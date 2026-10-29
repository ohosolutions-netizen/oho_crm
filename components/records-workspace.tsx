import {
  emptyLeadCriteria,
  leadViewNames,
  type LeadCriteria,
  type LeadView,
} from "../lib/lead-views";
import DateTimePicker from "./date-time-picker";
import { formatMoney, moneyTotals } from "../lib/money";
import { useEffect, useState } from "react";
("use client");
import {
  Building2,
  Users,
  Inbox,
  TrendingUp,
  CalendarDays,
  FileText,
  Receipt,
  Layers,
  Search,
  X,
  Plus,
  Columns3,
  List,
  Download,
  ChevronRight,
  ArrowRight,
  FileClock,
  AlertCircle,
} from "lucide-react";
import FollowUpCell from "./follow-up-cell";
import Select from "./select";
import { stageColor } from "../lib/stage-colors";
import {
  modules,
  stages,
  leadStages,
  followUpDate,
  type CRMRecord,
  type Action,
} from "../lib/model";
const icons: Record<string, typeof Building2> = {
  companies: Building2,
  contacts: Users,
  enquiries: Inbox,
  leadEnquiries: FileClock,
  integrationErrors: AlertCircle,
  opportunities: TrendingUp,
  activities: CalendarDays,
  proposals: FileText,
  invoices: Receipt,
  projects: Layers,
};
const money = formatMoney;
const date = (v: string) =>
  v
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Kolkata",
      }).format(new Date(v.length === 10 ? v + "T00:00:00+05:30" : v))
    : "—";
const initials = (v: string) =>
  v
    .split(/[ @]+/)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase())
    .join("");
