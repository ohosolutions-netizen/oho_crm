import { rows, allRecords, canSee, APIError, type Context } from "./server";
import {
  modules,
  hasPermission,
  visibleOwner,
  indiaToday,
  type CRMRecord,
} from "./model";
import { emptyLeadCriteria, type LeadCriteria } from "./lead-views";
import { validDate } from "./stage-rules";
import { formatMoney } from "./money";
export const stageSQL = (a = "r") =>
  `CASE ${a}.module WHEN 'enquiries' THEN CASE json_extract(${a}.data,'$.status') WHEN 'New' THEN 'New Lead' WHEN 'Reviewing' THEN 'Not Contacted' WHEN 'Contacted' THEN 'Not Contacted' WHEN 'Not connected' THEN 'Not Contacted' WHEN 'Qualified' THEN 'Discovery completed' WHEN 'Not qualified' THEN 'Disqualified' ELSE COALESCE(json_extract(${a}.data,'$.status'),'New Lead') END ELSE CASE json_extract(${a}.data,'$.stage') WHEN 'New enquiry' THEN 'Solution planning' WHEN 'Qualification' THEN 'Solution planning' WHEN 'Discovery' THEN 'Solution planning' WHEN 'Proposal' THEN 'Proposal sent' ELSE COALESCE(json_extract(${a}.data,'$.stage'),json_extract(${a}.data,'$.status'),'') END END`;
const j = (key: string, a = "r") =>
  `COALESCE(json_extract(${a}.data,'$.${key}'),'')`;
