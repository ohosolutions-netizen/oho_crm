Open http://127.0.0.1:5173/ while the local server is running.

Local administrator email: c8tyvch5hn@privaterelay.appleid.com. No password is required.

Run start-local.cmd to start the CRM again after restarting your computer.
The old local database in .wrangler/state and JSON backups in .sites-runtime/backups have been retained. start-local.cmd now loads and saves the shared Catalyst records; the hosted Catalyst app uses those same records.

Catalyst project OHO-CRM has been provisioned in India organization 60091125992 (project 77605000000054301). The insert restriction has been resolved and the saved local records have migrated to Catalyst. start-local.cmd now uses Catalyst as shared durable storage.

The hosted app is available at https://oho-crm-60091125992.development.catalystserverless.in/app/index.html and uses the same shared cloud records. The CLI must remain signed in to the India account for local bridge access, but the hosted app works independently of this computer. Old local files remain as migration backups.

The hosted Catalyst app includes the compact layout changes and migrated records. A clearly named Cloud regression example remains for development testing.