type Props = {
  pagination?: {
    page: number;
    total: number;
    pageSize: number;
    busy: boolean;
    changePage: (page: number) => void;
    stageCounts: { stage: string; count: number }[];
  };
  module: string;
  records: CRMRecord[];
  board: boolean;
  setBoard: (v: boolean) => void;
  query: string;
  setQuery: (v: string) => void;
  filter: string;
  setFilter: (v: string) => void;
  company: (id: string | null) => string;
  owner: (id: string) => string;
  can: (m: string, a: Action) => boolean;
  add: (m: string, defaults?: Record<string, string>) => void;
  select: (r: CRMRecord) => void;
  exportCSV: () => void;
  today: string;
  planFollowUp: (r: CRMRecord) => void;
  leadCriteria: LeadCriteria;
  setLeadCriteria: (v: LeadCriteria) => void;
  leadViews: LeadView[];
  owners: { id: string; name: string; active: number }[];
  saveLeadView: (name: string) => Promise<LeadView>;
  removeLeadView: (id: string) => Promise<void>;
};
export default function RecordsWorkspace(p: Props) {
  const [filtersOpen, setFiltersOpen] = useState(false),
    [selectedView, setSelectedView] = useState(""),
    [viewName, setViewName] = useState(""),
    [savingView, setSavingView] = useState(false),
    [viewError, setViewError] = useState("");
  const setCriteria = (key: keyof LeadCriteria, value: string) => {
    setSelectedView("");
    p.setLeadCriteria({ ...p.leadCriteria, [key]: value });
  };
  async function saveView() {
    if (!viewName.trim()) return;
    setSavingView(true);
    setViewError("");
    try {
      const v = await p.saveLeadView(viewName.trim());
      setSelectedView("custom:" + v.id);
      setViewName("");
    } catch (e) {
      setViewError(e instanceof Error ? e.message : "Unable to save view.");
    } finally {
      setSavingView(false);
    }
  }
  useEffect(() => {
    setSelectedView("");
    setFiltersOpen(false);
  }, [p.module]);
  const [page, setPage] = useState(0);
  useEffect(
    () => setPage(0),
    [p.module, p.query, p.filter, p.records.length, p.leadCriteria],
  );
  const total = p.pagination?.total ?? p.records.length,
    pageCount = Math.max(1, Math.ceil(total / (p.pagination?.pageSize || 50))),
    currentPage = p.pagination?.page ?? Math.min(page, pageCount - 1),
    pageRecords = p.pagination
      ? p.records
      : p.records.slice(currentPage * 50, currentPage * 50 + 50);
  const changePage = (next: number) =>
    p.pagination ? p.pagination.changePage(next) : setPage(next);
  const key = p.module,
    m = modules[key],
    isLead = key === "enquiries",
    isIntegrationError = key === "integrationErrors",
    pipeline = isLead || key === "opportunities",
    columns = isLead
      ? p.leadCriteria.view === "Archived / Converted"
        ? ["Converted"]
        : p.leadCriteria.view === "Lost / Disqualified"
          ? ["Lead Lost", "Disqualified", "Junk Lead"]
          : p.leadCriteria.view === "All Leads"
            ? [...leadStages, "Disqualified"]
            : leadStages.filter(
                (s) => !["Converted", "Junk Lead", "Lead Lost"].includes(s),
              )
      : stages;
  const status = (r: CRMRecord) => (isLead ? r.data.status : r.data.stage);
  const company = (r: CRMRecord) =>
    r.companyId
      ? p.company(r.companyId)
      : r.data.companyName || "Company not linked";
  const count = (s: string) => p.records.filter((r) => status(r) === s);
  const stageCount = (s: string) =>
    p.pagination?.stageCounts.find((r) => r.stage === s)?.count ??
    count(s).length;
  const Icon = icons[key];
  const widths =
    key === "companies"
      ? [32, 22, 27, 16, 3]
      : key === "contacts"
        ? [22, 16, 21, 12, 13, 13, 3]
        : ["opportunities", "proposals", "invoices"].includes(key)
          ? [20, 16, 14, 10, 24, 13, 3]
          : [24, 18, 16, 26, 13, 3];
  return (
    <>
      {pipeline && (
        <div className="journey-strip">
          <span className="journey-label">
            {isLead ? "LEAD WORKFLOW" : "OPPORTUNITY WORKFLOW"}
          </span>
          <div>
            {(isLead
              ? [
                  "New Lead",
                  "Discovery scheduled",
                  "Discovery completed",
                  "Converted",
                ]
              : stages
            ).map((s, i) => (
              <span key={s}>
                {i > 0 && <ArrowRight size={12} />}
                <strong>{s}</strong>
              </span>
            ))}
          </div>
        </div>
      )}
      {isLead && (
        <div className="lead-view-bar">
          <div>
            <span className="lead-view-label">View</span>
            <Select
              aria-label="Lead view"
              value={selectedView || p.leadCriteria.view}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedView(value.startsWith("custom:") ? value : "");
                p.setFilter("All");
                if (value.startsWith("custom:")) {
                  const saved = p.leadViews.find(
                    (v) => "custom:" + v.id === value,
                  );
                  if (saved) {
                    p.setLeadCriteria(saved.criteria);
                    p.setQuery(saved.search);
                  }
                } else
                  p.setLeadCriteria({ ...emptyLeadCriteria(), view: value });
              }}
            >
              {leadViewNames.map((v) => (
                <option key={v}>{v}</option>
              ))}
              {p.leadViews.map((v) => (
                <option key={v.id} value={"custom:" + v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </div>
          <button
            type="button"
            className={"secondary " + (filtersOpen ? "active" : "")}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            Filters
            {Object.entries(p.leadCriteria).filter(
              ([k, v]) => k !== "view" && v,
            ).length > 0
              ? " • Applied"
              : ""}
          </button>
        </div>
      )}
      {isLead && filtersOpen && (
        <section className="lead-filter-panel">
          <div className="form-grid">
            <label>
              <span>Stage</span>
              <Select
                aria-label="Filter lead stage"
                value={p.leadCriteria.stage}
                onChange={(e) => setCriteria("stage", e.target.value)}
              >
                <option value="">All stages</option>
                {leadStages.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </Select>
            </label>
            <label>
              <span>Lead source</span>
              <Select
                aria-label="Filter lead source"
                value={p.leadCriteria.source}
                onChange={(e) => setCriteria("source", e.target.value)}
              >
                <option value="">All sources</option>
                {modules.enquiries.fields
                  .find((f) => f.key === "source")
                  ?.options?.filter(Boolean)
                  .map((v) => (
                    <option key={v}>{v}</option>
                  ))}
              </Select>
            </label>
            <label>
              <span>Owner</span>
              <Select
                aria-label="Filter lead owner"
                value={p.leadCriteria.owner}
                onChange={(e) => setCriteria("owner", e.target.value)}
              >
                <option value="">All owners</option>
                {p.owners.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              <span>Follow-up</span>
              <Select
                aria-label="Filter lead follow-up"
                value={p.leadCriteria.followup}
                onChange={(e) => setCriteria("followup", e.target.value)}
              >
                <option value="">Any follow-up status</option>
                {[
                  "Overdue",
                  "Due today",
                  "Upcoming",
                  "No follow-up",
                  "Completed",
                  "Cancelled",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </Select>
            </label>
            <label className="full">
              <span>Company contains</span>
              <input
                aria-label="Filter company name"
                value={p.leadCriteria.company}
                onChange={(e) => setCriteria("company", e.target.value)}
              />
            </label>
            <label>
              <span>Created from</span>
              <DateTimePicker
                label="Created from"
                date={p.leadCriteria.fromDate}
                time={p.leadCriteria.fromTime}
                onChange={(date, time) => {
                  setSelectedView("");
                  p.setLeadCriteria({
                    ...p.leadCriteria,
                    fromDate: date,
                    fromTime: time,
                  });
                }}
              />
            </label>
            <label>
              <span>Created until</span>
              <DateTimePicker
                label="Created until"
                date={p.leadCriteria.toDate}
                time={p.leadCriteria.toTime}
                onChange={(date, time) => {
                  setSelectedView("");
                  p.setLeadCriteria({
                    ...p.leadCriteria,
                    toDate: date,
                    toTime: time,
                  });
                }}
              />
            </label>
          </div>
          <div className="lead-filter-footer">
            {selectedView.startsWith("custom:") && (
              <button
                type="button"
                className="text-button danger"
                disabled={savingView}
                onClick={async () => {
                  setSavingView(true);
                  setViewError("");
                  try {
                    await p.removeLeadView(selectedView.slice(7));
                    setSelectedView("");
                  } catch (e) {
                    setViewError(
                      e instanceof Error ? e.message : "Unable to remove view.",
                    );
                  } finally {
                    setSavingView(false);
                  }
                }}
              >
                Delete view
              </button>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                p.setLeadCriteria({
                  ...emptyLeadCriteria(),
                  view: p.leadCriteria.view,
                });
                p.setFilter("All");
                p.setQuery("");
                setSelectedView("");
              }}
            >
              Clear filters
            </button>
            <input
              aria-label="Custom view name"
              placeholder="Name this view"
              maxLength={80}
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
            />
            <button
              type="button"
              className="primary"
              disabled={savingView || !viewName.trim()}
              onClick={() => void saveView()}
            >
              {savingView ? "Saving…" : "Save view"}
            </button>
          </div>
          {viewError && (
            <p role="alert" className="error-banner">
              {viewError}
            </p>
          )}
          <small>
            All selected criteria must match. Saved views are private to your
            CRM user.
          </small>
        </section>
      )}
      <section
        aria-busy={p.pagination?.busy}
        className={pipeline && p.board ? "board-section" : "card"}
      >
        <div className="toolbar">
          <div className="search-input">
            <Search size={17} />
            <input
              value={p.query}
              onChange={(e) => p.setQuery(e.target.value)}
              placeholder={`Search ${m.name.toLowerCase()}…`}
              aria-label={`Search ${m.name}`}
            />
            {p.query && (
              <button
                onClick={() => p.setQuery("")}
                className="icon-button"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="toolbar-right">
            {!isLead && (
              <Select
                value={p.filter}
                onChange={(e) => p.setFilter(e.target.value)}
                aria-label="Filter records"
              >
                <option>All</option>
                <option>Mine</option>
                <option>Overdue</option>
                <option>Due today</option>
                <option>Upcoming</option>
                <option>No follow-up</option>
                <option>Follow-up completed</option>
                {m.fields
                  .find((f) => f.key === "status" || f.key === "stage")
                  ?.options?.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
              </Select>
            )}
            <span className="count-label">{total} records</span>
            {pipeline && (
              <div className="view-toggle">
                <button
                  className={p.board ? "active" : ""}
                  onClick={() => p.setBoard(true)}
                  aria-label="Board view"
                >
                  <Columns3 size={17} />
                </button>
                <button
                  className={!p.board ? "active" : ""}
                  onClick={() => p.setBoard(false)}
                  aria-label="List view"
                >
                  <List size={17} />
                </button>
              </div>
            )}
            <button
              className="icon-button"
              onClick={p.exportCSV}
              title="Export visible records"
              aria-label="Export visible records"
            >
              <Download size={17} />
            </button>
          </div>
        </div>
        {p.pagination?.busy ? (
          <div className="record-loading" role="status">
            <span className="spinner" />
            Loading records...
          </div>
        ) : pipeline && p.board ? (
          <div className="kanban">
            {columns.map((s, i) => (
              <div className="kanban-column" key={s}>
                <div className="column-heading">
                  <span className={"stage-dot stage-" + i} />
                  <strong>{s}</strong>
                  <span className="column-count">{stageCount(s)}</span>
                  {p.can(key, "create") &&
                    s === (isLead ? "New Lead" : "Solution planning") && (
                      <button
                        className="icon-button"
                        onClick={() =>
                          p.add(key, { [isLead ? "status" : "stage"]: s })
                        }
                        aria-label={`Add ${s} ${m.singular}`}
                      >
                        <Plus size={14} />
                      </button>
                    )}
                </div>
                <div className="column-value">
                  {isLead
                    ? s === "Not Contacted"
                      ? "Retry outreach and set a follow-up"
                      : s === "Converted"
                        ? "Continue in Opportunities"
                        : s.startsWith("Discovery")
                          ? "Understand the customer’s needs"
                          : "Build the customer relationship"
                    : moneyTotals(count(s))}
                </div>
                {count(s)
                  .slice(0, 50)
                  .map((r) => (
                    <button
                      key={r.id}
                      className="deal-card"
                      onClick={() => p.select(r)}
                    >
                      <small>{company(r)}</small>
                      <h3>{r.title}</h3>
                      {isLead ? (
                        <div className="lead-contact">
                          {r.data.contactName ||
                            r.data.email ||
                            "Contact details pending"}
                        </div>
                      ) : (
                        <strong className="deal-amount">
                          {money(r.data.amount, r.data.currency)}
                        </strong>
                      )}
                      {isLead && r.data.reEnquiryCount && (
                        <span className="new-enquiry-tag list-reenquiry-tag">
                          #ReEnquiry · {r.data.reEnquiryCount}
                        </span>
                      )}
                      {r.data.products && (
                        <span className="product-tag">{r.data.products}</span>
                      )}
                      {isLead && r.data.discoveryDate && (
                        <span className="discovery-tag">
                          <CalendarDays size={12} />
                          Discovery · {date(r.data.discoveryDate)}
                        </span>
                      )}
                      <div className="deal-footer">
                        <span
                          className="avatar tiny"
                          title={p.owner(r.ownerId)}
                        >
                          {initials(p.owner(r.ownerId))}
                        </span>
                        <span
                          className={
                            followUpDate(r) && followUpDate(r) < p.today
                              ? "danger"
                              : ""
                          }
                        >
                          {followUpDate(r)
                            ? date(followUpDate(r))
                            : r.data.expectedClose
                              ? date(r.data.expectedClose)
                              : "No follow-up set"}
                        </span>
                      </div>
                    </button>
                  ))}
                {stageCount(s) > count(s).length && (
                  <button
                    className="text-button"
                    onClick={() => {
                      p.setFilter(s);
                      p.setBoard(false);
                    }}
                  >
                    View all {stageCount(s)} records
                  </button>
                )}
                {!count(s).length && (
                  <div className="empty-column">
                    {stageCount(s)
                      ? "Open this stage to view its records"
                      : `No ${m.name.toLowerCase()} yet`}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : p.records.length ? (
          <div className="table-scroll">
            <table className="records-table dense-records">
              <colgroup>
                {widths.map((width, i) => (
                  <col key={i} style={{ width: width + "%" }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th>
                    {key === "companies"
                      ? "Company"
                      : isIntegrationError
                        ? "Error"
                        : "Name"}
                  </th>
                  {key !== "companies" && !isIntegrationError && (
                    <th>Company</th>
                  )}
                  <th>
                    {key === "contacts"
                      ? "Email"
                      : pipeline
                        ? "Stage"
                        : "Status"}
                  </th>
                  {["opportunities", "proposals", "invoices"].includes(key) && (
                    <th>Value</th>
                  )}
                  {key === "contacts" && <th>Phone</th>}
                  <th>
                    {isIntegrationError
                      ? "Occurred"
                      : "Follow-up / next action"}
                  </th>
                  <th>Owner</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageRecords.map((r) => (
                  <tr
                    key={r.id}
                    className="clickable-record-row"
                    tabIndex={0}
                    aria-label={`Open ${r.title}`}
                    onClick={(e) => {
                      if (
                        !(e.target as HTMLElement).closest(
                          "button,a,input,select",
                        )
                      )
                        p.select(r);
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.target === e.currentTarget &&
                        ["Enter", " "].includes(e.key)
                      ) {
                        e.preventDefault();
                        p.select(r);
                      }
                    }}
                  >
                    <td>
                      <button
                        className="record-name"
                        onClick={() => p.select(r)}
                      >
                        <span className="record-icon">
                          <Icon size={18} />
                        </span>
                        <span>
                          <strong title={r.title}>{r.title}</strong>
                          <small>
                            {isIntegrationError
                              ? [r.data.integration, r.data.operation]
                                  .filter(Boolean)
                                  .join(" · ")
                              : key === "companies"
                                ? r.data.industry || "Company record"
                                : r.data.latestStageNote ||
                                  r.data.products ||
                                  r.data.contactName ||
                                  r.data.type ||
                                  m.singular}
                          </small>
                          {isLead && r.data.reEnquiryCount && (
                            <span className="new-enquiry-tag list-reenquiry-tag">
                              #ReEnquiry · {r.data.reEnquiryCount}
                            </span>
                          )}
                        </span>
                      </button>
                    </td>
                    {key !== "companies" && !isIntegrationError && (
                      <td title={company(r)}>{company(r)}</td>
                    )}
                    <td>
                      {key === "contacts" ? (
                        r.data.email || "—"
                      ) : (
                        <span
                          className={
                            "badge " + stageColor(r.data.status || r.data.stage)
                          }
                        >
                          {r.data.status || r.data.stage || "New"}
                        </span>
                      )}
                    </td>
                    {["opportunities", "proposals", "invoices"].includes(
                      key,
                    ) && (
                      <td className="amount">
                        {money(r.data.amount, r.data.currency)}
                      </td>
                    )}
                    {key === "contacts" && <td>{r.data.phone || "—"}</td>}
                    <td>
                      {isIntegrationError ? (
                        date(r.data.occurredAt)
                      ) : (
                        <FollowUpCell
                          record={r}
                          today={p.today}
                          canEdit={p.can(key, "edit")}
                          plan={() => p.planFollowUp(r)}
                        />
                      )}
                    </td>
                    <td>
                      <span className="owner-cell">
                        <span className="avatar tiny">
                          {initials(p.owner(r.ownerId))}
                        </span>
                        <span className="owner-name" title={p.owner(r.ownerId)}>
                          {p.owner(r.ownerId)}
                        </span>
                      </span>
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`Open ${r.title}`}
                        onClick={() => p.select(r)}
                      >
                        <ChevronRight size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon size={30} />
            </span>
            <h2>
              {p.query || p.filter !== "All"
                ? "No matching records"
                : `Your ${m.name.toLowerCase()} start here`}
            </h2>
            <p>
              {p.query || p.filter !== "All"
                ? "Try another search or reset the filter."
                : m.description}
            </p>
            {p.can(key, "create") && (
              <button className="primary" onClick={() => p.add(key)}>
                <Plus size={16} />
                Add {m.singular}
              </button>
            )}
          </div>
        )}
        {!(pipeline && p.board) && (
          <div
            className={
              "table-footer" + (pageCount > 1 ? " pagination-footer" : "")
            }
          >
            <span>{total} records · Visible within your role hierarchy</span>
            <span>
              {pageCount > 1 ? (
                <>
                  <button
                    className="text-button"
                    disabled={p.pagination?.busy || currentPage === 0}
                    onClick={() => changePage(currentPage - 1)}
                  >
                    Previous
                  </button>{" "}
                  · {currentPage + 1} / {pageCount} ·{" "}
                  <button
                    className="text-button"
                    disabled={
                      p.pagination?.busy || currentPage === pageCount - 1
                    }
                    onClick={() => changePage(currentPage + 1)}
                  >
                    Next
                  </button>
                </>
              ) : (
                <>OHO Solutions</>
              )}
            </span>
          </div>
        )}
      </section>
    </>
  );
}
