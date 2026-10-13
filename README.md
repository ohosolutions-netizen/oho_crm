# OHO CRM

A standalone CRM for OHO Solutions, covering company and employee contacts, enquiries, opportunities, meetings and calls, proposal versions and acceptance, manual invoices, implementation, and due/overdue follow-ups.

## Access model

- Roles control record visibility: own records plus all subordinate roles; peers and unrelated branches are excluded.
- Profiles control View, Create, Edit, and Delete separately for each module.
- All API reads and writes enforce both controls. Dashboard, search, export, and related-record views operate on server-filtered data.
- Each user must have a role and a profile. Deactivation retains ownership and history but prevents access.
- The initial private Site's first signed-in owner becomes the administrator. ChatGPT sign-in provides identity; internal membership is checked separately on every request.
- Add team members using the email associated with their ChatGPT sign-in. A Site's hosting audience must also permit the team to visit; adding an internal member does not change hosting access.

## Initial defaults

Roles: Admin → Manager → Executive. Profiles: Administrator (full permissions) and Standard (View/Create/Edit for customer modules; no Delete or Administration).

There are no production sample records or placeholder employees. Add the remaining six users in Administration when their names and sign-in emails are available.

## Local development on Windows

Requires Node 22.13+ and installed dependencies. The development identity is `seedy@sites.test`; it is loopback-only and excluded from production.

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
$env:CRM_TEST_LOCAL='1'
node --experimental-strip-types tests/api-regression.mjs
```

The API regression script requires the loopback development server and its migrated local database. It uses disposable fixtures, temporarily changes the local test identity's permissions, and restores that identity in `finally`. Never run it against production. It verifies the customer workflow, linked contacts, proposal versions, acceptance, invoice consistency, implementation, hierarchy visibility, forbidden actions, revoked permissions, and inactive accounts.

## Phase-one limits

- Enquiries and invoice details are entered manually. Email, WhatsApp, forms, and accounting integrations are not connected.
- Follow-up reminders are in-app due/overdue views; no email/SMS or background notifications are configured.
- Proposal and acceptance documents are external links, not file uploads or legally binding signatures.
- Process definitions and automated invoicing remain deferred.
- Hosting is owner-private for initial review. Team access requires configuring the supported hosting audience as well as adding CRM users.
