import process from "node:process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { config, rows, insert, update, quote } from "../catalyst/client.mjs";
import { project } from "../catalyst/projections.mjs";
import { encodeNativePayload, decodeNativePayload } from "../catalyst/native-record-codec.mjs";
import { sourceId } from "../catalyst/zoho-sync/engine.mjs";

const dryRun = process.argv.includes("--dry-run");
if (process.argv.includes("--production")) config.environment = "Production";
const csvArg = process.argv.indexOf("--csv");
if (csvArg < 0 || !process.argv[csvArg + 1]) throw new Error("Provide --csv <deals.csv>.");
const source = await readFile(process.argv[csvArg + 1], "utf8");

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

const csvRows = parseCSV(source);
const norm = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const cleanId = (value) => sourceId(value);
const emptyState = () => ({ roles: [], profiles: [], users: [], records: [], audit: [], settings: [] });
const stageMap = new Map([
  ["new deal", "Solution planning"], ["discovery meeting not scheduled", "Solution planning"],
  ["discovery meeting scheduled", "Solution planning"], ["discovery meeting not conducted", "Solution planning"],
  ["discovery meeting conducted", "Solution planning"], ["proposal preparation", "Proposal preparation"],
  ["proposal prepared", "Proposal preparation"], ["proposal submitted", "Proposal sent"],
  ["estimate submitted", "Proposal sent"], ["negotiation", "Negotiation"],
  ["deal won", "Accepted"], ["deal lost", "Closed lost"],
]);
const mappedStage = (value) => stageMap.get(norm(value)) || "Solution planning";
const dateParts = (value) => {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?/);
  return { date: match?.[1] || "", time: match?.[2] || "" };
};
const iso = (value) => {
  const parts = dateParts(value); if (!parts.date) return "";
  const parsed = new Date(`${parts.date}T${parts.time || "00:00"}:00+05:30`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
};
async function payload(row) {
  if (!row.DataJson) return null;
  const header = JSON.parse(row.DataJson);
  if (!header.bodyRef) return header;
  const chunks = await rows("BackendChunks", `CommitAppId=${quote(header.bodyRef)}`);
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
async function decoded(table) {
  const result = [];
  for (const row of await rows(table)) {
    try { const frame = await payload(row), record = frame?.record || frame; if (record?.id) result.push({ row, record, data: JSON.parse(record.data || "{}") }); } catch {}
  }
  return result;
}

const [usersRaw, companies, contacts, leads, opportunities] = await Promise.all([
  decoded("Users"), decoded("Companies"), decoded("Contacts"), decoded("Leads"), decoded("Opportunities"),
]);
const users = usersRaw.map(x => x.record).filter(u => u.active !== false && u.active !== 0 && norm(u.active) !== "false");
const fallbackOwner = users.find(u => norm(u.email).endsWith("@ohosolutions.in")) || users[0];
if (!fallbackOwner) throw new Error("No active Production owner is available.");
const userByName = new Map(users.map(user => [norm(user.name), user]));
const companyByZoho = new Map(), companyByName = new Map();
for (const item of companies) { if (item.data.zohoCRMId) companyByZoho.set(cleanId(item.data.zohoCRMId), item.record); companyByName.set(norm(item.record.title), item.record); }
const contactByZoho = new Map(), contactByName = new Map();
for (const item of contacts) { if (item.data.zohoCRMId) contactByZoho.set(cleanId(item.data.zohoCRMId), item.record); contactByName.set(norm(item.record.title), item.record); }
const leadByZoho = new Map();
for (const item of leads) if (item.data.zohoCRMId) leadByZoho.set(cleanId(item.data.zohoCRMId), item.record);
const existingByZoho = new Map();
for (const item of opportunities) { const id = cleanId(item.data.zohoCRMId || item.data.zohoDealId || item.data.sourceDealId); if (id) existingByZoho.set(id, item); }

function incomingData(row, previous = {}) {
  const follow = dateParts(row["Follow Up Date And Time"] || row["Follow Date"]);
  const proposalSent = dateParts(row["Estimate/Proposal Submitted Date"] || row["Estimate Submitted Date"]);
  const proposalDue = dateParts(row["Approximate Proposal Submission Date"]);
  const accepted = dateParts(row["Advance Received Date"]);
  const stage = mappedStage(row.Stage);
  const data = {
    ...previous,
    zohoCRMId: cleanId(row["Record Id"]), zohoDealNumber: row["Deal Number"] || previous.zohoDealNumber || "",
    zohoCRMStage: row.Stage || "", zohoCreatedTime: row["Created Time"] || previous.zohoCreatedTime || "",
    zohoModifiedTime: row["Modified Time"] || "", zohoCRMOwner: row["Deal Owner"] || "",
    stage, amount: row.Amount || previous.amount || "", currency: row.Currency || previous.currency || "INR",
    closingDate: row["Closing Date"] || previous.closingDate || "", companyName: row["Company Name"] || row.Company || previous.companyName || "",
    contactName: row["Contact Name"] || row.Contacts || previous.contactName || "", email: row.Email || previous.email || "", phone: row.Phone || previous.phone || "",
    source: row["Lead Source"] || previous.source || "", secondarySource: row["Secondary Source"] || previous.secondarySource || "",
    products: row["Zoho Products Used"] || row["Zoho Service"] || row["Service Name"] || previous.products || "",
    scope: row.Description || row["Product and Consultation"] || previous.scope || "",
    reasonLost: row["Reason For Loss"] || row["Reason for losing the deal"] || previous.reasonLost || "",
    advanceAmount: row["Advance Amount Received"] || previous.advanceAmount || "", paidDate: accepted.date || previous.paidDate || "",
    importOrigin: previous.importOrigin || "Zoho CRM Deals CSV reconciliation", importedAt: previous.importedAt || new Date().toISOString(),
  };
  if (follow.date) { data.nextFollowUp = follow.date; data.followUpTime = follow.time; data.followUpAction = previous.followUpAction || "Follow up on opportunity"; data.followUpNeeded = "Yes"; data.followUpStatus = "Pending"; }
  if (proposalSent.date) data.proposalSentDate = proposalSent.date;
  if (proposalDue.date) data.proposalDueDate = proposalDue.date;
  if (stage === "Negotiation") { data.negotiationDate = dateParts(row["Last Negotiation Done On"]).date || previous.negotiationDate || ""; data.negotiationPoints = row["Deal Update"] || row.Description || previous.negotiationPoints || "Imported negotiation"; }
  if (stage === "Accepted") { data.acceptedDate = accepted.date || dateParts(row["Closing Date"]).date || previous.acceptedDate || ""; data.acceptedBy = row["Contact Name"] || row.Contacts || previous.acceptedBy || "Client"; }
  return data;
}

const now = new Date().toISOString(), creates = [], updates = [], audits = [];
const stats = { source: csvRows.length, created: 0, updated: 0, unchanged: 0, linkedCompanies: 0, linkedContacts: 0, linkedLeads: 0, unmappedStages: 0 };
for (const row of csvRows) {
  const zohoId = cleanId(row["Record Id"]); if (!zohoId) continue;
  if (!stageMap.has(norm(row.Stage))) stats.unmappedStages++;
  const existing = existingByZoho.get(zohoId), previous = existing?.data || {}, data = incomingData(row, previous);
  const company = companyByZoho.get(cleanId(row["Company Name.id"])) || companyByName.get(norm(row["Company Name"] || row.Company));
  const contact = contactByZoho.get(cleanId(row["Contact Name.id"] || row["Contacts.id"])) || contactByName.get(norm(row["Contact Name"] || row.Contacts));
  const lead = leadByZoho.get(cleanId(row["Lead.id"]));
  if (company) stats.linkedCompanies++; if (contact) { data.contactId = contact.id; stats.linkedContacts++; } if (lead) { data.enquiryId = lead.id; stats.linkedLeads++; }
  const owner = userByName.get(norm(row["Deal Owner"])) || (existing ? users.find(u => u.id === existing.record.owner_id) : null) || fallbackOwner;
  const title = row["Deal Name"] || existing?.record.title || `Zoho deal ${zohoId}`;
  if (existing) {
    const changed = title !== existing.record.title || owner.id !== existing.record.owner_id || (company?.id || existing.record.company_id || null) !== (existing.record.company_id || null) || JSON.stringify(data) !== JSON.stringify(existing.data);
    if (!changed) { stats.unchanged++; continue; }
    const record = { ...existing.record, title, owner_id: owner.id, company_id: company?.id || existing.record.company_id || null, data: JSON.stringify(data), updated_at: now };
    const action = existing.data.stage !== data.stage ? "transition" : "edit";
    const audit = { id: randomUUID(), actor_id: fallbackOwner.id, action, target: `record:${record.id}`, details: JSON.stringify(action === "transition" ? { module: "opportunities", fromStage: existing.data.stage || "Solution planning", toStage: data.stage, data: { stageNote: `Reconciled from Zoho CRM stage: ${row.Stage}` } } : { module: "opportunities", source: "Zoho CRM Deals CSV reconciliation" }), created_at: now };
    const state = emptyState(); state.records = [record]; const projected = project(state).Opportunities[0];
    if (!dryRun) projected.DataJson = await stored({ _nativeRecord: true, record, audit, references: [record.company_id, data.contactId, data.enquiryId].filter(Boolean) });
    updates.push({ ...projected, ROWID: existing.row.ROWID }); audits.push(audit); stats.updated++;
  } else {
    const record = { id: `zcrm-deal-${zohoId}`, module: "opportunities", title, owner_id: owner.id, company_id: company?.id || null, data: JSON.stringify(data), created_at: iso(row["Created Time"]) || now, updated_at: now };
    const audit = { id: randomUUID(), actor_id: fallbackOwner.id, action: "create", target: `record:${record.id}`, details: JSON.stringify({ module: "opportunities", title, source: "Zoho CRM Deals CSV reconciliation" }), created_at: now };
    const state = emptyState(); state.records = [record]; const projected = project(state).Opportunities[0];
    if (!dryRun) projected.DataJson = await stored({ _nativeRecord: true, record, audit, references: [record.company_id, data.contactId, data.enquiryId].filter(Boolean) });
    creates.push(projected); audits.push(audit); stats.created++;
  }
}

if (!dryRun) {
  await batches(insert, "Opportunities", creates); await batches(update, "Opportunities", updates);
  const state = emptyState(); state.audit = audits; const projected = project(state);
  for (const row of projected.AuditLog) row.DataJson = JSON.stringify(audits.find(a => a.id === row.AppId));
  await batches(insert, "AuditLog", projected.AuditLog); await batches(insert, "StageHistory", projected.StageHistory);
}
console.log(JSON.stringify({ ...stats, dryRun, plannedWrites: creates.length + updates.length }, null, 2));
