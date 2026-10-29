"use client";

import { readJSON } from "../lib/http";

import { useEffect, useState, useRef, useMemo, type FormEvent } from "react";

import {
  LayoutDashboard,
  Building2,
  Users,
  Inbox,
  TrendingUp,
  CalendarDays,
  FileText,
  Receipt,
  Layers,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  X,
  Pencil,
  Trash2,
  Check,
  Clock,
  CircleCheck,
  RefreshCw,
  LogOut,
  ShieldCheck,
  GitBranch,
  Mail,
  Phone,
  ExternalLink,
  MoreHorizontal,
  List,
  Columns3,
  Menu,
  AlertCircle,
  Download,
  FileClock,
} from "lucide-react";

import {
  modules,
  stages,
  leadStages,
  canConvertLead,
  indiaToday,
  followUpDate,
  followUpAction,
  followUpLabel,
  followUpTime,
  fullPermissions,
  hasPermission,
  type Role,
  type Member,
  type CRMRecord,
  type PermissionMap,
  type Action,
  type Field,
} from "../lib/model";

import {
  emptyLeadCriteria,
  matchesLead,
  type LeadCriteria,
  type LeadView,
} from "../lib/lead-views";

import OverviewDashboard, {
  type DashboardData,
} from "../components/overview-dashboard";
import RecordLookup from "../components/record-lookup";
import RecordsWorkspace from "../components/records-workspace";

import EmailEntry from "../components/email-entry";

import ConvertLeadDialog from "../components/convert-lead";

import StageTransition from "../components/stage-transition";

import RecordActions from "../components/record-actions";

import StageJourney from "../components/stage-journey";

import FollowUpDialog from "../components/follow-up-dialog";
import MeetingDialog from "../components/meeting-dialog";

import FollowUpPanel from "../components/follow-up-panel";

import StageHistory from "../components/stage-history";

import NoteComposer from "../components/note-composer";

import { moneyTotals } from "../lib/money";

import RecordNotes from "../components/record-notes";

import ProposalVersions from "../components/proposal-versions";

import RecordTasks, { CompletedActivities } from "../components/record-tasks";

import DateTimePicker, { indiaTime } from "../components/date-time-picker";

import Select from "../components/select";

import ZohoLeadImport from "../components/zoho-lead-import";

import { disqualificationReasons } from "../lib/lead-picklists";

import { dateTimeKey } from "../lib/model";

import { stageColor } from "../lib/stage-colors";

import type { StageEvent } from "../lib/stage-rules";

type Profile = { id: string; name: string; permissions: PermissionMap };

type Audit = {
  id: string;
  actor_id: string;
  action: string;
  target: string;
  details: string;
  created_at: string;
};

type State = {
  me: Member;
  permissions: PermissionMap;
  roles: Role[];
  owners: { id: string; name: string; active: number }[];
  records: CRMRecord[];
  profiles: Profile[];
  users: Member[];
  audit: Audit[];
  stageHistory: StageEvent[];
  leadViews: LeadView[];
};

type Editor = {
  kind: "record" | "role" | "profile" | "user";
  module?: string;
  item?: CRMRecord | Role | Profile | Member;
  defaults?: Record<string, string>;
};

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

const money = (value: unknown) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const date = (value: string) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }).format(
        new Date(value.length === 10 ? value + "T00:00:00+05:30" : value),
      )
    : "â€”";

const dateTime = (value: string) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(new Date(value))
    : "â€”";

const initials = (value: string) =>
  value
    .split(/[ @]+/)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase())
    .join("");

function Badge({ value }: { value: string }) {
  const good = [
    "Accepted",
    "Paid",
    "Completed",
    "Customer",
    "Qualified",
    "Connected",
  ].includes(value);
  const bad = [
    "Overdue",
    "Closed lost",
    "Rejected",
    "Disconnected",
    "Inactive",
    "Not qualified",
  ].includes(value);
  return (
    <span className={"badge " + stageColor(value)}>{value || "Not set"}</span>
  );
}

