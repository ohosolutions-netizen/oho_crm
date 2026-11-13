import process from "node:process";
import { readFile } from "node:fs/promises";
import { config, insert, rows, quote, update } from "../catalyst/client.mjs";
import {
  decodeNativePayload,
  encodeNativePayload,
} from "../catalyst/native-record-codec.mjs";

const dryRun = process.argv.includes("--dry-run");
if (process.argv.includes("--production")) config.environment = "Production";
const opportunityMode = process.argv.includes("--opportunities");
const repairAll = process.argv.includes("--repair-all");
const csvArg = process.argv.indexOf("--csv");
const source = repairAll ? "" : csvArg >= 0 ? await readFile(process.argv[csvArg + 1], "utf8") : await new Promise((resolve, reject) => {
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
const notes = repairAll ? [] : csvArg >= 0 ? parseCSV(source) : JSON.parse(source);
const normalizeZohoId = (value) => String(value || "").replace(/^zcrm_/i, "").trim();

async function payload(row) {
  if (!row.DataJson) return null;
  const header = JSON.parse(row.DataJson);
  if (!header.bodyRef) return header;
  const chunks = await rows("BackendChunks", `CommitAppId=${quote(header.bodyRef)}`);
  return decodeNativePayload(row.DataJson, chunks);
}

if (repairAll) {
  const legacy = (
    await rows("Settings", "SettingKey LIKE 'zoho-note:*' AND IsDeleted=false")
  ).filter((row) => !row.DataJson && row.SettingKey && row.SettingValue);
  const repairs = [];
  const chunks = [];
  for (const row of legacy) {
    const encoded = encodeNativePayload({
      key: row.SettingKey,
      value: row.SettingValue,
    });
    repairs.push({
      AppId: row.SettingKey,
      SettingKey: row.SettingKey,
      SettingValue: row.SettingValue,
      DataJson: encoded.data,
      IsDeleted: false,
      ROWID: row.ROWID,
    });
    chunks.push(...encoded.chunks);
  }
  if (!dryRun) {
    for (let offset = 0; offset < chunks.length; offset += 100)
      await insert("BackendChunks", chunks.slice(offset, offset + 100));
    for (let offset = 0; offset < repairs.length; offset += 100)
      await update("Settings", repairs.slice(offset, offset + 100));
  }
  console.log(
    JSON.stringify(
      {
        legacyNotes: legacy.length,
        repaired: dryRun ? 0 : repairs.length,
        readyToRepair: repairs.length,
        dryRun,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const [leadRows, enquiryRows] = opportunityMode
  ? [await rows("Opportunities"), []]
  : await Promise.all([rows("Leads"), rows("Enquiries")]);
const leadByZohoId = new Map();
for (const row of leadRows) {
  try {
    const frame = await payload(row);
    const record = frame?.record || frame;
    const data = JSON.parse(record.data || "{}");
    const zohoId = normalizeZohoId(data.zohoCRMId || data.zohoDealId || data.sourceDealId);
    if (zohoId) leadByZohoId.set(zohoId, row.AppId);
  } catch {
    // Ignore malformed legacy rows; they cannot be matched safely.
  }
}
for (const row of enquiryRows) {
  try {
    const frame = await payload(row);
    const record = frame?.record || frame;
    const data = JSON.parse(record.data || "{}");
    const zohoId = normalizeZohoId(data.zohoCRMId);
    if (zohoId && data.enquiryId) leadByZohoId.set(zohoId, data.enquiryId);
  } catch {
    // Ignore malformed legacy enquiries; they cannot be matched safely.
  }
}

const existing = new Map(
  (await rows("Settings", "SettingKey LIKE 'zoho-note:*' AND IsDeleted=false")).map(
    (row) => [row.SettingKey, row],
  ),
);
const pending = [];
const repairs = [];
const chunks = [];
const unmatched = [];
let skipped = 0;
for (const note of notes) {
  const parentZohoId = normalizeZohoId(note["Parent ID.id"]);
  const leadId = leadByZohoId.get(parentZohoId);
  if (!leadId) {
    unmatched.push({
      noteId: note["Record Id"],
      leadZohoId: note["Parent ID.id"],
      leadName: note["Parent ID"],
    });
    continue;
  }
  const noteId = String(note["Record Id"] || "").trim();
  const key = `zoho-note:${leadId}:${noteId}`;
  if (!noteId) {
    skipped += 1;
    continue;
  }
  const value = JSON.stringify({
    content: note["Note Content"] || "",
    title: note["Note Title"] || "",
    createdBy: note["Created By"] || note["Note Owner"] || "Zoho CRM",
    createdAt: note["Created Time"] || "",
    modifiedBy: note["Modified By"] || "",
    modifiedAt: note["Modified Time"] || "",
    zohoNoteId: noteId,
    zohoLeadId: note["Parent ID.id"] || "",
    source: "Zoho CRM",
  });
  const encoded = encodeNativePayload({ key, value });
  const row = {
    AppId: key,
    SettingKey: key,
    SettingValue: value,
    DataJson: encoded.data,
    IsDeleted: false,
  };
  const prior = existing.get(key);
  if (prior) {
    let readable = false;
    try {
      const decoded = await payload(prior);
      readable = decoded?.key === key && decoded?.value === value;
    } catch {}
    if (readable) skipped += 1;
    else {
      repairs.push({ ...row, ROWID: prior.ROWID });
      chunks.push(...encoded.chunks);
    }
  } else {
    pending.push(row);
    chunks.push(...encoded.chunks);
  }
  existing.set(key, row);
}

if (!dryRun) {
  for (let offset = 0; offset < chunks.length; offset += 100) {
    await insert("BackendChunks", chunks.slice(offset, offset + 100));
  }
  for (let offset = 0; offset < pending.length; offset += 100) {
    await insert("Settings", pending.slice(offset, offset + 100));
  }
  for (let offset = 0; offset < repairs.length; offset += 100) {
    await update("Settings", repairs.slice(offset, offset + 100));
  }
}

console.log(
  JSON.stringify(
    {
      sourceNotes: notes.length,
      matchedRecords: leadByZohoId.size,
      inserted: dryRun ? 0 : pending.length,
      readyToInsert: pending.length,
      repaired: dryRun ? 0 : repairs.length,
      readyToRepair: repairs.length,
      alreadyPresent: skipped,
      unmatched: unmatched.length,
      unmatchedSample: unmatched.slice(0, 20),
      dryRun,
    },
    null,
    2,
  ),
);
