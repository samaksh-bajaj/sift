# Vercel static deployment

The web workspace deploys to Vercel as a static build, with Supabase as the shared backend. The seven Supabase Edge Functions are deployed to the Sift project (`kyhejuyczptkvdeopvll`). The production workspace is https://sift-delta-vert.vercel.app. Backend access currently allows that origin, `http://127.0.0.1:5173`, `http://localhost:5173`, and the installed Chrome extension origin `chrome-extension://canfkeihololoebhbnodeglhhhjadapl`; unlisted origins are rejected. An unpacked extension gets a different ID on another machine or path, so add that origin to `ALLOWED_ORIGINS` when it changes.

Build command: `pnpm --filter @sift/web build`.

Output directory: `apps/web/dist`.

Use Node 22.13+ (or Node 24). Configure only `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_WEB_URL` in the frontend build environment. Configure Gemini and the service-role secret only in Supabase Edge Functions.

`vercel.json` sets the build and rewrites every path to `index.html` (the `public/_redirects` file does the same on hosts that read it) so links to `/projects/:id`, `/sign-in`, and `/sign-up` open the application. After deployment, update Supabase Auth's site/redirect URLs and Edge Function `ALLOWED_ORIGINS`, then rebuild the extension with the deployed workspace URL.

Work through the open items in `STATUS.md` before inviting users, and check current hosting and provider pricing before relying on the free tiers.
