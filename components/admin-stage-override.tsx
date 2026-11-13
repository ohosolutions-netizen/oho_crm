"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, ShieldCheck, X } from "lucide-react";
import { leadStages, type CRMRecord } from "../lib/model";

type Props = {
  record: CRMRecord;
  close: () => void;
  save: (payload: Record<string, unknown>) => Promise<unknown>;
};

export default function AdminStageOverride({ record, close, save }: Props) {
  const current = record.data.status || "New Lead";
  const options = leadStages.filter(
    (stage) => stage !== current && stage !== "Converted",
  );
  const [stage, setStage] = useState(options[0] || "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    form.current?.querySelector<HTMLElement>("select")?.focus();
  }, []);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) close();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [busy, close]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await save({
        kind: "stage-override",
        operation: "edit",
        id: record.id,
        targetStage: stage,
        reason: reason.trim(),
        expectedUpdatedAt: record.updatedAt,
      });
      close();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to update the stage.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <form
        ref={form}
        className="editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-stage-title"
        onSubmit={submit}
      >
        <div className="editor-heading">
          <div>
            <span className="eyebrow">ADMINISTRATOR / {record.title}</span>
            <h2 id="admin-stage-title">Edit lead stage</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close stage editor"
            disabled={busy}
            onClick={close}
          >
            <X size={21} />
          </button>
        </div>
        <div className="editor-body">
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} />
              {error}
            </div>
          )}
          <p className="form-note">
            <ShieldCheck size={17} /> This administrator action bypasses the
            normal lead journey. The reason will be retained in Timeline and
            History.
          </p>
          <div className="form-grid">
            <label>
              <span>Current stage</span>
              <input value={current} disabled />
            </label>
            <label>
              <span>New stage *</span>
              <select
                required
                value={stage}
                disabled={busy}
                onChange={(event) => setStage(event.target.value)}
              >
                {options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="full">
              <span>Reason for changing the stage *</span>
              <textarea
                required
                rows={4}
                maxLength={1000}
                value={reason}
                disabled={busy}
                placeholder="Explain why this stage is being corrected"
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="editor-footer">
          <span>Converted leads must use the conversion workflow.</span>
          <div>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={close}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary"
              disabled={busy || !stage || !reason.trim()}
            >
              {busy ? "Updating…" : "Update stage"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
