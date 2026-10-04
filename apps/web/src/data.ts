import { createClient } from '@supabase/supabase-js';
import { z } from '@sift/shared';
import {
  createFields,
  projectSchema,
  fieldSchema,
  itemSchema,
  documentSchema,
  publicEnvSchema,
  cellSchema,
  valueMatchesField,
  validateFilter,
  type Project,
  type Field,
  type Item,
  type Cell,
  type TemplateType,
  type CapturedDocument,
} from '@sift/shared';
const demoForced = import.meta.env.VITE_DEMO_MODE === 'true';
const configured =
  !demoForced &&
  Boolean(
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
const env = configured ? publicEnvSchema.parse(import.meta.env) : null;
export const supabase = env
  ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
  : null;
const stateSchema = z.object({
  projects: z.array(projectSchema),
  fields: z.record(z.string(), z.array(fieldSchema)),
  items: z.array(itemSchema),
  sources: z.record(z.string(), documentSchema),
});
export type Workspace = z.infer<typeof stateSchema>;
const demoKey = 'sift-demo-v1';
const now = () => new Date().toISOString();
export function seedDemo(): Workspace {
  const project: Project = {
    id: crypto.randomUUID(),
    name: 'Edmonton Apartments',
    templateType: 'apartments',
    description: 'A shortlist for the next chapter.',
    createdAt: now(),
    updatedAt: now(),
  };
  const fields = createFields('apartments');
  const sources: Record<string, CapturedDocument> = {};
  const samples = [
    {
      name: 'Garneau Place',
      address: '109 Street · Garneau',
      rent: 1250,
      bedrooms: 1,
      bathrooms: 1,
      square_feet: 620,
      parking: true,
      laundry: 'In-suite',
      pets: 'Cats welcome',
      pool: null,
      gym: true,
      utilities: 'Heat and water',
    },
    {
      name: 'Whyte Avenue Studio',
      address: '82 Avenue · Strathcona',
      rent: 1175,
      bedrooms: 0,
      bathrooms: 1,
      square_feet: 480,
      parking: false,
      laundry: 'Shared',
      pets: 'No pets',
      pool: false,
      gym: false,
      utilities: 'Water',
    },
    {
      name: 'River Valley Loft',
      address: '100 Avenue · Oliver',
      rent: 1475,
      bedrooms: 1,
      bathrooms: 1,
      square_feet: 780,
      parking: true,
      laundry: 'In-suite',
      pets: 'Pets welcome',
      pool: false,
      gym: true,
      utilities: 'Heat and water',
    },
    {
      name: 'University Heights',
      address: '87 Avenue · University',
      rent: 1295,
      bedrooms: 1,
      bathrooms: 1,
      square_feet: 650,
      parking: true,
      laundry: 'Shared',
      pets: null,
      pool: null,
      gym: null,
      utilities: 'Heat',
    },
    {
      name: 'Westmount Two Bedroom',
      address: '124 Street · Westmount',
      rent: 1650,
      bedrooms: 2,
      bathrooms: 2,
      square_feet: 980,
      parking: true,
      laundry: 'In-suite',
      pets: 'Pets welcome',
      pool: false,
      gym: false,
      utilities: 'Not included',
    },
  ];
  const items = samples.map((sample, index) => {
    const id = crypto.randomUUID();
    const url = `${location.origin}/fixtures/apartment-${index + 1}.html`;
    const entries = Object.entries(sample);
    const cleanedText = entries
      .map(([k, v]) => `${k}: ${v === null ? 'Not stated' : v}`)
      .join('\n');
    sources[id] = {
      url,
      title: sample.name,
      cleanedText,
      metadata: { currency: 'CAD' },
      jsonLd: [],
      tables: [],
      wasTruncated: false,
    };
    const values = Object.fromEntries(
      fields.map((f) => {
        const value = (sample as Record<string, Cell['value']>)[f.key] ?? null;
        return [
          f.id,
          {
            value,
            currency: f.dataType === 'currency' ? 'CAD' : null,
            unit: null,
            confidence: value === null ? null : 'high',
            evidence:
              value === null
                ? []
                : [{ quote: `${f.key}: ${value}`, sourceUrl: url }],
            manuallyEdited: false,
          },
        ];
      }),
    );
    return itemSchema.parse({
      id,
      projectId: project.id,
      title: sample.name,
      sourceUrl: url,
      contentHash: `demo-${index}`,
      extractionStatus: 'complete',
      createdAt: now(),
      updatedAt: now(),
      values,
    });
  });
  return {
    projects: [project],
    fields: { [project.id]: fields },
    items,
    sources,
  };
}
export function loadDemo(): Workspace {
  const saved = localStorage.getItem(demoKey);
  if (saved) {
    const parsed = stateSchema.safeParse(JSON.parse(saved));
    if (parsed.success) return parsed.data;
    throw new Error(
      'Saved demo data is invalid. Use Reset demo to start again.',
    );
  }
  const data = seedDemo();
  saveDemo(data);
  return data;
}
export function saveDemo(data: Workspace) {
  localStorage.setItem(demoKey, JSON.stringify(stateSchema.parse(data)));
}
export function resetDemo() {
  localStorage.removeItem(demoKey);
  return loadDemo();
}

export async function loadRemote(): Promise<Workspace> {
  if (!supabase) throw new Error('Backend is not configured');
  const results = await Promise.all(
    ['projects', 'project_fields', 'items', 'item_field_values'].map((table) =>
      supabase!
        .from(table)
        .select('*')
        .order('created_at', { ascending: true }),
    ),
  );
  for (const r of results) if (r.error) throw r.error;
  const [projectsRaw, fieldsRaw, itemsRaw, valuesRaw] = results.map(
    (r) => r.data ?? [],
  );
  const projects = (projectsRaw ?? []).map((p) =>
    projectSchema.parse({
      id: p.id,
      name: p.name,
      templateType: p.template_type,
      description: p.description,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }),
  );
  const fields: Record<string, Field[]> = {};
  for (const p of projects) fields[p.id] = [];
  for (const f of fieldsRaw ?? [])
    fields[f.project_id]?.push(
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
  for (const fs of Object.values(fields))
    fs.sort((a, b) => a.position - b.position);
  const items = (itemsRaw ?? []).map((i) =>
    itemSchema.parse({
      id: i.id,
      projectId: i.project_id,
      title: i.title,
      sourceUrl: i.source_url,
      canonicalUrl: i.canonical_url,
      contentHash: i.content_hash,
      extractionStatus: i.extraction_status,
      ...(i.error ? { error: i.error } : {}),
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      values: Object.fromEntries(
        (valuesRaw ?? [])
          .filter((v) => v.item_id === i.id)
          .map((v) => [
            v.field_id,
            {
              value:
                v.value_text ??
                v.value_number ??
                v.value_boolean ??
                v.value_date ??
                v.value_json ??
                null,
              currency: v.currency,
              unit: v.unit,
              confidence: v.confidence,
              evidence: v.evidence_json,
              manuallyEdited: v.manually_edited,
            },
          ]),
      ),
    }),
  );
  return { projects, fields, items, sources: {} };
}
export async function invoke(name: string, body: unknown): Promise<unknown> {
  if (!supabase) throw new Error('Connect Supabase to use AI extraction.');
  const { data, error } = await supabase.functions.invoke(name, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  if (error) {
    const details = await error.context?.json().catch(() => null);
    throw new Error(details?.error ?? error.message);
  }
  const failure = z.object({ error: z.string() }).safeParse(data);
  if (failure.success) throw new Error(failure.data.error);
  return data;
}
export async function createRemote(name: string, templateType: TemplateType) {
  const fields = createFields(templateType);
  const { data, error } = await supabase!.rpc('create_project', {
    project_name: name,
    template: templateType,
    fields,
  });
  if (error) throw error;
  return z.string().uuid().parse(data);
}
export async function updateCell(
  item: Item,
  field: Field,
  value: Cell['value'],
) {
  if (!valueMatchesField(value, field))
    throw new Error('Value does not match the field type');
  await invoke('edit-value', { itemId: item.id, fieldId: field.id, value });
}
export function demoQuery(text: string, fields: Field[]) {
  const filters: {
    fieldId: string;
    operator: 'lt' | 'eq';
    value: number | boolean;
  }[] = [];
  const price = fields.find((f) =>
    ['rent', 'price', 'nightly_rate'].includes(f.key),
  );
  const threshold = text.match(/under\s*\$?([\d,]+(?:\.\d+)?)/i);
  if (threshold && price)
    filters.push({
      fieldId: price.id,
      operator: 'lt',
      value: Number(threshold[1]!.replaceAll(',', '')),
    });
  for (const key of ['parking', 'pool']) {
    const f = fields.find((f) => f.key === key);
    if (f && new RegExp(`\\b(?:with|without) (?:a )?${key}\\b`, 'i').test(text))
      filters.push({
        fieldId: f.id,
        operator: 'eq',
        value: !new RegExp(`without (?:a )?${key}`, 'i').test(text),
      });
  }
  const sort =
    price && /cheapest first/i.test(text)
      ? { fieldId: price.id, direction: 'asc' as const }
      : undefined;
  if (!filters.length && !sort)
    throw new Error(
      'Demo supports “under $1300 with parking”, “without parking”, “with a pool”, and “cheapest first”. Connect your backend for AI queries.',
    );
  return validateFilter({ filters, ...(sort ? { sort } : {}) }, fields);
}
export function demoBackfill(
  item: Item,
  field: Field,
  source?: CapturedDocument,
): Cell {
  if (!source) throw new Error('No saved source is available for this item');
  const line = source.cleanedText
    .split('\n')
    .find((l) => l.toLowerCase().startsWith(`${field.key}:`));
  const raw = line?.split(':').slice(1).join(':').trim();
  const value: Cell['value'] =
    !raw || raw === 'Not stated'
      ? null
      : field.dataType === 'boolean'
        ? raw === 'true'
          ? true
          : raw === 'false'
            ? false
            : null
        : ['number', 'currency'].includes(field.dataType)
          ? Number.isFinite(Number(raw))
            ? Number(raw)
            : null
          : field.dataType === 'list'
            ? raw.split(',').map((s) => s.trim())
            : raw;
  return cellSchema.parse({
    value: valueMatchesField(value, field) ? value : null,
    currency:
      field.dataType === 'currency' ? (source.metadata.currency ?? null) : null,
    unit: null,
    confidence: value === null ? null : 'high',
    evidence:
      value !== null && valueMatchesField(value, field)
        ? [{ quote: line!, sourceUrl: item.sourceUrl }]
        : [],
    manuallyEdited: false,
  });
}
