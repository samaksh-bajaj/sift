# Sift

## Codex Engineering Specification

### 1. Project Summary

Build a research and comparison platform that lets users collect information from arbitrary webpages into structured research projects.

The primary initial use case is:

> A user researching apartments, hotels, jobs, products, cars, courses, or another category browses several websites, saves interesting pages, and automatically receives a normalized comparison table that can be filtered, sorted, queried with natural language, edited, and exported.

The product must consist of two connected interfaces:

1. **Chrome extension** — fast webpage capture while the user browses.
2. **Standalone web application** — persistent research projects, comparison tables, AI queries, filtering, editing, exports, and project management.

The extension is an ingestion mechanism, not the entire product.

The core product thesis is:

> **Save anything you find online. Turn it into a structured, source-backed comparison.**

Do not build a generic AI chatbot with bookmarks.

The differentiated functionality is:

* cross-site structured extraction;
* normalization into a common schema;
* field-level source provenance;
* deterministic filtering and sorting;
* dynamic comparison fields;
* retrospective extraction when a user adds a new field;
* persistent research projects;
* natural-language querying over structured data;
* CSV/XLSX export;
* eventual PDF reporting and file/URL ingestion.

---

# 2. Product Problem

Users doing comparative research commonly gather information from many heterogeneous sources.

Examples:

* apartments across RentFaster, Kijiji, property-management sites and other rental websites;
* hotels across Booking, Expedia, hotel websites and travel sites;
* products across manufacturers and retailers;
* jobs across LinkedIn, company career pages, Indeed and PDFs;
* cars across dealer sites and marketplaces;
* university programs across university webpages;
* insurance plans or other complex services.

Each source presents overlapping information differently.

The user currently has to:

1. open many tabs;
2. manually remember or copy details;
3. construct a spreadsheet;
4. decide which columns matter;
5. return to old pages when they realize another variable matters;
6. manually verify where each fact came from;
7. manually sort/filter the information.

The application should automate steps 3–7 without attempting to automate the user's browsing decisions.

---

# 3. Primary User Experience

## 3.1 Create a research project

User opens the web app or extension and creates:

**Project: Edmonton Apartments**

The project uses an initial apartment schema such as:

* property name
* address
* monthly rent
* bedrooms
* bathrooms
* square footage
* utilities included
* parking
* parking cost
* laundry
* furnished
* pets
* gym
* swimming pool
* lease term
* security deposit
* source URL

The schema must remain editable.

---

## 3.2 Capture a webpage

User browses normally.

On an apartment listing, the user invokes the extension and chooses:

**Save to → Edmonton Apartments**

The extension should collect relevant information from the current webpage and send a sanitized representation to the backend.

It must NOT send raw browsing history or unrelated tabs.

The system extracts structured values and creates a table row.

Example:

| Property      |   Rent | Beds | Laundry  | Parking | Pool |
| ------------- | -----: | ---: | -------- | ------- | ---- |
| Garneau Place | $1,250 |    1 | In-suite | Yes     | No   |

---

# 4. Hybrid Product Architecture

The product must be built around a shared backend.

```text
                     ┌──────────────────────┐
                     │   Chrome Extension   │
                     │   Page Capture UI    │
                     └──────────┬───────────┘
                                │
                                │
                     ┌──────────▼───────────┐
                     │                      │
                     │  Research Platform   │
                     │                      │
                     └──────────┬───────────┘
                                │
       ┌────────────────────────┼─────────────────────┐
       │                        │                     │
       ▼                        ▼                     ▼
 Structured extraction     Project storage     AI query layer
       │                        │                     │
       └────────────────────────┼─────────────────────┘
                                ▼
                     Structured comparison data
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
          Web table          Exports            Sharing
```

The Chrome extension must never become the source of truth.

All persistent research data belongs in the backend.

---

# 5. Recommended Technology Stack

Use TypeScript throughout unless there is a strong technical reason not to.

## Repository

Use a pnpm monorepo.

Recommended structure:

```text
sift/
│
├── apps/
│   ├── web/
│   └── extension/
│
├── packages/
│   └── shared/
│       ├── schemas/
│       ├── templates/
│       ├── filters/
│       └── types/
│
├── supabase/
│   ├── migrations/
│   ├── tests/
│   └── functions/
│       ├── extract-item/
│       ├── interpret-query/
│       ├── suggest-fields/
│       └── backfill-field/
│
├── tests/
│   └── fixtures/
│
├── package.json
└── pnpm-workspace.yaml
```

