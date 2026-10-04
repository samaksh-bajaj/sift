import { strict as assert } from 'node:assert';
Deno.env.set('SUPABASE_URL', 'http://test-backend.invalid');
Deno.env.set(
  'SUPABASE_SERVICE_ROLE_KEY',
  'test-service-role-key-not-a-real-secret',
);
Deno.env.set('GEMINI_API_KEY', 'test-gemini-key-not-a-real-secret');
Deno.env.set('ALLOWED_ORIGINS', 'http://localhost:5173');
const { handle } = await import('./handler.ts');
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost/functions/v1/extract-item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
Deno.test(
  'rejects unauthenticated calls before any external work',
  async () => {
    const res = await handle('extract-item')(request({}));
    assert.equal(res.status, 401);
    assert.match((await res.json()).error, /Sign in/);
  },
);
Deno.test('rejects origins outside the allowlist', async () => {
  const res = await handle('extract-item')(
    request({}, { Origin: 'https://untrusted.example' }),
  );
  assert.equal(res.status, 403);
  await res.text();
});
Deno.test('handles approved preflight without credentials', async () => {
  const res = await handle('extract-item')(
    new Request('http://localhost', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173' },
    }),
  );
  assert.equal(res.status, 204);
  assert.equal(
    res.headers.get('Access-Control-Allow-Origin'),
    'http://localhost:5173',
  );
});
Deno.test(
  'rejects cross-user project before saving or calling AI',
  async () => {
    const original = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/auth/v1/user'))
        return new Response(
          JSON.stringify({
            id: '00000000-0000-4000-8000-000000000001',
            aud: 'authenticated',
            role: 'authenticated',
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      if (url.includes('/rest/v1/projects'))
        return new Response('[]', {
          headers: { 'Content-Type': 'application/json' },
        });
      throw new Error(`Unexpected external request: ${url}`);
    };
    try {
      const res = await handle('extract-item')(
        request(
          {
            projectId: '10000000-0000-4000-8000-000000000002',
            requestId: '20000000-0000-4000-8000-000000000001',
            document: {
              url: 'https://example.com',
              title: 'Fixture',
              jsonLd: [],
              metadata: {},
              tables: [],
              cleanedText: 'Rent 1200',
              wasTruncated: false,
            },
          },
          { Authorization: 'Bearer fixture-token' },
        ),
      );
      assert.equal(res.status, 404);
      assert.equal(calls.length, 2);
      assert.match((await res.json()).error, /Project not found/);
    } finally {
      globalThis.fetch = original;
    }
  },
);
