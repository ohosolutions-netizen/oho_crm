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
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);
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
              Starts at <strong>Solution planning</strong>, then Proposal
              preparation → Proposal sent → Negotiation.
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
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Converting…" : "Convert lead"}
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
