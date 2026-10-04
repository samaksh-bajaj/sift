import { describe, expect, it } from 'vitest';
import {
  applyQuery,
  createFields,
  estimatedCost,
  fieldSchema,
  findDuplicate,
  normalizeUrl,
  safeSpreadsheetText,
  validateExtraction,
  validateFilter,
  valueMatchesField,
  type CapturedDocument,
  type Item,
} from './index';
const fields = createFields('apartments');
const rent = fields.find((f) => f.key === 'rent')!;
const parking = fields.find((f) => f.key === 'parking')!;
const row = (price: number | null, parks: boolean | null): Item => ({
  id: crypto.randomUUID(),
  projectId: '00000000-0000-4000-8000-000000000001',
  title: 'Fixture',
  sourceUrl: 'https://example.com/1',
  contentHash: 'hash',
  extractionStatus: 'complete',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  values: {
    [rent.id]: {
      value: price,
      currency: 'CAD',
      unit: null,
      confidence: 'high',
      evidence: [],
      manuallyEdited: false,
    },
    [parking.id]: {
      value: parks,
      currency: null,
      unit: null,
      confidence: null,
      evidence: [],
      manuallyEdited: false,
    },
  },
});
describe('typed deterministic comparisons', () => {
  it('excludes unknown parking and respects strict price bounds', () => {
    const items = [
      row(1200, true),
      row(1300, true),
      row(1000, null),
      row(1000, false),
    ];
    expect(
      applyQuery(items, fields, {
        filters: [
          { fieldId: rent.id, operator: 'lt', value: 1300 },
          { fieldId: parking.id, operator: 'eq', value: true },
        ],
      }),
    ).toEqual([items[0]]);
  });
  it('keeps unknown last in both sort directions', () => {
    const items = [row(null, true), row(1200, true), row(1500, true)];
    expect(
      applyQuery(items, fields, {
        filters: [],
        sort: { fieldId: rent.id, direction: 'desc' },
      }).map((i) => i.values[rent.id]?.value),
    ).toEqual([1500, 1200, null]);
  });
  it('rejects unknown fields, wrong types and raw SQL', () => {
    expect(() =>
      validateFilter(
        {
          filters: [
            { fieldId: crypto.randomUUID(), operator: 'eq', value: true },
          ],
        },
        fields,
      ),
    ).toThrow();
    expect(() =>
      validateFilter(
        { filters: [{ fieldId: rent.id, operator: 'lt', value: '1300' }] },
        fields,
      ),
    ).toThrow();
    expect(() =>
      validateFilter({ filters: [], sql: 'DELETE FROM items' }, fields),
    ).toThrow();
  });
  it('does not match unknown for neq', () =>
    expect(
      applyQuery([row(null, null)], fields, {
        filters: [{ fieldId: parking.id, operator: 'neq', value: true }],
      }),
    ).toEqual([]));
  it('validates real dates and enum options', () => {
    expect(valueMatchesField('2026-02-30', { ...rent, dataType: 'date' })).toBe(
      false,
    );
    expect(() =>
      fieldSchema.parse({ ...rent, dataType: 'enum', enumOptions: [] }),
    ).toThrow();
  });
});
describe('source provenance', () => {
  const doc: CapturedDocument = {
    url: 'https://example.com',
    title: 'Home',
    jsonLd: [],
    metadata: {},
    tables: [],
    cleanedText: 'Parking included.',
    wasTruncated: false,
  };
  it('accepts exact evidence and rejects invented evidence', () => {
    const output = {
      title: 'Home',
      values: {
        [parking.id]: {
          value: true,
          confidence: 'high',
          evidence: [{ quote: 'Parking included.', sourceUrl: doc.url }],
        },
      },
    };
    expect(
      validateExtraction(output, [parking], doc).values[parking.id]?.value,
    ).toBe(true);
    output.values[parking.id]!.evidence[0]!.quote = 'Free heated parking';
    expect(() => validateExtraction(output, [parking], doc)).toThrow();
  });
  it('rejects missing evidence, missing fields and wrong values', () => {
    expect(() =>
      validateExtraction(
        {
          title: 'Home',
          values: {
            [parking.id]: { value: true, confidence: 'high', evidence: [] },
          },
        },
        [parking],
        doc,
      ),
    ).toThrow();
    expect(() =>
      validateExtraction({ title: 'Home', values: {} }, [parking], doc),
    ).toThrow();
    expect(() =>
      validateExtraction(
        {
          title: 'Home',
          values: {
            [parking.id]: { value: 'yes', confidence: 'high', evidence: [] },
          },
        },
        [parking],
        doc,
      ),
    ).toThrow();
  });
  it('allows null without evidence', () =>
    expect(
      validateExtraction(
        {
          title: 'Home',
          values: {
            [parking.id]: { value: null, confidence: null, evidence: [] },
          },
        },
        [parking],
        doc,
      ).values[parking.id]?.value,
    ).toBeNull());
});
it('normalizes tracking without deleting meaningful parameters', () =>
  expect(
    normalizeUrl('https://example.com/a?unit=12&utm_source=x#details'),
  ).toBe('https://example.com/a?unit=12'));
it('scopes duplicates to a project', () => {
  const item = row(1200, true);
  expect(
    findDuplicate(
      [item],
      item.projectId,
      'https://example.com/1?utm_source=x',
      'other',
    ),
  ).toBe(item);
  expect(
    findDuplicate([item], crypto.randomUUID(), item.sourceUrl, 'hash'),
  ).toBeUndefined();
});
it('calculates usage costs and rejects negative counts', () => {
  expect(estimatedCost(5000, 300)).toBeCloseTo(0.00062);
  expect(() => estimatedCost(-1, 1)).toThrow();
});
it('neutralizes spreadsheet formulas', () =>
  expect(safeSpreadsheetText('  =HYPERLINK("bad")')).toMatch(/^'/));
