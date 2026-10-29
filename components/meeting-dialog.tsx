"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Search,
  Users,
  X,
} from "lucide-react";
import type { CRMRecord } from "../lib/model";
import DateTimePicker, { indiaTime } from "./date-time-picker";
import Select from "./select";

type User = { id: string; name: string; active: number };
type Props = {
  record: CRMRecord;
  users: User[];
  close: () => void;
  save: (payload: Record<string, unknown>) => Promise<unknown>;
};

export default function MeetingDialog({ record, users, close, save }: Props) {
  const [values, setValues] = useState({
    meetingMode: "Online",
    status: "Scheduled",
    dueDate: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
    }).format(new Date()),
    time: indiaTime(),
    location: "",
    notes: "",
  });
  const [participants, setParticipants] = useState<string[]>([record.ownerId]);
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantOpen, setParticipantOpen] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  useEffect(
    () => form.current?.querySelector<HTMLElement>("[role=combobox]")?.focus(),
    [],
  );
  const set = (key: string, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const activeUsers = users.filter((user) => user.active);
  const matchingUsers = activeUsers.filter((user) =>
    user.name.toLowerCase().includes(participantSearch.trim().toLowerCase()),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!participants.length) {
      setError("Select at least one participant.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const participantNames = participants
        .map((id) => users.find((user) => user.id === id)?.name)
        .filter(Boolean)
        .join(", ");
      await save({
        kind: "record",
        operation: "create",
        module: "activities",
        title: `${values.meetingMode} meeting · ${record.title}`,
        ownerId: record.ownerId,
        companyId: record.companyId || "",
        data: {
          contactId: record.data.contactId || "",
          enquiryId: record.module === "enquiries" ? record.id : "",
          opportunityId: record.module === "opportunities" ? record.id : "",
          type: `${values.meetingMode} meeting`,
          meetingMode: values.meetingMode,
          participants: participants.join(","),
          participantNames,
          dueDate: values.dueDate,
          time: values.time,
          status: values.status,
          outcome: values.status === "Completed" ? "Completed" : "Pending",
          stageContext: record.data.status || record.data.stage || "",
          location: values.location,
          notes: values.notes,
        },
      });
      close();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save meeting.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-overlay">
      <form
        className="editor-dialog meeting-dialog"
        onSubmit={submit}
        ref={form}
        role="dialog"
        aria-modal="true"
        aria-labelledby="meeting-title"
      >
        <div className="editor-heading">
          <div>
            <span className="eyebrow">MEETING / {record.title}</span>
            <h2 id="meeting-title">Log meeting</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={close}
            disabled={busy}
            aria-label="Close meeting form"
          >
            <X size={20} />
          </button>
        </div>
        <div className="editor-body">
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={17} />
              {error}
            </div>
          )}
          <div className="form-grid">
            <label>
              <span>
                Online or offline <em>*</em>
              </span>
              <Select
                value={values.meetingMode}
                disabled={busy}
                onChange={(event) => set("meetingMode", event.target.value)}
              >
                <option>Online</option>
                <option>Offline</option>
              </Select>
            </label>
            <label>
              <span>
                Meeting status <em>*</em>
              </span>
              <Select
                value={values.status}
                disabled={busy}
                onChange={(event) => set("status", event.target.value)}
              >
                <option>Scheduled</option>
                <option>Completed</option>
              </Select>
            </label>
            <label className="full">
              <span>
                Meeting date & time <em>*</em>
              </span>
              <DateTimePicker
                label="Meeting date & time"
                required
                date={values.dueDate}
                time={values.time}
                disabled={busy}
                onChange={(date, time) =>
                  setValues((current) => ({ ...current, dueDate: date, time }))
                }
              />
            </label>
            <div className="meeting-participants full">
              <span className="meeting-participants-label">
                <Users size={15} />
                Participants <em>*</em>
              </span>
              <button
                type="button"
                className="meeting-participants-trigger"
                aria-haspopup="listbox"
                aria-expanded={participantOpen}
                disabled={busy}
                onClick={() => setParticipantOpen((open) => !open)}
              >
                <span>
                  {participants.length
                    ? participants
                        .map(
                          (id) =>
                            activeUsers.find((user) => user.id === id)?.name,
                        )
                        .filter(Boolean)
                        .join(", ")
                    : "Select participants"}
                </span>
                <ChevronDown size={16} />
              </button>
              {participantOpen && (
                <div className="meeting-participants-dropdown">
                  <div className="meeting-participant-search">
                    <Search size={15} />
                    <input
                      autoFocus
                      type="search"
                      value={participantSearch}
                      disabled={busy}
                      onChange={(event) =>
                        setParticipantSearch(event.target.value)
                      }
                      placeholder="Search users…"
                      aria-label="Search participants"
                    />
                  </div>
                  <div
                    className="meeting-participant-options"
                    role="listbox"
                    aria-multiselectable="true"
                  >
                    {matchingUsers.map((user) => {
                      const selected = participants.includes(user.id);
                      return (
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={selected ? "selected" : ""}
                          key={user.id}
                          onClick={() =>
                            setParticipants((current) =>
                              selected
                                ? current.filter((id) => id !== user.id)
                                : [...current, user.id],
                            )
                          }
                        >
                          <span>{user.name}</span>
                          {selected && <Check size={15} />}
                        </button>
                      );
                    })}
                    {!matchingUsers.length && <p>No matching users.</p>}
                  </div>
                  <div className="meeting-participants-done">
                    <span>{participants.length} selected</span>
                    <button
                      type="button"
                      onClick={() => setParticipantOpen(false)}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
            <label className="full">
              <span>
                {values.meetingMode === "Online" ? "Meeting link" : "Location"}
              </span>
              <input
                value={values.location}
                disabled={busy}
                onChange={(event) => set("location", event.target.value)}
              />
            </label>
            <label className="full">
              <span>Notes</span>
              <textarea
                rows={3}
                value={values.notes}
                disabled={busy}
                onChange={(event) => set("notes", event.target.value)}
                placeholder="Discussion or next steps"
              />
            </label>
          </div>
        </div>
        <div className="editor-footer">
          <span>Saved to tasks and History</span>
          <div>
            <button
              type="button"
              className="secondary"
              onClick={close}
              disabled={busy}
            >
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              {busy
                ? "Saving…"
                : values.status === "Completed"
                  ? "Log completed meeting"
                  : "Schedule meeting"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
