import { z } from 'zod';

export const httpUrl = z
  .string()
  .url()
  .max(4096)
  .refine(
    (s) => ['http:', 'https:'].includes(new URL(s).protocol),
    'Use an HTTP or HTTPS URL',
  );
export const fieldTypeSchema = z.enum([
  'text',
  'number',
  'boolean',
  'date',
  'enum',
  'list',
  'currency',
  'url',
]);
export const fieldSchema = z
  .object({
    id: z.string().uuid(),
    key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    label: z.string().trim().min(1).max(100),
    dataType: fieldTypeSchema,
    unit: z.string().max(30).nullable().default(null),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .default(null),
    enumOptions: z.array(z.string().min(1).max(100)).max(50).default([]),
    position: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    (f) => f.dataType !== 'enum' || f.enumOptions.length > 0,
    'An enum needs options',
  );
export const evidenceSchema = z
  .object({
    quote: z.string().min(1).max(4000),
    sourceUrl: httpUrl,
    startOffset: z.number().int().nonnegative().optional(),
    endOffset: z.number().int().nonnegative().optional(),
  })
  .strict();
export const valueSchema = z.union([
  z.string().max(10000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(1000)).max(100),
  z.null(),
]);
export const cellSchema = z
  .object({
    value: valueSchema,
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .default(null),
    unit: z.string().max(30).nullable().default(null),
    confidence: z.enum(['high', 'medium', 'low']).nullable(),
    evidence: z.array(evidenceSchema).max(10),
    manuallyEdited: z.boolean().default(false),
  })
  .strict();
export const templateTypeSchema = z.enum([
  'apartments',
  'hotels',
  'jobs',
  'products',
  'cars',
  'courses',
  'custom',
]);
export const projectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  templateType: templateTypeSchema,
  description: z.string().max(2000).default(''),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export const itemSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string().max(500),
  sourceUrl: httpUrl,
  canonicalUrl: httpUrl.optional(),
  contentHash: z.string(),
  extractionStatus: z.enum([
    'pending',
    'processing',
    'complete',
    'partial',
    'failed',
  ]),
  error: z.string().optional(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  values: z.record(z.string().uuid(), cellSchema),
});
export const documentSchema = z
  .object({
    url: httpUrl,
    canonicalUrl: httpUrl.optional(),
    title: z.string().max(500),
    description: z.string().max(4000).optional(),
    jsonLd: z.array(z.unknown()).max(100),
    metadata: z.record(z.string().max(100), z.string().max(4000)),
    tables: z
      .array(
        z.object({
          headers: z.array(z.string().max(1000)).max(100),
          rows: z.array(z.array(z.string().max(4000)).max(100)).max(200),
        }),
      )
      .max(30),
    cleanedText: z.string().max(60000),
    wasTruncated: z.boolean().default(false),
  })
  .strict()
  .refine((d) => JSON.stringify(d).length <= 500000, 'Source exceeds 500 KB');
export const extractionSchema = z
  .object({
    title: z.string().min(1).max(500),
    values: z.record(z.string().uuid(), cellSchema),
  })
  .strict();
export const filterSchema = z
  .object({
    filters: z
      .array(
        z
          .object({
            fieldId: z.string().uuid(),
            operator: z.enum([
              'eq',
              'neq',
              'lt',
              'lte',
              'gt',
              'gte',
              'contains',
              'in',
              'is_unknown',
            ]),
            value: valueSchema,
          })
          .strict(),
      )
      .max(20),
    sort: z
      .object({
        fieldId: z.string().uuid(),
        direction: z.enum(['asc', 'desc']),
      })
      .strict()
      .optional(),
    search: z.string().max(200).optional(),
    aggregate: z
      .object({
        fieldId: z.string().uuid(),
        operation: z.enum(['count', 'sum', 'average', 'min', 'max']),
      })
      .strict()
      .optional(),
  })
  .strict();
export type Field = z.infer<typeof fieldSchema>;
export type Cell = z.infer<typeof cellSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Item = z.infer<typeof itemSchema>;
export type CapturedDocument = z.infer<typeof documentSchema>;
export type FilterAST = z.infer<typeof filterSchema>;
export type ExtractionResult = z.infer<typeof extractionSchema>;
export type TemplateType = z.infer<typeof templateTypeSchema>;

export function valueMatchesField(value: Cell['value'], field: Field): boolean {
  if (value === null) return true;
  switch (field.dataType) {
    case 'number':
    case 'currency':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'list':
      return Array.isArray(value) && value.every((v) => typeof v === 'string');
    case 'enum':
      return typeof value === 'string' && field.enumOptions.includes(value);
    case 'url':
      return httpUrl.safeParse(value).success;
    case 'date':
      return (
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value
      );
    default:
      return typeof value === 'string';
  }
}

export function validateExtraction(
  input: unknown,
  fields: Field[],
  document: CapturedDocument,
): ExtractionResult {
  const result = extractionSchema.parse(input);
  const source = [
    document.cleanedText,
    document.title,
    document.description ?? '',
    ...Object.values(document.metadata),
    JSON.stringify(document.jsonLd),
    JSON.stringify(document.tables),
  ].join('\n');
  if (Object.keys(result.values).length !== fields.length)
    throw new Error('Extraction must return every requested field');
  for (const field of fields) {
    const cell = result.values[field.id];
    if (!cell || !valueMatchesField(cell.value, field))
      throw new Error(`Invalid value for ${field.label}`);
    if (cell.manuallyEdited)
      throw new Error('Extraction cannot claim a manual edit');
    if (cell.value === null && cell.evidence.length)
      throw new Error('Unknown values must have no evidence');
    if (cell.value !== null && !cell.evidence.length)
      throw new Error(`Missing evidence for ${field.label}`);
    for (const e of cell.evidence) {
      if (
        ![document.url, document.canonicalUrl].includes(e.sourceUrl) ||
        !source.includes(e.quote)
      )
        throw new Error(`Unsupported evidence for ${field.label}`);
      if ((e.startOffset === undefined) !== (e.endOffset === undefined))
        throw new Error('Evidence offsets must be paired');
      if (
        e.startOffset !== undefined &&
        document.cleanedText.slice(e.startOffset, e.endOffset) !== e.quote
      )
        throw new Error('Evidence offsets do not match');
    }
  }
  return result;
}
