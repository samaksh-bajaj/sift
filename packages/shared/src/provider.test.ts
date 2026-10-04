import { expect, it, vi } from 'vitest';
import { GeminiProvider } from './provider';
import { createFields } from './templates';
import type { CapturedDocument } from './schemas';
const parking = createFields('apartments').find((f) => f.key === 'parking')!;
const name = createFields('apartments').find((f) => f.key === 'name')!;
const document: CapturedDocument = {
  url: 'https://example.com',
  title: 'Home',
  cleanedText: 'Parking included.',
  metadata: {},
  jsonLd: [],
  tables: [],
  wasTruncated: false,
};
const mock = (value: unknown) =>
  vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: { parts: [{ text: JSON.stringify(value) }] },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
      }),
    ),
  );
it('validates a Gemini contract and logs actual tokens', async () => {
  const onUsage = vi.fn().mockResolvedValue(undefined);
  const fetch = mock({
    title: 'Home',
    values: {
      [parking.id]: {
        value: true,
        confidence: 'high',
        currency: null,
        unit: null,
        evidence: [{ quote: 'Parking included.', sourceUrl: document.url }],
      },
    },
  });
  const provider = new GeminiProvider({
    apiKey: 'test-only',
    model: 'gemini-test',
    fetch,
    onUsage,
  });
  const result = await provider.extractItem({ document, fields: [parking] });
  expect(result.values[parking.id]?.value).toBe(true);
  expect(onUsage).toHaveBeenCalledWith({
    inputTokens: 100,
    outputTokens: 20,
    model: 'gemini-test',
  });
  const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
  expect(body.generationConfig.responseMimeType).toBe('application/json');
});
it('replaces a long structured SEO name with a concise contextual title', async () => {
  const seoName =
    'Edmonton Room For Rent For Rent | Parkallen | Renovated Room Rentals in Parkallen | ID 620701 - RentFaster.caCookie';
  const source: CapturedDocument = {
    ...document,
    title: seoName,
    cleanedText: '6718 110 Street Northwest is a furnished room in Parkallen.',
    jsonLd: [{ '@type': 'Apartment', name: seoName }],
  };
  const fetch = mock({
    title: 'Parkallen Room at 6718 110 St',
    values: {
      [name.id]: {
        value: 'Parkallen Room at 6718 110 St',
        confidence: 'high',
        currency: null,
        unit: null,
        evidence: [
          {
            quote: '6718 110 Street Northwest',
            sourceUrl: source.url,
          },
        ],
      },
    },
  });
  const result = await new GeminiProvider({
    apiKey: 'test-only',
    model: 'gemini-test',
    fetch,
  }).extractItem({ document: source, fields: [name] });
  expect(result.title).toBe('Parkallen Room at 6718 110 St');
  expect(result.values[name.id]?.value).toBe('Parkallen Room at 6718 110 St');
  const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
  expect(body.contents[0].parts[0].text).toContain(name.id);
  expect(body.generationConfig.responseJsonSchema.properties.title).toEqual({
    type: 'string',
    description:
      'A distinctive plain-language title of 2–8 words and at most 60 characters.',
  });
});
it.each([
  { title: 'Home', values: {} },
  {
    title: 'Home',
    values: {
      [parking.id]: { value: 'Yes', confidence: 'high', evidence: [] },
    },
  },
  {
    title: 'Home',
    values: { [parking.id]: { value: true, confidence: 'high', evidence: [] } },
  },
])('rejects invalid extraction contracts', async (result) => {
  const provider = new GeminiProvider({
    apiKey: 'test-only',
    model: 'gemini-test',
    fetch: mock(result),
  });
  await expect(
    provider.extractItem({ document, fields: [parking] }),
  ).rejects.toThrow();
});
it('rejects malformed JSON', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'not JSON' }] } }],
      }),
    ),
  );
  await expect(
    new GeminiProvider({
      apiKey: 'test-only',
      model: 'gemini-test',
      fetch,
    }).extractItem({ document, fields: [parking] }),
  ).rejects.toThrow();
});
it('rejects query fields outside the project', async () => {
  const p = new GeminiProvider({
    apiKey: 'test-only',
    model: 'gemini-test',
    fetch: mock({
      filters: [{ fieldId: crypto.randomUUID(), operator: 'eq', value: true }],
    }),
  });
  await expect(
    p.interpretQuery({ query: 'with parking', fields: [parking] }),
  ).rejects.toThrow();
});
it('does not retry permanent provider errors', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response('Bad request', { status: 400 }));
  await expect(
    new GeminiProvider({
      apiKey: 'test-only',
      model: 'gemini-test',
      fetch,
    }).extractItem({ document, fields: [parking] }),
  ).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('preserves the provider reason after retrying a temporary failure', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          error: { message: 'Quota is temporarily exhausted.' },
        }),
        { status: 429 },
      ),
  );
  await expect(
    new GeminiProvider({
      apiKey: 'test-only',
      model: 'gemini-test',
      fetch,
    }).extractItem({ document, fields: [parking] }),
  ).rejects.toThrow(
    'Gemini gemini-test (429): Quota is temporarily exhausted.',
  );
  expect(fetch).toHaveBeenCalledTimes(3);
});
it('explains a missing model using available models without retrying inference or leaking a key', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: 'Model unavailable for test-sensitive-key' },
        }),
        { status: 404 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          models: [
            {
              name: 'models/gemini-3.1-flash-lite',
              supportedGenerationMethods: ['generateContent'],
            },
          ],
        }),
      ),
    );
  const provider = new GeminiProvider({
    apiKey: 'test-sensitive-key',
    model: 'missing-model',
    fetch,
  });
  await expect(
    provider.extractItem({ document, fields: [parking] }),
  ).rejects.toThrow(
    'Model unavailable for [redacted] Available Flash-Lite models: gemini-3.1-flash-lite.',
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1]?.[1]?.method).toBeUndefined();
});
