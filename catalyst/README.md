# Catalyst backend

## Hosted CRM

URL: https://oho-crm-60091125992.development.catalystserverless.in/app/index.html

The Catalyst Web Client now calls the ohocrm Advanced I/O function running Node.js 22. Records are shared in Catalyst Data Store, with the same validation, hierarchy, profiles and module permissions as the local CRM. Administrator email: c8tyvch5hn@privaterelay.appleid.com. The browser-storage preview banner and browser database runtime are no longer included in the deployed client. Old preview data in browser storage has not been deleted or imported automatically.

Build using `node catalyst/build-cloud.mjs` and `node catalyst/build-web.mjs`. Deploy from catalyst/ using `catalyst deploy --only "functions,client" --project 77605000000054301 --dc in --org 60091125992 --non-interactive`. The function uses platform-provided SDK credentials. Local CLI credentials are never deployed. Dependencies are pinned under functions/ohocrm/package.json.

Project: OHO-CRM, India organization 60091125992, development project 77605000000054301.

## Current status

19 tables and 322 columns were created and their metadata exported to schema.json. The account insert restriction was resolved. Seven saved local records and one administrator were migrated successfully as checkpoint revision 1. Cloud write/read tests passed through the hosted function, including concurrent conversion protection, stage validation/history, stale writes, company/contact links and linked deletion protection. A named Cloud regression test example is retained in the development project because converted lead history is immutable.

The existing local database and a JSON backup under ignored .sites-runtime/backups remain intact.

## Local access to shared data

Run start-local.cmd to use the existing loopback Catalyst bridge. It requires the CLI to remain signed in to the India account. The old local database remains a backup; it is not the shared data source. Running the raw npm dev command without the Catalyst launcher still uses the old local database. The hosted client needs no local server or CLI session.

The migration script can reconcile reporting tables from the latest checkpoint, but will not overwrite initialized cloud data with old local data. Run node catalyst/check-cloud.mjs only for intentional development regression testing; it creates a named test example.

## Storage and concurrency

Routine create/edit operations for leads, contacts, activities, opportunities and implementation records run directly against Catalyst's named tables. The function loads the current users, roles, profiles and relevant records into a small request-only validation database. It reuses the CRM's field, ownership, permission, relationship and stage validation rules, then writes the native record and its audit. It does not restore or publish a whole-workspace checkpoint for these requests. Individual record reads and email selection use the same native path.

Native DataJson envelopes retain the exact record and its latest audit. Larger payloads use immutable, checksummed record-specific chunks in BackendChunks; typed reporting fields may have narrower limits but canonical text is never truncated. Audit-table and follow-up projections remain recoverable from native record data. The UI replaces only the confirmed changed records after saving.

Conversions, stage transitions, administrative changes, deletes and operations with shared uniqueness rules retain the existing transactional checkpoint path. These requests merge directly saved native records and audit entries before validation. Checkpoints publish an atomic unique revision, while conditional native row leases prevent a direct edit from overwriting an in-flight transaction. Reference checks run while parent records are reserved. Expired leases are recovered from committed state after 60 seconds. The native user-configuration revision prevents stale permissions from being used if an administrative projection is pending.

Shared workspace reads combine checkpoint state with directly saved native records. The localhost bridge also merges native records before running its existing validated transactions. Edit data through the CRM API; changing native table rows manually bypasses validation and the concurrency protocol.

Run the pure test suites under tests/, including native-record-codec.test.mjs and catalyst-delta.test.mjs. The disposable hosted task checks in check-task-transitions.mjs verify Close/Keep decisions, stale task versions and coordinated stage/task completion.

The hosted function uses Catalyst's native SDK request credentials. Local bridge authentication uses the installed Catalyst CLI's encrypted India session. No OAuth token is copied into source or sent to the frontend. A random loopback bridge token lives in ignored .sites-runtime. The bridge accepts token-authorized server requests only and rejects browser Origin headers. User selection remains email-only as requested, using an HttpOnly cookie on the hosted app; it is not verified authentication.

Stage changes with pending follow-ups or linked activities require an explicit Close/Keep task decision. Close records completion and its outcome; Keep retains the task's date and action, including when closing a lead. Closing linked activities is permission-checked and committed with the stage change, with task-version guards rejecting stale decisions. Run tests/transition-tasks.test.mjs for the pure rules and catalyst/check-task-transitions.mjs for disposable hosted integration fixtures.