export function dueSQL(a = "r") {
  const status = j("status", a),
    stage = j("stage", a),
    next = j("nextFollowUp", a);
  return `CASE WHEN ${status} IN ('Completed','Cancelled','Paid','Rejected','Not qualified','Converted') OR (${status} IN ('Disqualified','Junk Lead','Lead Lost') AND ${j("followUpNeeded", a)}!='Yes') OR ${j("followUpStatus", a)} IN ('Completed','Cancelled') OR (${stage} IN ('Closed lost','Accepted') AND ${j("followUpNeeded", a)}!='Yes') THEN '' ELSE COALESCE(NULLIF(${next},''),CASE WHEN ${a}.module='enquiries' AND ${status}='Discovery scheduled' AND ${j("discoveryActivityId", a)}='' THEN NULLIF(${j("discoveryDate", a)},'') END,CASE WHEN ${a}.module='opportunities' AND ${stage}='Proposal preparation' THEN NULLIF(${j("proposalDueDate", a)},'') END,CASE WHEN ${a}.module IN ('activities','invoices','projects') THEN ${j("dueDate", a)} END,'') END`;
}
export function visibility(c: Context, alias = "r") {
  const owners = c.members
      .filter((u) => visibleOwner(c.me, u, c.roles))
      .map((u) => u.id),
    names = Object.keys(modules).filter((m) =>
      hasPermission(c.permissions, m, "view"),
    );
  return {
    where:
      owners.length && names.length
        ? `${alias}.owner_id IN (${owners.map(() => "?")}) AND ${alias}.module IN (${names.map(() => "?")})`
        : "0=1",
    args: (owners.length && names.length
      ? [...owners, ...names]
      : []) as unknown[],
  };
}
function followCondition(value: string, args: unknown[], today: string) {
  const due = dueSQL();
  if (value === "Completed" || value === "Cancelled") {
    args.push(value);
    return `${due}='' AND ${j("followUpStatus")}=?`;
  }
  if (value === "No follow-up")
    return `${due}='' AND ${j("followUpStatus")} NOT IN ('Completed','Cancelled')`;
  args.push(today);
  return `${due}!='' AND ${due}${value === "Overdue" ? "<" : value === "Upcoming" ? ">" : "="}?`;
}
export function buildRecordQuery(c: Context, p: URLSearchParams) {
  const module = p.get("module") || "",
    followups = module === "followups";
  if (!followups && !modules[module])
    throw new APIError("Select a valid module.");
  if (!followups && !hasPermission(c.permissions, module, "view"))
    throw new APIError("Your profile does not allow this action.", 403);
  const scope = visibility(c),
    args = [...scope.args],
    conditions = [scope.where];
  let criteria = emptyLeadCriteria();
  if (!followups) {
    conditions.push("r.module=?");
    args.push(module);
  } else conditions.push(dueSQL() + "!=''");
  const filter = p.get("filter") || "All",
    today = indiaToday();
  if (filter === "Mine") {
    conditions.push("r.owner_id=?");
    args.push(c.me.id);
  } else if (
    [
      "Overdue",
      "Due today",
      "Upcoming",
      "No follow-up",
      "Follow-up completed",
      "Completed",
      "Cancelled",
    ].includes(filter)
  )
    conditions.push(
      followCondition(
        filter === "Follow-up completed" ? "Completed" : filter,
        args,
        today,
      ),
    );
  else if (filter !== "All") {
    conditions.push(`(${stageSQL()}=? OR ${j("status")}=?)`);
    args.push(filter, filter);
  }
  const companyScope = visibility(c, "co");
  const company = `COALESCE((SELECT co.title FROM records co WHERE co.id=r.company_id AND ${companyScope.where}),${j("companyName")},'')`;
  if (module === "enquiries" && p.get("criteria")) {
    let raw: Partial<LeadCriteria>;
    try {
      raw = JSON.parse(p.get("criteria")!);
      if (!raw || Array.isArray(raw) || typeof raw !== "object") throw Error();
    } catch {
      throw new APIError("Invalid lead filters.");
    }
    for (const key of Object.keys(criteria) as (keyof LeadCriteria)[]) {
      if (raw[key] !== undefined && typeof raw[key] !== "string")
        throw new APIError("Invalid lead filters.");
      if (raw[key] !== undefined) criteria[key] = raw[key]!;
    }
    const stage = stageSQL(),
      converted = `(${stage}='Converted' OR ${j("convertedOpportunityId")}!='')`,
      lost = `${stage} IN ('Lead Lost','Disqualified','Junk Lead','Not qualified')`;
    if (criteria.view === "Active Leads")
      conditions.push(`NOT ${converted} AND NOT (${lost})`);
    else if (criteria.view === "Archived / Converted")
      conditions.push(converted);
    else if (criteria.view === "Lost / Disqualified") conditions.push(lost);
    for (const [key, expr] of [
      ["stage", stage],
      ["source", j("source")],
      ["owner", "r.owner_id"],
    ] as const) {
      if (criteria[key]) {
        conditions.push(expr + "=?");
        args.push(criteria[key]);
      }
    }
    if (criteria.followup)
      conditions.push(followCondition(criteria.followup, args, today));
    if (criteria.company) {
      conditions.push(`instr(lower(${company}),lower(?))>0`);
      args.push(...companyScope.args, criteria.company);
    }
    for (const side of ["from", "to"] as const) {
      const date = criteria[side === "from" ? "fromDate" : "toDate"],
        time = criteria[side === "from" ? "fromTime" : "toTime"];
      if (date) {
        if (
          !validDate(date) ||
          (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
        )
          throw new APIError("Invalid creation date filter.");
        conditions.push(
          `julianday(r.created_at) ${side === "from" ? ">=" : "<="} julianday(?)`,
        );
        args.push(
          date +
            "T" +
            (time || (side === "from" ? "00:00" : "23:59")) +
            (side === "from" ? ":00" : ":59") +
            "+05:30",
        );
      }
    }
  }
  const search = (p.get("search") || "").trim();
  if (search) {
    if (p.get("mode") === "lookup") {
      conditions.push("instr(lower(r.title),lower(?))>0");
      args.push(search);
    } else {
      const text = [
        "r.title",
        ...[
          "contactName",
          "email",
          "phone",
          "companyName",
          "products",
          "source",
          "status",
          "stage",
          "zohoCRMId",
          "requirements",
        ].map((key) => j(key)),
      ].join("||' '||");
      conditions.push(
        `(instr(lower(${text}),lower(?))>0 OR instr(lower(${company}),lower(?))>0)`,
      );
      args.push(search, ...companyScope.args, search);
    }
  }
  if (p.get("companyId")) {
    conditions.push("r.company_id=?");
    args.push(p.get("companyId"));
  }
  if (p.get("accepted") === "1") {
    conditions.push(`(${stageSQL()}='Accepted' OR ${j("status")}='Accepted')`);
  }
  const page = Number(p.get("page") || 0),
    size = Number(p.get("pageSize") || 50);
  if (
    !Number.isInteger(page) ||
    page < 0 ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > 100
  )
    throw new APIError("Invalid record page.");
  return { where: conditions.join(" AND "), args, page, size, followups };
}
export async function relatedCompanies(c: Context, records: CRMRecord[]) {
  const ids = [...new Set(records.map((r) => r.companyId).filter(Boolean))];
  return ids.length
    ? (await allRecords("id IN (" + ids.map(() => "?") + ")", ids)).filter(
        (r) => canSee(c, r),
      )
    : [];
}
export async function recordPage(c: Context, p: URLSearchParams) {
  const q = buildRecordQuery(c, p),
    from = " FROM records r WHERE " + q.where;
  const total = (
    await rows<{ n: number }>("SELECT COUNT(*) AS n" + from, ...q.args)
  )[0].n;
  const recordRows = await rows<{ id: string }>(
    "SELECT r.id" +
      from +
      " ORDER BY " +
      (q.followups ? dueSQL() + " ASC," : "") +
      "r.updated_at DESC,r.id ASC LIMIT ? OFFSET ?",
    ...q.args,
    q.size,
    q.page * q.size,
  );
  const ids = recordRows.map((r) => r.id),
    records = ids.length
      ? await allRecords("id IN (" + ids.map(() => "?") + ")", ids)
      : [];
  const leadIds = records
    .filter((r) => r.module === "enquiries")
    .map((r) => r.id);
  if (leadIds.length) {
    const counts = await rows<{ leadId: string; count: number }>(
      "SELECT json_extract(data,'$.enquiryId') AS leadId,COUNT(*) AS count FROM records WHERE module='leadEnquiries' AND json_extract(data,'$.enquiryId') IN (" +
        leadIds.map(() => "?").join(",") +
        ") GROUP BY leadId",
      ...leadIds,
    );
    const byLead = new Map(counts.map((row) => [row.leadId, row.count]));
    for (const record of records) {
      const count = byLead.get(record.id) || 0;
      if (count)
        record.data = {
          ...record.data,
          reEnquiryCount: String(count),
          reEnquiryTag: "#ReEnquiry",
        };
    }
  }
  const byId = new Map(records.map((r) => [r.id, r]));
  const stageCounts = await rows<{ stage: string; count: number }>(
    `SELECT ${stageSQL()} AS stage,COUNT(*) AS count` +
      from +
      " GROUP BY stage",
    ...q.args,
  );
  let followupCounts: { label: string; count: number }[] | undefined;
  if (q.followups) {
    const all = new URLSearchParams(p);
    all.set("filter", "All");
    const base = buildRecordQuery(c, all);
    const due = dueSQL(),
      today = indiaToday();
    followupCounts = await rows<{ label: string; count: number }>(
      `SELECT CASE WHEN ${due}<? THEN 'Overdue' WHEN ${due}=? THEN 'Due today' ELSE 'Upcoming' END AS label,COUNT(*) AS count FROM records r WHERE ${base.where} GROUP BY label`,
      today,
      today,
      ...base.args,
    );
  }
  return {
    records: ids.map((id) => byId.get(id)!),
    relatedRecords: await relatedCompanies(c, records),
    total,
    page: q.page,
    pageSize: q.size,
    stageCounts,
    followupCounts,
  };
}
function range(from: string, to: string) {
  if (!validDate(from) || !validDate(to) || from > to)
    throw new APIError("Choose a valid date range.");
  return [from + "T00:00:00+05:30", to + "T23:59:59.999+05:30"];
}
export async function conversionSQL(c: Context, from: string, to: string) {
  const dates = range(from, to),
    scope = visibility(c);
  const stage = stageSQL();
  const leadSteps = [
      { label: "New leads", stages: [] },
      {
        label: "Connected",
        stages: [
          "Connected",
          "Not Pitched",
          "Discovery to be Scheduled",
          "Discovery scheduled",
          "Discovery completed",
          "Converted",
        ],
      },
      {
        label: "Discovery to be scheduled",
        stages: [
          "Discovery to be Scheduled",
          "Discovery scheduled",
          "Discovery completed",
          "Converted",
        ],
      },
      {
        label: "Discovery scheduled",
        stages: ["Discovery scheduled", "Discovery completed", "Converted"],
      },
      {
        label: "Discovery completed",
        stages: ["Discovery completed", "Converted"],
      },
      { label: "Converted", stages: ["Converted"] },
    ],
    dealStages = [
      "Solution planning",
      "Proposal preparation",
      "Proposal sent",
      "Negotiation",
      "Accepted",
    ];
  const sqlList = (values: string[]) =>
    values.map((v) => "'" + v.replaceAll("'", "''") + "'").join(",");
  const reached = (alias: string, values: string[]) =>
    `(${stageSQL(alias)} IN (${sqlList(values)}) OR EXISTS (SELECT 1 FROM audit a WHERE a.action IN ('transition','convert') AND a.target IN ('record:'||${alias}.id,'lead:'||${alias}.id) AND (json_extract(a.details,'$.fromStage') IN (${sqlList(values)}) OR COALESCE(json_extract(a.details,'$.toStage'),CASE WHEN a.action='convert' THEN 'Converted' END) IN (${sqlList(values)}))))`;
  const expressions = leadSteps.map((s, i) =>
    i
      ? `(${reached("r", s.stages)} OR COALESCE(progress.linked,0)>0 OR converted.id IS NOT NULL)`
      : "1=1",
  );
  for (let i = 0; i < dealStages.length; i++)
    expressions.push(
      `(COALESCE(progress.n${i},0)=1 OR COALESCE(converted.n${i},0)=1)`,
    );
  const flags = dealStages
    .map((_, i) =>
      i
        ? `CASE WHEN ${reached("o", dealStages.slice(i))} THEN 1 ELSE 0 END AS n${i}`
        : "1 AS n0",
    )
    .join(",");
  const sql = `SELECT * FROM (WITH visible AS (SELECT id,module,data,created_at FROM records r WHERE ${scope.where}), cohort AS (SELECT * FROM visible WHERE module='enquiries' AND julianday(created_at) BETWEEN julianday(?) AND julianday(?)), opportunity_flags AS (SELECT o.id,json_extract(o.data,'$.enquiryId') AS lead_id,${flags} FROM visible o WHERE o.module='opportunities'), progress AS (SELECT lead_id,COUNT(*) AS linked,${dealStages.map((_, i) => `MAX(n${i}) AS n${i}`).join(",")} FROM opportunity_flags GROUP BY lead_id) SELECT ${expressions.map((e, i) => `COALESCE(SUM(CASE WHEN ${e} THEN 1 ELSE 0 END),0) AS n${i}`).join(",")} FROM cohort r LEFT JOIN progress ON progress.lead_id=r.id LEFT JOIN opportunity_flags converted ON converted.id=json_extract(r.data,'$.convertedOpportunityId'))`;

  const row = (
      await rows<Record<string, number>>(sql, ...scope.args, ...dates)
    )[0],
    labels = [
      ...leadSteps.map((s) => s.label),
      ...dealStages.map((s) => (s === "Accepted" ? "Proposal accepted" : s)),
    ];
  return labels.map((label, i) => ({
    label,
    count: row["n" + i],
    percent: row.n0 ? Math.round((row["n" + i] / row.n0) * 100) : 0,
  }));
}
export async function timingSQL(c: Context, from: string, to: string) {
  const dates = range(from, to),
    previousTo = new Date(
      Date.parse(from + "T00:00:00+05:30") - 86400000,
    ).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
    previousFrom = previousTo.slice(0, 7) + "-01",
    previous = range(previousFrom, previousTo),
    scope = visibility(c);
  const sql = `SELECT * FROM (WITH visible AS (SELECT * FROM records r WHERE ${scope.where} AND r.module IN ('enquiries','opportunities')), events AS (SELECT r.id,r.module,r.created_at,r.data,a.id AS event_id,a.created_at AS at,COALESCE(json_extract(a.details,'$.fromStage'),json_extract(a.details,'$.before.data.status'),'') AS src,COALESCE(json_extract(a.details,'$.toStage'),CASE WHEN a.action='convert' THEN 'Converted' END) AS dest FROM visible r JOIN audit a ON a.target IN ('record:'||r.id,'lead:'||r.id) WHERE a.action IN ('transition','convert')), real AS (SELECT * FROM events WHERE src!=dest), ranked AS (SELECT *,LAG(at) OVER (PARTITION BY id ORDER BY at,event_id) AS previous_at,LAG(dest) OVER (PARTITION BY id ORDER BY at,event_id) AS previous_stage FROM real), samples AS (SELECT src||' → '||dest AS path,julianday(at) AS finished,(julianday(at)-julianday(CASE WHEN previous_stage=src THEN previous_at WHEN previous_at IS NULL AND (src='New Lead' OR (src='Solution planning' AND COALESCE(json_extract(data,'$.importOrigin'),'')='')) THEN created_at END))*86400000.0 AS duration FROM ranked), valid AS (SELECT * FROM samples WHERE duration>=0) SELECT path,AVG(CASE WHEN finished BETWEEN julianday(?) AND julianday(?) THEN duration END) AS current,AVG(CASE WHEN finished BETWEEN julianday(?) AND julianday(?) THEN duration END) AS previous,COUNT(CASE WHEN finished BETWEEN julianday(?) AND julianday(?) THEN 1 END) AS count,COUNT(CASE WHEN finished BETWEEN julianday(?) AND julianday(?) THEN 1 END) AS previousCount FROM valid GROUP BY path HAVING count>0 OR previousCount>0 ORDER BY path)`;
  return {
    previousFrom,
    previousTo,
    rows: await rows<{
      path: string;
      current: number | null;
      previous: number | null;
      count: number;
      previousCount: number;
    }>(sql, ...scope.args, ...dates, ...previous, ...dates, ...previous),
  };
}
export async function dashboardSQL(c: Context, from: string, to: string) {
  const scope = visibility(c),
    where = " FROM records r WHERE " + scope.where,
    due = dueSQL(),
    today = indiaToday();
  const counts = await rows<{ module: string; stage: string; count: number }>(
    `SELECT r.module,${stageSQL()} AS stage,COUNT(*) AS count` +
      where +
      " GROUP BY r.module,stage",
    ...scope.args,
  );
  const sums = async (module: string, extra: string, value: string) => {
    const result = await rows<{ currency: string; amount: number }>(
      `SELECT COALESCE(NULLIF(${j("currency")},''),'INR') AS currency,SUM(${value}) AS amount` +
        where +
        ` AND r.module=? AND ${extra} GROUP BY currency`,
      ...scope.args,
      module,
    );
    return (
      result.map((v) => formatMoney(v.amount, v.currency)).join(" / ") ||
      formatMoney(0)
    );
  };
  const pipelineValue = await sums(
      "opportunities",
      `${stageSQL()} NOT IN ('Accepted','Closed lost')`,
      `CAST(${j("amount")} AS REAL)`,
    ),
    outstandingValue = await sums(
      "invoices",
      `${j("status")}!='Cancelled'`,
      `MAX(0,CAST(${j("amount")} AS REAL)-CAST(${j("paidAmount")} AS REAL))`,
    );
  const followupCounts = await rows<{ label: string; count: number }>(
    `SELECT CASE WHEN ${due}<? THEN 'Overdue' WHEN ${due}=? THEN 'Due today' ELSE 'Upcoming' END AS label,COUNT(*) AS count` +
      where +
      ` AND ${due}!='' GROUP BY label`,
    today,
    today,
    ...scope.args,
  );
  const recentIds = await rows<{ id: string }>(
      "SELECT r.id" + where + " ORDER BY r.updated_at DESC,r.id LIMIT 6",
      ...scope.args,
    ),
    dueIds = await rows<{ id: string }>(
      "SELECT r.id" + where + ` AND ${due}!='' ORDER BY ${due},r.id LIMIT 50`,
      ...scope.args,
    ),
    ids = [...new Set([...recentIds, ...dueIds].map((r) => r.id))],
    records = ids.length
      ? await allRecords("id IN (" + ids.map(() => "?") + ")", ids)
      : [];
  const outstandingCount = (
    await rows<{ n: number }>(
      "SELECT COUNT(*) AS n" +
        where +
        ` AND r.module='invoices' AND ${j("status")}!='Cancelled' AND CAST(${j("amount")} AS REAL)>CAST(${j("paidAmount")} AS REAL)`,
      ...scope.args,
    )
  )[0].n;
  return {
    counts,
    pipelineValue,
    outstandingValue,
    outstandingCount,
    followupCounts,
    recentIds: recentIds.map((r) => r.id),
    followupIds: dueIds.map((r) => r.id),
    records,
    relatedRecords: await relatedCompanies(c, records),
    funnel: await conversionSQL(c, from, to),
    timing: await timingSQL(c, from, to),
  };
}

export async function homeSQL(c: Context, from: string, to: string) {
  if (!validDate(from) || !validDate(to) || from > to)
    throw new APIError("Choose a valid follow-up date range.");
  const scope = visibility(c),
    due = dueSQL(),
    today = indiaToday(),
    owned = `${scope.where} AND r.owner_id=?`,
    ownedArgs = [...scope.args, c.me.id],
    dayStart = today + "T00:00:00+05:30",
    dayEnd = today + "T23:59:59.999+05:30",
    assignedToday = `(SELECT MAX(a.created_at) FROM audit a WHERE a.action='edit' AND a.target='record:'||r.id AND json_extract(a.details,'$.after.ownerId')=? AND COALESCE(json_extract(a.details,'$.before.ownerId'),'')<>? AND julianday(a.created_at) BETWEEN julianday(?) AND julianday(?))`,
    leadInboxAt = `MAX(r.created_at,COALESCE(${assignedToday},r.created_at))`,
    untouchedAfter = (at: string) =>
      `NOT EXISTS (SELECT 1 FROM audit worked WHERE worked.target IN ('record:'||r.id,'lead:'||r.id) AND julianday(worked.created_at)>julianday(${at}))`,
    taskIds = await rows<{ id: string }>(
      `SELECT r.id FROM records r WHERE ${owned} AND ${due}!='' AND ${due}>=? AND ${due}<=? ORDER BY ${due} ASC,COALESCE(json_extract(r.data,'$.followUpTime'),json_extract(r.data,'$.dueTime'),'') ASC,r.id ASC LIMIT 30`,
      ...ownedArgs,
      from,
      to,
    ),
    leadIds = await rows<{ id: string }>(
      `SELECT r.id FROM records r WHERE ${owned} AND r.module='enquiries' AND (julianday(r.created_at) BETWEEN julianday(?) AND julianday(?) OR ${assignedToday} IS NOT NULL) AND ${untouchedAfter(leadInboxAt)} ORDER BY r.updated_at DESC,r.id ASC LIMIT 12`,
      ...ownedArgs,
      dayStart,
      dayEnd,
      c.me.id,
      c.me.id,
      dayStart,
      dayEnd,
      c.me.id,
      c.me.id,
      dayStart,
      dayEnd,
    ),
    opportunityIds = await rows<{ id: string }>(
      `SELECT r.id FROM records r WHERE ${owned} AND r.module='opportunities' AND julianday(r.created_at) BETWEEN julianday(?) AND julianday(?) AND ${untouchedAfter("r.created_at")} ORDER BY r.created_at DESC,r.id ASC LIMIT 12`,
      ...ownedArgs,
      dayStart,
      dayEnd,
    ),
    openLeadIds = await rows<{ id: string }>(
      `SELECT r.id FROM records r WHERE ${owned} AND r.module='enquiries' AND ${stageSQL()} NOT IN ('Converted','Lead Lost','Junk Lead','Disqualified','Not qualified') AND ${j("convertedOpportunityId")}='' ORDER BY r.updated_at DESC,r.id ASC LIMIT 20`,
      ...ownedArgs,
    ),
    openOpportunityIds = await rows<{ id: string }>(
      `SELECT r.id FROM records r WHERE ${owned} AND r.module='opportunities' AND ${stageSQL()} NOT IN ('Accepted','Closed lost') ORDER BY r.updated_at DESC,r.id ASC LIMIT 20`,
      ...ownedArgs,
    ),
    ids = [...new Set([...taskIds, ...leadIds, ...opportunityIds, ...openLeadIds, ...openOpportunityIds].map((r) => r.id))],
    records = ids.length
      ? await allRecords("id IN (" + ids.map(() => "?").join(",") + ")", ids)
      : [],
    parentIds = [
      ...new Set(
        records
          .filter((record) => record.module === "activities")
          .map((record) => record.data.enquiryId || record.data.opportunityId)
          .filter(Boolean),
      ),
    ],
    parentRecords = parentIds.length
      ? (await allRecords(
          "id IN (" + parentIds.map(() => "?").join(",") + ")",
          parentIds,
        )).filter((record) => canSee(c, record))
      : [],
    responseRecords = [
      ...records,
      ...parentRecords.filter(
        (parent) => !records.some((record) => record.id === parent.id),
      ),
    ],
    byId = new Map(responseRecords.map((r) => [r.id, r]));
  return {
    today,
    taskIds: taskIds.map((r) => r.id),
    leadIds: leadIds.map((r) => r.id),
    opportunityIds: opportunityIds.map((r) => r.id),
    openLeadIds: openLeadIds.map((r) => r.id),
    openOpportunityIds: openOpportunityIds.map((r) => r.id),
    records: [
      ...ids.map((id) => byId.get(id)!).filter(Boolean),
      ...parentRecords.filter((parent) => !ids.includes(parent.id)),
    ],
    relatedRecords: await relatedCompanies(c, responseRecords),
  };
}
