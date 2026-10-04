import { expect, it } from 'vitest';
import { structuredValues } from './structured';
import { createFields } from './templates';
import type { CapturedDocument } from './schemas';
it('reads explicit product price and currency without inference', () => {
  const fields = createFields('products');
  const doc: CapturedDocument = {
    url: 'https://example.com',
    title: 'Product',
    metadata: {},
    jsonLd: [
      {
        '@type': 'Product',
        name: 'Laptop',
        offers: { price: '1299', priceCurrency: 'CAD' },
      },
    ],
    tables: [],
    cleanedText: '',
    wasTruncated: false,
  };
  const values = structuredValues(doc, fields);
  expect(values[fields.find((f) => f.key === 'price')!.id]?.value).toBe(1299);
  expect(values[fields.find((f) => f.key === 'price')!.id]?.currency).toBe(
    'CAD',
  );
});
it('does not collapse conflicting offers or assume a rental period', () => {
  const fields = createFields('apartments');
  const doc: CapturedDocument = {
    url: 'https://example.com',
    title: 'Home',
    metadata: {},
    jsonLd: [
      { '@type': 'Apartment', offers: { price: 1250, priceCurrency: 'CAD' } },
    ],
    tables: [],
    cleanedText: '',
    wasTruncated: false,
  };
  expect(
    structuredValues(doc, fields)[fields.find((f) => f.key === 'rent')!.id],
  ).toBeUndefined();
});
it('leaves conflicting product prices for inference', () => {
  const fields = createFields('products');
  const doc: CapturedDocument = {
    url: 'https://example.com',
    title: 'Products',
    metadata: {},
    jsonLd: [
      { '@type': 'Product', offers: { price: 100, priceCurrency: 'CAD' } },
      { '@type': 'Product', offers: { price: 200, priceCurrency: 'CAD' } },
    ],
    tables: [],
    cleanedText: '',
    wasTruncated: false,
  };
  expect(
    structuredValues(doc, fields)[fields.find((f) => f.key === 'price')!.id],
  ).toBeUndefined();
});