## Frontend

Use:

* React;
* Vite;
* TypeScript strict mode;
* Tailwind CSS or similarly lightweight styling;
* TanStack Table if useful for comparison-table state;
* Zod for runtime validation.

Do not introduce Next.js unless a requirement genuinely needs SSR.

The application is primarily an authenticated SPA, so static hosting is sufficient for the MVP.

## Backend

Use Supabase for:

* PostgreSQL;
* authentication;
* Row Level Security;
* object storage;
* Edge Functions.

Supabase currently provides a free tier including 50,000 MAU, 500 MB database storage, 1 GB object storage and 500,000 Edge Function invocations. [Certain]

Supabase Auth integrates with JWT authentication and PostgreSQL Row Level Security. [Certain]

This is preferable for the MVP to maintaining a separate FastAPI server because the project does not need a continuously running application server.

Keep business logic sufficiently isolated that migration to another backend remains possible.

## Web hosting

Deploy the static React application to Cloudflare.

Static asset requests on Cloudflare Pages are currently free and unlimited. [Certain]

Do not deploy a paid always-on backend server for the MVP.

---

# 6. LLM Strategy

## Default model

Use:

`gemini-2.5-flash-lite`

Gemini 2.5 Flash-Lite currently costs:

* $0.10 / 1M text input tokens;
* $0.40 / 1M output tokens;
* $0.05 / 1M input and $0.20 / 1M output for Batch processing.

[Certain]

Google currently offers free-tier Gemini 2.5 Flash-Lite usage, although free-tier data may be used to improve Google's products whereas paid-tier data is not. [Certain]

Gemini 2.5 Flash-Lite supports structured JSON output using a supplied JSON Schema. [Certain]

## Critical architectural requirement

DO NOT directly couple application code to Gemini.

Create:

```ts
interface LLMProvider {
  extractItem(input: ExtractionInput): Promise<ExtractionResult>;
  interpretQuery(input: QueryInput): Promise<FilterAST>;
  suggestFields(input: SuggestFieldsInput): Promise<SuggestedField[]>;
}
```

Then implement:

```text
GeminiProvider
```

Environment configuration:

```text
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.5-flash-lite
```

This must make switching to OpenAI, Groq, another Gemini model, or a self-hosted model possible without changing core application logic.

---

# 7. Do Not Use the LLM as a Database

This is a mandatory architecture rule.

An LLM should be used for:

1. extracting structured facts from ambiguous webpage content;
2. interpreting natural-language queries;
3. suggesting useful comparison fields;
4. subjective comparison or summarization when explicitly requested.

An LLM should NOT be used for:

* sorting numbers;
* filtering booleans;
* arithmetic;
* database retrieval;
* CSV generation;
* duplicate detection;
* simple aggregation;
* deterministic comparisons.

Example user request:

> Show me apartments under $1,400 with a pool and parking.

Do NOT send every apartment description to the model.

Instead provide the field schema:

```json
{
  "monthly_rent": "number",
  "pool": "boolean",
  "parking": "boolean"
}
```

The model should generate a constrained AST:

```json
{
  "operator": "AND",
  "conditions": [
    {
      "field": "monthly_rent",
      "operator": "lt",
      "value": 1400
    },
    {
      "field": "pool",
      "operator": "eq",
      "value": true
    },
    {
      "field": "parking",
      "operator": "eq",
      "value": true
    }
  ]
}
```

Validate that AST with Zod.

Never execute raw SQL generated by an LLM.

Apply the validated filters deterministically.

---

# 8. Chrome Extension

Use Manifest V3.

Chrome's Side Panel API is available for MV3 extensions and provides a persistent interface alongside webpages. [Certain]

## Required permissions

Minimize permissions.

Prefer:

```json
{
  "permissions": [
    "activeTab",
    "scripting",
    "storage",
    "sidePanel"
  ]
}
```

Avoid:

```text
<all_urls>
```

unless testing proves it is unavoidable.

