# Cloudflare static deployment

The requested deployment target is Cloudflare with Supabase as the shared backend. The seven Supabase Edge Functions are deployed to the user’s Sift project (`nontxbyxbcmckzehfkfy`). Cloudflare hosting has not yet been deployed. Backend access currently allows `http://127.0.0.1:5173` and `http://localhost:5173`; the installed Chrome extension origin `chrome-extension://gcflgeflkjdjoieckdgcpcmjipojdhbf` is also allowed. Its preflight and authentication enforcement were verified.

Build command: `pnpm --filter @sift/web build`.

Output directory: `apps/web/dist`.

Use Node 22.12+ (or Node 24). Configure only `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_WEB_URL` in the frontend build environment. Configure Gemini and the service-role secret only in Supabase Edge Functions.

The `public/_redirects` file provides SPA routing so links to `/projects/:id`, `/sign-in`, and `/sign-up` open the application. After deployment, update Supabase Auth's site/redirect URLs and Edge Function `ALLOWED_ORIGINS`, then rebuild the extension with the deployed workspace URL.

Run the live acceptance checklist in `STATUS.md` before inviting users. Recheck current hosting and provider plans rather than relying on the historical pricing statements in the original specification.
