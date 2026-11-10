import process from "node:process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { config, rows, insert, update } from "../catalyst/client.mjs";
import { project } from "../catalyst/projections.mjs";
import { encodeNativePayload, decodeNativePayload } from "../catalyst/native-record-codec.mjs";
import { leadId, enquiryId, sourceId } from "../catalyst/zoho-sync/engine.mjs";

const dryRun = process.argv.includes("--dry-run");
if (process.argv.includes("--production")) config.environment = "Production";
const csvArg = process.argv.indexOf("--csv");
const source = csvArg >= 0 ? await readFile(process.argv[csvArg + 1], "utf8") : await new Promise((resolve, reject) => {
  let value = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (value += chunk));
  process.stdin.on("end", () => resolve(value));
  process.stdin.on("error", reject);
});
function parseCSV(text) {
  const values = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ""; }
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); if (row.some(Boolean)) values.push(row); row = []; cell = "";
    } else cell += char;
  }
  row.push(cell); if (row.some(Boolean)) values.push(row);
  const headers = values.shift().map((value) => value.replace(/^\uFEFF/, ""));
  return values.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])));
}
const csvRows = csvArg >= 0 ? parseCSV(source) : JSON.parse(source);
const cutoff = Date.parse("2026-10-01T00:00:00+05:30");
const incoming = csvRows.filter((row) => Date.parse(`${row["Modified Time"]}+05:30`) > cutoff);
const norm = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const phoneKey = (value) => String(value || "").replace(/\D/g, "").slice(-10);
const terminal = new Set(["Converted", "Junk Lead", "Lead Lost", "Disqualified"]);
const statusMap = new Map([
  ["new lead", "New Lead"],
  ["not connected", "Not Contacted"],
  ["not contacted", "Not Contacted"],
  ["not pitched", "Not Pitched"],
  ["future lead", "Followup Later"],
  ["confused", "Followup Later"],
  ["call connected", "Discovery to be Scheduled"],
  ["qualified", "Discovery completed"],
  ["meeting conducted", "Discovery completed"],
  ["meeting scheduled", "Discovery scheduled"],
  ["junk lead", "Junk Lead"],
  ["lead lost", "Lead Lost"],
  ["lost lead", "Lead Lost"],
]);
const mappedStatus = (value) => statusMap.get(norm(value)) || "New Lead";
const emptyState = () => ({ roles: [], profiles: [], users: [], records: [], audit: [], settings: [] });

async function payload(row) {
  if (!row.DataJson) return null;
  const header = JSON.parse(row.DataJson);
  if (!header.bodyRef) return header;
  const chunks = await rows("BackendChunks", `CommitAppId='${String(header.bodyRef).replaceAll("'", "''")}'`);
  return decodeNativePayload(row.DataJson, chunks);
}
async function stored(value) {
  const encoded = encodeNativePayload(value);
  for (let i = 0; i < encoded.chunks.length; i += 100) await insert("BackendChunks", encoded.chunks.slice(i, i + 100));
  return encoded.data;
}
async function batches(fn, table, values) {
  for (let i = 0; i < values.length; i += 100) await fn(table, values.slice(i, i + 100));
}
function dateParts(value) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?/);
  return { date: match?.[1] || "", time: match?.[2] || "" };
}
function incomingData(row, previous = {}) {
  const created = dateParts(row["Created Time"]);
  const follow = dateParts(row["Follow up Date and Time"]);
  const title = row["Lead Name"] || [row["First Name"], row["Last Name"]].filter(Boolean).join(" ") || row.Email;
  const next = {
    ...previous,
    zohoCRMId: sourceId(row["Record Id"]),
    zohoCRMStatus: row["Lead Status"] || "",
    zohoCreatedTime: row["Created Time"] || previous.zohoCreatedTime || "",
    zohoModifiedTime: row["Modified Time"] || "",
    zohoCRMOwner: row["Lead Owner"] || "",
    companyName: row.Company || previous.companyName || "",
    contactName: title || previous.contactName || "",
    email: row.Email || previous.email || "",
    phone: row.Phone || previous.phone || "",
    website: row.Website || previous.website || "",
    source: row["Lead Source"] || previous.source || "Other",
    status: previous.status === "Converted" ? "Converted" : mappedStatus(row["Lead Status"]),
    receivedDate: previous.receivedDate || created.date,
    receivedTime: previous.receivedTime || created.time,
    requirements: row.Description || previous.requirements || "Imported from Zoho CRM",
    notes: row.Description || previous.notes || "",
    notInterestedReason: row["Reason For Not Interested"] || previous.notInterestedReason || "",
    disqualificationReason: row["Reason For Not Interested"] || row["Reason For Lost"] || previous.disqualificationReason || "",
    secondarySource: row["Secondary Source"] || previous.secondarySource || "",
    serviceName: row["Service Name"] || previous.serviceName || "",
    referredBy: row["Referred By"] || previous.referredBy || "",
    currency: row.Currency || previous.currency || "INR",
    importOrigin: previous.importOrigin || "Zoho CRM CSV reconciliation",
    importedAt: previous.importedAt || new Date().toISOString(),
  };
  if (!previous.nextFollowUp && follow.date) {
    next.nextFollowUp = follow.date;
    next.followUpTime = follow.time;
    next.followUpAction = row["Reason For Followup"] || "Follow up with customer";
    next.followUpNeeded = "Yes";
    next.followUpStatus = "Pending";
  }
  return next;
}

