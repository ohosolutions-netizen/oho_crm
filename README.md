# OHO CRM

A standalone CRM for OHO Solutions, covering company and employee contacts, enquiries, opportunities, meetings and calls, proposal versions and acceptance, manual invoices, implementation, and due/overdue follow-ups.

## Access model

- Roles control record visibility: own records plus all subordinate roles; peers and unrelated branches are excluded.
- Profiles control View, Create, Edit, and Delete separately for each module.
- All API reads and writes enforce both controls. Dashboard, search, export, and related-record views operate on server-filtered data.
- Each user must have a role and a profile. Deactivation retains ownership and history but prevents access.
- The user explicitly requested no authentication for this phase. Enter a work email to select a CRM user; no password, ChatGPT sign-in, or email verification is required.
- The first email in an empty CRM becomes its administrator. Later emails must be added as active users in Administration. Existing users and records are retained.
- The email selection is stored in an HttpOnly cookie. It is a user selector, not proof of identity: someone who knows another user's email can select that user. Role/profile rules are applied to that selected identity.

## Initial defaults

Roles: Admin → Manager → Executive. Profiles: Administrator (full permissions) and Standard (View/Create/Edit for customer modules; no Delete or Administration).

There are no production sample records or placeholder employees. Add the remaining six users in Administration using their names and work emails.

## Lead and opportunity workflows

Lead stages: New Lead → Contacted → Connected / Not connected → Discovery scheduled → Discovery completed → Converted. Disqualified is available as an exit. Not connected leads can be retried, and discovery stores date, time, online/offline mode, and meeting location/link.

An explicit Convert to opportunity action is available after connection. It creates or reuses the company and employee contact, carries requirements/products/owner/follow-up forward, creates an opportunity at Solution planning, and marks the original lead Converted in one database transaction. A unique conversion claim prevents duplicate conversion, including concurrent requests. Converted leads are retained as history. Outreach activities stay linked through their lead.

Opportunity stages: Solution planning → Proposal preparation → Proposal sent → Negotiation → Accepted / Closed lost. Meetings and proposal versions attach to opportunities.

Stage changes open a dedicated information form. Outreach captures contact method, date, outcome, and a note; a not-connected lead also requires a follow-up. Discovery captures meeting arrangements and findings. Commercial stages capture scope, proposal reference/recipient/date, negotiation points, or acceptance/loss details. Normal record editing cannot bypass this form, and new leads/opportunities start at their initial stage.

Each update retains its actor, time, stage information, and follow-up decision in the record history. Follow-ups capture a date, optional India time, and a specific action. The dashboard and list use the same overdue/due-today/upcoming status. Completing a follow-up requires an outcome note, removes it from the pending queue, and keeps the outcome in history. Stage and follow-up writes reject stale record versions.

Lead and opportunity lists are the default view. Text has been enlarged throughout the workspace (16px body/navigation, 15px record cells, 14px table headings).

Older lead and opportunity status names are normalized when read, so existing data remains usable without rewriting historical migrations.

## Local development on Windows

Requires Node 22.13+ and installed dependencies. The local test fixture uses `seedy@sites.test`; it is never seeded into production.

```powershell
node scripts/run-framework.mjs dev --hostname 127.0.0.1
```

Local D1 migrations are documented in the starter instructions. Production and local databases are separate.

The Sites build helper's npm shim has a path-resolution failure on this Windows host. The verified workaround invokes the installed npm JavaScript entrypoint directly:

```powershell
node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run build
```

The package build script, Vinext integration, and Sites packaging are retained.

## Validation

```powershell
node node_modules/typescript/bin/tsc --noEmit
node --experimental-strip-types --test tests/permissions.test.mjs
node --experimental-strip-types --test tests/stage-rules.test.mjs
$env:CRM_TEST_LOCAL='1'
node --experimental-strip-types tests/api-regression.mjs
```

The API regression script requires the loopback development server and its migrated local database. It uses disposable fixtures, temporarily changes the local test identity's permissions, and restores that identity in `finally`. Never run it against production. It verifies the customer workflow, linked contacts, proposal versions, acceptance, invoice consistency, implementation, hierarchy visibility, forbidden actions, revoked permissions, and inactive accounts.

## Phase-one limits

- Enquiries and invoice details are entered manually. Email, WhatsApp, forms, and accounting integrations are not connected.
- Follow-up reminders are in-app due/overdue views; no email/SMS or background notifications are configured.
- Proposal and acceptance documents are external links, not file uploads or legally binding signatures.
- Process definitions and automated invoicing remain deferred.
- Hosting allows opening the page without ChatGPT sign-in, as requested. An email entry is still required to select an active CRM user. Verified authentication is deferred.
