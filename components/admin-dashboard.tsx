"use client";

import { useEffect, useState } from "react";
import { CheckCheck, ClipboardCheck, RefreshCw, TrendingUp } from "lucide-react";
import { readJSON } from "../lib/http";
import { indiaToday, type CRMRecord, type Member } from "../lib/model";
import Select from "./select";

type ReportRow = {
  recordId: string;
  module: "enquiries" | "opportunities" | "activities";
  title: string;
  ownerId: string;
  modifiedById: string;
  modifiedBy: string;
  action: string;
  modifiedAt: string;
};

type AdminActivity = {
  date: string;
  modifiedBy: string;
  tasksClosed: number;
  leadsModified: number;
  dealsModified: number;
  report: ReportRow[];
};

export default function AdminDashboard({
  version,
  users,
  open,
}: {
  version: number;
  users: Member[];
  open: (record: CRMRecord) => void;
}) {
  const today = indiaToday();
  const [date, setDate] = useState(today);
  const [modifiedBy, setModifiedBy] = useState("");
  const [appliedDate, setAppliedDate] = useState(today);
  const [appliedUser, setAppliedUser] = useState("");
  const [data, setData] = useState<AdminActivity | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    fetch(
      "/api/crm?mode=admin-dashboard&date=" +
        encodeURIComponent(appliedDate) +
        "&modifiedBy=" +
        encodeURIComponent(appliedUser),
      { signal: abort.signal, cache: "no-store" },
    )
      .then(async (response) => {
        const body = (await readJSON(response)) as AdminActivity & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(body.error || "Unable to load admin activity.");
        if (!abort.signal.aborted) {
          setData(body);
          setError("");
        }
      })
      .catch((reason) => {
        if (!abort.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load admin activity.",
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, [appliedDate, appliedUser, refresh, version]);

  function apply() {
    setBusy(true);
    setError("");
    setAppliedDate(date);
    setAppliedUser(modifiedBy);
    setRefresh((value) => value + 1);
  }

  const formattedDate = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "long",
    timeZone: "Asia/Kolkata",
  }).format(new Date(appliedDate + "T00:00:00+05:30"));
  const metrics = [
    {
      label: "Tasks closed",
      value: data?.tasksClosed || 0,
      note: "Tasks moved to Completed",
      icon: ClipboardCheck,
      tone: "green",
    },
    {
      label: "Leads modified",
      value: data?.leadsModified || 0,
      note: "Unique lead records updated",
      icon: RefreshCw,
      tone: "blue",
    },
    {
      label: "Deals modified",
      value: data?.dealsModified || 0,
      note: "Unique opportunity records updated",
      icon: TrendingUp,
      tone: "violet",
    },
  ];
  const moduleLabel: Record<ReportRow["module"], string> = {
    enquiries: "Lead",
    opportunities: "Opportunity",
    activities: "Task",
  };
  const actionLabel = (row: ReportRow) =>
    row.module === "activities"
      ? "Closed"
      : row.action === "transition"
        ? "Stage changed"
        : row.action === "note"
          ? "Note added"
          : row.action === "followup"
            ? "Follow-up updated"
            : "Modified";
  const time = (value: string) =>
    new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    }).format(new Date(value));

  return (
    <section className="admin-activity" aria-busy={busy}>
      <div className="card admin-activity-filter">
        <div>
          <h2>Daily team activity</h2>
          <p>Review completed work and CRM changes for one India calendar day.</p>
        </div>
        <div className="admin-date-filter">
          <label>
            <span>Date</span>
            <input
              type="date"
              value={date}
              max={today}
              onClick={(event) => event.currentTarget.showPicker?.()}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            <span>Modified by</span>
            <Select
              searchable
              value={modifiedBy}
              onChange={(event) => setModifiedBy(event.target.value)}
            >
              <option value="">All users</option>
              {[...users]
                .filter((user) => user.active)
                .sort((left, right) => left.name.localeCompare(right.name))
                .map((user) => (
                  <option value={user.id} key={user.id}>
                    {user.name}
                  </option>
                ))}
            </Select>
          </label>
          <button
            className="primary"
            disabled={busy || !date}
            onClick={apply}
          >
            {busy ? "Loading…" : "Apply"}
          </button>
        </div>
      </div>
      {error ? (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={apply}>Retry</button>
        </div>
      ) : (
        <>
          <div className="admin-activity-date">
            <CheckCheck size={17} /> Activity for {formattedDate}
          </div>
          <div className="admin-metrics-grid">
            {metrics.map(({ label, value, note, icon: Icon, tone }) => (
              <article className="card admin-metric" key={label}>
                <span className={"admin-metric-icon " + tone}>
                  <Icon size={22} />
                </span>
                <div>
                  <span>{label}</span>
                  <strong>{busy ? "—" : value.toLocaleString("en-IN")}</strong>
                  <small>{note}</small>
                </div>
              </article>
            ))}
          </div>
          <section className="card admin-report-card">
            <div className="card-heading">
              <div>
                <h2>Activity report</h2>
                <p>
                  Leads and opportunities modified, and tasks closed, during
                  the selected day.
                </p>
              </div>
              <span className="badge">
                {data?.report.length.toLocaleString("en-IN") || 0} records
              </span>
            </div>
            {data?.report.length ? (
              <div className="table-scroll">
                <table className="records-table admin-report-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Record</th>
                      <th>Activity</th>
                      <th>Modified by</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.report.map((row) => (
                      <tr key={row.module + ":" + row.recordId}>
                        <td>
                          <span className={"badge admin-report-" + row.module}>
                            {moduleLabel[row.module]}
                          </span>
                        </td>
                        <td>
                          <button
                            className="text-button record-link"
                            onClick={() =>
                              open({
                                id: row.recordId,
                                module: row.module,
                                title: row.title,
                                ownerId: row.ownerId,
                                companyId: null,
                                data: {},
                                createdAt: "",
                                updatedAt: "",
                              })
                            }
                          >
                            {row.title}
                          </button>
                        </td>
                        <td>{actionLabel(row)}</td>
                        <td>{row.modifiedBy}</td>
                        <td>{time(row.modifiedAt)} IST</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="admin-report-empty">
                No matching lead, opportunity, or closed-task activity was
                recorded for this date and user.
              </p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