`activeTab` grants temporary access to the current tab after an explicit user invocation and can be combined with the Scripting API without requesting persistent access to every website. [Certain]

## Capture interaction

Recommended flow:

1. User clicks the extension action.
2. This grants temporary `activeTab` access.
3. Open the side panel.
4. Show current active project.
5. Allow `Save current page`.
6. Inject the extraction script into that page.
7. Extract and sanitize content.
8. Send it to the backend.
9. Display extraction progress.
10. Display the newly created row.

If Chrome's permission lifecycle causes problems after the user navigates to a new origin, require another explicit extension invocation rather than requesting blanket browser access.

Privacy is more important than eliminating one click.

---

# 9. Local Webpage Extraction

Do NOT immediately send `document.body.innerText` to Gemini.

Implement a deterministic extraction stage first.

Collect:

### Page metadata

* URL;
* canonical URL;
* document title;
* meta description;
* OpenGraph metadata.

### Structured data

Extract:

* JSON-LD;
* schema.org fields;
* relevant microdata where easy;
* visible tables;
* definition lists.

Structured page data should take priority over LLM inference where reliable.

### Visible content

Extract useful visible text while removing:

* `<script>`;
* `<style>`;
* navigation;
* footers;
* hidden elements;
* cookie banners where identifiable;
* repeated menus;
* ads where identifiable;
* excessive whitespace.

Consider Mozilla Readability for a candidate main-content extraction, but do not depend solely on Readability because listing pages may place key attributes outside article-style content.

Preserve headings and table relationships.

---

# 10. Input Reduction

Cost control must begin before the LLM call.

Create a normalized document:

```ts
interface CapturedDocument {
  url: string;
  canonicalUrl?: string;
  title: string;
  description?: string;
  jsonLd: unknown[];
  metadata: Record<string, string>;
  tables: ExtractedTable[];
  cleanedText: string;
}
```

Deduplicate repeated text.

Create a hash of the normalized document.

Recommended limits:

```text
soft cleaned-text target: 30,000 characters
hard maximum: 60,000 characters
```

If content exceeds the hard maximum:

1. always preserve metadata;
2. always preserve JSON-LD;
3. always preserve tables;
4. score content sections based on project-field relevance;
5. retain the most relevant sections;
6. clearly mark truncation in internal metadata.

The exact character thresholds should remain configuration values.

---

# 11. Project Templates

Create templates in shared application code.

Initial templates:

## Apartments

* name
* address
* rent
* bedrooms
* bathrooms
* square feet
* utilities
* parking
* parking cost
* laundry
* furnished
* pets
* gym
* pool
* lease term
* deposit

## Hotels

* hotel name
* location
* nightly rate
* total stay price
* rating
* pool
* gym
* breakfast
* parking
* parking cost
* resort fee
* airport shuttle
* cancellation policy

## Jobs

* company
* role
* location
* remote/hybrid/on-site
* salary
* employment type
* term length
* deadline
* requirements
* skills
* sponsorship/work authorization
* application URL

## Products

* product
* brand
* price
* major specifications
* rating
* warranty
* shipping

## Cars

* make
* model
* year
* price
* mileage
* drivetrain
* accident information
* seller
* important features

## Courses / Programs

* institution
* program
* tuition
* duration
* location
* prerequisites
* deadline
* delivery format

## Custom

Allow users to define arbitrary fields.

The templates are starting schemas, not rigid schemas.

---

# 12. Dynamic Fields

Users must be able to add fields after collecting items.

Example:

User has 40 apartments and realizes:

> I care whether utilities are included.

User creates:

```text
Utilities included?
```

The application should offer:

**Populate this field for existing items.**

The backend then reprocesses stored sanitized source documents for that field only.

Do not send the complete original schema again if only one field is being backfilled.

For small backfills, standard inference is acceptable.

For large noninteractive backfills, design the provider so Batch inference can eventually be used because Gemini 2.5 Flash-Lite Batch pricing is currently half its standard token price. [Certain]

---

# 13. Automatic Field Suggestions

A later MVP feature should detect potentially useful recurring attributes.

Example:

Existing hotel schema:

```text
price
rating
pool
breakfast
parking
```

After several pages contain information about:

```text
resort fee
cancellation policy
airport shuttle
```

the interface may suggest:

