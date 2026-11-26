"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, ArrowRight, Check, Plus, X } from "lucide-react";
import { followUpDate, type CRMRecord, type PermissionMap } from "../lib/model";
import DateTimePicker from "./date-time-picker";
import RecordLookup from "./record-lookup";

type Props = {
  lead: CRMRecord;
  state: { records: CRMRecord[]; permissions: PermissionMap };
  close: () => void;
  save: (p: Record<string, unknown>) => Promise<void>;
};

export default function ConvertLeadDialog({ lead, state, close, save }: Props) {
  const [v, setV] = useState({
    title: lead.title,
    companyId: lead.companyId || "",
    companyName: lead.data.companyName || "",
    companyWebsite: "",
    contactId: lead.data.contactId || "",
    contactName: lead.data.contactName || "",
    email: lead.data.email || "",
    phone: lead.data.phone || "",
    amount: "",
    expectedClose: "",
    expectedCloseTime: "",
    followUpTime: lead.data.followUpTime || "",
    nextFollowUp: followUpDate(lead),
    followUpAction:
      lead.data.followUpAction || "Follow up on the proposed solution",
  });
  const [createCompany, setCreateCompany] = useState(false),
    [createContact, setCreateContact] = useState(false),
    [existingOpportunity, setExistingOpportunity] = useState<{
      id: string;
      title: string;
    } | null>(null),
    [companyResolution, setCompanyResolution] = useState<
      "idle" | "checking" | "matched" | "missing"
    >(lead.companyId || !lead.data.companyName?.trim() ? "idle" : "checking"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    const params = new URLSearchParams({
      mode: "conversion-check",
      leadId: lead.id,
    });
    fetch("/api/crm?" + params, { signal: abort.signal })
      .then(async (response) => {
        const body = (await response.json()) as {
          opportunity?: { id: string; title: string } | null;
          error?: string;
        };
        if (!response.ok)
          throw new Error(body.error || "Unable to check this lead.");
        if (!abort.signal.aborted)
          setExistingOpportunity(body.opportunity || null);
      })
      .catch((caught) => {
        if (!abort.signal.aborted)
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to check this lead.",
          );
      });
    return () => abort.abort();
  }, [lead.id]);
  useEffect(() => {
    const companyName = lead.data.companyName?.trim();
    if (lead.companyId || !companyName) return;
    const abort = new AbortController();
    const params = new URLSearchParams({
      mode: "lookup",
      module: "companies",
      search: companyName,
      globalCompanies: "1",
    });
    fetch("/api/crm?" + params, { signal: abort.signal })
      .then(async (response) => {
        const body = (await response.json()) as {
          records?: CRMRecord[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(body.error || "Unable to check the lead company.");
        const normalized = companyName.toLocaleLowerCase();
        const company = body.records?.find(
          (record) => record.title.trim().toLocaleLowerCase() === normalized,
        );
        if (company) {
          setV((current) => ({ ...current, companyId: company.id }));
          setCompanyResolution("matched");
        } else {
          setCreateCompany(true);
          setCreateContact(true);
          setCompanyResolution("missing");
        }
      })
      .catch((caught) => {
        if (!abort.signal.aborted) {
          setCompanyResolution("idle");
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to check the lead company.",
          );
        }
      });
    return () => abort.abort();
  }, [lead.companyId, lead.data.companyName]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) close();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [busy, close]);
  const set = (key: string, value: string) =>
    setV((current) => ({
      ...current,
      [key]: value,
      ...(key === "companyId" ? { contactId: "" } : {}),
    }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await save({
        kind: "convert",
        operation: "create",
        leadId: lead.id,
        confirmExistingOpportunity: Boolean(existingOpportunity),
        ...v,
        createCompany,
        createContact: createCompany || createContact,
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to convert lead.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <form
        className="editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversion-title"
        onSubmit={submit}
        ref={form}
      >
        <div className="editor-heading">
          <div>
            <span className="eyebrow">LEAD → OPPORTUNITY</span>
            <h2 id="conversion-title">Convert to opportunity</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={close}
            disabled={busy}
            aria-label="Close conversion"
          >
            <X size={20} />
          </button>
        </div>
        <div className="editor-body">
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
          {existingOpportunity && (
            <div className="error-banner" role="status">
              <AlertCircle size={16} />
              Opportunity “{existingOpportunity.title}” already exists from
              migrated data. Continuing will archive this lead as Converted
              and repair its company link. No new opportunity will be created.
            </div>
          )}
          <p className="conversion-intro">
            Select the company and contact for this opportunity, or create them
            here without leaving the conversion.
          </p>
          <div className="form-grid">
            <label className="full">
              <span>
                Opportunity name <em>*</em>
              </span>
              <input
                required
                maxLength={180}
                value={v.title}
                onChange={(e) => set("title", e.target.value)}
                disabled={busy}
              />
            </label>
            {!createCompany ? (
              <div className="full conversion-lookup-block">
                <label>
                  <span>
                    Company <em>*</em>
                  </span>
                  <RecordLookup
                    module="companies"
                    globalCompanies
                    label="Company"
                    value={v.companyId}
                    onChange={(value) => {
                      set("companyId", value);
                      setCreateContact(false);
                    }}
                    disabled={busy}
                    required
                    emptyLabel="Select an existing company"
                    initial={state.records}
                  />
                </label>
                <button
                  type="button"
                  className="text-button conversion-create-link"
                  disabled={busy}
                  onClick={() => {
                    setCreateCompany(true);
                    setCreateContact(true);
                    set("companyId", "");
                  }}
                >
                  <Plus size={14} />
                  Add a new company
                </button>
                {companyResolution === "checking" && (
                  <small>Checking the company saved on this lead…</small>
                )}
                {companyResolution === "matched" && (
                  <small>
                    Matched and selected the company saved on this lead.
                  </small>
                )}
              </div>
            ) : (
              <section className="full conversion-create-panel">
                <div className="conversion-create-heading">
                  <strong>New company</strong>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      setCreateCompany(false);
                      setCreateContact(false);
                    }}
                  >
                    Select existing
                  </button>
                </div>
                {companyResolution === "missing" && (
                  <p className="field-help">
                    This lead had a company name but no linked Company record.
                    Complete the details below to create and link it during
                    conversion.
                  </p>
                )}
                <div className="form-grid">
                  <label>
                    <span>
                      Company name <em>*</em>
                    </span>
                    <input
                      required
                      maxLength={180}
                      value={v.companyName}
                      disabled={busy}
                      onChange={(e) => set("companyName", e.target.value)}
                    />
                  </label>
                  <label>
                    <span>
                      Company website <em>*</em>
                    </span>
                    <input
                      required
                      type="url"
                      placeholder="https://company.com"
                      value={v.companyWebsite}
                      disabled={busy}
                      onChange={(e) => set("companyWebsite", e.target.value)}
                    />
                  </label>
                </div>
              </section>
            )}
            {(v.companyId || createCompany) && !createContact ? (
              <div className="full conversion-lookup-block">
                <label>
                  <span>
                    Contact <em>*</em>
                  </span>
                  <RecordLookup
                    module="contacts"
                    companyId={v.companyId}
                    label="Contact"
                    value={v.contactId}
                    onChange={(value) => set("contactId", value)}
                    disabled={busy}
                    required
                    emptyLabel="Select an existing contact"
                    initial={state.records}
                  />
                </label>
                <button
                  type="button"
                  className="text-button conversion-create-link"
                  disabled={busy}
                  onClick={() => {
                    setCreateContact(true);
                    set("contactId", "");
                  }}
                >
                  <Plus size={14} />
                  Add a new contact
                </button>
              </div>
            ) : (v.companyId || createCompany) && createContact ? (
              <section className="full conversion-create-panel">
                <div className="conversion-create-heading">
                  <strong>New contact</strong>
                  {!createCompany && (
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() => setCreateContact(false)}
                    >
                      Select existing
                    </button>
                  )}
                </div>
                <div className="form-grid">
                  <label className="full">
                    <span>
                      Contact name <em>*</em>
                    </span>
                    <input
                      required
                      value={v.contactName}
                      disabled={busy}
                      onChange={(e) => set("contactName", e.target.value)}
                    />
                  </label>
                  <label>
                    <span>
                      Contact phone <em>*</em>
                    </span>
                    <input
                      required
                      type="tel"
                      value={v.phone}
                      disabled={busy}
                      onChange={(e) => set("phone", e.target.value)}
                    />
                  </label>
                  <label>
                    <span>Contact email</span>
                    <input
                      type="email"
                      value={v.email}
                      disabled={busy}
                      onChange={(e) => set("email", e.target.value)}
                    />
                  </label>
                </div>
              </section>
            ) : null}
            <label>
              <span>Expected close date & time</span>
              <DateTimePicker
                label="Expected close date & time"
                date={v.expectedClose}
                time={v.expectedCloseTime}
                disabled={busy}
                onChange={(date, time) =>
                  setV((current) => ({
                    ...current,
                    expectedClose: date,
                    expectedCloseTime: time,
                  }))
                }
              />
            </label>
            <label className="full">
              <span>Next follow-up date & time</span>
              <DateTimePicker
                label="Next follow-up date & time"
                date={v.nextFollowUp}
                time={v.followUpTime}
                disabled={busy}
                onChange={(date, time) =>
                  setV((current) => ({
                    ...current,
                    nextFollowUp: date,
                    followUpTime: time,
                  }))
                }
              />
            </label>
            {v.nextFollowUp && (
              <label className="full">
                <span>
                  Follow-up action <em>*</em>
                </span>
                <textarea
                  required
                  value={v.followUpAction}
                  disabled={busy}
                  rows={2}
                  onChange={(e) => set("followUpAction", e.target.value)}
                />
              </label>
            )}
          </div>
          <div className="conversion-summary">
            <Check size={16} />
            <span>
              {existingOpportunity ? (
                <>The existing opportunity and its stage will be retained.</>
              ) : (
                <>
                  Starts at <strong>Solution planning</strong>, then Proposal
                  preparation → Proposal sent → Negotiation.
                </>
              )}
            </span>
          </div>
        </div>
        <div className="editor-footer">
          <span>Lead history is retained</span>
          <div>
            <button
              type="button"
              className="secondary"
              onClick={close}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary"
              formNoValidate={Boolean(existingOpportunity)}
              disabled={busy}
            >
              {busy
                ? "Converting…"
                : existingOpportunity
                  ? "Archive as converted"
                  : "Convert lead"}
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
