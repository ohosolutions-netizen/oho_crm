import { randomUUID } from "node:crypto";
import { api, config, insert, query, update } from "../catalyst/client.mjs";
import { encodeNativePayload } from "../catalyst/native-record-codec.mjs";
import { project } from "../catalyst/projections.mjs";
import { parseFunctionOutput } from "../catalyst/zoho-sync/function-response.mjs";
import { sourceId } from "../catalyst/zoho-sync/engine.mjs";

const apply = process.argv.includes("--apply");
config.environment = process.argv.includes("--production") ? "Production" : "Development";
const norm = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const empty = () => ({ roles: [], profiles: [], users: [], records: [], audit: [], settings: [] });
async function all(table, where = "") { const result = []; for (let offset = 0;; offset += 200) { const page = (await query(`SELECT * FROM ${table}${where ? ` WHERE ${where}` : ""} LIMIT ${offset},200`)).map((item) => item[table] || item); result.push(...page); if (page.length < 200) return result; } }

const fn = await api("/function/77605000000185829");
const vars = fn.configuration?.environment?.variables || {};
if (!vars.ZOHO_CRM_FUNCTION_URL || !vars.ZOHO_CRM_FUNCTION_API_KEY) throw new Error("Zoho sync source is not configured.");
const sourceLeads = [];
const endpoint = new URL(vars.ZOHO_CRM_FUNCTION_URL);
const lastSyncTime = vars.ZOHO_SYNC_INITIAL_FROM || "2026-10-09T13:48:42Z";
const syncUntil = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
let afterId = "";
for (let page = 0; page < 500; page++) {
  const url = new URL(endpoint);
  url.searchParams.set("auth_type", "apikey");
  url.searchParams.set("zapikey", vars.ZOHO_CRM_FUNCTION_API_KEY);
  url.searchParams.set("last_sync_time", lastSyncTime);
  url.searchParams.set("sync_until", syncUntil);
  url.searchParams.set("after_id", afterId);
  const response = await fetch(url, { method: "POST", signal: AbortSignal.timeout(45000) });
  const body = await response.json();
  if (!response.ok || body.code !== "success") throw new Error("Zoho source request failed.");
  const output = parseFunctionOutput(body.details?.output);
  sourceLeads.push(...output.data);
  if (!output.more_records) break;
  afterId = output.next_after_id;
}
const sourceById = new Map(sourceLeads.map((lead) => [sourceId(lead.id), lead]));

const users = await all("Users", "IsDeleted=false");
const activeUsers = users.filter((user) => [true, 1, "1", "true"].includes(typeof user.Active === "string" ? user.Active.toLowerCase() : user.Active));
const userById = new Map(activeUsers.map((user) => [user.AppId, user]));
const userByZohoId = new Map();
for (const user of activeUsers) { let data = {}; try { data = JSON.parse(user.DataJson || "{}"); } catch {} const zohoId = sourceId(data.auth_id); if (/^\d+$/.test(zohoId)) userByZohoId.set(zohoId, user); }
const actor = activeUsers.find((user) => norm(user.Email) === "c8tyvch5hn@privaterelay.appleid.com");
if (!actor) throw new Error("Administrative audit actor not found.");

const records = [];
for (const row of await all("Leads", "IsDeleted=false")) { try { const frame = JSON.parse(row.DataJson || "{}"); if (frame.bodyRef) continue; const record = frame.record || frame, data = JSON.parse(record.data || "{}"), source = sourceById.get(sourceId(data.zohoCRMId)); if (!source || data.importOrigin !== "Zoho CRM API") continue; const expected = userByZohoId.get(sourceId(source.Owner?.id)); if (!expected) continue; records.push({ row, frame, record, data, source, expected }); } catch {} }

const ownerMismatches = records.filter((item) => item.record.owner_id !== item.expected.AppId);
const changed = new Set();
for (let offset = 0; offset < ownerMismatches.length; offset += 100) {
  const targets = ownerMismatches.slice(offset, offset + 100).map((item) => quote(`record:${item.record.id}`)).join(",");
  for (const row of await all("AuditLog", `Target IN (${targets}) AND IsDeleted=false`)) { try { const audit = JSON.parse(row.DataJson || "{}"), details = JSON.parse(audit.details || "{}"); if (details.before?.ownerId && details.after?.ownerId && details.before.ownerId !== details.after.ownerId) changed.add(String(audit.target || row.Target).replace(/^record:/, "")); } catch {} }
}

