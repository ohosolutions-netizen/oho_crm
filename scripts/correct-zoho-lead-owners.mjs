import { randomUUID } from "node:crypto";
import {
  config,
  insert,
  query,
  update,
} from "../catalyst/client.mjs";
import { encodeNativePayload } from "../catalyst/native-record-codec.mjs";
import { project } from "../catalyst/projections.mjs";

const apply = process.argv.includes("--apply");
config.environment = process.argv.includes("--production")
  ? "Production"
  : "Development";

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const emptyState = () => ({
  roles: [],
  profiles: [],
  users: [],
  records: [],
  audit: [],
  settings: [],
});

async function all(table, where = "") {
  const result = [];
  for (let offset = 0; ; offset += 200) {
    const page = await query(
      `SELECT * FROM ${table}${where ? ` WHERE ${where}` : ""} LIMIT ${offset},200`,
    );
    const flat = page.map((item) => item[table] || item);
    result.push(...flat);
    if (flat.length < 200) return result;
  }
}

async function ownerChangedLeadIds(ids) {
  const changed = new Set();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const targets = ids
      .slice(offset, offset + 100)
      .map((id) => quote(`record:${id}`))
      .join(",");
    const audits = await all(
      "AuditLog",
      `Target IN (${targets}) AND IsDeleted=false`,
    );
    for (const row of audits) {
      try {
        const audit = JSON.parse(row.DataJson || "{}");
        const details = JSON.parse(audit.details || "{}");
        if (
          details.before?.ownerId &&
          details.after?.ownerId &&
          details.before.ownerId !== details.after.ownerId
        ) {
          changed.add(String(audit.target || row.Target).replace(/^record:/, ""));
        }
      } catch {}
    }
  }
  return changed;
}

const users = await all("Users", "IsDeleted=false");
const activeUsers = users.filter((user) =>
  [true, 1, "1", "true"].includes(
    typeof user.Active === "string" ? user.Active.toLowerCase() : user.Active,
  ),
);
const usersById = new Map(activeUsers.map((user) => [user.AppId, user]));
const usersByName = new Map();
for (const user of activeUsers) {
  const key = normalize(user.Name);
  if (usersByName.has(key))
    throw new Error(`Multiple active users are named ${user.Name}.`);
  usersByName.set(key, user);
}
const actor =
  activeUsers.find(
    (user) =>
      normalize(user.Email) === "c8tyvch5hn@privaterelay.appleid.com",
  ) || activeUsers.find((user) => normalize(user.Name) === "krishna kumar");
if (!actor) throw new Error("Administrative audit actor not found.");

const candidates = [];
for (const row of await all("Leads", "IsDeleted=false")) {
  let frame;
  try {
    frame = JSON.parse(row.DataJson || "{}");
    if (frame.bodyRef) continue;
    const record = frame.record || frame;
    const data = JSON.parse(record.data || "{}");
    const zohoOwner = String(data.zohoCRMOwner || "").trim();
    if (!zohoOwner) continue;
    const currentOwner = usersById.get(record.owner_id || row.OwnerAppId);
    if (normalize(zohoOwner) === normalize(currentOwner?.Name)) continue;
    const targetOwner = usersByName.get(normalize(zohoOwner));
    if (!targetOwner) continue;
    candidates.push({ row, frame, record, data, currentOwner, targetOwner });
  } catch {}
}

const changedIds = await ownerChangedLeadIds(
  candidates.map(({ record }) => record.id),
);
const corrections = candidates.filter(({ record }) => !changedIds.has(record.id));
const skippedAudited = candidates.length - corrections.length;

if (!apply) {
  console.log(
    JSON.stringify(
      {
        environment: config.environment,
        apply: false,
        corrections: corrections.length,
        skippedAudited,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const leadUpdates = [];
const auditRows = [];
const correctedIds = [];
const targetOwnerById = new Map();
const now = new Date().toISOString();
for (const item of corrections) {
  const { row, frame, record, currentOwner, targetOwner } = item;
  const updated = { ...record, owner_id: targetOwner.AppId, updated_at: now };
  const audit = {
    id: randomUUID(),
    actor_id: actor.AppId,
    action: "edit",
    target: `record:${record.id}`,
    details: JSON.stringify({
      module: "enquiries",
      reason: "Zoho owner migration correction",
      before: {
        ownerId: record.owner_id,
        ownerName: currentOwner?.Name || "Unknown user",
        data: {},
      },
      after: {
        ownerId: targetOwner.AppId,
        ownerName: targetOwner.Name,
        data: {},
      },
    }),
    created_at: now,
  };
  const recordState = emptyState();
  recordState.records = [updated];
  const projected = project(recordState).Leads[0];
  const encoded = encodeNativePayload({
    _nativeRecord: true,
    record: updated,
    audit,
    references: frame.references || [],
  });
  if (encoded.chunks.length)
    throw new Error(`Unexpected large lead payload for ${record.id}.`);
  leadUpdates.push({ ...projected, DataJson: encoded.data, ROWID: row.ROWID });

  const auditState = emptyState();
  auditState.audit = [audit];
  const auditRow = project(auditState).AuditLog[0];
  const auditEncoded = encodeNativePayload(audit);
  if (auditEncoded.chunks.length)
    throw new Error(`Unexpected large audit payload for ${record.id}.`);
  auditRows.push({ ...auditRow, DataJson: auditEncoded.data });
  correctedIds.push(record.id);
  targetOwnerById.set(record.id, targetOwner.AppId);
}

for (let offset = 0; offset < leadUpdates.length; offset += 50)
  await update("Leads", leadUpdates.slice(offset, offset + 50));
for (let offset = 0; offset < auditRows.length; offset += 50)
  await insert("AuditLog", auditRows.slice(offset, offset + 50));

let followUpsUpdated = 0;
for (let offset = 0; offset < correctedIds.length; offset += 100) {
  const ids = correctedIds.slice(offset, offset + 100);
  const followUps = await all(
    "FollowUps",
    `AppId IN (${ids.map(quote).join(",")}) AND IsDeleted=false`,
  );
  const updates = followUps.map((row) => ({
    ROWID: row.ROWID,
    OwnerAppId: targetOwnerById.get(row.AppId),
  }));
  if (updates.length) await update("FollowUps", updates);
  followUpsUpdated += updates.length;
}

console.log(
  JSON.stringify({
    environment: config.environment,
    apply: true,
    corrected: corrections.length,
    skippedAudited,
    followUpsUpdated,
    correctedAt: now,
  }),
);
