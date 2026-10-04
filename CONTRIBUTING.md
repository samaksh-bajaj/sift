# Contributing to Sift

Thanks for considering a contribution. Bug reports, focused feature proposals,
documentation improvements, and tested fixes are welcome.

## Before opening a change

- Search existing issues and pull requests to avoid duplicates.
- Open an issue before starting a large feature or architectural change.
- Keep pull requests focused on one problem.
- Never include credentials, private webpages, personal data, or proprietary
  source material in issues, fixtures, commits, or screenshots.

## Local setup

Sift requires Node.js 22.13 or newer and pnpm 11.19.0.

```sh
pnpm install
pnpm dev
```

The app starts in its fictional, browser-only demo when Supabase variables are
not configured. Use the checked-in `.env.example` files as references if you
need to exercise the connected workflow. Keep all `.env` files local.

## Validation

Run these checks before opening a pull request:

```sh
pnpm format:check
pnpm check
```

Changes to browser capture or end-to-end behavior should also run the relevant
Playwright tests. Database or policy changes should run `pnpm test:db` with
Docker available.

## Pull requests

Explain the problem and resulting behavior, include screenshots for visible UI
changes, and list the checks you ran. By contributing, you agree that your
contribution is licensed under the repository's MIT License.

All participants must follow the [Code of Conduct](CODE_OF_CONDUCT.md).