> Frequently found fields:
>
> * Resort fee
> * Cancellation policy
> * Airport shuttle

Do not silently alter the project's schema without user approval.

For custom projects, `suggest-fields` may inspect the first item and propose 6–12 useful comparison dimensions.

---

# 14. Provenance Is Mandatory

Each AI-extracted value must store evidence.

Example:

```text
Parking
Included
```

User should be able to click the value and see:

```text
"Heated underground parking included in monthly rent."
Source: example.com/listing/123
```

Store provenance with every extracted field.

Example structure:

```ts
interface FieldEvidence {
  quote: string;
  sourceUrl: string;
  startOffset?: number;
  endOffset?: number;
}
```

The model should return evidence with every non-null extracted field.

Never manufacture evidence.

If the source does not support a field:

```text
value = null
evidence = []
```

Do not have the model guess values from industry norms.

---

# 15. Confidence

Store:

```text
high
medium
low
```

or a numerical internal confidence indicator.

Confidence must not be presented as mathematically calibrated unless actual calibration testing has been performed.

Use it mainly for:

* highlighting questionable extractions;
* deciding which values users should verify;
* debugging.

---

# 16. Data Model

Use UUID primary keys.

## projects

```text
id
user_id
name
template_type
description
created_at
updated_at
```

## project_fields

```text
id
project_id
key
label
data_type
unit
currency
enum_options_json
position
created_at
```

Supported types:

```text
text
number
boolean
date
enum
list
currency
url
```

## items

```text
id
project_id
title
source_url
canonical_url
content_hash
extraction_status
created_at
updated_at
```

Possible extraction statuses:

```text
pending
processing
complete
partial
failed
```

## item_field_values

```text
id
item_id
field_id

value_text
value_number
value_boolean
value_date
value_json

currency
unit
confidence
evidence_json

created_at
updated_at
```

Only the appropriate typed value column should be populated.

Do not store everything as untyped text.

## source_documents

```text
id
item_id
storage_path
text_hash
metadata_json
jsonld_json
character_count
was_truncated
created_at
```

## usage_events

```text
id
user_id
event_type
model
input_tokens
output_tokens
estimated_cost_usd
created_at
```

Track costs from day one.

---

# 17. Source Snapshot Storage

To support retrospective field extraction, save the cleaned source representation.

Do NOT save the entire raw webpage HTML by default.

Store:

* cleaned text;
* relevant metadata;
* JSON-LD;
* extracted tables.

Compress the source document if convenient.

Use Supabase Storage instead of placing large documents directly in relational tables.

Provide a future option to delete stored source snapshots without necessarily deleting already extracted structured values.

---

# 18. Authentication and Security

Implement Supabase email/password authentication first.

Google OAuth may be added later.

Both the extension and web app use the user's Supabase JWT.

The public Supabase publishable key may be used client-side as intended, but database authorization must depend on Row Level Security.

Never expose:

* Supabase service-role key;
* Gemini API key;
* any backend secret.

The Gemini key must exist only in an Edge Function secret/environment variable.

Every user-owned table must have RLS enabled.

Write explicit policies for:

* SELECT;
* INSERT;
* UPDATE;
* DELETE.

Users must only access:

```text
their projects
their fields
their items
their source documents
their usage
```

Supabase specifically recommends enabling RLS and testing both grants and policies for exposed tables. [Certain]

Create automated RLS tests.

---

# 19. Extraction API

Implement:

```text
POST /functions/v1/extract-item
```

Request:

```json
{
  "projectId": "uuid",
  "document": {
    "url": "...",
    "canonicalUrl": "...",
    "title": "...",
    "metadata": {},
    "jsonLd": [],
    "tables": [],
    "cleanedText": "..."
  }
}
```

The backend must:

1. authenticate user;
2. verify project ownership;
3. validate request;
4. check quota;
5. detect duplicates;
6. store sanitized source document;
7. load current project schema;
8. create Gemini structured-output schema;
9. call LLM;
10. validate response with Zod;
11. normalize units/currency conservatively;
12. store typed field values;
13. store evidence;
14. log token usage;
15. return resulting item.

Make the operation idempotent where possible.

---

# 20. Extraction Prompt Rules

The extraction system prompt should explicitly say:

* extract only information supported by supplied source content;
* never infer absent amenities;
* distinguish `false` from `unknown`;
* use `null` for unknown;
* do not assume "not mentioned" means "no";
* include exact supporting evidence;
* normalize obvious numeric formats;
* do not fabricate currency;
* do not invent addresses;
* respect provided field types.

Example distinction:

```text
"Pool: No" → false
No mention of pool → null
```

This distinction is critical.

---

# 21. Natural-Language Querying

Add an input:

```text
Ask or filter...
```

Examples:

```text
Show apartments under $1,400 with parking.
```

```text
Only hotels with pools and free breakfast.
```

```text
Sort these by price.
```

```text
Which jobs mention Python?
```

Use an LLM only to translate natural language into a constrained operation.

Supported initial operations:

```text
filter
sort
search text
aggregate
```

Do not initially support arbitrary autonomous actions.

AST example:

```ts
type FilterAST = {
  filters: Array<{
    fieldId: string;
    operator:
      | "eq"
      | "neq"
      | "lt"
      | "lte"
      | "gt"
      | "gte"
      | "contains"
      | "in";
    value: unknown;
  }>;
  sort?: {
    fieldId: string;
    direction: "asc" | "desc";
  };
};
```

Reject fields that are not part of the project.

Reject unsupported operators.

---

# 22. Subjective AI Analysis

Queries such as:

> Which three apartments offer the best value?

cannot be reduced entirely to deterministic filtering.

For these requests:

1. first use deterministic filtering to reduce the candidate set where appropriate;
2. construct compact structured rows;
3. send only relevant fields to the LLM;
4. ask the LLM to explain its ranking;
5. make clear which criteria influenced the answer.

Do not resend original webpage text unless required.

---

# 23. Web Application

Required pages:

## Authentication

```text
/sign-in
/sign-up
```

## Dashboard

```text
/projects
```

Display:

* project name;
* template;
* number of saved items;
* last updated;
* create project button.

## Project

```text
/projects/:id
```

Main interface:

```text
Project title

[ Ask or filter... ]

Filters
Sort
Add field
Export

───────────────────────────────────────────────

| Property | Rent | Beds | Laundry | Pool | ... |
|----------|------|------|---------|------|-----|
| ...      | ...  | ...  | ...     | ...  | ... |
```

Support:

* column sorting;
* filters;
* column visibility;
* field editing;
* row editing;
* source links;
* evidence inspection;
* deletion;
* duplicate warning.

## Item Detail

Provide an item drawer or modal showing:

* all extracted fields;
* source URL;
* evidence;
* extraction confidence;
* edit controls.

---

# 24. Extension Side Panel

Side panel should contain:

```text
Current project:
[ Edmonton Apartments ▼ ]

[ Save current page ]

Recent saves:
✓ Garneau Place — $1,250
✓ Whyte Avenue — $1,175

[ Open full workspace ]
```

Keep it intentionally small.

Do not recreate the entire web application inside the extension.

---

# 25. Standalone URL Import

The platform must not permanently depend on the Chrome extension.

Add architecture support for:

```text
Paste URL
```

Example:

```text
Add to Toronto Hotels

https://...
https://...
https://...

[ Import ]
```

Treat this as secondary ingestion.

Public URL extraction may later use:

* normal HTTP fetching where technically appropriate;
* Gemini URL context;
* another extraction service.

Gemini's current API includes URL context support, with retrieved tokens billed as model input rather than a separate URL-context tool charge. [Certain]

Do not rely on URL import for login-protected or highly dynamic webpages.

Extension capture remains the primary reliable mechanism for pages the user is already viewing.

---

# 26. File Import — Later Phase

Future ingestion should support:

* PDFs;
* screenshots;
* pasted text;
* CSV/XLSX;
* job descriptions;
* brochures;
* product specification documents.

All ingestion methods should normalize into the same `items + fields + evidence` architecture.

Do not build all of these in the initial MVP.

---

# 27. Exports

## MVP

Implement:

* CSV;
* XLSX.

Exports should contain visible comparison fields.

Preserve source URLs as a column.

## PDF

PDF is secondary.

For the first implementation, use a printable report view and browser print functionality rather than creating a complicated server-side document-generation service.

Possible later PDF report:

```text
Edmonton Apartment Comparison

Filters:
Under $1,400
Parking required

Summary
...

Comparison table
...

Sources
...
```

Do not spend significant MVP effort on PDF styling.

---

# 28. Cost Controls

Cost efficiency is a first-class requirement.

## Rule 1

Never call an LLM when deterministic code can answer the request.

## Rule 2

Sanitize and reduce page content before inference.

## Rule 3

Use structured metadata before natural-language extraction.

## Rule 4

Do not resend project history unnecessarily.

## Rule 5

Backfill only newly requested fields.

## Rule 6

Deduplicate identical pages using:

```text
canonical URL
+
content hash
```

## Rule 7

Store token usage.

## Rule 8

Implement configurable quotas.

Initial development defaults may be:

```text
MAX_SAVES_PER_MONTH=100
MAX_AI_ANALYSIS_PER_MONTH=25
MAX_SOURCE_CHARACTERS=60000
MAX_ITEMS_PER_PROJECT=500
```

These are provisional product limits and should remain configuration values rather than hard-coded business rules.

---

# 29. Illustrative Inference Cost

Assume one cleaned page uses:

```text
5,000 input tokens
300 output tokens
```

This is an illustrative assumption, not a guaranteed average.

At current Gemini 2.5 Flash-Lite paid pricing:

```text
input:
5,000 / 1,000,000 × $0.10
= $0.00050

output:
300 / 1,000,000 × $0.40
= $0.00012

total:
≈ $0.00062 per page
```

[Certain] based on the illustrative token assumptions and current published token rates.

At that hypothetical workload:

```text
1,000 saves ≈ $0.62
10,000 saves ≈ $6.20
100,000 saves ≈ $62
```

[Certain] under the same assumptions.

Actual cost must be measured from production token-usage metadata rather than assumed.

---

# 30. Expected MVP Infrastructure Cost

Target:

```text
Web hosting:           $0 initially
Supabase:              $0 initially
Chrome extension:      local/unpacked during development
Gemini:                free tier initially where available
```

Cloudflare currently offers free static asset serving and Supabase has an applicable Free plan. [Certain]

Publishing through the Chrome Web Store requires a one-time developer registration fee, and Google currently identifies that fee as $5 for creation of a publisher account. [Certain]

Do not introduce paid infrastructure until actual usage requires it.

---

# 31. Privacy

This extension processes webpage content.

Privacy requirements therefore need to be explicit.

Only capture a page after deliberate user action.

Do not:

* monitor general browsing;
* collect browsing history;
* automatically capture every visited page;
* collect unrelated tabs;
* collect forms/passwords;
* capture hidden sensitive fields;
* transmit page content before the user requests a save.

Chrome's current Web Store policies require collected user data to be necessary for the extension's disclosed purpose. [Certain]

Provide a privacy page before public Chrome Web Store release.

Users should understand that saved webpage content is transmitted to the application's backend and AI provider for extraction.

---

# 32. Duplicate Handling

Before extraction:

Check:

```text
project_id + canonical_url
```

Then check:

```text
content_hash
```

If duplicate:

Display:

> This page already exists in Edmonton Apartments.

Options:

```text
Open existing
Update extraction
Save duplicate anyway
```

Avoid paying for repeated extraction by default.

---

# 33. Failure Handling

Possible extraction errors:

```text
unsupported Chrome page
no readable content
authentication expired
rate limit exceeded
Gemini timeout
invalid model response
schema validation failure
storage failure
network failure
```

Every error should produce a meaningful user-facing state.

Do not silently discard captured pages.

For Gemini failures:

1. retry transient failures with bounded exponential backoff;
2. never retry indefinitely;
3. record failure reason;
4. allow manual retry.

---

# 34. Testing Strategy

Testing is mandatory.

## Unit tests

Use Vitest.

Test:

* field schema validation;
* value normalization;
* filter AST validation;
* deterministic filters;
* sorting;
* cost calculation;
* duplicate detection;
* URL normalization;
* page sanitizer;
* JSON-LD extraction.

## HTML fixtures

Create local fixtures representing:

```text
apartment listing
hotel listing
job listing
product listing
messy dynamically styled page
page with JSON-LD
page without JSON-LD
page with irrelevant navigation/footer text
```

Do not depend on live third-party websites for automated tests.

## LLM contract tests