export default function CRM() {
  const initialView = () => {
    if (typeof window === "undefined") return "dashboard";
    const value =
      new URLSearchParams(window.location.search).get("view") || "dashboard";
    return value === "dashboard" ||
      value === "followups" ||
      value === "settings" ||
      !!modules[value]
      ? value
      : "dashboard";
  };

  const [showLeadImport, setShowLeadImport] = useState(false);
  const [leadCriteria, setLeadCriteria] =
    useState<LeadCriteria>(emptyLeadCriteria);

  const [state, setState] = useState<State | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");

  const [view, setView] = useState(initialView),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All"),
    [board, setBoard] = useState(false);

  const [selected, setSelected] = useState<CRMRecord | null>(null),
    [editor, setEditor] = useState<Editor | null>(null),
    [notice, setNotice] = useState(""),
    [menu, setMenu] = useState(false),
    [deleteTarget, setDeleteTarget] = useState<
      CRMRecord | Role | Profile | null
    >(null),
    [deleting, setDeleting] = useState(false);

  const openRequest = useRef(0),
    restoreAttempted = useRef(false),
    historyLoaded = useRef(new Set<string>());
  const [openingRecord, setOpeningRecord] = useState(false);

  const [tab, setTab] = useState("users");

  const [convertTarget, setConvertTarget] = useState<CRMRecord | null>(null);

  const [transitionTarget, setTransitionTarget] = useState<{
    record: CRMRecord;
    stage: string;
  } | null>(null);

  const [followUpTarget, setFollowUpTarget] = useState<{
    record: CRMRecord;
    mode: "add" | "plan" | "complete" | "cancel";
  } | null>(null);
  const [meetingTarget, setMeetingTarget] = useState<CRMRecord | null>(null);
  const detailDirty = useRef(false);

  const [version, setVersion] = useState(0),
    [pageIndex, setPageIndex] = useState(0),
    [pageBusy, setPageBusy] = useState(false),
    [pageError, setPageError] = useState("");
  const [pageData, setPageData] = useState<{
    records: CRMRecord[];
    total: number;
    page: number;
    pageSize: number;
    stageCounts: { stage: string; count: number }[];
    followupCounts?: { label: string; count: number }[];
  }>({ records: [], total: 0, page: 0, pageSize: 50, stageCounts: [] });
  const pageCache = useRef(new Map<string, typeof pageData>());
  const pageCacheKey = (
    module: string,
    page: number,
    search: string,
    selectedFilter: string,
    criteria: string,
    revision: number,
  ) =>
    [
      state?.me.id || "",
      module,
      page,
      search,
      selectedFilter,
      criteria,
      revision,
    ].join("|");
  const [dashboardCounts, setDashboardCounts] = useState<
      DashboardData["counts"]
    >([]),
    [overdueCount, setOverdueCount] = useState(0);
  function mergeRecords(records: CRMRecord[]) {
    const ids = new Set(records.map((r) => r.id));
    setState((s) =>
      s
        ? {
            ...s,
            records: [...records, ...s.records.filter((r) => !ids.has(r.id))],
          }
        : s,
    );
  }
  function dashboardLoaded(d: DashboardData) {
    mergeRecords([...d.records, ...d.relatedRecords]);
    setDashboardCounts(d.counts);
    setOverdueCount(
      d.followupCounts.find((r) => r.label === "Overdue")?.count || 0,
    );
  }
  async function loadWorkspace() {
    const response = await fetch("/api/crm?mode=bootstrap", {
      cache: "no-store",
    });
    const body = (await readJSON(response)) as State & { error?: string };
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) setState(null);
      throw Error(body.error || "Unable to load CRM.");
    }
    return body;
  }
  async function reload() {
    setError("");
    try {
      const body = await loadWorkspace();
      setState(body);
      setVersion((v) => v + 1);
      if (selected) {
        const full = await hydrateRecord(selected);
        setSelected((s) => (s?.id === selected.id ? full : s));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load CRM.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void reload();
  }, []);
  useEffect(() => {
    if (!state || restoreAttempted.current || typeof window === "undefined")
      return;
    restoreAttempted.current = true;
    const params = new URLSearchParams(window.location.search),
      id = params.get("record"),
      module = params.get("module") || view;
    if (id && modules[module])
      void openRecord({
        id,
        module,
        title: "Loading record…",
        ownerId: "",
        companyId: null,
        data: {},
        createdAt: "",
        updatedAt: "",
      });
  }, [state]);
  const criteriaKey = JSON.stringify(leadCriteria);
  useEffect(() => {
    setPageIndex(0);
  }, [view, query, filter, criteriaKey]);
  useEffect(() => {
    if (!state?.me.id || (!modules[view] && view !== "followups")) return;
    const key = pageCacheKey(
        view,
        pageIndex,
        query,
        filter,
        criteriaKey,
        version,
      ),
      cached = pageCache.current.get(key);
    if (cached) {
      setPageData(cached);
      setPageBusy(false);
      setPageError("");
      mergeRecords(cached.records);
      return;
    }
    const abort = new AbortController();
    setPageBusy(true);
    setPageError("");
    const timer = setTimeout(
      () => {
        const params = new URLSearchParams({
          mode: "page",
          module: view,
          page: String(pageIndex),
          pageSize: "50",
          search: query,
          filter,
        });
        if (view === "enquiries") params.set("criteria", criteriaKey);
        fetch("/api/crm?" + params, { signal: abort.signal })
          .then(async (response) => {
            const body = (await readJSON(response)) as typeof pageData & {
              relatedRecords: CRMRecord[];
              error?: string;
            };
            if (!response.ok)
              throw Error(body.error || "Unable to load records.");
            if (!abort.signal.aborted) {
              pageCache.current.set(key, body);
              setPageData(body);
              mergeRecords([...body.records, ...body.relatedRecords]);
              if (body.page > 0 && body.page * body.pageSize >= body.total)
                setPageIndex(
                  Math.max(0, Math.ceil(body.total / body.pageSize) - 1),
                );
            }
          })
          .catch((e) => {
            if (!abort.signal.aborted) setPageError(e.message);
          })
          .finally(() => {
            if (!abort.signal.aborted) setPageBusy(false);
          });
      },
      query ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [state?.me.id, view, query, filter, criteriaKey, pageIndex, version]);
  useEffect(() => {
    if (view !== "settings" || tab !== "audit" || !state?.me.id) return;
    const abort = new AbortController();
    fetch("/api/crm?mode=audit", { signal: abort.signal })
      .then(async (r) => {
        const b = (await readJSON(r)) as { audit: Audit[]; error?: string };
        if (!r.ok) throw Error(b.error || "Unable to load audit");
        setState((s) => (s ? { ...s, audit: b.audit } : s));
      })
      .catch((e) => {
        if (!abort.signal.aborted) setNotice(e.message);
      });
    return () => abort.abort();
  }, [view, tab, state?.me.id, version]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(t);
    }
  }, [notice]);

  function navigate(v: string) {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.search = "";
      if (v !== "dashboard") url.searchParams.set("view", v);
      window.history.replaceState(null, "", url);
    }
    const nextCriteria =
        v === "enquiries" ? JSON.stringify(emptyLeadCriteria()) : criteriaKey,
      cached = pageCache.current.get(
        pageCacheKey(v, 0, "", "All", nextCriteria, version),
      );
    if (v === "enquiries") setLeadCriteria(emptyLeadCriteria());
    setView(v);
    setQuery("");
    setFilter("All");
    setMenu(false);
    setPageData(
      cached || {
        records: [],
        total: 0,
        page: 0,
        pageSize: 50,
        stageCounts: [],
      },
    );
    setPageIndex(0);
    openRequest.current++;
    setOpeningRecord(false);
    setSelected(null);
  }

  async function hydrateRecord(r: CRMRecord) {
    const res = await fetch(
      "/api/crm?id=" + encodeURIComponent(r.id) + "&recordModule=" + r.module,
      { cache: "no-store" },
    );
    const body = (await readJSON(res)) as {
      record: CRMRecord;
      relatedTasks?: CRMRecord[];
      relatedRecords?: CRMRecord[];
      stageHistory: StageEvent[];
      error?: string;
    };
    if (!res.ok) throw new Error(body.error || "Unable to open record.");
    setState((previous) =>
      previous
        ? {
            ...previous,
            records: [
              body.record,
              ...(body.relatedTasks || []),
              ...(body.relatedRecords || []),
              ...previous.records.filter(
                (x) =>
                  x.id !== r.id &&
                  ![
                    ...(body.relatedTasks || []),
                    ...(body.relatedRecords || []),
                  ].some((t) => t.id === x.id),
              ),
            ],
            stageHistory: [
              ...body.stageHistory,
              ...previous.stageHistory.filter((e) => e.recordId !== r.id),
            ],
          }
        : previous,
    );
    return body.record;
  }

  async function hydrateHistory(record: CRMRecord) {
    if (historyLoaded.current.has(record.id)) return;
    historyLoaded.current.add(record.id);
    try {
      const response = await fetch(
        "/api/crm?mode=history&recordHistoryId=" +
          encodeURIComponent(record.id),
        { cache: "no-store" },
      );
      const body = (await readJSON(response)) as {
        recordIds: string[];
        stageHistory: StageEvent[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error || "Unable to load History.");
      const ids = new Set(body.recordIds);
      setState((previous) =>
        previous
          ? {
              ...previous,
              stageHistory: [
                ...body.stageHistory,
                ...previous.stageHistory.filter(
                  (event) => !ids.has(event.recordId),
                ),
              ],
            }
          : previous,
      );
    } catch (reason) {
      historyLoaded.current.delete(record.id);
      setNotice(
        reason instanceof Error ? reason.message : "Unable to load History.",
      );
    }
  }

  async function openRecord(r: CRMRecord) {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (view !== "dashboard") url.searchParams.set("view", view);
      url.searchParams.set("module", r.module);
      url.searchParams.set("record", r.id);
      window.history.replaceState(null, "", url);
    }
    const request = ++openRequest.current;
    setSelected(r);
    setOpeningRecord(true);
    try {
      const full = await hydrateRecord(r);
      if (openRequest.current === request) {
        setSelected(full);
        void hydrateHistory(full);
      }
    } catch (e) {
      if (openRequest.current === request) {
        setSelected(null);
        setNotice(e instanceof Error ? e.message : "Unable to open record.");
      }
    } finally {
      if (openRequest.current === request) setOpeningRecord(false);
    }
  }

  function closeRecord() {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("record");
      url.searchParams.delete("module");
      window.history.replaceState(null, "", url);
    }
    openRequest.current++;
    setSelected(null);
    setOpeningRecord(false);
    if (detailDirty.current) {
      detailDirty.current = false;
      setVersion((v) => v + 1);
    }
  }

  function openTask(r: CRMRecord) {
    const id =
      r.module === "activities"
        ? r.data.enquiryId || r.data.opportunityId
        : null;
    if (id) {
      const target = state?.records.find((x) => x.id === id) || {
        ...r,
        id,
        module: r.data.enquiryId ? "enquiries" : "opportunities",
        data: {},
      };
      navigate(target.module);
      void openRecord(target);
    } else {
      navigate(r.module);
      void openRecord(r);
    }
  }
  function dashboardNavigate(module: string, status?: string) {
    navigate(module);
    if (module === "enquiries" && status)
      setLeadCriteria({
        ...emptyLeadCriteria(),
        view:
          status === "Converted"
            ? "Archived / Converted"
            : ["Lead Lost", "Junk Lead", "Disqualified"].includes(status)
              ? "Lost / Disqualified"
              : "Active Leads",
      });
    if (status) setFilter(status);
  }
  const can = (module: string, action: Action) =>
    state ? hasPermission(state.permissions, module, action) : false;
  useEffect(() => {
    const add = (event: Event) => {
      const record = (event as CustomEvent<CRMRecord>).detail;
      if (record && can("activities", "create"))
        setFollowUpTarget({ record, mode: "add" });
    };
    window.addEventListener("oho:add-followup", add);
    return () => window.removeEventListener("oho:add-followup", add);
  }, [state]);
  useEffect(() => {
    const log = (event: Event) => {
      const record = (event as CustomEvent<CRMRecord>).detail;
      if (record && can("activities", "create")) setMeetingTarget(record);
    };
    window.addEventListener("oho:log-meeting", log);
    return () => window.removeEventListener("oho:log-meeting", log);
  }, [state]);

  const today = indiaToday();

  const filtered = (module: string) =>
    state?.records.filter(
      (r) =>
        r.module === module &&
        (module !== "enquiries" ||
          (matchesLead(r, { ...leadCriteria, company: "" }, today) &&
            (!leadCriteria.company ||
              (r.data.companyName || company(r.companyId))
                .toLowerCase()
                .includes(leadCriteria.company.toLowerCase())))) &&
        (filter === "All" ||
          (filter === "Mine" && r.ownerId === state.me.id) ||
          (["Overdue", "Due today", "Upcoming", "No follow-up"].includes(
            filter,
          ) &&
            followUpLabel(r, today) === filter) ||
          (filter === "Follow-up completed" &&
            followUpLabel(r, today) === "Completed") ||
          r.data.status === filter ||
          r.data.stage === filter) &&
        (query === "" ||
          [r.title, ...Object.values(r.data), company(r.companyId)]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase())),
    ) || [];

  const recordNames = useMemo(
    () => new Map((state?.records || []).map((r) => [r.id, r.title])),
    [state?.records],
  );

  const company = (id: string | null) =>
    id ? recordNames.get(id) || "â€”" : "â€”";

  const owner = (id: string) =>
    state?.owners.find((u) => u.id === id)?.name || "Team member";

  const followups = (state?.records || [])
    .filter((r) => followUpDate(r))
    .sort((a, b) =>
      (followUpDate(a) + followUpTime(a)).localeCompare(
        followUpDate(b) + followUpTime(b),
      ),
    );

  const opportunities = (state?.records || []).filter(
    (r) => r.module === "opportunities",
  );

  const activeOpp = opportunities.filter(
    (r) => !["Accepted", "Closed lost"].includes(r.data.stage),
  );

  const overdue = followups.filter((r) => followUpDate(r) < today);

  const invoices = (state?.records || []).filter(
    (r) => r.module === "invoices" && r.data.status !== "Cancelled",
  );

  const outstanding = invoices.reduce(
    (s, r) =>
      s +
      Math.max(0, Number(r.data.amount || 0) - Number(r.data.paidAmount || 0)),
    0,
  );

  async function save(payload: Record<string, unknown>) {
    const response = await fetch("/api/crm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await readJSON(response)) as {
      id: string;
      ok?: boolean;
      error?: string;
      changes?: {
        ids: string[];
        records: CRMRecord[];
        stageHistory: StageEvent[];
      };
    };
    if (!response.ok) throw new Error(body.error || "Unable to save.");
    if (
      body.changes &&
      ["record", "transition", "followup", "convert", "note"].includes(
        String(payload.kind),
      )
    ) {
      const changes = body.changes,
        ids = new Set(changes.ids),
        updated = new Map(changes.records.map((record) => [record.id, record]));
      setState((previous) =>
        previous
          ? {
              ...previous,
              records: [
                ...changes.records,
                ...previous.records.filter((record) => !ids.has(record.id)),
              ],
              stageHistory: [
                ...changes.stageHistory,
                ...previous.stageHistory.filter(
                  (event) =>
                    !ids.has(event.recordId) ||
                    event.id.startsWith("zoho-note:"),
                ),
              ],
            }
          : previous,
      );
      setPageData((previous) => ({
        ...previous,
        records: previous.records.flatMap((record) =>
          ids.has(record.id)
            ? updated.has(record.id)
              ? [updated.get(record.id)!]
              : []
            : [record],
        ),
        total:
          payload.operation === "delete" &&
          previous.records.some((record) => record.id === body.id)
            ? Math.max(0, previous.total - 1)
            : previous.total,
      }));
      setSelected((previous) =>
        previous && ids.has(previous.id)
          ? updated.get(previous.id) || null
          : previous,
      );
      if (selected && payload.operation !== "delete") {
        historyLoaded.current.delete(selected.id);
        detailDirty.current = true;
      } else setVersion((v) => v + 1);
    } else await reload();
    setNotice("Changes saved");
    return body;
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await save({
        kind:
          view === "settings"
            ? tab === "roles"
              ? "role"
              : "profile"
            : "record",
        module: (deleteTarget as CRMRecord).module,
        id: deleteTarget.id,
        operation: "delete",
      });
      setDeleteTarget(null);
      setSelected(null);
      setNotice("Record deleted");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Unable to delete.");
    } finally {
      setDeleting(false);
    }
  }

  async function switchEmail() {
    const r = await fetch("/api/identity", { method: "DELETE" });
    if (r.ok) {
      setState(null);
      setError("");
      setSelected(null);
      setEditor(null);
      setPageData({
        records: [],
        total: 0,
        page: 0,
        pageSize: 50,
        stageCounts: [],
      });
      setDashboardCounts([]);
      setOverdueCount(0);
      setPageIndex(0);
      setLeadCriteria(emptyLeadCriteria());
      setView("dashboard");
    } else setNotice("Unable to switch email. Try again.");
  }

  async function refreshTransition(r: CRMRecord) {
    const response = await fetch(
      "/api/crm?id=" + encodeURIComponent(r.id) + "&recordModule=" + r.module,
      { cache: "no-store" },
    );
    const body = (await readJSON(response)) as {
      record: CRMRecord;
      relatedTasks: CRMRecord[];
      stageHistory: StageEvent[];
      error?: string;
    };
    if (!response.ok)
      throw new Error(body.error || "Unable to refresh record.");
    const ids = new Set([r.id, ...body.relatedTasks.map((t) => t.id)]);
    const records = [
      body.record,
      ...body.relatedTasks,
      ...(state?.records || []).filter(
        (t) =>
          !ids.has(t.id) &&
          !(
            t.module === "activities" &&
            (t.data.enquiryId === r.id || t.data.opportunityId === r.id)
          ),
      ),
    ];
    setState((s) =>
      s
        ? {
            ...s,
            records,
            stageHistory: [
              ...body.stageHistory,
              ...s.stageHistory.filter((e) => e.recordId !== r.id),
            ],
          }
        : s,
    );
    setSelected(body.record);
    return { record: body.record, records };
  }

  function updateStage(r: CRMRecord, stage: string) {
    setTransitionTarget({ record: r, stage });
  }

  function planFollowUp(r: CRMRecord) {
    setFollowUpTarget({ record: r, mode: "plan" });
  }

  function add(module: string, defaults?: Record<string, string>) {
    setEditor({ kind: "record", module, defaults });
  }

  async function saveLeadView(name: string) {
    const response = await fetch("/api/crm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "lead-view",
        operation: "create",
        name,
        criteria: leadCriteria,
        search: query,
      }),
    });
    const body = (await readJSON(response)) as {
      view: LeadView;
      error?: string;
    };
    if (!response.ok) throw new Error(body.error || "Unable to save view.");
    setState((s) =>
      s ? { ...s, leadViews: [...(s.leadViews || []), body.view] } : s,
    );
    return body.view;
  }

  async function removeLeadView(id: string) {
    const response = await fetch("/api/crm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "lead-view", operation: "delete", id }),
    });
    const body = (await readJSON(response)) as { error?: string };
    if (!response.ok) throw new Error(body.error || "Unable to remove view.");
    setState((s) =>
      s ? { ...s, leadViews: s.leadViews.filter((v) => v.id !== id) } : s,
    );
    setLeadCriteria(emptyLeadCriteria());
    setQuery("");
    setFilter("All");
  }

  async function exportCSV() {
    const data: CRMRecord[] = [];
    let page = 0,
      total = 1;
    const names = new Map(recordNames);
    while (data.length < total) {
      const params = new URLSearchParams({
        mode: "page",
        module: view,
        page: String(page++),
        pageSize: "100",
        search: query,
        filter,
      });
      if (view === "enquiries")
        params.set("criteria", JSON.stringify(leadCriteria));
      const response = await fetch("/api/crm?" + params);
      const body = (await readJSON(response)) as {
        records: CRMRecord[];
        relatedRecords: CRMRecord[];
        total: number;
        error?: string;
      };
      if (!response.ok) {
        setNotice(body.error || "Unable to export records.");
        return;
      }
      data.push(...body.records);
      for (const r of body.relatedRecords) names.set(r.id, r.title);
      total = body.total;
      if (!body.records.length) break;
    }
    const fields = modules[view]?.fields || [];

    const headings = [
      "Name",
      "Company",
      "Owner",
      ...fields.map((f) => f.label),
    ];

    const quote = (s: string) =>
      '"' + (/^[=+@\-\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"';

    const csv = [
      headings,
      ...data.map((r) => [
        r.title,
        r.companyId
          ? names.get(r.companyId) || r.data.companyName || ""
          : r.data.companyName || "",
        owner(r.ownerId),
        ...fields.map((f) => r.data[f.key] || ""),
      ]),
    ]
      .map((row) => row.map(quote).join(","))
      .join("\r\n");

    const url = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `oho-${view}-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice("Visible records exported");
  }

  if (loading)
    return (
      <div className="loading">
        <div className="brand-mark">
          oho<span>.</span>
        </div>
        <div className="spinner" />
        <p>Opening your workspaceâ€¦</p>
      </div>
    );

  if (!state) return <EmailEntry error={error} onEntered={() => reload()} />;

  return (
    <div className="app-shell">
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <div className="brand">
          <div className="brand-mark">
            oho<span>.</span>
          </div>
          <div className="brand-caption">
            SOLUTIONS <span>CRM</span>
          </div>
        </div>

        <div className="sidebar-nav-area">
          <div className="workspace">
            <span className="workspace-icon">O</span>
            <div>
              <strong>OHO Solutions</strong>
              <small>Customer workspace</small>
            </div>
            <ChevronRight size={14} />
          </div>

          <div className="nav-label">WORKSPACE</div>

          <nav>
            <button
              className={view === "dashboard" ? "active" : ""}
              onClick={() => navigate("dashboard")}
            >
              <LayoutDashboard size={18} />
              Overview
            </button>
            <button
              className={view === "followups" ? "active" : ""}
              onClick={() => navigate("followups")}
            >
              <Clock size={18} />
              Follow-ups
              {overdueCount > 0 && (
                <span className="nav-count">{overdueCount}</span>
              )}
            </button>
          </nav>

          <div className="nav-label">CUSTOMER JOURNEY</div>

          <nav>
            {Object.entries(modules)
              .filter(([key]) => can(key, "view"))
              .map(([key, m]) => {
                const Icon = icons[key];
                return (
                  <button
                    key={key}
                    className={view === key ? "active" : ""}
                    onClick={() => navigate(key)}
                  >
                    <Icon size={18} />
                    {m.name}
                    {key === "enquiries" && (
                      <span className="nav-count muted-count">
                        {dashboardCounts
                          .filter((r) => r.module === key)
                          .reduce((n, r) => n + r.count, 0)}
                      </span>
                    )}
                  </button>
                );
              })}
          </nav>
        </div>
        <div className="sidebar-bottom">
          {can("administration", "view") && (
            <button
              className={view === "settings" ? "active" : ""}
              onClick={() => navigate("settings")}
            >
              <Settings size={18} />
              Administration
            </button>
          )}
          <div className="signed-user">
            <span className="avatar">{initials(state.me.name)}</span>
            <div>
              <strong>{state.me.name}</strong>
              <small>
                {state.roles.find((r) => r.id === state.me.roleId)?.name}
              </small>
            </div>
            <button
              title="Switch email"
              aria-label="Switch email"
              className="icon-button"
              onClick={() => void switchEmail()}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-label="Toggle navigation"
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {modules[view]?.name ||
                (
                  {
                    dashboard: "Overview",
                    followups: "Follow-ups",
                    settings: "Administration",
                  } as Record<string, string>
                )[view]}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="system-status">
              <i /> Connected
            </span>
            <button
              className="icon-button"
              aria-label="Refresh records"
              onClick={() => void reload()}
            >
              <RefreshCw size={17} />
            </button>
            <span className="avatar small">{initials(state.me.name)}</span>
          </div>
        </header>

        <main className="content">
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={16} />
              {error}
              <button onClick={() => void reload()}>Retry</button>
            </div>
          )}

          <div className="page-heading">
            <div>
              <div className="eyebrow">
                OHO SOLUTIONS /{" "}
                {view === "dashboard"
                  ? "YOUR BUSINESS AT A GLANCE"
                  : view === "settings"
                    ? "WORKSPACE CONTROLS"
                    : "CUSTOMER OPERATIONS"}
              </div>
              <h1>
                {view === "dashboard"
                  ? "Good to see you, " + state.me.name.split(/[ @]/)[0] + "."
                  : modules[view]?.name ||
                    (
                      {
                        followups: "Keep the conversation moving",
                        settings: "Administration",
                      } as Record<string, string>
                    )[view]}
              </h1>
              <p>
                {modules[view]?.description ||
                  (
                    {
                      dashboard:
                        "Every relationship, every opportunity, every next step.",
                      followups:
                        "Your due dates and next actions, together in one place.",
                      settings:
                        "Define your team structure and what each profile can do.",
                    } as Record<string, string>
                  )[view]}
              </p>
            </div>

            <div className="heading-actions">
              {view === "enquiries" && can("enquiries", "create") && (
                <button
                  className="secondary"
                  onClick={() => setShowLeadImport(true)}
                >
                  <Download size={16} />
                  Import Zoho CRM CSV
                </button>
              )}
              {view === "dashboard" ? (
                <span className="date-chip">
                  <CalendarDays size={16} />
                  {date(today)}
                </span>
              ) : modules[view] && can(view, "create") ? (
                <button className="primary" onClick={() => add(view)}>
                  <Plus size={17} />
                  Add {modules[view].singular}
                </button>
              ) : null}
            </div>
          </div>

          {view === "dashboard" && (
            <OverviewDashboard
              version={version}
              can={can}
              loaded={dashboardLoaded}
              open={openTask}
              owner={owner}
              company={company}
              navigate={dashboardNavigate}
              complete={(r) =>
                setFollowUpTarget({ record: r, mode: "complete" })
              }
            />
          )}
          {pageError && (
            <div className="error-banner" role="alert">
              {pageError}
              <button onClick={() => setVersion((v) => v + 1)}>Retry</button>
            </div>
          )}
          {view === "followups" && (
            <FollowUpPanel
              showAll
              records={pageData.records}
              today={today}
              owner={owner}
              company={company}
              open={openTask}
              can={can}
              complete={(r) =>
                setFollowUpTarget({ record: r, mode: "complete" })
              }
              viewAll={() => navigate("followups")}
              server={{
                page: pageIndex,
                total: pageData.total,
                counts: pageData.followupCounts || [],
                filter,
                changePage: setPageIndex,
                changeFilter: setFilter,
                busy: pageBusy,
              }}
            />
          )}
          {modules[view] && (
            <RecordsWorkspace
              module={view}
              records={pageData.records}
              pagination={{
                page: pageIndex,
                total: pageData.total,
                pageSize: 50,
                busy: pageBusy,
                changePage: setPageIndex,
                stageCounts: pageData.stageCounts,
              }}
              board={board}
              setBoard={setBoard}
              query={query}
              setQuery={setQuery}
              filter={filter}
              setFilter={setFilter}
              company={company}
              owner={owner}
              can={can}
              add={add}
              select={(r) =>
                r.module === "activities" ? openTask(r) : openRecord(r)
              }
              exportCSV={exportCSV}
              today={today}
              planFollowUp={planFollowUp}
              leadCriteria={leadCriteria}
              setLeadCriteria={setLeadCriteria}
              leadViews={state.leadViews || []}
              owners={state.owners}
              saveLeadView={saveLeadView}
              removeLeadView={removeLeadView}
            />
          )}

          {view === "settings" && (
            <>
              <div className="settings-tabs">
                {[
                  { id: "users", name: "Users", icon: Users },
                  { id: "roles", name: "Role Designer", icon: GitBranch },
                  {
                    id: "profiles",
                    name: "Permission Sets / Profiles",
                    icon: ShieldCheck,
                  },
                  { id: "audit", name: "Audit log", icon: Clock },
                ].map((t) => (
                  <button
                    key={t.id}
                    className={tab === t.id ? "active" : ""}
                    onClick={() => setTab(t.id)}
                  >
                    <t.icon size={17} />
                    {t.name}
                  </button>
                ))}
              </div>

              <section className="card">
                <div className="card-heading">
                  <div>
                    <h2>
                      {tab === "roles"
                        ? "Role hierarchy"
                        : tab === "profiles"
                          ? "Module permission sets"
                          : tab === "audit"
                            ? "Workspace audit trail"
                            : "Your team"}
                    </h2>
                    <p>
                      {tab === "roles"
                        ? "Upper roles see records of all subordinate roles. Peers keep their own records."
                        : tab === "profiles"
                          ? "Profiles control View, Create, Edit, and Delete independently for every module."
                          : tab === "audit"
                            ? "User, permission, and record changes are recorded automatically."
                            : "Assign a role and a profile to every user. Add their work email and assign their role and profile."}
                    </p>
                  </div>
                  {tab !== "audit" && can("administration", "create") && (
                    <button
                      className="primary"
                      onClick={() =>
                        setEditor({
                          kind:
                            tab === "roles"
                              ? "role"
                              : tab === "profiles"
                                ? "profile"
                                : "user",
                        })
                      }
                    >
                      <Plus size={16} />
                      Add{" "}
                      {tab === "roles"
                        ? "role"
                        : tab === "profiles"
                          ? "profile"
                          : "user"}
                    </button>
                  )}
                </div>

                {tab === "users" && (
                  <div className="table-scroll">
                    <table className="records-table">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Role</th>
                          <th>Profile</th>
                          <th>Status</th>
                          <th>Entry method</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {state.users.map((u) => (
                          <tr key={u.id}>
                            <td>
                              <div className="record-name">
                                <span className="avatar">
                                  {initials(u.name)}
                                </span>
                                <span>
                                  <strong>
                                    {u.name}
                                    {u.id === state.me.id ? " (you)" : ""}
                                  </strong>
                                  <small>{u.email}</small>
                                </span>
                              </div>
                            </td>
                            <td>
                              {state.roles.find((r) => r.id === u.roleId)?.name}
                            </td>
                            <td>
                              {
                                state.profiles.find((p) => p.id === u.profileId)
                                  ?.name
                              }
                            </td>
                            <td>
                              <Badge value={u.active ? "Active" : "Inactive"} />
                            </td>
                            <td>
                              <small>{u.id}</small>
                            </td>
                            <td>
                              {can("administration", "edit") && (
                                <button
                                  className="icon-button"
                                  aria-label={`Edit ${u.name}`}
                                  onClick={() =>
                                    setEditor({ kind: "user", item: u })
                                  }
                                >
                                  <Pencil size={16} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {tab === "roles" && (
                  <div className="role-list">
                    {[...state.roles]
                      .sort(
                        (a, b) =>
                          roleDepth(a, state.roles) - roleDepth(b, state.roles),
                      )
                      .map((r) => (
                        <div
                          className="role-row"
                          key={r.id}
                          style={{
                            marginLeft:
                              Math.min(roleDepth(r, state.roles), 5) * 28,
                          }}
                        >
                          <span className="role-symbol">
                            <GitBranch size={20} />
                          </span>
                          <div>
                            <strong>{r.name}</strong>
                            <small>
                              {r.parentId
                                ? `Reports to ${state.roles.find((p) => p.id === r.parentId)?.name}`
                                : "Top-level role"}{" "}
                              Â·{" "}
                              {
                                state.users.filter((u) => u.roleId === r.id)
                                  .length
                              }{" "}
                              users
                            </small>
                          </div>
                          <div className="row-actions">
                            {can("administration", "edit") && (
                              <button
                                className="icon-button"
                                aria-label={`Edit ${r.name}`}
                                onClick={() =>
                                  setEditor({ kind: "role", item: r })
                                }
                              >
                                <Pencil size={16} />
                              </button>
                            )}
                            {can("administration", "delete") && (
                              <button
                                className="icon-button"
                                aria-label={`Delete ${r.name}`}
                                onClick={() => setDeleteTarget(r)}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {tab === "profiles" && (
                  <div className="profile-grid">
                    {state.profiles.map((p) => (
                      <div className="profile-card" key={p.id}>
                        <div>
                          <span className="profile-symbol">
                            <ShieldCheck size={23} />
                          </span>
                          <div className="row-actions">
                            {can("administration", "edit") && (
                              <button
                                className="icon-button"
                                aria-label={`Edit ${p.name}`}
                                onClick={() =>
                                  setEditor({ kind: "profile", item: p })
                                }
                              >
                                <Pencil size={16} />
                              </button>
                            )}
                            {can("administration", "delete") && (
                              <button
                                className="icon-button"
                                aria-label={`Delete ${p.name}`}
                                onClick={() => setDeleteTarget(p)}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                        <h3>{p.name}</h3>
                        <p>
                          {
                            state.users.filter((u) => u.profileId === p.id)
                              .length
                          }{" "}
                          assigned users
                        </p>
                        <div className="profile-modules">
                          {Object.keys(fullPermissions()).map((m) => (
                            <span
                              key={m}
                              className={
                                p.permissions[m]?.view ? "enabled" : "disabled"
                              }
                            >
                              {modules[m]?.name || "Administration"}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {tab === "audit" && (
                  <div className="audit-list">
                    {state.audit.map((a) => (
                      <details key={a.id}>
                        <summary>
                          <span className="action-icon">
                            <Clock size={16} />
                          </span>
                          <span>
                            <strong>
                              {state.users.find((u) => u.id === a.actor_id)
                                ?.name || "Team member"}{" "}
                              <span className="subtle">{a.action}</span>
                            </strong>
                            <small>{a.target}</small>
                          </span>
                          <time>
                            {date(a.created_at)} Â·{" "}
                            {new Intl.DateTimeFormat("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "Asia/Kolkata",
                            }).format(new Date(a.created_at))}
                          </time>
                          <ChevronRight size={16} />
                        </summary>
                        <pre>
                          {JSON.stringify(JSON.parse(a.details), null, 2)}
                        </pre>
                      </details>
                    ))}
                  </div>
                )}
              </section>
              <div className="access-note">
                <ShieldCheck size={20} />
                <p>
                  <strong>Two settings. One access decision.</strong> The role
                  determines whose records a user can see. The profile
                  determines what they can do with them. Both are checked on the
                  server.
                </p>
              </div>
            </>
          )}

          <footer className="page-footer">
            <span>
              OHO CRM <span className="footer-dot">Â·</span> Built for better
              customer relationships
            </span>
            <span>India Standard Time</span>
          </footer>
        </main>
      </div>

      {notice && (
        <div className="toast" role="status">
          <CircleCheck size={18} />
          {notice}
          <button
            className="icon-button"
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {showLeadImport && (
        <ZohoLeadImport
          owners={state.owners}
          userId={state.me.id}
          close={() => setShowLeadImport(false)}
          save={save}
        />
      )}

      {selected &&
        !editor &&
        !convertTarget &&
        !transitionTarget &&
        !followUpTarget &&
        !meetingTarget && (
          <Detail
            loading={openingRecord}
            save={save}
            record={selected}
            state={state}
            close={closeRecord}
            edit={() =>
              setEditor({
                kind: "record",
                module: selected.module,
                item: selected,
              })
            }
            remove={() => setDeleteTarget(selected)}
            open={openRecord}
            add={add}
            can={(module, action) => !openingRecord && can(module, action)}
            company={company}
            owner={owner}
            updateStage={updateStage}
            convert={() => setConvertTarget(selected)}
            schedule={() => updateStage(selected, "Discovery scheduled")}
            addFollowUp={() =>
              setFollowUpTarget({ record: selected, mode: "add" })
            }
            planFollowUp={() => planFollowUp(selected)}
            completeFollowUp={() =>
              setFollowUpTarget({ record: selected, mode: "complete" })
            }
          />
        )}

      {transitionTarget && (
        <StageTransition
          record={transitionTarget.record}
          targetStage={transitionTarget.stage}
          records={state.records}
          canEditActivities={can("activities", "edit")}
          refresh={refreshTransition}
          close={() => setTransitionTarget(null)}
          save={save}
        />
      )}

      {followUpTarget && (
        <FollowUpDialog
          record={followUpTarget.record}
          mode={followUpTarget.mode}
          close={() => setFollowUpTarget(null)}
          save={save}
        />
      )}

      {meetingTarget && (
        <MeetingDialog
          record={meetingTarget}
          users={state.owners}
          close={() => setMeetingTarget(null)}
          save={save}
        />
      )}

      {convertTarget && (
        <ConvertLeadDialog
          lead={convertTarget}
          state={state}
          close={() => setConvertTarget(null)}
          save={async (payload) => {
            await save(payload);
            setConvertTarget(null);
            setSelected(null);
            navigate("opportunities");
            setNotice("Lead converted â€” opportunity created");
          }}
        />
      )}

      {editor && (
        <RecordEditor
          editor={editor}
          state={state}
          close={() => setEditor(null)}
          save={save}
        />
      )}

      {deleteTarget && (
        <div className="modal-overlay">
          <section
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <span className="empty-icon danger">
              <Trash2 size={26} />
            </span>
            <h2 id="delete-title">
              Delete{" "}
              {"title" in deleteTarget ? deleteTarget.title : deleteTarget.name}
              ?
            </h2>
            <p>
              This permanently removes this record. Records with linked data
              cannot be deleted.
            </p>
            <div className="dialog-actions">
              <button
                className="secondary"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                className="danger-button"
                disabled={deleting}
                onClick={() => void remove()}
              >
                {deleting ? "Deletingâ€¦" : "Delete record"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function roleDepth(role: Role, roles: Role[]) {
  let depth = 0;
  let id = role.parentId;
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    depth++;
    id = roles.find((r) => r.id === id)?.parentId || null;
  }
  return depth;
}

function Stat({
  label,
  value,
  note,
  icon: Icon,
  warning,
  onClick,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Building2;
  warning?: boolean;
  onClick: () => void;
}) {
  return (
    <button className="stat-card" onClick={onClick}>
      <div className="stat-top">
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <strong className={warning ? "danger" : ""}>{value}</strong>
      <small>
        {warning && <i className="warning-dot" />}
        {note}
        <ArrowUpRight size={13} />
      </small>
    </button>
  );
}

function Empty({
  icon: Icon,
  title,
  text,
  action,
  actionLabel,
}: {
  icon: typeof Building2;
  title: string;
  text: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={30} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action && (
        <button className="primary" onClick={action}>
          <Plus size={16} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function Detail({
  loading,
  save,
  record: r,
  state,
  close,
  edit,
  remove,
  open,
  add,
  can,
  company,
  owner,
  updateStage,
  convert,
  schedule,
  planFollowUp,
  completeFollowUp,
}: {
  loading: boolean;
  save: (p: Record<string, unknown>) => Promise<unknown>;
  record: CRMRecord;
  state: State;
  close: () => void;
  edit: () => void;
  remove: () => void;
  open: (r: CRMRecord) => void;
  add: (module: string, defaults?: Record<string, string>) => void;
  can: (m: string, a: Action) => boolean;
  company: (id: string | null) => string;
  owner: (id: string) => string;
  updateStage: (r: CRMRecord, stage: string) => void;
  convert: () => void;
  schedule: () => void;
  addFollowUp?: () => void;
  planFollowUp: () => void;
  completeFollowUp: () => void;
}) {
  const [detailTab, setDetailTab] = useState("Tasks");

  const Icon = icons[r.module];
  const linked = state.records.filter(
    (x) =>
      x.id !== r.id &&
      (x.companyId === r.id ||
        Object.values(x.data).includes(r.id) ||
        (r.module === "opportunities" &&
          r.data.enquiryId &&
          (x.id === r.data.enquiryId ||
            x.data.enquiryId === r.data.enquiryId))),
  );
  const bookedEnquiries = linked.filter((x) => x.module === "leadEnquiries");
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    container.current?.focus();
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [close]);
  useEffect(() => {
    const subtitle =
      container.current?.querySelector<HTMLElement>(".detail-title p");
    if (subtitle)
      subtitle.hidden =
        r.module === "enquiries" &&
        subtitle.textContent?.trim().toLowerCase() === "lead record";
  }, [r.id, r.module, r.companyId, r.data.companyName]);

  const linkTypes: Record<string, string> = {
    contact: "contacts",
    enquiry: "enquiries",
    opportunity: "opportunities",
    proposal: "proposals",
  };

  return (
    <div className="drawer-overlay" onClick={close}>
      <div
        className="detail-drawer"
        aria-busy={loading}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        tabIndex={-1}
        ref={container}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <span className="eyebrow">
            {modules[r.module].name.toUpperCase()} / RECORD DETAILS
          </span>
          <div className="drawer-top-actions">
            <RecordActions
              edit={
                can(r.module, "edit") &&
                !(r.module === "enquiries" && r.data.status === "Converted")
                  ? edit
                  : undefined
              }
              remove={
                can(r.module, "delete") &&
                !(r.module === "enquiries" && r.data.status === "Converted")
                  ? remove
                  : undefined
              }
            />
            <button
              className="icon-button"
              aria-label="Close record"
              onClick={close}
            >
              <X size={20} />
            </button>
          </div>
        </div>
        {loading && (
          <div role="status" aria-live="polite" className="record-loading">
            <span className="spinner" aria-hidden="true" />
            <span>Loading record details...</span>
          </div>
        )}
        <div className="detail-title">
          <span className="detail-symbol">
            <Icon size={27} />
          </span>
          <h2 id="detail-title">{r.title}</h2>
          <Badge value={r.data.status || r.data.stage || "Active"} />
          {r.module === "enquiries" && bookedEnquiries.length > 0 && (
            <span className="new-enquiry-tag">
              #NewEnquiry · {bookedEnquiries.length}
            </span>
          )}
          <p>
            {r.companyId
              ? company(r.companyId)
              : r.data.companyName ||
                r.data.industry ||
                `${modules[r.module].singular} record`}
          </p>
        </div>
        {["enquiries", "opportunities"].includes(r.module) && (
          <StageJourney
            record={r}
            events={state.stageHistory || []}
            editable={can(r.module, "edit")}
            canConvert={
              can("opportunities", "create") && canConvertLead(r.data)
            }
            choose={(stage) => updateStage(r, stage)}
            convert={convert}
            openOpportunity={() => {
              const opportunity = state.records.find(
                (x) => x.id === r.data.convertedOpportunityId,
              );
              if (opportunity) open(opportunity);
            }}
          />
        )}
        <div
          className="detail-tabs"
          role="tablist"
          aria-label="Record sections"
        >
          {(r.module === "opportunities"
            ? ["Tasks", "Proposals", "Timeline", "History", "Related"]
            : ["Tasks", "Timeline", "History", "Related"]
          ).map((t) => (
            <button
              role="tab"
              id={"record-tab-" + t}
              aria-selected={detailTab === t}
              aria-controls="record-tab-panel"
              key={t}
              className={detailTab === t ? "active" : ""}
              onClick={() => setDetailTab(t)}
            >
              {t === "Tasks" ? "Tasks & details" : t}
            </button>
          ))}
        </div>
        <div
          key={detailTab}
          id="record-tab-panel"
          role="tabpanel"
          aria-labelledby={"record-tab-" + detailTab}
          className="detail-tab-panel"
        >
          {detailTab === "Proposals" && (
            <ProposalVersions
              record={r}
              records={state.records}
              canSend={
                can("opportunities", "edit") && can("proposals", "create")
              }
              send={() => updateStage(r, "Proposal sent")}
              open={open}
            />
          )}{" "}
          {detailTab === "Tasks" && (
            <NoteComposer
              record={r}
              save={save}
              editable={can(r.module, "edit")}
            />
          )}{" "}
          {detailTab === "Tasks" && (
            <RecordTasks
              record={r}
              records={state.records}
              owner={owner}
              open={open}
              add={add}
              can={can}
              save={save}
              plan={planFollowUp}
              complete={completeFollowUp}
            />
          )}{" "}
          {detailTab === "Timeline" && (
            <RecordNotes
              record={r}
              events={(state.stageHistory || []).filter(
                (e) =>
                  e.recordId === r.id ||
                  (r.module === "opportunities" &&
                    e.recordId === r.data.enquiryId),
              )}
            />
          )}
          {detailTab === "History" && (
            <>
              <CompletedActivities
                record={r}
                records={state.records}
                open={open}
              />
              <details className="detail-history" open>
                <summary>Activity & stage history</summary>
                <StageHistory
                  events={(state.stageHistory || []).filter(
                    (e) =>
                      e.recordId === r.id ||
                      (r.module === "opportunities" &&
                        e.recordId === r.data.enquiryId),
                  )}
                />
              </details>
            </>
          )}
          {detailTab === "Tasks" && (
            <div className="detail-section">
              <h3>Record information</h3>
              <dl>
                <div>
                  <dt>Owner</dt>
                  <dd>{owner(r.ownerId)}</dd>
                </div>
                {r.companyId && (
                  <div>
                    <dt>Company</dt>
                    <dd>
                      {state.records.find((x) => x.id === r.companyId) ? (
                        <button
                          className="text-button"
                          onClick={() =>
                            open(
                              state.records.find((x) => x.id === r.companyId)!,
                            )
                          }
                        >
                          {company(r.companyId)}
                          <ArrowUpRight size={13} />
                        </button>
                      ) : (
                        company(r.companyId)
                      )}
                    </dd>
                  </div>
                )}
                {modules[r.module].fields
                  .filter(
                    (f) =>
                      f.type !== "time" &&
                      r.data[f.key] &&
                      ![
                        "status",
                        "stage",
                        "nextFollowUp",
                        "followUpAction",
                        "followUpTime",
                      ].includes(f.key),
                  )
                  .map((f) => {
                    const v = r.data[f.key];
                    const linkedRecord = linkTypes[f.type || ""]
                      ? state.records.find((x) => x.id === v)
                      : null;
                    return (
                      <div
                        key={f.key}
                        className={f.type === "textarea" ? "full-detail" : ""}
                      >
                        <dt>{f.label}</dt>
                        <dd>
                          {!v ? (
                            "â€”"
                          ) : linkedRecord ? (
                            <button
                              className="text-button"
                              onClick={() => open(linkedRecord)}
                            >
                              {linkedRecord.title}
                              <ArrowUpRight size={13} />
                            </button>
                          ) : f.type === "url" ? (
                            <a href={v} target="_blank" rel="noreferrer">
                              Open document / website <ExternalLink size={12} />
                            </a>
                          ) : f.type === "email" ? (
                            <a href={"mailto:" + v}>{v}</a>
                          ) : f.type === "date" ? (
                            date(v) +
                            (r.data[dateTimeKey(f.key, r.module)]
                              ? " Â· " +
                                r.data[dateTimeKey(f.key, r.module)] +
                                " IST"
                              : "")
                          ) : [
                              "amount",
                              "paidAmount",
                              "advanceAmount",
                            ].includes(f.key) ? (
                            new Intl.NumberFormat("en-IN", {
                              style: "currency",
                              currency: r.data.currency || "INR",
                            }).format(Number(v || 0))
                          ) : linkTypes[f.type || ""] ? (
                            "Linked record unavailable"
                          ) : (
                            v
                          )}
                        </dd>
                      </div>
                    );
                  })}
              </dl>
            </div>
          )}
          {detailTab === "Related" && (
            <div className="detail-section">
              <div className="card-heading compact">
                <h3>
                  Related records <span className="badge">{linked.length}</span>
                </h3>
                {r.module === "companies" && can("contacts", "create") && (
                  <button
                    className="text-button"
                    onClick={() => add("contacts", { companyId: r.id })}
                  >
                    <Plus size={14} />
                    Contact
                  </button>
                )}
                {r.module === "opportunities" && can("proposals", "create") && (
                  <button
                    className="text-button"
                    onClick={() =>
                      add("proposals", {
                        companyId: r.companyId || "",
                        opportunityId: r.id,
                        version: String(
                          Math.max(
                            0,
                            ...linked
                              .filter((x) => x.module === "proposals")
                              .map((x) => Number(x.data.version)),
                          ) + 1,
                        ),
                      })
                    }
                  >
                    <Plus size={14} />
                    Proposal version
                  </button>
                )}
              </div>
              {linked.length ? (
                linked.map((x) =>
                  x.module === "leadEnquiries" ? (
                    <article className="related-enquiry-card" key={x.id}>
                      <header>
                        <span>
                          <strong>{x.title}</strong>
                          <small>Enquiry information</small>
                        </span>
                        <Badge value={x.data.status || "Booked"} />
                      </header>
                      <dl>
                        {modules.leadEnquiries.fields
                          .filter(
                            (field) =>
                              field.key !== "enquiryId" && x.data[field.key],
                          )
                          .map((field) => (
                            <div
                              key={field.key}
                              className={
                                field.type === "textarea"
                                  ? "full-detail"
                                  : undefined
                              }
                            >
                              <dt>{field.label}</dt>
                              <dd>
                                {field.type === "date"
                                  ? date(x.data[field.key])
                                  : field.key.endsWith("Time") &&
                                      Number.isFinite(
                                        Date.parse(x.data[field.key]),
                                      )
                                    ? dateTime(x.data[field.key])
                                    : x.data[field.key]}
                              </dd>
                            </div>
                          ))}
                        <div>
                          <dt>OHO CRM created time</dt>
                          <dd>{dateTime(x.createdAt)}</dd>
                        </div>
                      </dl>
                    </article>
                  ) : (
                    <button
                      className="related-record"
                      key={x.id}
                      onClick={() => open(x)}
                    >
                      <span>
                        <strong>{x.title}</strong>
                        <small>
                          {modules[x.module].name}{" "}
                          {x.data.version ? "Â· Version " + x.data.version : ""}
                        </small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ),
                )
              ) : (
                <p className="subtle">No linked records yet.</p>
              )}
              {r.module === "companies" && (
                <div className="quick-add">
                  {["enquiries", "activities", "opportunities"]
                    .filter((m) => can(m, "create"))
                    .map((m) => (
                      <button
                        className="secondary"
                        key={m}
                        onClick={() => add(m, { companyId: r.id })}
                      >
                        <Plus size={14} />
                        {modules[m].singular}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="detail-meta">
          Created {date(r.createdAt)}
          <br />
          Last updated {date(r.updatedAt)}
        </div>
      </div>
    </div>
  );
}

function RecordEditor({
  editor: e,
  state,
  close,
  save,
}: {
  editor: Editor;
  state: State;
  close: () => void;
  save: (payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const item = e.item;
  const record =
    e.kind === "record" ? (item as CRMRecord | undefined) : undefined;

  const initial: Record<string, string> =
    e.kind === "record"
      ? {
          title: record?.title || "",
          companyId: record?.companyId || "",
          ownerId: record?.ownerId || state.me.id,
          ...record?.data,
          ...(e.module === "enquiries" && !record
            ? { receivedDate: indiaToday(), receivedTime: indiaTime() }
            : {}),
          ...e.defaults,
        }
      : e.kind === "user"
        ? {
            name: (item as Member)?.name || "",
            email: (item as Member)?.email || "",
            roleId: (item as Member)?.roleId || "",
            profileId: (item as Member)?.profileId || "",
            active: String((item as Member)?.active ?? 1),
          }
        : {
            name: (item as Role | Profile)?.name || "",
            parentId: (item as Role)?.parentId || "",
          };

  const [values, setValues] = useState(initial),
    [perms, setPerms] = useState<PermissionMap>(
      (item as Profile)?.permissions ||
        Object.fromEntries(
          Object.keys(fullPermissions()).map((k) => [
            k,
            { view: false, create: false, edit: false, delete: false },
          ]),
        ),
    ),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState("");

  const form = useRef<HTMLFormElement>(null);
  const priorFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    priorFocus.current = document.activeElement as HTMLElement;
    form.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      priorFocus.current?.focus();
    };
  }, []);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) close();
      if (event.key === "Tab" && form.current) {
        const nodes = Array.from(
          form.current.querySelectorAll<HTMLElement>(
            "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])",
          ),
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [busy, close]);

  const set = (key: string, value: string) =>
    setValues((v) => ({
      ...v,
      [key]: value,
      ...(key === "companyId"
        ? { contactId: "", enquiryId: "", opportunityId: "", proposalId: "" }
        : {}),
    }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const payload: Record<string, unknown> = {
        kind: e.kind,
        operation: item ? "edit" : "create",
        id: item?.id,
      };

      if (e.kind === "record") {
        const data = Object.fromEntries(
          modules[e.module!].fields.map((f) => [
            f.key,
            values[f.key] ?? f.options?.[0] ?? (f.key === "version" ? "1" : ""),
          ]),
        );
        Object.assign(payload, {
          module: e.module,
          title: values.title,
          ownerId: values.ownerId,
          companyId: values.companyId,
          data,
        });
      } else if (e.kind === "profile")
        Object.assign(payload, { name: values.name, permissions: perms });
      else if (e.kind === "user")
        Object.assign(payload, { ...values, active: values.active === "1" });
      else
        Object.assign(payload, {
          name: values.name,
          parentId: values.parentId,
        });

      await save(payload);
      close();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }

  function input(f: Field) {
    const linkTypes: Record<string, string> = {
      contact: "contacts",
      enquiry: "enquiries",
      opportunity: "opportunities",
      proposal: "proposals",
    };
    const linkModule = linkTypes[f.type || ""];

    const common = {
      id: "field-" + f.key,
      required:
        !!f.required || (f.key === "followUpAction" && !!values.nextFollowUp),
      disabled: busy,
    };

    if (linkModule)
      return (
        <RecordLookup
          {...common}
          module={linkModule}
          value={values[f.key] || ""}
          onChange={(value) => set(f.key, value)}
          label={f.label}
          companyId={values.companyId || undefined}
          accepted={
            (e.module === "invoices" && f.key === "proposalId") ||
            (e.module === "projects" && f.key === "opportunityId")
          }
          initial={state.records}
        />
      );

    if (
      ["enquiries", "opportunities"].includes(e.module || "") &&
      (f.key === "status" || f.key === "stage")
    )
      return (
        <>
          <input
            {...common}
            readOnly
            value={
              record
                ? record.data[f.key]
                : e.module === "enquiries"
                  ? "New Lead"
                  : "Solution planning"
            }
          />
          <small className="form-note">
            Use Change stage on the record to capture the required stage
            information.
          </small>
        </>
      );

    if (f.key === "notInterestedReason")
      return (
        <Select
          {...common}
          value={values[f.key] || ""}
          onChange={(event) => set(f.key, event.target.value)}
        >
          <option value="">None</option>
          {[
            ...disqualificationReasons,
            ...(values[f.key] &&
            !disqualificationReasons.includes(values[f.key])
              ? [values[f.key]]
              : []),
          ].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>
      );

    if (f.options)
      return (
        <Select
          {...common}
          value={values[f.key] ?? f.options[0]}
          onChange={(event) => set(f.key, event.target.value)}
        >
          {f.options
            .filter((v) => !(e.module === "enquiries" && v === "Converted"))
            .map((v) => (
              <option key={v} value={v}>
                {v || "None"}
              </option>
            ))}
        </Select>
      );

    if (f.type === "date")
      return (
        <DateTimePicker
          {...common}
          label={f.label + " & time"}
          date={values[f.key] || ""}
          time={values[dateTimeKey(f.key, e.module)] || ""}
          onChange={(date, time) =>
            setValues((v) => ({
              ...v,
              [f.key]: date,
              [dateTimeKey(f.key, e.module)]: time,
            }))
          }
        />
      );

    if (f.type === "textarea")
      return (
        <textarea
          {...common}
          rows={3}
          value={values[f.key] || ""}
          onChange={(event) => set(f.key, event.target.value)}
        />
      );

    return (
      <input
        {...common}
        type={f.type || "text"}
        value={values[f.key] || ""}
        min={f.type === "number" ? (f.key === "version" ? 1 : 0) : undefined}
        step={f.key === "version" ? 1 : "any"}
        onChange={(event) => set(f.key, event.target.value)}
      />
    );
  }

  return (
    <div className="modal-overlay">
      <form
        className={"editor-dialog " + (e.kind === "profile" ? "wide" : "")}
        onSubmit={submit}
        ref={form}
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
      >
        <div className="editor-heading">
          <div>
            <span className="eyebrow">
              {e.kind === "record" ? "CUSTOMER WORKSPACE" : "ADMINISTRATION"}
            </span>
            <h2 id="editor-title">
              {item ? "Edit" : "Add"}{" "}
              {e.kind === "record"
                ? modules[e.module!].singular
                : e.kind === "profile"
                  ? "permission set / profile"
                  : e.kind}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            disabled={busy}
            aria-label="Close editor"
            onClick={close}
          >
            <X size={21} />
          </button>
        </div>
        <div className="editor-body">
          {err && (
            <div className="error-banner" role="alert">
              <AlertCircle size={16} />
              {err}
            </div>
          )}

          <div className="form-grid">
            {e.kind === "record" ? (
              <>
                <label className="full">
                  <span>
                    Name / title <em>*</em>
                  </span>
                  <input
                    id="record-title"
                    required
                    maxLength={180}
                    value={values.title}
                    onChange={(event) => set("title", event.target.value)}
                    disabled={busy}
                  />
                </label>
                {e.module !== "companies" && (
                  <label>
                    <span>
                      Company{" "}
                      {[
                        "contacts",
                        "opportunities",
                        "proposals",
                        "invoices",
                        "projects",
                      ].includes(e.module!) && <em>*</em>}
                    </span>
                    <RecordLookup
                      module="companies"
                      label="Company"
                      required={[
                        "contacts",
                        "opportunities",
                        "proposals",
                        "invoices",
                        "projects",
                      ].includes(e.module!)}
                      value={values.companyId || ""}
                      onChange={(value) => set("companyId", value)}
                      disabled={busy}
                      initial={state.records}
                    />
                  </label>
                )}
                <label className={e.module === "companies" ? "full" : ""}>
                  <span>
                    Record owner <em>*</em>
                  </span>
                  <Select
                    value={values.ownerId}
                    required
                    disabled={busy}
                    onChange={(event) => set("ownerId", event.target.value)}
                  >
                    {state.owners
                      .filter((u) => u.active)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                          {u.id === state.me.id ? " (you)" : ""}
                        </option>
                      ))}
                  </Select>
                </label>
                {modules[e.module!].fields
                  .filter(
                    (f) =>
                      f.type !== "time" &&
                      f.key !== "contactDate" &&
                      !(e.module === "enquiries" && f.key === "contactId") &&
                      f.key !== "acceptedProposalId" &&
                      !f.key.startsWith("zohoCRM"),
                  )
                  .map((f) => (
                    <label
                      key={f.key}
                      htmlFor={"field-" + f.key}
                      className={f.type === "textarea" ? "full" : ""}
                    >
                      <span>
                        {f.label}
                        {f.type === "date" ? " & time" : ""}{" "}
                        {(f.required ||
                          (f.key === "followUpAction" &&
                            !!values.nextFollowUp)) && <em>*</em>}
                      </span>
                      {input(f)}
                    </label>
                  ))}
                {e.module === "invoices" && (
                  <p className="form-note full">
                    Record an invoice created externally. Match the payment
                    status to the amount received; add a follow-up date to track
                    collection.
                  </p>
                )}
                {e.module === "proposals" && (
                  <p className="form-note full">
                    Create a separate record for each version. Acceptance
                    requires a date and the person who accepted. Accepted
                    versions are retained.
                  </p>
                )}
              </>
            ) : (
              <>
                <label className="full">
                  <span>
                    {e.kind === "user"
                      ? "Full name"
                      : e.kind === "role"
                        ? "Role name"
                        : "Profile name"}{" "}
                    <em>*</em>
                  </span>
                  <input
                    required
                    maxLength={100}
                    value={values.name}
                    onChange={(event) => set("name", event.target.value)}
                    disabled={busy}
                  />
                </label>
                {e.kind === "role" && (
                  <label className="full">
                    <span>Reports to</span>
                    <Select
                      value={values.parentId}
                      onChange={(event) => set("parentId", event.target.value)}
                      disabled={busy}
                    >
                      <option value="">Top-level role</option>
                      {state.roles
                        .filter((r) => r.id !== item?.id)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                    </Select>
                    <small className="form-note">
                      Users in this role can see their own records and those
                      belonging to subordinate roles.
                    </small>
                  </label>
                )}
                {e.kind === "user" && (
                  <>
                    <label className="full">
                      <span>
                        User email <em>*</em>
                      </span>
                      <input
                        type="email"
                        required
                        value={values.email}
                        disabled={busy}
                        onChange={(event) => set("email", event.target.value)}
                      />
                      <small className="form-note">
                        This email selects the user and their assigned role and
                        profile.
                      </small>
                    </label>
                    <label>
                      <span>
                        Role <em>*</em>
                      </span>
                      <Select
                        value={values.roleId}
                        required
                        disabled={busy}
                        onChange={(event) => set("roleId", event.target.value)}
                      >
                        <option value="">Select role</option>
                        {state.roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label>
                      <span>
                        Permission set / profile <em>*</em>
                      </span>
                      <Select
                        value={values.profileId}
                        required
                        disabled={busy}
                        onChange={(event) =>
                          set("profileId", event.target.value)
                        }
                      >
                        <option value="">Select profile</option>
                        {state.profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label>
                      <span>Account status</span>
                      <Select
                        value={values.active}
                        disabled={busy}
                        onChange={(event) => set("active", event.target.value)}
                      >
                        <option value="1">Active</option>
                        <option value="0">Inactive</option>
                      </Select>
                    </label>
                  </>
                )}
              </>
            )}
          </div>

          {e.kind === "profile" && (
            <>
              <p className="form-note">
                Choose the permitted actions for each module. View is required
                for any other action to take effect.
              </p>
              <table className="permission-table">
                <thead>
                  <tr>
                    <th>Module</th>
                    {(["view", "create", "edit", "delete"] as Action[]).map(
                      (a) => (
                        <th key={a}>{a}</th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(fullPermissions()).map((m) => (
                    <tr key={m}>
                      <td>{modules[m]?.name || "Administration"}</td>
                      {(["view", "create", "edit", "delete"] as Action[]).map(
                        (a) => (
                          <td key={a}>
                            <input
                              aria-label={`${modules[m]?.name || "Administration"} ${a}`}
                              type="checkbox"
                              checked={!!perms[m]?.[a]}
                              disabled={busy}
                              onChange={(event) =>
                                setPerms((p) => ({
                                  ...p,
                                  [m]: {
                                    ...p[m],
                                    [a]: event.target.checked,
                                    ...(a !== "view" && event.target.checked
                                      ? { view: true }
                                      : {}),
                                  },
                                }))
                              }
                            />
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
        <div className="editor-footer">
          <span>
            <ShieldCheck size={14} />
            Access follows role + profile
          </span>
          <div>
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={close}
            >
              Cancel
            </button>
            <button className="primary" disabled={busy} type="submit">
              {busy
                ? "Savingâ€¦"
                : item
                  ? "Save changes"
                  : "Create " +
                    (e.kind === "record"
                      ? modules[e.module!].singular
                      : e.kind === "profile"
                        ? "profile"
                        : e.kind)}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
