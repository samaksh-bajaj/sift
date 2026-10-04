# Privacy notice — development draft

Sift saves information from pages you deliberately choose, so you can compare options in a private research project.

## What is captured

When you select **Save current page**, the Chrome extension collects the chosen page's URL, title, relevant metadata, JSON-LD, visible tables, and cleaned page text. It removes form controls and form content, editable content, hidden elements, navigation, and common cookie/ad regions. Automated removal is imperfect; check that a page is appropriate to send before saving it.

The extension does not collect general browsing history, watch all visited pages, capture unrelated tabs, or send a page before you request a save.

## Where it goes

For connected accounts, sanitized page content is transmitted to the configured Supabase backend. Relevant content is sent to the configured AI provider (Gemini by default) to extract facts, interpret a query, or populate a newly added field. The backend stores structured values, source quotes, sanitized source snapshots, account/project information, and usage records.

The AI provider's data-handling terms depend on the account and billing tier you configure. Review those terms before a public launch; this draft does not promise a particular provider retention or training policy.

## Access and retention

Project records are restricted to their owner using authentication and database row-level security. Source snapshots are private. Passwords are handled by Supabase Auth. Provider secrets are not sent to the browser.

Deleting an item or project through the app removes its structured records and associated snapshots. Usage accounting can remain to enforce quotas and diagnose service operation. This development build does not yet include a self-service account deletion workflow or a scheduled retention policy.

Demo mode uses fictional data and browser local storage, with no cloud sync or AI requests. **Reset demo** clears that demo state.

## Before public release

The operator must supply a contact address, final retention/deletion terms, applicable provider details, and a public URL for this notice before Chrome Web Store distribution.