const [leadRows, enquiryRows, userRows] = await Promise.all([rows("Leads"), rows("Enquiries"), rows("Users", "IsDeleted=false")]);
const users = [];
for (const row of userRows) {
  const value = await payload(row);
  if (value?.active) users.push(value);
}
const fallbackOwner = users.find((u) => norm(u.name).includes("krishna")) || users.find((u) => u.active) || users[0];
if (!fallbackOwner) throw new Error("No active CRM owner is available.");
const userByName = new Map(users.map((user) => [norm(user.name), user]));
const existingByZoho = new Map();
const existingEnquiryZoho = new Set();
const activeByPhone = new Map();
const decodedLeads = [];
for (const row of leadRows) {
  const frame = await payload(row);
  const record = frame?.record || frame;
  if (!record?.id || typeof record.data !== "string") continue;
  const data = JSON.parse(record.data);
  decodedLeads.push({ row, record, data });
  if (data.zohoCRMId) existingByZoho.set(sourceId(data.zohoCRMId), { row, record, data });
  const key = phoneKey(data.phone);
  if (key && !terminal.has(data.status)) activeByPhone.set(key, { row, record, data });
}
for (const row of enquiryRows) {
  const frame = await payload(row);
  const record = frame?.record || frame;
  if (!record?.data) continue;
  try {
    const id = sourceId(JSON.parse(record.data).zohoCRMId);
    if (id) existingEnquiryZoho.add(id);
  } catch {}
}

