# Sift

[![CI](https://github.com/samaksh-bajaj/sift/actions/workflows/ci.yml/badge.svg)](https://github.com/samaksh-bajaj/sift/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Sift turns webpages into structured, source-backed comparisons. This repository contains the React workspace, Manifest V3 Chrome extension, shared TypeScript domain package, Supabase database and Edge Functions, and Gemini provider integration described in `docs/SPEC.md`.

**[Try the live demo](https://sift-delta-vert.vercel.app)** — choose **Explore the demo** to use a fictional comparison workspace without creating an account or making AI calls.

## Highlights

- Capture one webpage at a time from the Chrome side panel with explicit user action.
- Turn saved pages into structured comparison rows with Gemini and source evidence.
- Add fields, backfill saved items, filter in natural language, edit values, and export CSV or XLSX.
- Keep user data private with Supabase Auth, owner-scoped Row Level Security, private Storage, and authenticated Edge Functions.
- Continue browsing after capture while extraction completes in the background.

## Try it locally

Requires Node **22.13+** and pnpm **11.19.0**.

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:5173. Without backend configuration, the app starts in a **clearly labeled demo**. Demo records are fictional and persist only in this browser. Reset demo clears those records. This local storage is not used for real account data.

You can filter, sort, inspect evidence, edit values, create/rename/delete projects, add fields, manage columns, populate fields from demo snapshots, and export CSV/XLSX. Demo query interpretation is deliberately limited to the examples shown in the app; it makes no AI calls. Demo backfill matches literal field keys, while the connected backend uses targeted AI extraction.

## Connect real accounts and extraction

1. Create a Supabase project, or run the Supabase CLI locally. Keep the service-role key out of both apps.
2. Copy `apps/web/.env.example` to `apps/web/.env.local` and set your Supabase URL, **public publishable key**, and web app URL. Do the same for `apps/extension/.env.local`.
3. Apply the SQL files in `supabase/migrations` in filename order. They create tables, constraints, RLS, quota admission, storage policies, and transaction functions. Template definitions live in the shared package and are copied into each new project by the transactional `create_project` function.
4. Set backend secrets using `supabase/functions/.env.example` as the reference. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to hosted Edge Functions. Set `GEMINI_API_KEY`, the model, quotas, and **ALLOWED_ORIGINS** there. Never prefix a backend secret with `VITE_`.
5. Run `pnpm build`. It builds both apps and bundles shared backend code into `supabase/functions/_shared/domain.js`.
6. Deploy the seven Edge Functions: `extract-item`, `interpret-query`, `backfill-field`, `suggest-fields`, `edit-value`, `delete-item`, and `delete-project`. The Supabase configuration disables gateway JWT checks so publishable keys work; **each handler independently validates the user's bearer token with Supabase Auth before accessing user data**.
7. Configure the Supabase Auth site URL and allowed redirect URLs for your web origin. Use email/password registration in the web app. For hosted projects, confirm the email if required by your Auth settings.
8. Restart the web development server after editing its environment, and rebuild/reload the extension after editing its environment.

The origin allowlist is exact and comma-separated, for example `http://127.0.0.1:5173,http://localhost:5173,chrome-extension://YOUR_EXTENSION_ID`. An empty list denies browser-origin requests. Add the actual extension ID after loading it; do not use a wildcard.

For local functions, use the Supabase CLI's `functions serve --env-file supabase/functions/.env` after filling that ignored file. For hosted functions, store the values with Supabase's secret management. **Do not paste secret values into chat or commit them.**

## Load the Chrome extension

1. Run `pnpm --filter @sift/extension build`.
2. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/extension/dist`.
3. Add its displayed extension origin to backend `ALLOWED_ORIGINS`.
4. Click the extension icon on a listing, sign in, select a project, and choose **Save current page**.
5. After navigating to a different site, click the icon again if Chrome requests a fresh invocation.

Production permissions are `activeTab`, `scripting`, `storage`, and `sidePanel`. Host access is limited to the configured backend. There is no browsing-history permission, blanket website access, automatic page capture, or background tab scanning. Session tokens are stored in Chrome extension storage; AI and service-role secrets stay on the backend.

## Verification

```sh
pnpm check             # lint, strict TypeScript, unit/contract tests, production builds
pnpm format:check
pnpm typecheck:backend # Deno check of the shared handler used by all seven functions
pnpm test:backend      # mocked backend authorization and request-boundary tests
pnpm exec playwright install chromium
pnpm test:e2e          # web workflow and unpacked extension with local fixtures
pnpm test:db           # requires Docker; disposable PostgreSQL container
```

The database harness supplies minimal Supabase `auth`/`storage` interfaces around **real PostgreSQL** and runs the migrations and access tests. It does not replace verification against a real Supabase deployment. It exposes no host port and removes its container when finished. Override `TEST_POSTGRES_IMAGE` if you want another compatible local PostgreSQL image.

The extension test adds a localhost-only host permission to a disposable test copy because Playwright cannot click Chrome's native extension toolbar action. It tests actual script injection, sanitization, authentication UI, backend request shape, and saved-item display. A manual check of the real `activeTab` invocation remains necessary.

## Structure

- `apps/web`: authenticated SPA and isolated demo mode.
- `apps/extension`: Chrome side panel and explicit page capture.
- `packages/shared`: Zod contracts, templates, deterministic operations, sanitizer, structured metadata extraction, provider interface, Gemini integration.
- `supabase/migrations`: database and storage access rules, typed values, transactional quota/capture admission.
- `supabase/functions`: authenticated handlers. The checked-in generated domain bundle is rebuilt from shared source; edit the shared source, not the bundle.
- `tests/fixtures`: local HTML samples; never scrape live sites in automated tests.
- `docs`: deployment, privacy, and remaining verification notes.

## Current delivery boundary

This implementation is deployed on Vercel and connected to a hosted Supabase project. The migrations and Gemini secret are configured, all seven Edge Functions are deployed, and every endpoint has been checked to reject unauthenticated requests and unlisted origins. Sign-up, authenticated capture from the real Chrome toolbar flow, and live Gemini extraction have been exercised end to end. Cross-account isolation and a broader extraction-accuracy benchmark still need live acceptance testing. See `docs/STATUS.md` for the remaining work.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request and [SECURITY.md](SECURITY.md) for private vulnerability reporting. Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Sift is available under the [MIT License](LICENSE).
