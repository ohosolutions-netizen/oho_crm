"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Clock, Inbox, TrendingUp } from "lucide-react";
import { readJSON } from "../lib/http";
import {
  followUpAction,
  followUpDate,
  followUpLabel,
  followUpTime,
  modules,
  type Action,
  type CRMRecord,
} from "../lib/model";
import { stageColor } from "../lib/stage-colors";

export type HomeData = {
  today: string;
  taskIds: string[];
  leadIds: string[];
  opportunityIds: string[];
  records: CRMRecord[];
  relatedRecords: CRMRecord[];
};

type Props = {
  version: number;
  merge: (records: CRMRecord[]) => void;
  open: (record: CRMRecord) => void;
  owner: (id: string) => string;
  company: (id: string | null) => string;
  can: (module: string, action: Action) => boolean;
  complete: (record: CRMRecord) => void;
};

const displayDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value + "T00:00:00+05:30"));

function stage(record: CRMRecord) {
  return record.data.status || record.data.stage || "New";
}

export default function UserHome(props: Props) {
  const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
    }).format(new Date()),
    [from, setFrom] = useState(today),
    [to, setTo] = useState(today),
    [applied, setApplied] = useState({ from: today, to: today }),
    [data, setData] = useState<HomeData | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");

  useEffect(() => {
    const abort = new AbortController();
    setBusy(true);
    setError("");
    const params = new URLSearchParams({ mode: "home", ...applied });
    fetch("/api/crm?" + params, { signal: abort.signal })
      .then(async (response) => {
        const body = (await readJSON(response)) as HomeData & { error?: string };
        if (!response.ok) throw new Error(body.error || "Unable to load your home page.");
        if (!abort.signal.aborted) {
          setData(body);
          props.merge([...body.records, ...body.relatedRecords]);
        }
      })
      .catch((reason) => {
        if (!abort.signal.aborted)
          setError(reason instanceof Error ? reason.message : "Unable to load your home page.");
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, [applied, props.version]);

  const byId = useMemo(
      () => new Map((data?.records || []).map((record) => [record.id, record])),
      [data],
    ),
    tasks = (data?.taskIds || []).map((id) => byId.get(id)!).filter(Boolean),
    leads = (data?.leadIds || []).map((id) => byId.get(id)!).filter(Boolean),
    opportunities = (data?.opportunityIds || []).map((id) => byId.get(id)!).filter(Boolean);

  if (!data && busy)
    return <div className="record-loading" role="status"><span className="spinner" />Loading your work...</div>;
  if (!data)
    return <div className="error-banner" role="alert">{error || "Unable to load your home page."}</div>;

  const recordList = (records: CRMRecord[], empty: string) =>
    records.length ? (
      <div className="home-record-list">
        {records.map((record) => (
          <button key={record.id} className="home-record-row" onClick={() => props.open(record)}>
            <span className="home-record-main"><strong>{record.title}</strong><small>{record.companyId ? props.company(record.companyId) : record.data.companyName || "Company not linked"}</small></span>
            <span className={"badge " + stageColor(stage(record))}>{stage(record)}</span>
            <span className="home-row-arrow">›</span>
          </button>
        ))}
      </div>
    ) : <p className="home-empty">{empty}</p>;

  return (
    <div className="user-home">
      {error && <div className="error-banner" role="alert">{error}</div>}
      <section className="card home-tasks-card">
        <div className="card-heading home-card-heading">
          <div><h2><Clock size={19} /> My follow-up tasks</h2><p>{applied.from === applied.to ? displayDate(applied.from) : `${displayDate(applied.from)} – ${displayDate(applied.to)}`}</p></div>
          <div className="home-date-filter">
            <button className="text-button" type="button" onClick={() => { setFrom(today); setTo(today); setApplied({ from: today, to: today }); }}>Today</button>
            <label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
            <button className="primary" type="button" disabled={busy || !from || !to || from > to} onClick={() => setApplied({ from, to })}>{busy ? "Loading..." : "Apply"}</button>
          </div>
        </div>
        {busy ? <div className="record-loading compact-loading"><span className="spinner" />Refreshing tasks...</div> : tasks.length ? (
          <div className="home-task-list">
            {tasks.map((record) => (
              <div className="home-task-row" key={record.id}>
                <button className="home-task-open" onClick={() => props.open(record)}>
                  <span className="home-task-date"><strong>{displayDate(followUpDate(record))}</strong><small>{followUpTime(record) ? followUpTime(record) + " IST" : "Any time"}</small></span>
                  <span className="home-record-main"><strong>{followUpAction(record)}</strong><small>{record.title} · {modules[record.module].name}</small></span>
                  <span className={"badge " + (followUpLabel(record, today) === "Overdue" ? "red" : followUpLabel(record, today) === "Due today" ? "amber" : "")}>{followUpLabel(record, today)}</span>
                </button>
                {props.can(record.module, "edit") && <button className="secondary home-complete" onClick={() => props.complete(record)}><Check size={15} />Close</button>}
              </div>
            ))}
          </div>
        ) : <p className="home-empty">No follow-up tasks in this date range.</p>}
      </section>

      <div className="home-created-grid">
        <section className="card home-created-card"><div className="card-heading home-card-heading"><div><h2><Inbox size={19} /> New leads today</h2><p>{leads.length} assigned to you</p></div></div>{recordList(leads, "No new leads assigned to you today.")}</section>
        <section className="card home-created-card"><div className="card-heading home-card-heading"><div><h2><TrendingUp size={19} /> New opportunities today</h2><p>{opportunities.length} assigned to you</p></div></div>{recordList(opportunities, "No new opportunities assigned to you today.")}</section>
      </div>
      <p className="home-timezone"><CalendarDays size={14} /> Dates and times use India Standard Time</p>
    </div>
  );
}
