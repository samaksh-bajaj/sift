# Sift

Sift turns webpages into structured, source-backed comparisons.

The product spec lives in `project_instructions_ aggregator.md`. This repository is a pnpm monorepo; the shared domain package, web workspace, Chrome extension, and Supabase backend are added under `packages/`, `apps/`, and `supabase/`.

## Development

Requires Node 22+ and pnpm 11.

```sh
pnpm install
pnpm lint
pnpm typecheck
```