Mock Gemini.

Test valid and invalid responses.

Examples:

```text
correct JSON
missing field
wrong data type
unsupported enum
evidence absent
malformed output
null field
```

## Golden extraction set

Create a small manual benchmark.

Example:

```text
30–50 saved HTML/text fixtures
```

For each fixture, define expected important fields.

Measure:

```text
exact matches
missing values
false positives
incorrect values
unsupported inferred values
```

The most dangerous category is **false confidently populated information**, not merely missing information.

## RLS tests

Create tests proving:

```text
User A can read User A project.
User A cannot read User B project.

User A can edit User A item.
User A cannot edit User B item.

Anonymous user cannot access private project records.
```

## Extension E2E

Use Playwright with Chromium persistent context and the unpacked extension.

Test against local fixture webpages.

Test:

1. extension loads;
2. user selects project;
3. fixture page is captured;
4. request reaches mocked backend;
5. resulting item appears;
6. extension does not access another unrelated page automatically.

---

# 35. Observability

Implement lightweight structured logging.

Track:

```text
capture_started
capture_completed
capture_failed
extraction_started
extraction_completed
extraction_failed
query_interpreted
export_generated
field_backfilled
```

Do not log full source page content to ordinary application logs.

Track:

```text
input tokens
output tokens
estimated cost
latency
model
```

This allows actual cost-per-save to be calculated.

---

# 36. Analytics That Matter

Do not add complex product analytics initially.

Track:

```text
projects created
pages saved
successful extractions
items manually corrected
fields added
backfills requested
natural-language queries
exports
projects revisited
```

Important eventual metrics:

```text
pages saved per project
percentage of projects with 5+ saved items
percentage of users starting a second project
extraction correction rate
cost per saved item
```

These are more meaningful than extension installs alone.

---

# 37. Explicit MVP Scope

The initial usable product must support:

### Accounts

* register;
* login;
* logout.

### Projects

* create;
* rename;
* delete;
* choose template.

### Extension

* select current project;
* capture current webpage;
* save webpage;
* display success/failure;
* open full web workspace.

### Extraction

* sanitize webpage;
* parse JSON-LD;
* call Gemini;
* validate structured output;
* save typed values;
* save evidence;
* save sanitized source snapshot.

### Comparison

* display rows;
* sort columns;
* filter columns;
* hide/show columns;
* edit values.

### AI

* translate natural-language filters into safe AST.

### Dynamic fields

* add field;
* extract new field from one existing source;
* support batch backfill architecture.

### Export

* CSV;
* XLSX.

### Security

* authentication;
* RLS;
* secret management;
* quota checks.

### Testing

* unit tests;
* database/RLS tests;
* extraction fixtures;
* extension E2E smoke test.

---

# 38. Explicit Non-Goals for MVP

Do NOT build yet:

* Firefox extension;
* Safari extension;
* mobile native app;
* autonomous web browsing;
* full browser agent;
* automatic purchasing or booking;
* payments/subscriptions;
* team collaboration;
* public project sharing;
* embeddings/vector search unless actual need appears;
* OCR pipeline;
* complicated PDF report engine;
* scraping infrastructure;
* proxy rotation;
* anti-bot bypassing;
* automated Google Maps enrichment;
* email integration;
* infinite agent loops.

Avoid turning this into another generic AI workspace.

---

# 39. Future Product Expansion

After the core workflow proves useful:

## Phase A — Better ingestion

Add:

* paste URL;
* multiple URL import;
* PDFs;
* screenshots;
* pasted text.

## Phase B — Mobile

Implement a mobile share target:

```text
Share → Sift → Edmonton Apartments
```

## Phase C — Collaboration

Add:

* shared projects;
* comments;
* votes;
* shared comparison criteria.

## Phase D — Research intelligence

Add:

* duplicate detection across sites;
* price-change tracking;
* listing-change tracking;
* automatic field suggestions;
* missing-data detection;
* stale-source warnings.

## Phase E — Domain integrations

Examples:

```text
calculate commute from apartment to university
normalize hotel total-price including fees
calculate price per square foot
compare product price per unit
identify job requirement overlap with resume
```

These should be implemented as domain-specific modules rather than forcing everything through an LLM.

---

# 40. UX Principle