const now = new Date().toISOString();
const createRecords = [], updateRecords = [], audits = [], history = [];
const stats = { source: csvRows.length, afterCutoff: incoming.length, updated: 0, created: 0, enquiries: 0, unchanged: 0, skippedMissingPhone: 0, keptConverted: 0 };
for (const row of incoming) {
  const zohoId = sourceId(row["Record Id"]);
  const existing = existingByZoho.get(zohoId);
  const title = row["Lead Name"] || [row["First Name"], row["Last Name"]].filter(Boolean).join(" ") || row.Email;
  if (existing) {
    const beforeStatus = existing.data.status || "New Lead";
    const data = incomingData(row, existing.data);
    if (beforeStatus === "Converted" && mappedStatus(row["Lead Status"]) !== "Converted") stats.keptConverted++;
    const changed = JSON.stringify(data) !== JSON.stringify(existing.data) || (title && title !== existing.record.title);
    if (!changed) { stats.unchanged++; continue; }
    const record = { ...existing.record, title: title || existing.record.title, data: JSON.stringify(data), updated_at: now };
    const audit = {
      id: randomUUID(), actor_id: fallbackOwner.id,
      action: beforeStatus !== data.status ? "transition" : "edit",
      target: `record:${record.id}`,
      details: JSON.stringify(beforeStatus !== data.status
        ? { module: "enquiries", fromStage: beforeStatus, toStage: data.status, data: { stageNote: `Reconciled from Zoho CRM status: ${row["Lead Status"]}` } }
        : { before: { snapshotVersion: 2, module: "enquiries", title: existing.record.title, ownerId: existing.record.owner_id, companyId: existing.record.company_id, data: { zohoCRMStatus: existing.data.zohoCRMStatus || "", zohoModifiedTime: existing.data.zohoModifiedTime || "" } }, after: { snapshotVersion: 2, module: "enquiries", title: record.title, ownerId: record.owner_id, companyId: record.company_id, data: { zohoCRMStatus: data.zohoCRMStatus, zohoModifiedTime: data.zohoModifiedTime } } }),
      created_at: now,
    };
    const state = emptyState(); state.records = [record];
    const projected = project(state).Leads[0];
    if (!dryRun) projected.DataJson = await stored({ _nativeRecord: true, record, audit, references: [record.company_id].filter(Boolean) });
    updateRecords.push({ ...projected, ROWID: existing.row.ROWID });
    audits.push(audit); stats.updated++;
    existing.data = data; existing.record = record;
    continue;
  }
  if (existingEnquiryZoho.has(zohoId)) { stats.unchanged++; continue; }
  if (!phoneKey(row.Phone)) { stats.skippedMissingPhone++; continue; }
  const owner = userByName.get(norm(row["Lead Owner"])) || fallbackOwner;
  const duplicate = activeByPhone.get(phoneKey(row.Phone));
  if (duplicate) {
    const id = enquiryId(zohoId), data = { enquiryId: duplicate.record.id, phone: row.Phone, email: row.Email || "", source: row["Lead Source"] || "Other", enquiryAt: dateParts(row["Created Time"]).date, status: "Booked", notes: row.Description || "Repeated enquiry received", zohoCRMId: zohoId };
    const record = { id, module: "leadEnquiries", title: `${title} enquiry`, owner_id: owner.id, company_id: duplicate.record.company_id, data: JSON.stringify(data), created_at: now, updated_at: now };
    const state = emptyState(); state.records = [record]; const projected = project(state).Enquiries[0];
    if (!dryRun) projected.DataJson = await stored({ _nativeRecord: true, record, references: [duplicate.record.id, record.company_id].filter(Boolean) });
    createRecords.push({ table: "Enquiries", row: projected }); stats.enquiries++; continue;
  }
  const id = leadId(zohoId), data = incomingData(row), record = { id, module: "enquiries", title, owner_id: owner.id, company_id: null, data: JSON.stringify(data), created_at: now, updated_at: now };
  const audit = { id: randomUUID(), actor_id: fallbackOwner.id, action: "create", target: `record:${id}`, details: JSON.stringify({ module: "enquiries", title, data, source: "Zoho CRM CSV reconciliation" }), created_at: now };
  const state = emptyState(); state.records = [record]; const projected = project(state).Leads[0];
  if (!dryRun) projected.DataJson = await stored({ _nativeRecord: true, record, audit, references: [] });
  createRecords.push({ table: "Leads", row: projected }); audits.push(audit); stats.created++;
  activeByPhone.set(phoneKey(row.Phone), { record, data });
}

if (!dryRun) {
  console.error(`Applying ${createRecords.length} creates and ${updateRecords.length} updates...`);
  await batches(insert, "Leads", createRecords.filter((x) => x.table === "Leads").map((x) => x.row));
  console.error("Lead creates applied.");
  await batches(insert, "Enquiries", createRecords.filter((x) => x.table === "Enquiries").map((x) => x.row));
  console.error("Enquiries applied.");
  await batches(update, "Leads", updateRecords);
  console.error("Lead updates applied.");
  const auditState = emptyState(); auditState.audit = audits;
  const projected = project(auditState);
  for (const row of projected.AuditLog) row.DataJson = JSON.stringify(audits.find((a) => a.id === row.AppId));
  await batches(insert, "AuditLog", projected.AuditLog);
  console.error("Audit applied.");
  await batches(insert, "StageHistory", projected.StageHistory);
  console.error("Stage history applied.");
}
console.log(JSON.stringify({ ...stats, dryRun, plannedWrites: createRecords.length + updateRecords.length }, null, 2));