const updates = records.filter((item) => {
  const metadataWrong = norm(item.data.zohoCRMOwner) !== norm(item.expected.Name) || sourceId(item.data.zohoCRMOwnerId) !== sourceId(item.source.Owner?.id);
  const ownerWrong = item.record.owner_id !== item.expected.AppId && !changed.has(item.record.id);
  return metadataWrong || ownerWrong;
});
const ownerCorrections = updates.filter((item) => item.record.owner_id !== item.expected.AppId && !changed.has(item.record.id));
const preservedTransfers = ownerMismatches.filter((item) => changed.has(item.record.id));

if (!apply) { console.log(JSON.stringify({ environment: config.environment, sourceLeads: sourceLeads.length, matchedScheduledLeads: records.length, recordsToUpdate: updates.length, ownerCorrections: ownerCorrections.length, metadataBackfills: updates.length, preservedTransfers: preservedTransfers.length }, null, 2)); process.exit(0); }

const now = new Date().toISOString(), leadUpdates = [], auditRows = [], correctedOwnerById = new Map();
for (const item of updates) {
  const ownerChanges = item.record.owner_id !== item.expected.AppId && !changed.has(item.record.id);
  const data = { ...item.data, zohoCRMOwner: item.expected.Name, zohoCRMOwnerId: sourceId(item.source.Owner?.id) };
  const record = { ...item.record, owner_id: ownerChanges ? item.expected.AppId : item.record.owner_id, data: JSON.stringify(data), updated_at: now };
  const current = userById.get(item.record.owner_id);
  const audit = { id: randomUUID(), actor_id: actor.AppId, action: "edit", target: `record:${record.id}`, details: JSON.stringify({ module: "enquiries", reason: ownerChanges ? "Zoho source owner correction" : "Zoho source owner metadata backfill", before: { ownerId: item.record.owner_id, ownerName: current?.Name || "Unknown user", data: { zohoCRMOwner: item.data.zohoCRMOwner || "", zohoCRMOwnerId: item.data.zohoCRMOwnerId || "" } }, after: { ownerId: record.owner_id, ownerName: userById.get(record.owner_id)?.Name || item.expected.Name, data: { zohoCRMOwner: data.zohoCRMOwner, zohoCRMOwnerId: data.zohoCRMOwnerId } } }), created_at: now };
  const state = empty(); state.records = [record]; const projected = project(state).Leads[0], encoded = encodeNativePayload({ _nativeRecord: true, record, audit, references: item.frame.references || [] }); if (encoded.chunks.length) throw new Error(`Unexpected large lead payload: ${record.id}`); leadUpdates.push({ ...projected, DataJson: encoded.data, ROWID: item.row.ROWID });
  const auditState = empty(); auditState.audit = [audit]; const auditRow = project(auditState).AuditLog[0], auditEncoded = encodeNativePayload(audit); auditRows.push({ ...auditRow, DataJson: auditEncoded.data });
  if (ownerChanges) correctedOwnerById.set(record.id, record.owner_id);
}
for (let offset = 0; offset < leadUpdates.length; offset += 50) await update("Leads", leadUpdates.slice(offset, offset + 50));
for (let offset = 0; offset < auditRows.length; offset += 50) await insert("AuditLog", auditRows.slice(offset, offset + 50));
let followUpsUpdated = 0; const correctedIds = [...correctedOwnerById.keys()];
for (let offset = 0; offset < correctedIds.length; offset += 100) { const ids = correctedIds.slice(offset, offset + 100), followups = await all("FollowUps", `AppId IN (${ids.map(quote).join(",")}) AND IsDeleted=false`), followupUpdates = followups.map((row) => ({ ROWID: row.ROWID, OwnerAppId: correctedOwnerById.get(row.AppId) })); if (followupUpdates.length) await update("FollowUps", followupUpdates); followUpsUpdated += followupUpdates.length; }
console.log(JSON.stringify({ environment: config.environment, updated: updates.length, ownerCorrections: ownerCorrections.length, preservedTransfers: preservedTransfers.length, followUpsUpdated, updatedAt: now }));