The application should behave more like:

```text
Airtable / spreadsheet
+
browser save button
+
AI extraction
```

than:

```text
ChatGPT with bookmarks.
```

Structured data is the primary interface.

Chat is secondary.

---

# 41. Definition of Done

Do not consider the MVP complete until this end-to-end scenario works:

### Scenario

1. User creates **Edmonton Apartments**.
2. User installs unpacked Chrome extension.
3. User signs in.
4. User visits fixture apartment A.
5. User saves it.
6. Correct structured row appears.
7. User visits fixture apartment B.
8. User saves it.
9. Both rows appear in the web workspace.
10. Each extracted field exposes its source evidence.
11. User asks:

```text
Show only apartments under $1,300 with parking.
```

12. The LLM returns a safe filter AST.
13. Application filters deterministically.
14. User adds:

```text
Utilities included
```

15. Application extracts that field from previously stored source content.
16. User edits one incorrectly extracted value manually.
17. User exports the table to XLSX.
18. User A cannot access User B's project through direct API calls.
19. No Gemini or service-role API key exists in browser-delivered code.
20. Automated tests pass.

---

# 42. Implementation Order for Codex

Implement sequentially.

## Milestone 1 — Repository foundation

Create monorepo.

Configure:

```text
TypeScript
pnpm
ESLint
Prettier
Vitest
shared Zod schemas
environment validation
```

Everything must type-check.

## Milestone 2 — Database

Create Supabase migrations.

Implement:

```text
projects
project_fields
items
item_field_values
source_documents
usage_events
```

Add indexes.

Add RLS.

Add RLS tests.

Seed project templates.

## Milestone 3 — Web application

Implement:

```text
auth
project dashboard
create project
project comparison table
field editor
item editor
```

Use mocked records initially.

## Milestone 4 — Extension

Create MV3 extension.

Implement:

```text
authentication
project selection
active-tab capture
DOM extraction
side panel
backend request
```

Use mocked extraction initially.

## Milestone 5 — Gemini

Implement provider abstraction.

Implement Gemini provider.

Use structured output.

Validate every model response.

Add mocked contract tests.

## Milestone 6 — Provenance

Add field evidence.

Create evidence UI.

Ensure null/unknown is handled correctly.

## Milestone 7 — Query parser

Build safe Filter AST.

Implement:

```text
"under $1400"
"with a pool"
"without parking"
"sort cheapest first"
```

No generated SQL.

## Milestone 8 — Dynamic fields

Implement custom fields.

Implement targeted extraction against existing saved source content.

## Milestone 9 — Exports

Implement:

```text
CSV
XLSX
```

## Milestone 10 — Hardening

Add:

```text
quotas
usage tracking
duplicate detection
idempotency
retry logic
error states
E2E tests
privacy documentation
```

---

# 43. Coding Rules for Codex

Follow these rules throughout implementation.

1. Do not create placeholder functions if the functionality can reasonably be completed.
2. Do not leave security TODOs around authentication, RLS, or secret handling.
3. Do not expose service credentials to frontend code.
4. Validate every external boundary with Zod.
5. Prefer deterministic code over model calls.
6. Keep LLM provider code behind an interface.
7. Keep domain templates in shared configuration rather than duplicating them.
8. Keep database schema changes in migrations.
9. Write tests alongside important logic.
10. Do not scrape live third-party sites in automated tests.
11. Use fixture webpages.
12. Avoid unnecessary dependencies.
13. Do not implement features listed as non-goals unless required to support the core architecture.
14. Favor simple readable code over premature abstraction.
15. Maintain strict TypeScript.
16. Run lint, tests, type-check and production builds before declaring a milestone complete.

---

# 44. Product Principle to Preserve

The difficult and valuable step is not:

> storing webpages in an LLM context.

The valuable step is:

> turning heterogeneous web research into a persistent, structured, editable, source-backed dataset.

Every technical decision should reinforce that distinction.

The final MVP should therefore demonstrate this complete loop:

```text
BROWSE
   ↓
SAVE
   ↓
EXTRACT
   ↓
NORMALIZE
   ↓
VERIFY SOURCE
   ↓
COMPARE
   ↓
FILTER / QUERY
   ↓
EXPORT
```

If a feature does not materially improve that loop, defer it.
