# Security Policy

## Supported versions

Security fixes are applied to the latest code on `main`. This project does not
currently maintain older release branches.

## Reporting a vulnerability

Do not disclose suspected vulnerabilities in public issues, discussions, or
pull requests. Use GitHub's private vulnerability reporting form:

https://github.com/samaksh-bajaj/sift/security/advisories/new

Include the affected component, reproduction steps, impact, and any suggested
mitigation. Remove credentials, personal information, and captured webpage
content from the report. You should receive an acknowledgement within seven
days.

## Secrets and captured content

The browser apps may contain only the Supabase project URL and publishable key.
Gemini credentials and Supabase secret or service-role keys belong only in
Supabase Edge Function secrets. Test fixtures must be fictional or explicitly
licensed for redistribution.
