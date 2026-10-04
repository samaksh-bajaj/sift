import {
  type CapturedDocument,
  type Cell,
  type Field,
  valueMatchesField,
} from './schemas';

/** Resolve only explicit, unambiguous structured facts before paying for inference. */
export function structuredValues(
  document: CapturedDocument,
  fields: Field[],
): Record<string, Cell> {
  const result: Record<string, Cell> = {};
  const nodes: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    nodes.push(node);
    if (node['@graph']) visit(node['@graph']);
  };
  document.jsonLd.forEach(visit);
  for (const field of fields) {
    const candidates: {
      value: Cell['value'];
      quote: string;
      currency: string | null;
    }[] = [];
    for (const node of nodes) {
      const type = node['@type'];
      const recognized = [
        'Apartment',
        'Product',
        'Hotel',
        'Car',
        'Course',
        'JobPosting',
      ].includes(String(type));
      if (!recognized) continue;
      const keys: Record<string, string> = {
        name: 'name',
        bedrooms: 'numberOfBedrooms',
        bathrooms: 'numberOfBathroomsTotal',
        role: 'title',
      };
      const key = keys[field.key];
      if (
        key &&
        (typeof node[key] === 'string' || typeof node[key] === 'number')
      )
        candidates.push({
          value: node[key] as string | number,
          quote: JSON.stringify(node),
          currency: null,
        });
      if (field.key === 'price' && ['Product', 'Car'].includes(String(type))) {
        const offer = node.offers;
        if (offer && !Array.isArray(offer) && typeof offer === 'object') {
          const o = offer as Record<string, unknown>;
          const price =
            typeof o.price === 'number'
              ? o.price
              : typeof o.price === 'string' && /^\d+(\.\d+)?$/.test(o.price)
                ? Number(o.price)
                : null;
          if (price !== null)
            candidates.push({
              value: price,
              quote: JSON.stringify(offer),
              currency:
                typeof o.priceCurrency === 'string' &&
                /^[A-Z]{3}$/.test(o.priceCurrency)
                  ? o.priceCurrency
                  : null,
            });
        }
      }
    }
    for (const table of document.tables)
      for (const row of table.rows) {
        if (
          row.length !== 2 ||
          ![field.label.toLowerCase(), field.key.replaceAll('_', ' ')].includes(
            row[0]?.trim().toLowerCase() ?? '',
          )
        )
          continue;
        const text = row[1]!.trim();
        let value: Cell['value'] = text;
        if (field.dataType === 'boolean')
          value = /^(yes|true)$/i.test(text)
            ? true
            : /^(no|false)$/i.test(text)
              ? false
              : null;
        if (['number', 'currency'].includes(field.dataType))
          value = /^[-+]?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
        if (value !== null)
          candidates.push({
            value,
            quote: JSON.stringify(row),
            currency: null,
          });
      }
    const valid = candidates.filter(
      (c) => valueMatchesField(c.value, field) && c.quote.length <= 4000,
    );
    if (
      !valid.length ||
      new Set(valid.map((c) => JSON.stringify([c.value, c.currency]))).size !==
        1
    )
      continue;
    const fact = valid[0]!;
    result[field.id] = {
      value: fact.value,
      currency: fact.currency,
      unit: null,
      confidence: 'high',
      evidence: [{ quote: fact.quote, sourceUrl: document.url }],
      manuallyEdited: false,
    };
  }
  return result;
}
