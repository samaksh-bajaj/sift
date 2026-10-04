# Implementation and acceptance status

## Implemented locally

- pnpm monorepo, strict TypeScript, lint/format checks, Vitest, Playwright, repeatable PostgreSQL security tests.
- Seven shared templates plus custom projects; validated typed fields and values.
- Supabase schema, owner RLS, storage isolation, server-only metering and quota reservations, atomic capture admission and extraction commits.
- React sign-up/sign-in/sign-out, project dashboard, comparison table, sorting/filtering, visible columns, field management, evidence drawer, manual corrections, deletion, and CSV/XLSX exports.
- MV3 extension authentication, project selection, explicit page capture, sanitization, JSON-LD/tables/metadata, progress/error states, duplicate actions, and workspace links.
- Provider interface and Gemini structured-output implementation; runtime contract validation and exact evidence checks. Explicit supported structured facts are resolved before requesting inference for remaining fields.
- Constrained natural-language filters/sort/search/aggregation interpreted server-side and applied deterministically in the browser. Mixed known/unknown currency sets cannot be ordered or numerically aggregated together.
- Targeted field extraction from stored snapshots. Small multi-item backfills run sequentially from field management; manual corrections survive backfills and re-extraction. Batch-provider processing is a future improvement.
- Bounded transient provider retries, request/body limits, configurable quotas, usage recording, and content-free operation logs.
- Fictional local fixtures and a clearly labeled browser-only demo.

## Required before calling the MVP complete

1. Completed: Sift project connected, migrations applied, Gemini secret present, and all seven Edge Functions deployed. Every endpoint was checked to reject unauthenticated requests with HTTP 401 and accept the configured local web and extension origins.
2. Completed: registration, login, real private Storage upload, live Gemini extraction, duplicate updates, background extraction status, and the production Chrome toolbar flow were exercised with apartment listings.
3. Verify direct cross-account API isolation against a second live account.
4. Expand live Gemini evaluation beyond the exercised listings. The configured token prices remain editable estimates, not a verified current billing promise.
5. Expand the fixture set into a manually labeled 30–50-source accuracy benchmark and evaluate real extraction. Mocked contract tests are not an extraction-quality measurement.
6. Review the privacy draft, choose free-tier versus paid-tier Gemini data handling, and deploy the static web build to the user's Cloudflare account.

## Intentional limits

- Demo queries use a small literal parser; unsupported wording is rejected. Live accounts use the provider interpreter.
- Public URL/file ingestion, subjective ranking, large background batch jobs, public sharing, and polished PDF reports are not implemented in this initial slice. The shared captured-document and item interfaces support future ingestion methods.
- Field labels can be renamed; existing field data types cannot be changed in place because that needs explicit value migration. Add a new field for a different type.
- Source evidence is checked for exact presence and allowed URL. This catches invented quotes but does not prove that a quote semantically entails an extracted value. Human verification and the accuracy benchmark remain important.
- Database tests use a PostgreSQL harness with minimal Supabase platform interfaces, not a complete Supabase service stack.
- Deletion through the application removes associated snapshots. Direct table deletion by a privileged database operator may leave storage objects; production housekeeping should handle such administrative operations.
