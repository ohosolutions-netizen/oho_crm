"use client";
import { allowedNextStages } from "../lib/stage-path";
import { ArrowRight, CalendarPlus, Video } from "lucide-react";
import {
  leadStages,
  leadPrimaryStages,
  leadFollowupStages,
  stages,
  type CRMRecord,
} from "../lib/model";
import type { StageEvent } from "../lib/stage-rules";
import { stageColor } from "../lib/stage-colors";
function timestamp(value: string) {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
    timeZoneName: "short",
  }).format(parsed);
}
export default function StageJourney({
  record: r,
  events,
  editable,
  canConvert,
  choose,
  convert,
  openOpportunity,
}: {
  record: CRMRecord;
  events: StageEvent[];
  editable: boolean;
  canConvert: boolean;
  choose: (stage: string) => void;
  convert: () => void;
  openOpportunity: () => void;
}) {
  const lead = r.module === "enquiries",
    current = lead ? r.data.status : r.data.stage,
    visited = new Set(
      events.filter((e) => e.recordId === r.id).map((e) => e.toStage),
    ),
    options = lead ? leadStages : stages;
  const main = lead
      ? leadPrimaryStages
      : options.filter((s) => s !== "Closed lost"),
    secondary = lead ? leadFollowupStages : [],
    alternate = options.filter(
      (s) => !main.includes(s) && !secondary.includes(s),
    ),
    converted = lead && current === "Converted";
  function step(s: string) {
    const active = s === current,
      seen = visited.has(s) && !active,
      disabled =
        active ||
        !allowedNextStages(r.module, current).includes(s) ||
        converted ||
        !editable ||
        (s === "Converted" && !canConvert),
      visits = events.filter(
        (e) => e.recordId === r.id && e.toStage === s,
      ).length;
    return (
      <button
        key={s}
        className={
          "journey-step " +
          stageColor(s) +
          (active ? " current" : "") +
          (seen ? " visited" : "")
        }
        aria-current={active ? "step" : undefined}
        disabled={disabled}
        aria-label={s + (active ? " — current stage" : "")}
        onClick={() => (s === "Converted" ? convert() : choose(s))}
      >
        <span className="journey-label-text">
          <span>{s}</span>
          {!lead && s === "Proposal preparation" && visits > 1 && (
            <span
              className="journey-repeat-count"
              title={`${visits} proposal preparation cycles`}
            >
              {visits}
            </span>
          )}
        </span>
      </button>
    );
  }
  return (
    <section
      className={
        "detail-section journey-section " +
        (lead ? "lead-journey" : "opportunity-journey")
      }
    >
      <div className="card-heading compact">
        <h3>{lead ? "Lead journey" : "Opportunity journey"}</h3>
        <div className="journey-current-block">
          <span className="journey-current">
            {current === "Connected" ? "Previous stage" : current}
          </span>
          {lead && Number(r.data.notContactedAttemptCount || 0) >= 3 && (
            <span className="attempt-tag">#3AttemptsCompleted</span>
          )}
          {editable &&
            ![
              "Converted",
              "Junk Lead",
              "Lead Lost",
              "Accepted",
              "Closed lost",
            ].includes(current) && (
              <div className="journey-quick-actions">
                <button
                  className="journey-add-followup"
                  disabled={current === "New Lead"}
                  title={
                    current === "New Lead"
                      ? "Move the lead out of New Lead before adding a follow-up"
                      : "Create another follow-up in this stage"
                  }
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("oho:add-followup", { detail: r }),
                    )
                  }
                >
                  <CalendarPlus size={13} />
                  Add follow-up
                </button>
                <button
                  className="journey-log-meeting"
                  title="Schedule a meeting or log one already completed"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("oho:log-meeting", { detail: r }),
                    )
                  }
                >
                  <Video size={13} />
                  Log meeting
                </button>
              </div>
            )}
        </div>
      </div>
      <div className="journey-scroll">
        <div className="journey-track">{main.map((s) => step(s))}</div>
      </div>
      {lead && (
        <div className="journey-secondary">
          <span className="journey-secondary-label">Follow-up stages</span>
          <div className="journey-track">{secondary.map((s) => step(s))}</div>
        </div>
      )}
      <div className="journey-secondary journey-outcomes">
        <span className="journey-secondary-label">Other outcomes</span>
        <div className="journey-track">{alternate.map((s) => step(s))}</div>
      </div>
      {converted && (
        <button className="text-button" onClick={openOpportunity}>
          Open opportunity
          <ArrowRight size={16} />
        </button>
      )}
      {lead && (
        <div className="record-origin-times">
          <div>
            <span>Zoho CRM created time</span>
            <strong>{timestamp(r.data.zohoCreatedTime)}</strong>
          </div>
          <div>
            <span>OHO CRM created time</span>
            <strong>{timestamp(r.data.importedAt || r.createdAt)}</strong>
          </div>
        </div>
      )}
    </section>
  );
}
