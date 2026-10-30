import {
  recordPage,
  dashboardSQL,
  homeSQL,
  timingSQL,
} from "../../../lib/workspace-query";
import { stageTiming } from "../../../lib/stage-timing";
import {
  emptyLeadCriteria,
  leadViewNames,
  type LeadCriteria,
} from "../../../lib/lead-views";
import {
  context,
  allRecords,
  rows,
  canSee,
  permit,
  database,
  log,
  APIError,
  errorResponse,
  checkOrigin,
} from "../../../lib/server";
import { summarizeRecord } from "../../../lib/record-summary";
import {
  modules,
  normalizeData,
  fullPermissions,
  hasPermission,
  visibleOwner,
  validHierarchy,
  type Role,
  type PermissionMap,
  type Member,
} from "../../../lib/model";
import { convertLead } from "../../../lib/workflow";
import {
  transition,
  updateFollowUp,
  visibleHistory,
  addNote,
} from "../../../lib/stage-service";
import { importZohoLeads } from "../../../lib/zoho-import-service";
import { followUpErrors, validDate } from "../../../lib/stage-rules";
import {
  receiveVoiceCallWebhook,
  startVoiceCall,
} from "../../../lib/sarvam-call";
export const dynamic = "force-dynamic";
export async function GET(req?: Request) {
  try {
    const c = await context();
    const admin = hasPermission(c.permissions, "administration", "view");
    const params = req ? new URL(req.url).searchParams : new URLSearchParams();
    const mode = params.get("mode");
    if (mode === "bootstrap")
      return Response.json(
        {
          me: c.me,
          permissions: c.permissions,
          roles: c.roles,
          owners: c.members
            .filter((u) => visibleOwner(c.me, u, c.roles))
            .map((u) => ({ id: u.id, name: u.name, active: u.active })),
          records: [],
          stageHistory: [],
          profiles: admin
            ? c.profiles.map((p) => ({
                ...p,
                permissions: JSON.parse(p.permissions),
              }))
            : [],
          users: admin ? c.members : [],
          audit: [],
          leadViews: (
            await rows<{ value: string }>(
              "SELECT value FROM settings WHERE key LIKE ?",
              "lead-view:" + c.me.id + ":%",
            )
          ).map((r) => JSON.parse(r.value)),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (mode === "page" || mode === "lookup") {
      if (mode === "lookup") {
        params.set("pageSize", "30");
        params.set("page", "0");
        params.set("filter", "All");
        params.delete("criteria");
      }
      const page = await recordPage(c, params);
      if (
        mode === "lookup" &&
        params.get("selectedId") &&
        !page.records.some((r) => r.id === params.get("selectedId"))
      ) {
        const selected = (
          await allRecords("id=? AND module=?", [
            params.get("selectedId"),
            params.get("module"),
          ])
        ).find((r) => canSee(c, r));
        if (selected) page.records.push(selected);
      }
      return Response.json(page, { headers: { "Cache-Control": "no-store" } });
    }
    if (mode === "dashboard") {
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
      }).format(new Date());
      return Response.json(
        await dashboardSQL(
          c,
          params.get("from") || today.slice(0, 7) + "-01",
          params.get("to") || today,
        ),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (mode === "home") {
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
      }).format(new Date());
      return Response.json(
        await homeSQL(
          c,
          params.get("from") || today,
          params.get("to") || today,
        ),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (mode === "audit") {
      permit(c, "administration", "view");
      return Response.json(
        {
          audit: await rows(
            "SELECT * FROM audit ORDER BY created_at DESC LIMIT 150",
          ),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (mode === "history") {
      const historyId = params.get("recordHistoryId") || "";
      const record = (await allRecords("id=?", [historyId])).find((item) =>
        canSee(c, item),
      );
      if (!record) throw new APIError("Record unavailable.", 404);
      const historyRecords = [record];
      if (record.module === "opportunities" && record.data.enquiryId) {
        const lead = (await allRecords("id=?", [record.data.enquiryId])).find(
          (item) => canSee(c, item),
        );
        if (lead) historyRecords.push(lead);
      }
      return Response.json(
        {
          recordIds: historyRecords.map((item) => item.id),
          stageHistory: [
            ...(await visibleHistory(c, historyRecords)),
            ...(
              await Promise.all(
                historyRecords.map((item) => importedNoteHistory(item.id)),
              )
            ).flat(),
          ],
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (params.get("stageTiming"))
      return Response.json(
        await timingSQL(c, params.get("from") || "", params.get("to") || ""),
        { headers: { "Cache-Control": "no-store" } },
      );
    if (params.get("id")) {
      const found = await rows<
        Omit<import("../../../lib/model").CRMRecord, "data"> & { data: string }
      >(
        "SELECT id,module,title,owner_id AS ownerId,company_id AS companyId,data,created_at AS createdAt,updated_at AS updatedAt FROM records WHERE id=?",
        params.get("id"),
      );
      const record = found[0]
        ? {
            ...found[0],
            data: normalizeData(found[0].module, JSON.parse(found[0].data)),
          }
        : null;
      if (!record || !canSee(c, record))
        throw new APIError("Record unavailable.", 404);
      const refIds = [
        record.companyId,
        record.data.enquiryId,
        record.data.contactId,
        record.data.opportunityId,
        record.data.proposalId,
        record.data.acceptedProposalId,
        record.data.convertedOpportunityId,
      ].filter(Boolean);
      const related = (
        await allRecords(
          "id!=? AND (company_id=? OR json_extract(data,'$.enquiryId')=? OR json_extract(data,'$.opportunityId')=? OR json_extract(data,'$.proposalId')=?" +
            (refIds.length ? " OR id IN (" + refIds.map(() => "?") + ")" : "") +
            ")",
          [record.id, record.id, record.id, record.id, record.id, ...refIds],
        )
      ).filter((r) => canSee(c, r));
      const historyRecords = [
        record,
        ...related.filter(
          (r) => r.module === "enquiries" && r.id === record.data.enquiryId,
        ),
      ];
      return Response.json(
        {
          record,
          relatedRecords: related,
          relatedTasks: related.filter((r) => r.module === "activities"),
          stageHistory: [
            ...(await visibleHistory(c, historyRecords)),
            ...(
              await Promise.all(
                historyRecords.map((r) => importedNoteHistory(r.id)),
              )
            ).flat(),
          ],
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const limit = Math.min(
        5000,
        Math.max(1, Number(params.get("limit")) || 5000),
      ),
      offset = Math.max(0, Number(params.get("offset")) || 0);
    if (!Number.isInteger(limit) || !Number.isInteger(offset))
      throw new APIError("Invalid record page.");
    const ownerIds = c.members
        .filter((u) => visibleOwner(c.me, u, c.roles))
        .map((u) => u.id),
      moduleIds = Object.keys(modules).filter((m) =>
        hasPermission(c.permissions, m, "view"),
      );
    const where =
        ownerIds.length && moduleIds.length
          ? "owner_id IN (" +
            ownerIds.map(() => "?").join(",") +
            ") AND module IN (" +
            moduleIds.map(() => "?").join(",") +
            ")"
          : "0=1",
      args = [...ownerIds, ...moduleIds];
    const totalRecords = (
      await rows<{ count: number }>(
        "SELECT COUNT(*) AS count FROM records WHERE " + where,
        ...args,
      )
    )[0].count;
    const records = await allRecords(
      where,
      args,
      "LIMIT " + limit + " OFFSET " + offset,
    );
    const displayedRecords =
      params.get("full") !== "1" ? records.map(summarizeRecord) : records;
    const nextOffset =
      offset + records.length < totalRecords ? offset + records.length : null;
    const owners = c.members
      .filter((u) => visibleOwner(c.me, u, c.roles))
      .map((u) => ({ id: u.id, name: u.name, active: u.active }));
    return Response.json(
      {
        me: c.me,
        permissions: c.permissions,
        roles: c.roles,
        owners,
        records: displayedRecords,
        totalRecords,
        nextOffset,
        stageHistory: await visibleHistory(c, records),
        profiles: admin
          ? c.profiles.map((p) => ({
              ...p,
              permissions: JSON.parse(p.permissions),
            }))
          : [],
        users: admin ? c.members : [],
        leadViews: (
          await rows<{ value: string }>(
            "SELECT value FROM settings WHERE key LIKE ?",
            "lead-view:" + c.me.id + ":%",
          )
        ).map((r) => JSON.parse(r.value)),
        audit: admin
          ? await database()
              .prepare("SELECT * FROM audit ORDER BY created_at DESC LIMIT 150")
              .all()
              .then((x) => x.results)
          : [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
function string(value: unknown, label: string, required = false) {
  if (value == null && !required) return "";
  if (
    typeof value !== "string" ||
    value.length > 10000 ||
    (required && !value.trim())
  )
    throw new APIError(`Please enter a valid ${label}.`);
  return value.trim();
}
function permissions(value: unknown): PermissionMap {
  if (!value || typeof value !== "object")
    throw new APIError("Select module permissions.");
  return Object.fromEntries(
    Object.keys(fullPermissions()).map((k) => [
      k,
      Object.fromEntries(
        ["view", "create", "edit", "delete"].map((a) => [
          a,
          (value as Record<string, Record<string, boolean>>)[k]?.[a] === true,
        ]),
      ),
    ]),
  ) as PermissionMap;
}
function comparablePhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}
function comparableWebsite(value: unknown) {
  try {
    const url = new URL(String(value || ""));
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}
function terminalDuplicateLead(status: string) {
  return ["Converted", "Lead Lost", "Junk Lead", "Disqualified"].includes(
    status,
  );
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const c = await context();
    const b = (await req.json()) as Record<string, unknown>;
    const kind = string(b.kind, "operation", true);
    const operation = string(b.operation, "action", true);
    if (!["create", "edit", "delete"].includes(operation))
      throw new APIError("Unknown action.");
    if (kind === "lead-view") {
      permit(c, "enquiries", "view");
      if (operation !== "create" && operation !== "delete")
        throw new APIError("Unknown view action.");
      const viewId =
        operation === "create"
          ? crypto.randomUUID()
          : string(b.id, "view ID", true);
      const key = "lead-view:" + c.me.id + ":" + viewId;
      if (operation === "delete") {
        await database().batch([
          database().prepare("DELETE FROM settings WHERE key=?").bind(key),
        ]);
        return Response.json({ ok: true, id: viewId });
      }
      const name = string(b.name, "view name", true);
      if (name.length > 80)
        throw new APIError("View name must be 80 characters or fewer.");
      const criteria = Object.fromEntries(
        Object.keys(emptyLeadCriteria()).map((k) => [
          k,
          string((b.criteria as Record<string, unknown>)?.[k], k),
        ]),
      ) as LeadCriteria;
      if (!leadViewNames.includes(criteria.view))
        throw new APIError("Select a valid lead view.");
      for (const k of ["fromDate", "toDate"] as const)
        if (criteria[k] && !validDate(criteria[k]))
          throw new APIError("Select a valid date.");
      for (const k of ["fromTime", "toTime"] as const)
        if (criteria[k] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(criteria[k]))
          throw new APIError("Select a valid time.");
      if (
        criteria.fromDate &&
        criteria.toDate &&
        Date.parse(
          criteria.fromDate +
            "T" +
            (criteria.fromTime || "00:00") +
            ":00+05:30",
        ) >
          Date.parse(
            criteria.toDate + "T" + (criteria.toTime || "23:59") + ":59+05:30",
          )
      )
        throw new APIError("Created until must be after Created from.");
      const existingViews = await rows<{ value: string }>(
        "SELECT value FROM settings WHERE key LIKE ?",
        "lead-view:" + c.me.id + ":%",
      );
      if (
        existingViews.some(
          (r) => JSON.parse(r.value).name.toLowerCase() === name.toLowerCase(),
        )
      )
        throw new APIError("A saved view already has this name.");
      const view = {
        id: viewId,
        name,
        criteria,
        search: string(b.search, "search"),
      };
      await database().batch([
        database()
          .prepare("INSERT INTO settings (key,value) VALUES (?,?)")
          .bind(key, JSON.stringify(view)),
      ]);
      return Response.json({ ok: true, view });
    }
    if (kind === "zoho-import") {
      if (operation !== "create") throw new APIError("Unknown import action.");
      return await importZohoLeads(c, b);
    }
    if (kind === "convert") {
      if (operation !== "create")
        throw new APIError("Unknown conversion action.");
      return await convertLead(c, b);
    }
    if (kind === "transition") {
      if (operation !== "edit") throw new APIError("Unknown stage action.");
      return await transition(c, b);
    }
    if (kind === "note") {
      if (operation !== "edit") throw new APIError("Unknown note action.");
      return await addNote(c, b);
    }
    if (kind === "followup") {
      if (operation !== "edit") throw new APIError("Unknown follow-up action.");
      return await updateFollowUp(c, b);
    }
    if (kind === "voice-call") {
      if (operation !== "create") throw new APIError("Unknown call action.");
      return Response.json(await startVoiceCall(c, b, req.url), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const id =
      operation === "create"
        ? crypto.randomUUID()
        : string(b.id, "record ID", true);
    const queries: D1PreparedStatement[] = [];
    const changedIds = [id];
    let recordBefore: unknown = null;
    let recordAfter: unknown = null;
    if (kind === "record") {
      let module = string(b.module, "module", true);
      if (!modules[module]) throw new APIError("Unknown module.");
      permit(c, module, operation as "create" | "edit" | "delete");
      const linkedIds = [
        id,
        ...Object.values((b.data || {}) as Record<string, unknown>).filter(
          (v) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v as string),
        ),
      ];
      const detectingDuplicate =
        operation === "create" && module === "enquiries";
      const existing = await allRecords(
        detectingDuplicate
          ? "1=1"
          : "module<>'enquiries' OR id IN (" +
              linkedIds.map(() => "?").join(",") +
              ") OR company_id=? OR EXISTS (SELECT 1 FROM json_each(records.data) WHERE value=?)",
        detectingDuplicate ? [] : [...linkedIds, id, id],
      );
      const old = existing.find((r) => r.id === id);
      recordBefore = old
        ? {
            ...old,
            ownerName:
              c.members.find((member) => member.id === old.ownerId)?.name ||
              "Team member",
            companyName:
              existing.find((record) => record.id === old.companyId)?.title ||
              old.data.companyName ||
              "",
          }
        : null;
      if (
        operation !== "create" &&
        (!old || old.module !== module || !canSee(c, old))
      )
        throw new APIError("Record unavailable.", 404);
      if (module === "enquiries" && old?.data.status === "Converted")
        throw new APIError(
          "Converted leads are retained as history. Edit the linked opportunity.",
        );
      if (operation === "delete") {
        if (module === "proposals" && old?.data.status === "Accepted")
          throw new APIError(
            "Accepted proposals are retained. Create a new version instead.",
          );
        if (
          existing.some(
            (r) =>
              r.companyId === id || Object.values(r.data).some((v) => v === id),
          )
        )
          throw new APIError(
            "This record has linked records. Remove or relink them before deleting.",
          );
        queries.push(
          database().prepare("DELETE FROM records WHERE id=?").bind(id),
        );
      } else {
        let title = string(b.title, "record name", true);
        if (title.length > 180)
          throw new APIError("Name must be 180 characters or fewer.");
        const ownerId =
          string(b.ownerId, "owner") ||
          (operation === "create" ? c.me.id : old!.ownerId);
        const owner = c.members.find((u) => u.id === ownerId);
        if (!owner?.active || !visibleOwner(c.me, owner, c.roles))
          throw new APIError("Assign an active user within your hierarchy.");
        let companyId =
          module === "companies"
            ? null
            : string(b.companyId, "company") || null;
        if (companyId) {
          const co = existing.find(
            (r) => r.id === companyId && r.module === "companies",
          );
          if (!co || !canSee(c, co))
            throw new APIError("Select an accessible company.");
        }
        if (
          [
            "contacts",
            "opportunities",
            "proposals",
            "invoices",
            "projects",
          ].includes(module) &&
          !companyId
        )
          throw new APIError("Select a company.");
        const input = (b.data || {}) as Record<string, unknown>;
        let data: Record<string, string> = { ...old?.data };
        for (const f of modules[module].fields) {
          const v = string(input[f.key], f.label, !!f.required);
          data[f.key] = v;
          if (f.options && v && !f.options.includes(v))
            throw new APIError(`Invalid ${f.label}.`);
          if (
            f.type === "number" &&
            v &&
            (Number(v) < 0 || !Number.isFinite(Number(v)))
          )
            throw new APIError(`${f.label} must be a non-negative number.`);
          if (
            f.key === "version" &&
            v &&
            (!Number.isInteger(Number(v)) || Number(v) < 1)
          )
            throw new APIError("Proposal version must be a positive integer.");
          if (
            f.type === "date" &&
            v &&
            (!/^\d{4}-\d{2}-\d{2}$/.test(v) ||
              !Number.isFinite(Date.parse(v)) ||
              new Date(v).toISOString().slice(0, 10) !== v)
          )
            throw new APIError(`Invalid ${f.label}.`);
          if (f.type === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
            throw new APIError("Enter a valid email address.");
          if (f.type === "time" && v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v))
            throw new APIError(`Enter a valid ${f.label}.`);
          if (f.type === "url" && v) {
            try {
              if (!["https:", "http:"].includes(new URL(v).protocol))
                throw new Error();
            } catch {
              throw new APIError(
                `${f.label} must start with https:// or http://.`,
              );
            }
          }
          const linkModule: Record<string, string> = {
            contact: "contacts",
            enquiry: "enquiries",
            opportunity: "opportunities",
            proposal: "proposals",
          };
          if (linkModule[f.type || ""] && v) {
            const linked = existing.find(
              (r) => r.id === v && r.module === linkModule[f.type!],
            );
            if (
              !linked ||
              !canSee(c, linked) ||
              (linked.companyId !== companyId &&
                !(
                  module === "opportunities" &&
                  f.type === "enquiry" &&
                  old?.data.enquiryId === v &&
                  old.companyId === companyId
                ))
            )
              throw new APIError(
                `Select a ${f.label.toLowerCase()} for this company that you can access.`,
              );
            if (
              module === "invoices" &&
              f.key === "proposalId" &&
              linked.data.status !== "Accepted"
            )
              throw new APIError("Invoices must link to an accepted proposal.");
            if (
              module === "projects" &&
              f.key === "opportunityId" &&
              linked.data.stage !== "Accepted"
            )
              throw new APIError(
                "Implementation must link to an accepted opportunity.",
              );
          }
        }
        if (["enquiries", "opportunities"].includes(module)) {
          const stageKey = module === "enquiries" ? "status" : "stage";
          const initial =
            module === "enquiries" ? "New Lead" : "Solution planning";
          if (operation === "create" && data[stageKey] !== initial)
            throw new APIError(
              `New records start at ${initial}. Use Change stage to capture the information for later stages.`,
            );
          if (old && data[stageKey] !== old.data[stageKey])
            throw new APIError(
              "Use Change stage to capture the required transition details.",
            );
        }
        if (
          data.nextFollowUp &&
          (!old ||
            data.nextFollowUp !== old.data.nextFollowUp ||
            data.followUpAction !== old.data.followUpAction)
        ) {
          const errors = followUpErrors(data);
          if (errors.length) throw new APIError(errors.join(" "));
          data.followUpStatus = "Pending";
          data.followUpNeeded = "Yes";
          data.followUpCompletionNote = "";
          data.followUpCompletedAt = "";
        }
        if (!data.nextFollowUp && old?.data.nextFollowUp) {
          data.followUpStatus = "Cancelled";
          data.followUpNeeded = "No";
        }
        if (module === "enquiries") {
          if (data.status === "Converted")
            throw new APIError(
              "Use Convert to opportunity to convert this lead.",
            );
          if (data.status === "Discovery scheduled" && !data.discoveryDate)
            throw new APIError(
              "Set the discovery meeting date before scheduling discovery.",
            );
          if (
            data.discoveryTime &&
            !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.discoveryTime)
          )
            throw new APIError("Enter a valid discovery time.");
        }
        if (module === "activities" && old && data.status !== old.data.status) {
          data.followUpStatus =
            data.status === "Scheduled" ? "Pending" : data.status;
          data.followUpCompletedAt =
            data.status === "Scheduled" ? "" : new Date().toISOString();
          data.followUpCompletionNote =
            data.status === "Scheduled" ? "" : data.notes || "";
        }
        if (
          module === "activities" &&
          operation === "create" &&
          data.type === "Follow-up" &&
          data.enquiryId
        ) {
          const lead = existing.find(
            (record) =>
              record.id === data.enquiryId && record.module === "enquiries",
          );
          if (!lead || !canSee(c, lead))
            throw new APIError("Select an accessible lead for this follow-up.");
          if (lead.data.status === "New Lead")
            throw new APIError(
              "Move the lead out of New Lead before adding a follow-up.",
            );
          data.stageContext = lead.data.status;
          if (lead.data.status === "Not Contacted") {
            const attempts =
              existing.filter(
                (record) =>
                  record.module === "activities" &&
                  record.data.type === "Follow-up" &&
                  record.data.enquiryId === lead.id &&
                  record.data.stageContext === "Not Contacted",
              ).length + 1;
            const leadData = {
              ...lead.data,
              notContactedAttemptCount: String(attempts),
              ...(attempts >= 3 ? { attemptTag: "#3AttemptsCompleted" } : {}),
            };
            queries.push(
              database()
                .prepare("UPDATE records SET data=?,updated_at=? WHERE id=?")
                .bind(
                  JSON.stringify(leadData),
                  new Date().toISOString(),
                  lead.id,
                ),
            );
            changedIds.push(lead.id);
          }
        }
        if (module === "integrationErrors" && old) {
          if (data.status === "Resolved" && old.data.status !== "Resolved")
            data.resolvedAt = new Date().toISOString();
          if (data.status === "Open") data.resolvedAt = "";
        }
        if (
          module === "opportunities" &&
          (old?.data.acceptedProposalId || "") !==
            (data.acceptedProposalId || "")
        )
          throw new APIError(
            "Select the accepted proposal revision when closing the opportunity.",
          );
        if (
          module === "companies" &&
          existing.some(
            (r) =>
              r.module === module &&
              r.id !== id &&
              r.title.toLowerCase() === title.toLowerCase(),
          )
        )
          throw new APIError("A company with this name already exists.");
        if (
          module === "companies" &&
          existing.some(
            (r) =>
              r.module === module &&
              r.id !== id &&
              comparableWebsite(r.data.website) &&
              comparableWebsite(r.data.website) ===
                comparableWebsite(data.website),
          )
        )
          throw new APIError(
            "This website is already assigned to another company.",
          );
        if (
          module === "contacts" &&
          existing.some(
            (r) =>
              r.module === module &&
              r.id !== id &&
              comparablePhone(r.data.phone) &&
              comparablePhone(r.data.phone) === comparablePhone(data.phone),
          )
        )
          throw new APIError(
            "This phone number is already assigned to another contact.",
          );
        if (module === "proposals") {
          if (data.status === "Accepted" && old?.data.status !== "Accepted")
            throw new APIError(
              "Select the accepted revision when closing the opportunity.",
            );
          if (
            old?.data.documentId &&
            (old.data.documentUrl !== data.documentUrl ||
              old.data.version !== data.version ||
              old.data.amount !== data.amount ||
              (old.data.currency || "INR") !== (data.currency || "INR"))
          )
            throw new APIError(
              "Sent proposal documents and commercial versions are retained. Send a new revision instead.",
            );
          if (
            existing.some(
              (r) =>
                r.module === module &&
                r.id !== id &&
                r.data.opportunityId === data.opportunityId &&
                r.data.version === data.version,
            )
          )
            throw new APIError(
              "This proposal version already exists for the opportunity.",
            );
          if (
            old &&
            old.data.status === "Accepted" &&
            (old.title !== title ||
              JSON.stringify(old.data) !== JSON.stringify(data) ||
              old.companyId !== companyId)
          )
            throw new APIError(
              "Accepted proposals are retained as a record. Create a new version to make changes.",
            );
          if (
            data.status === "Accepted" &&
            (!data.acceptedDate || !data.acceptedBy)
          )
            throw new APIError(
              "Record the acceptance date and person before accepting a proposal.",
            );
        }
        if (module === "invoices") {
          if (
            existing.some(
              (r) =>
                r.module === module &&
                r.id !== id &&
                r.data.invoiceNumber.toLowerCase() ===
                  data.invoiceNumber.toLowerCase(),
            )
          )
            throw new APIError("This invoice number already exists.");
          const paid = Number(data.paidAmount || 0),
            total = Number(data.amount);
          if (paid > total)
            throw new APIError("Amount received cannot exceed invoice amount.");
          if (
            (data.status === "Paid" && paid !== total) ||
            (data.status === "Unpaid" && paid !== 0) ||
            (data.status === "Part paid" && !(paid > 0 && paid < total))
          )
            throw new APIError(
              "Payment status must match the amount received.",
            );
        }
        const now = new Date().toISOString();
        const duplicateLead =
          operation === "create" && module === "enquiries"
            ? existing
                .filter(
                  (record) =>
                    record.module === "enquiries" &&
                    comparablePhone(record.data.phone) &&
                    comparablePhone(record.data.phone) ===
                      comparablePhone(data.phone),
                )
                .sort((a, z) => z.updatedAt.localeCompare(a.updatedAt))[0]
            : undefined;
        let relatedEnquiryId = "";
        let relatedLeadId = "";
        if (duplicateLead) {
          relatedLeadId = terminalDuplicateLead(duplicateLead.data.status)
            ? id
            : duplicateLead.id;
          if (!terminalDuplicateLead(duplicateLead.data.status)) {
            module = "leadEnquiries";
            companyId = duplicateLead.companyId;
            data = {
              enquiryId: duplicateLead.id,
              phone: data.phone,
              email: data.email || "",
              source: data.source || "Other",
              enquiryAt: data.receivedDate || now.slice(0, 10),
              status: "Booked",
              notes:
                data.requirements || data.notes || "Repeated enquiry received",
              zohoCRMId: data.zohoCRMId || "",
            };
            title = `${title} enquiry`;
            if (!changedIds.includes(duplicateLead.id))
              changedIds.push(duplicateLead.id);
          } else {
            relatedEnquiryId = crypto.randomUUID();
            changedIds.push(relatedEnquiryId);
          }
        }
        recordAfter = {
          snapshotVersion: 2,
          id,
          module,
          title,
          ownerId,
          ownerName: owner.name,
          companyId,
          companyName:
            existing.find((record) => record.id === companyId)?.title ||
            data.companyName ||
            "",
          data,
          createdAt: old?.createdAt || now,
          updatedAt: now,
        };
        if (operation === "create")
          queries.push(
            database()
              .prepare(
                "INSERT INTO records (id,module,title,owner_id,company_id,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
              )
              .bind(
                id,
                module,
                title,
                ownerId,
                companyId,
                JSON.stringify(data),
                now,
                now,
              ),
          );
        else
          queries.push(
            database()
              .prepare(
                "UPDATE records SET title=?,owner_id=?,company_id=?,data=?,updated_at=? WHERE id=?",
              )
              .bind(title, ownerId, companyId, JSON.stringify(data), now, id),
          );
        if (relatedEnquiryId) {
          const enquiryData = {
            enquiryId: relatedLeadId,
            phone: data.phone,
            email: data.email || "",
            source: data.source || "Other",
            enquiryAt: data.receivedDate || now.slice(0, 10),
            status: "Booked",
            notes:
              data.requirements || data.notes || "Repeated enquiry received",
            zohoCRMId: data.zohoCRMId || "",
          };
          queries.push(
            database()
              .prepare(
                "INSERT INTO records (id,module,title,owner_id,company_id,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
              )
              .bind(
                relatedEnquiryId,
                "leadEnquiries",
                `${title} enquiry`,
                ownerId,
                companyId,
                JSON.stringify(enquiryData),
                now,
                now,
              ),
          );
        }
        if (duplicateLead) {
          queries.push(
            database()
              .prepare(
                "INSERT INTO audit (id,actor_id,action,target,details,created_at) VALUES (?,?,?,?,?,?)",
              )
              .bind(
                crypto.randomUUID(),
                c.me.id,
                "enquiry",
                "record:" + relatedLeadId,
                JSON.stringify({
                  title,
                  duplicatePhone: data.phone,
                  enquiryId: relatedEnquiryId || id,
                  newLeadCreated: terminalDuplicateLead(
                    duplicateLead.data.status,
                  ),
                }),
                now,
              ),
          );
        }
        if (
          module === "activities" &&
          (operation === "create" || (old && old.data.status !== data.status))
        ) {
          const parentId = data.enquiryId || data.opportunityId;
          if (parentId) {
            if (!changedIds.includes(parentId)) changedIds.push(parentId);
            queries.push(
              database()
                .prepare(
                  "INSERT INTO audit (id,actor_id,action,target,details,created_at) VALUES (?,?,?,?,?,?)",
                )
                .bind(
                  crypto.randomUUID(),
                  c.me.id,
                  "activity",
                  "record:" + parentId,
                  JSON.stringify({ title, data }),
                  now,
                ),
            );
          }
        }
      }
    } else {
      permit(c, "administration", operation as "create" | "edit" | "delete");
      if (kind === "role") {
        const old = c.roles.find((r) => r.id === id);
        if (operation !== "create" && !old)
          throw new APIError("Role unavailable.", 404);
        if (operation === "delete") {
          if (
            c.members.some((u) => u.roleId === id) ||
            c.roles.some((r) => r.parentId === id)
          )
            throw new APIError(
              "Reassign users and child roles before deleting this role.",
            );
          queries.push(
            database().prepare("DELETE FROM roles WHERE id=?").bind(id),
          );
        } else {
          const role: Role = {
            id,
            name: string(b.name, "role name", true),
            parentId: string(b.parentId, "parent role") || null,
          };
          if (!validHierarchy([...c.roles.filter((r) => r.id !== id), role]))
            throw new APIError(
              "Choose a valid parent. A role cannot report to itself or its descendants.",
            );
          if (
            c.roles.some(
              (r) =>
                r.id !== id && r.name.toLowerCase() === role.name.toLowerCase(),
            )
          )
            throw new APIError("Role name already exists.");
          queries.push(
            database()
              .prepare(
                "INSERT INTO roles (id,name,parent_id) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,parent_id=excluded.parent_id",
              )
              .bind(id, role.name, role.parentId),
          );
        }
      } else if (kind === "profile") {
        if (operation !== "create" && !c.profiles.some((p) => p.id === id))
          throw new APIError("Profile unavailable.", 404);
        if (operation === "delete") {
          if (c.members.some((u) => u.profileId === id))
            throw new APIError("Reassign users before deleting this profile.");
          queries.push(
            database().prepare("DELETE FROM profiles WHERE id=?").bind(id),
          );
        } else {
          const p = permissions(b.permissions);
          const name = string(b.name, "profile name", true);
          const remainingAdmins = c.members.filter(
            (u) =>
              u.active &&
              u.profileId !== id &&
              ["view", "create", "edit", "delete"].every((a) =>
                hasPermission(
                  JSON.parse(
                    c.profiles.find((p) => p.id === u.profileId)?.permissions ||
                      "{}",
                  ),
                  "administration",
                  a as "view",
                ),
              ),
          );
          if (
            !remainingAdmins.length &&
            c.members.some((u) => u.active && u.profileId === id) &&
            !["view", "create", "edit", "delete"].every((a) =>
              hasPermission(p, "administration", a as "view"),
            )
          )
            throw new APIError(
              "Keep at least one active user with full administration permissions.",
            );
          queries.push(
            database()
              .prepare(
                "INSERT INTO profiles (id,name,permissions) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,permissions=excluded.permissions",
              )
              .bind(id, name, JSON.stringify(p)),
          );
        }
      } else if (kind === "user") {
        const old = c.members.find((u) => u.id === id);
        if (operation !== "create" && !old)
          throw new APIError("User unavailable.", 404);
        if (operation === "delete")
          throw new APIError(
            "Deactivate users to retain record ownership and audit history.",
          );
        const name = string(b.name, "user name", true),
          email = string(b.email, "email", true).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          throw new APIError("Enter a valid user email.");
        if (c.members.some((u) => u.id !== id && u.email === email))
          throw new APIError("This email already has a user.");
        const roleId = string(b.roleId, "role", true),
          profileId = string(b.profileId, "profile", true),
          active = b.active === false ? 0 : 1;
        if (
          !c.roles.some((r) => r.id === roleId) ||
          !c.profiles.some((p) => p.id === profileId)
        )
          throw new APIError("Assign a valid role and profile.");
        const future: Member[] = [
          ...c.members.filter((u) => u.id !== id),
          {
            id,
            name,
            email,
            authId: old?.authId || null,
            roleId,
            profileId,
            active,
          },
        ];
        if (
          !future.some(
            (u) =>
              u.active &&
              ["view", "create", "edit", "delete"].every((a) =>
                hasPermission(
                  JSON.parse(
                    c.profiles.find((p) => p.id === u.profileId)?.permissions ||
                      "{}",
                  ),
                  "administration",
                  a as "view",
                ),
              ),
          )
        )
          throw new APIError(
            "Keep at least one active user with full administration permissions.",
          );
        queries.push(
          database()
            .prepare(
              "INSERT INTO users (id,email,name,role_id,profile_id,active) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,role_id=excluded.role_id,profile_id=excluded.profile_id,active=excluded.active",
            )
            .bind(id, email, name, roleId, profileId, active),
        );
      } else throw new APIError("Unknown operation.");
    }
    queries.push(
      await log(c.me.id, operation, `${kind}:${id}`, {
        module: b.module || "administration",
        before:
          kind === "record"
            ? recordBefore
            : kind === "role"
              ? c.roles.find((r) => r.id === id) || null
              : kind === "profile"
                ? c.profiles.find((p) => p.id === id) || null
                : c.members.find((u) => u.id === id) || null,
        after: kind === "record" ? recordAfter : b,
      }),
    );
    await database().batch(queries);
    if (kind === "record")
      return Response.json(
        { id, ok: true, changes: await changedRecords(changedIds) },
        { headers: { "Cache-Control": "no-store" } },
      );
    return Response.json(
      { id, ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}

export async function SARVAM_WEBHOOK(req: Request) {
  try {
    return await receiveVoiceCallWebhook(req);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function changedRecords(ids: string[]) {
  const c = await context();
  const records = ids.length
    ? (
        await allRecords("id IN (" + ids.map(() => "?").join(",") + ")", ids)
      ).filter((r) => canSee(c, r))
    : [];
  return { ids, records, stageHistory: await visibleHistory(c, records) };
}

async function importedNoteHistory(recordId: string) {
  const notes = await rows<{ key: string; value: string }>(
    "SELECT key,value FROM settings WHERE key LIKE ?",
    "zoho-note:" + recordId + ":%",
  );
  return notes.map((row) => {
    const n = JSON.parse(row.value);
    return {
      id: row.key,
      recordId,
      actor: n.createdBy,
      fromStage: "",
      toStage: "Migrated note",
      data: {
        stageNote: n.content,
        noteTitle: n.title || "",
        createdBy: n.createdBy,
        source: "Zoho CRM",
      },
      createdAt: n.createdAt,
    };
  });
}
