import {
  filterSchema,
  valueMatchesField,
  type Field,
  type FilterAST,
  type Item,
} from './schemas';
export function validateFilter(input: unknown, fields: Field[]): FilterAST {
  const ast = filterSchema.parse(input);
  const lookup = (id: string) => {
    const f = fields.find((f) => f.id === id);
    if (!f) throw new Error('Unknown comparison field');
    return f;
  };
  for (const c of ast.filters) {
    const f = lookup(c.fieldId);
    if (c.operator === 'is_unknown') {
      if (c.value !== null) throw new Error('Unknown test expects null');
      continue;
    }
    if (c.value === null) throw new Error('Use is_unknown for missing values');
    if (c.operator === 'contains') {
      if (
        !['text', 'list', 'enum', 'url'].includes(f.dataType) ||
        typeof c.value !== 'string'
      )
        throw new Error('Contains requires text');
    } else if (c.operator === 'in') {
      if (
        !Array.isArray(c.value) ||
        !c.value.every((v) => valueMatchesField(v, f))
      )
        throw new Error('Invalid set filter');
    } else if (!valueMatchesField(c.value, f))
      throw new Error('Filter value has wrong type');
    if (
      ['lt', 'lte', 'gt', 'gte'].includes(c.operator) &&
      !['number', 'currency', 'date'].includes(f.dataType)
    )
      throw new Error('Field is not ordered');
  }
  if (ast.sort) lookup(ast.sort.fieldId);
  if (
    ast.aggregate &&
    ast.aggregate.operation !== 'count' &&
    !['number', 'currency'].includes(lookup(ast.aggregate.fieldId).dataType)
  )
    throw new Error('Aggregate requires a number');
  if (ast.aggregate) lookup(ast.aggregate.fieldId);
  return ast;
}
export function applyQuery(
  items: Item[],
  fields: Field[],
  input: unknown,
): Item[] {
  const ast = validateFilter(input, fields);
  const ordered = new Set([
    ...ast.filters
      .filter((f) => ['lt', 'lte', 'gt', 'gte'].includes(f.operator))
      .map((f) => f.fieldId),
    ...(ast.sort ? [ast.sort.fieldId] : []),
    ...(ast.aggregate && ast.aggregate.operation !== 'count'
      ? [ast.aggregate.fieldId]
      : []),
  ]);
  for (const field of fields.filter(
    (f) => f.dataType === 'currency' && ordered.has(f.id),
  )) {
    const currencies = new Set(
      items
        .filter((i) => i.values[field.id]?.value != null)
        .map((i) => i.values[field.id]?.currency ?? 'unknown'),
    );
    if (currencies.size > 1)
      throw new Error(
        `“${field.label}” has mixed or unspecified currencies. Compare items in one currency before ordering their prices.`,
      );
  }
  const result = items.filter((item) => {
    if (
      ast.search &&
      ![
        item.title,
        ...Object.values(item.values).map((c) => String(c.value ?? '')),
      ]
        .join(' ')
        .toLowerCase()
        .includes(ast.search.toLowerCase())
    )
      return false;
    return ast.filters.every((c) => {
      const v = item.values[c.fieldId]?.value ?? null;
      if (c.operator === 'is_unknown') return v === null;
      if (v === null) return false;
      const expected = c.value;
      const comparison =
        typeof v === 'number' && typeof expected === 'number'
          ? v - expected
          : String(v).localeCompare(String(expected));
      switch (c.operator) {
        case 'eq':
          return JSON.stringify(v) === JSON.stringify(expected);
        case 'neq':
          return JSON.stringify(v) !== JSON.stringify(expected);
        case 'contains':
          return (Array.isArray(v) ? v.join(' ') : String(v))
            .toLowerCase()
            .includes(String(expected).toLowerCase());
        case 'in':
          return Array.isArray(expected) && expected.includes(String(v));
        case 'lt':
          return comparison < 0;
        case 'lte':
          return comparison <= 0;
        case 'gt':
          return comparison > 0;
        case 'gte':
          return comparison >= 0;
      }
    });
  });
  if (ast.sort) {
    const { fieldId, direction } = ast.sort;
    result.sort((a, b) => {
      const av = a.values[fieldId]?.value ?? null;
      const bv = b.values[fieldId]?.value ?? null;
      if (av === null) return bv === null ? 0 : 1;
      if (bv === null) return -1;
      const comparison =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return direction === 'asc' ? comparison : -comparison;
    });
  }
  return result;
}
export function aggregate(
  items: Item[],
  operation: NonNullable<FilterAST['aggregate']>,
): number | null {
  const values = items
    .map((i) => i.values[operation.fieldId]?.value)
    .filter((v): v is number => typeof v === 'number');
  if (operation.operation === 'count')
    return items.filter((i) => i.values[operation.fieldId]?.value != null)
      .length;
  if (!values.length) return null;
  switch (operation.operation) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'average':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
  }
}
