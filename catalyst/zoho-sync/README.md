# OHO add-only lead sync â€” pending CRM connection

Interval: every 5 minutes (supersedes the previous 15-minute request).

Install oho_lead_delta.deluge as a standalone CRM function. Required parameter:
last_sync_time. Optional continuation parameters: sync_until and after_id.
The response includes data[].Created_Time, a fixed sync_until, more_records,
and next_after_id. The caller sends the same window while fetching all pages.
Change the .in API domain if the CRM organization uses another data center.
The internal read connection oho_crm_read needs Leads.READ and coql.READ.
The endpoint itself uses OAuth execution access or a backend-only API key.
No credentials belong in this repository or browser frontend.

Persist a successful checkpoint only after all pages are validated and stored.
Use a two-minute overlap and canonical Zoho IDs (strip CSV zcrm_ prefix) to
skip existing leads, including prior CSV imports. Keep failures retryable.
Use Created_Time as records.created_at and receivedDate/receivedTime; importedAt
is separate. Existing stages, ownership, notes and tasks are never overwritten.
Missing phone/name/creation-time must block or enter a durable exception queue;
do not invent mandatory values or silently discard a record.

## Active Development setup

Initial window: 2026-10-09T13:48:42Z, seven days before setup.
Initial run imported 32 new leads. One missing-phone record was queued.
A corrected replay skipped existing IDs without overwriting any records.
Function zoholeadsync: 77605000000185829 (job, 512 MB).
Job pool oho_lead_sync: 77605000000195301.
Enabled schedule oho_lead_sync_5m: 77605000000195306, every five minutes.
Secrets are stored in this function's Development environment only.
Source sync cutoff is supplied explicitly by Catalyst to avoid source timezone drift.
State/lock/id-index/exceptions live in native Settings keys prefixed zoho-sync:.
The projection reconciler preserves these keys. Do not delete the ID index.
The baseline contains migrated CSV source IDs and source IDs from native lead frames;
new sync records use deterministic AppIds, protected by the table's unique key.
Missing-phone queue entries are refreshed through a narrow source creation-time
window on later runs, so filling the phone in Zoho allows eventual import.
API key is never bundled into the handler or frontend. Redeploying the job leaves
its runtime environment intact because deployment config omits env_variables.
## Production activation checklist

The production environment must contain the deployed `zoholeadsync` job and an
enabled `oho_lead_sync_5m` schedule that invokes it every five minutes. Configure
the following variables on the production job (secrets must be entered in the
Catalyst console and must not be committed): `ZOHO_CRM_FUNCTION_URL`,
`ZOHO_CRM_FUNCTION_API_KEY`, `ZOHO_SYNC_INITIAL_FROM`, and optionally
`ZOHO_SYNC_FALLBACK_OWNER`. Before enabling the schedule, initialise the
production `zoho-sync:existing-ids` baseline so the first run remains add-only.
Development and Production schedules and environment variables are independent.
