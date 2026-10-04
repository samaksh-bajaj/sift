import { chromium, expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('unpacked extension captures a fixture, sends sanitized data and displays the saved item', async () => {
  test.setTimeout(60000);
  const root = process.cwd();
  const work = mkdtempSync(path.join(tmpdir(), 'research-extension-test-'));
  const extension = path.join(work, 'extension');
  const env = {
    ...process.env,
    VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'test-public-key-for-local-fixtures-only',
    VITE_WEB_URL: 'http://127.0.0.1:5173',
  };
  for (const args of [
    ['build', '--outDir', extension],
    ['build', '--config', 'vite.background.config.ts', '--outDir', extension],
  ])
    execFileSync(
      process.execPath,
      [path.join(root, 'node_modules/vite/bin/vite.js'), ...args],
      { cwd: path.join(root, 'apps/extension'), env, stdio: 'pipe' },
    );
  const manifest = JSON.parse(
    readFileSync(path.join(extension, 'manifest.json'), 'utf8'),
  );
  expect(manifest.permissions).toEqual([
    'activeTab',
    'scripting',
    'storage',
    'sidePanel',
  ]);
  expect(manifest.host_permissions).not.toContain('<all_urls>');
  // Automation cannot click Chrome's toolbar action. Grant only the local fixture
  // origin in this disposable test build, then exercise the real capture script.
  manifest.host_permissions.push('http://127.0.0.1:5173/*');
  writeFileSync(
    path.join(extension, 'manifest.json'),
    JSON.stringify(manifest),
  );
  const context = await chromium.launchPersistentContext(
    path.join(work, 'profile'),
    {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    },
  );
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    const projectId = '10000000-0000-4000-8000-000000000001';
    const itemId = '30000000-0000-4000-8000-000000000001';
    let captured: Record<string, unknown> | undefined;
    let saves = 0;
    await context.route('http://127.0.0.1:54321/**', async (route) => {
      const url = new URL(route.request().url());
      let body: unknown;
      if (url.pathname.includes('/auth/v1/token'))
        body = {
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
          user: {
            id: '00000000-0000-4000-8000-000000000001',
            email: 'fixture@example.com',
            aud: 'authenticated',
            role: 'authenticated',
          },
        };
      else if (url.pathname.includes('/rest/v1/projects'))
        body = [{ id: projectId, name: 'Fixture Apartments' }];
      else if (url.pathname.includes('/rest/v1/project_fields'))
        body = [{ label: 'Rent' }, { label: 'Parking' }];
      else if (url.pathname.includes('/rest/v1/items'))
        body = saves
          ? [
              {
                id: itemId,
                title: 'Fixture apartment',
                extraction_status: 'complete',
                error: null,
              },
            ]
          : [];
      else if (url.pathname.includes('/functions/v1/extract-item')) {
        const request = route.request().postDataJSON();
        captured = request.document;
        saves++;
        body = {
          item: {
            id: itemId,
            title: 'Fixture apartment',
            extraction_status: 'processing',
          },
          captured: true,
          queued: true,
        };
      } else body = {};
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(body),
      });
    });
    const fixture = await context.newPage();
    await fixture.goto('http://127.0.0.1:5173/fixtures/apartment-1.html');
    const unrelated = await context.newPage();
    await unrelated.goto('http://127.0.0.1:5173/fixtures/job.html');
    await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      const target = tabs.find((t) => t.url?.endsWith('apartment-1.html'));
      if (!target?.id) throw new Error('Fixture tab missing');
      await chrome.storage.session.set({ invokedTabId: target.id });
    });
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/index.html`);
    await panel.getByLabel('Email').fill('fixture@example.com');
    await panel.getByLabel('Password').fill('fixture-password');
    await panel.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      panel.getByRole('option', { name: 'Fixture Apartments' }),
    ).toBeAttached();
    expect(saves).toBe(0);
    await panel
      .getByRole('button', { name: '+ Save current page', exact: true })
      .click();
    await expect(panel.getByRole('status')).toContainText(
      'Page captured — safe to move on',
    );
    expect(saves).toBe(1);
    expect(captured?.url).toContain('apartment-1.html');
    expect(captured?.cleanedText).toContain('Garneau Place');
    expect(JSON.stringify(captured)).not.toContain('DO_NOT_CAPTURE');
    expect(JSON.stringify(captured)).not.toContain('Python engineer');
    await expect(
      panel.getByRole('link', { name: /Fixture apartment/ }),
    ).toBeVisible();
    await expect(panel.getByRole('status')).toContainText(
      'Finished: Fixture apartment',
      { timeout: 5000 },
    );
  } finally {
    await context.close();
    rmSync(work, { recursive: true, force: true });
  }
});
