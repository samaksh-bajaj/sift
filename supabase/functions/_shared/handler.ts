import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  GeminiProvider,
  documentSchema,
  fieldSchema,
  prepareDocument,
  serverEnvSchema,
  estimatedCost,
  valueMatchesField,
  valueSchema,
} from './domain.js';

const env = serverEnvSchema.parse(Deno.env.toObject());
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const allowed = new Set(
  (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
const uuid = z.string().uuid();
const schema = {
  'extract-item': z
    .object({
      projectId: uuid,
      document: documentSchema,
      requestId: uuid,
      mode: z.enum(['default', 'update', 'duplicate']).default('default'),
    })
    .strict(),
  'interpret-query': z
    .object({
      projectId: uuid,
      query: z.string().trim().min(1).max(1000),
      requestId: uuid,
    })
    .strict(),
  'backfill-field': z
    .object({ itemId: uuid, fieldId: uuid, requestId: uuid })
    .strict(),
  'suggest-fields': z.object({ itemId: uuid, requestId: uuid }).strict(),
  'edit-value': z
    .object({ itemId: uuid, fieldId: uuid, value: valueSchema })
    .strict(),
  'delete-item': z.object({ itemId: uuid }).strict(),
  'delete-project': z.object({ projectId: uuid }).strict(),
};
type Operation = keyof typeof schema;
function checked<T>({ data, error }: { data: T; error: unknown }): T {
  if (error)
    throw error instanceof Error
      ? error
      : new Error(
          typeof error === 'object' && error !== null && 'message' in error
            ? String(error.message)
            : 'Database operation failed',
        );
  return data;
}
async function projectForUser(id: string, uid: string) {
  const p = checked(
    await service
      .from('projects')
      .select('*')
      .eq('id', id)
      .eq('user_id', uid)
      .maybeSingle(),
  );
  if (!p) throw new Error('Project not found');
  return p;
}
async function ownedItem(id: string, uid: string) {
  const item = checked(
    await service.from('items').select('*').eq('id', id).maybeSingle(),
  );
  if (!item) throw new Error('Item not found');
  await projectForUser(item.project_id, uid);
  return item;
}
async function fieldsFor(pid: string) {
  const rows = checked(
    await service
      .from('project_fields')
      .select('*')
      .eq('project_id', pid)
      .order('position'),
  );
  return (rows ?? []).map((f) =>
    fieldSchema.parse({
      id: f.id,
      key: f.key,
      label: f.label,
      dataType: f.data_type,
      unit: f.unit,
      currency: f.currency,
      enumOptions: f.enum_options_json,
      position: f.position,
    }),
  );
}
async function sourceFor(iid: string) {
  const source = checked(
    await service
      .from('source_documents')
      .select('storage_path')
      .eq('item_id', iid)
      .single(),
  );
  if (!source) throw new Error('Saved source not found');
  const blob = checked(
    await service.storage
      .from('source-snapshots')
      .download(source.storage_path),
  );
  if (!blob) throw new Error('Saved source could not be downloaded');
  return documentSchema.parse(JSON.parse(await blob.text()));
}
async function reserve(uid: string, rid: string, kind: string) {
  const admitted = checked(
    await service.rpc('reserve_request', {
      uid,
      rid,
      kind,
      monthly_limit: env.MAX_AI_ANALYSIS_PER_MONTH,
    }),
  );
  if (!admitted) throw new Error('This request has already been received.');
}
function provider(uid: string, kind: string) {
  return new GeminiProvider({
    apiKey: env.GEMINI_API_KEY,
    model: env.LLM_MODEL,
    onUsage: async (usage: {
      inputTokens: number;
      outputTokens: number;
      model: string;
    }) => {
      checked(
        await service.from('usage_events').insert({
          user_id: uid,
          event_type: kind,
          model: usage.model,
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          estimated_cost_usd: estimatedCost(
            usage.inputTokens,
            usage.outputTokens,
            env.INPUT_USD_PER_MILLION,
            env.OUTPUT_USD_PER_MILLION,
          ),
        }),
      );
    },
  });
}
function typed(
  field: { id: string; dataType: string },
  cell: {
    value: unknown;
    currency: string | null;
    unit: string | null;
    confidence: string | null;
    evidence: unknown[];
  },
) {
  const value = cell.value;
  return {
    field_id: field.id,
    value_text: ['text', 'enum', 'url'].includes(field.dataType) ? value : null,
    value_number: ['number', 'currency'].includes(field.dataType)
      ? value
      : null,
    value_boolean: field.dataType === 'boolean' ? value : null,
    value_date: field.dataType === 'date' ? value : null,
    value_json: field.dataType === 'list' ? value : null,
    currency: cell.currency,
    unit: cell.unit,
    confidence: cell.confidence,
    evidence_json: cell.evidence,
  };
}
async function removeItems(ids: string[]) {
  if (!ids.length) return;
  const sources = checked(
    await service
      .from('source_documents')
      .select('storage_path')
      .in('item_id', ids),
  );
  if (sources?.length)
    checked(
      await service.storage
        .from('source-snapshots')
        .remove(sources.map((s) => s.storage_path)),
    );
  checked(await service.from('items').delete().in('id', ids));
}
async function finishExtraction({
  uid,
  projectId,
  itemId,
  document,
}: {
  uid: string;
  projectId: string;
  itemId: string;
  document: z.infer<typeof documentSchema>;
}) {
  const start = Date.now();
  try {
    const fields = await fieldsFor(projectId);
    const result = await provider(uid, 'extraction_completed').extractItem({
      document,
      fields,
    });
    checked(
      await service.rpc('commit_extraction', {
        iid: itemId,
        extracted_title: result.title,
        extracted_values: fields.map((f) => typed(f, result.values[f.id])),
      }),
    );
    console.info(
      JSON.stringify({
        event: 'extract-item_background_completed',
        itemId,
        latencyMs: Date.now() - start,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'The extraction could not be completed. Please retry.';
    await service
      .from('items')
      .update({ extraction_status: 'failed', error: message.slice(0, 500) })
      .eq('id', itemId);
    console.warn(
      JSON.stringify({
        event: 'extract-item_background_failed',
        itemId,
        latencyMs: Date.now() - start,
        error: message.slice(0, 500),
      }),
    );
  }
}
export function handle(operation: Operation) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    const cors: Record<string, string> = {
      Vary: 'Origin',
      'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
    if (origin && allowed.has(origin))
      cors['Access-Control-Allow-Origin'] = origin;
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          ...cors,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    if (origin && !allowed.has(origin))
      return json({ error: 'This application origin is not configured.' }, 403);
    if (req.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
    const start = Date.now();
    let activeItem: string | undefined;
    try {
      const token = req.headers
        .get('Authorization')
        ?.match(/^Bearer (.+)$/i)?.[1];
      if (!token) return json({ error: 'Sign in to continue.' }, 401);
      const { data: auth, error: authError } =
        await service.auth.getUser(token);
      if (authError || !auth.user)
        return json({ error: 'Your session expired. Sign in again.' }, 401);
      const uid = auth.user.id;
      const length = Number(req.headers.get('content-length') ?? 0);
      if (length > 600000)
        return json({ error: 'Captured page is too large.' }, 413);
      // Bound the stream even when Content-Length is missing or forged.
      const reader = req.body?.getReader();
      if (!reader) throw new Error('Request body is required');
      let total = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        total += part.value.byteLength;
        if (total > 600000) {
          await reader.cancel();
          return json({ error: 'Captured page is too large.' }, 413);
        }
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const raw = JSON.parse(new TextDecoder().decode(bytes));
      console.info(
        JSON.stringify({ event: `${operation}_started`, userId: uid }),
      );
      if (operation === 'extract-item') {
        const input = schema[operation].parse(raw);
        await projectForUser(input.projectId, uid);
        const { document, hash } = await prepareDocument(input.document);
        if (document.cleanedText.length > env.MAX_SOURCE_CHARACTERS)
          throw new Error('Page exceeds the configured capture limit');
        if (!document.cleanedText && !document.jsonLd.length)
          throw new Error('No readable source content');
        const admission = checked(
          await service.rpc('admit_capture', {
            uid,
            rid: input.requestId,
            pid: input.projectId,
            page_url: document.canonicalUrl ?? document.url,
            page_hash: hash,
            capture_mode: input.mode,
            monthly_limit: env.MAX_SAVES_PER_MONTH,
            item_limit: env.MAX_ITEMS_PER_PROJECT,
          }),
        );
        if (admission.duplicate) return json(admission);
        const itemId = String(admission.item.id);
        activeItem = itemId;
        const path = `${uid}/${input.projectId}/${itemId}.json`;
        checked(
          await service.storage
            .from('source-snapshots')
            .upload(path, JSON.stringify(document), {
              contentType: 'application/json',
              upsert: true,
            }),
        );
        checked(
          await service.from('source_documents').upsert(
            {
              item_id: itemId,
              storage_path: path,
              text_hash: hash,
              metadata_json: document.metadata,
              jsonld_json: document.jsonLd,
              character_count: document.cleanedText.length,
              was_truncated: document.wasTruncated,
            },
            { onConflict: 'item_id' },
          ),
        );
        checked(
          await service
            .from('items')
            .update({
              source_url: document.url,
              canonical_url: document.canonicalUrl ?? document.url,
              content_hash: hash,
              title: document.title,
            })
            .eq('id', itemId),
        );
        const extraction = finishExtraction({
          uid,
          projectId: input.projectId,
          itemId,
          document,
        });
        const runtime = (
          globalThis as typeof globalThis & {
            EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void };
          }
        ).EdgeRuntime;
        if (runtime) {
          runtime.waitUntil(extraction);
          return json(
            {
              item: {
                ...admission.item,
                title: document.title,
                extraction_status: 'processing',
              },
              captured: true,
              queued: true,
            },
            202,
          );
        }
        await extraction;
        const item = checked(
          await service.from('items').select('*').eq('id', itemId).single(),
        );
        return json({ item });
      }
      if (operation === 'interpret-query') {
        const input = schema[operation].parse(raw);
        await projectForUser(input.projectId, uid);
        await reserve(uid, input.requestId, 'analysis');
        return json(
          await provider(uid, 'query_interpreted').interpretQuery({
            query: input.query,
            fields: await fieldsFor(input.projectId),
          }),
        );
      }
      if (operation === 'backfill-field') {
        const input = schema[operation].parse(raw);
        const item = await ownedItem(input.itemId, uid);
        const field = (await fieldsFor(item.project_id)).find(
          (f) => f.id === input.fieldId,
        );
        if (!field) throw new Error('Field not found');
        const current = checked(
          await service
            .from('item_field_values')
            .select('manually_edited')
            .eq('item_id', item.id)
            .eq('field_id', field.id)
            .maybeSingle(),
        );
        if (current?.manually_edited)
          throw new Error(
            'This field was manually edited. Clear the manual correction before extracting again.',
          );
        const document = await sourceFor(item.id);
        await reserve(uid, input.requestId, 'analysis');
        const result = await provider(uid, 'field_backfilled').extractItem({
          document,
          fields: [field],
        });
        checked(
          await service.rpc('commit_extraction', {
            iid: item.id,
            extracted_title: item.title,
            extracted_values: [typed(field, result.values[field.id])],
          }),
        );
        return json({ itemId: item.id, fieldId: field.id });
      }
      if (operation === 'suggest-fields') {
        const input = schema[operation].parse(raw);
        const item = await ownedItem(input.itemId, uid);
        const document = await sourceFor(item.id);
        await reserve(uid, input.requestId, 'analysis');
        return json(
          await provider(uid, 'fields_suggested').suggestFields({
            document,
            fields: await fieldsFor(item.project_id),
          }),
        );
      }
      if (operation === 'edit-value') {
        const input = schema[operation].parse(raw);
        const item = await ownedItem(input.itemId, uid);
        const field = (await fieldsFor(item.project_id)).find(
          (f) => f.id === input.fieldId,
        );
        if (!field || !valueMatchesField(input.value, field))
          throw new Error('Value does not match the field');
        const old = checked(
          await service
            .from('item_field_values')
            .select('currency,unit')
            .eq('item_id', item.id)
            .eq('field_id', field.id)
            .maybeSingle(),
        );
        checked(
          await service.from('item_field_values').upsert(
            {
              ...typed(field, {
                value: input.value,
                currency: old?.currency ?? null,
                unit: old?.unit ?? null,
                confidence: null,
                evidence: [],
              }),
              item_id: item.id,
              project_id: item.project_id,
              manually_edited: true,
            },
            { onConflict: 'item_id,field_id' },
          ),
        );
        return json({ saved: true });
      }
      if (operation === 'delete-item') {
        const input = schema[operation].parse(raw);
        await ownedItem(input.itemId, uid);
        await removeItems([input.itemId]);
        return json({ deleted: true });
      }
      const input = schema['delete-project'].parse(raw);
      await projectForUser(input.projectId, uid);
      const items = checked(
        await service
          .from('items')
          .select('id')
          .eq('project_id', input.projectId),
      );
      await removeItems((items ?? []).map((i) => i.id));
      checked(
        await service
          .from('projects')
          .delete()
          .eq('id', input.projectId)
          .eq('user_id', uid),
      );
      return json({ deleted: true });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'The request could not be completed. Please retry.';
      if (activeItem)
        await service
          .from('items')
          .update({ extraction_status: 'failed', error: message.slice(0, 500) })
          .eq('id', activeItem);
      console.warn(
        JSON.stringify({
          event: `${operation}_failed`,
          latencyMs: Date.now() - start,
          errorType: error instanceof Error ? error.name : 'backend',
        }),
      );
      return json(
        { error: message },
        /limit/i.test(message) ? 429 : /not found/i.test(message) ? 404 : 400,
      );
    } finally {
      console.info(
        JSON.stringify({
          event: `${operation}_finished`,
          latencyMs: Date.now() - start,
        }),
      );
    }
  };
}
