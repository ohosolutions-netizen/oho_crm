import { CalendarDays, ChevronRight, FileClock } from "lucide-react";
import type { ReactNode } from "react";
import { noteText } from "../lib/note-text";
import type { CRMRecord } from "../lib/model";
import type { StageEvent } from "../lib/stage-rules";

const Value = ({
  children,
  note = false,
}: {
  children: ReactNode;
  note?: boolean;
}) => (
  <span
    className={note ? "timeline-value timeline-note-value" : "timeline-value"}
  >
    {children}
  </span>
);
const Note = ({ event }: { event: StageEvent }) => {
  const text = event.data.stageNote?.trim();
  if (
    !text ||
    text === "Record created" ||
    text === "Activity recorded" ||
    text === event.data.activityTitle
  )
    return null;
  return (
    <>
      {" "}
      with note <Value note>{noteText(text)}</Value>
    </>
  );
};

function Narrative({
  event,
  record,
}: {
  event: StageEvent;
  record: CRMRecord;
}) {
  const actor = <Value>{event.actor}</Value>,
    activity = event.data.activityType || event.fromStage,
    title = event.data.activityTitle;
  if (event.fromStage === "Record" && event.toStage === "Created")
    return <>Record created by {actor}</>;
  if (event.fromStage === "Record" && event.toStage === "Edited")
    return (
      <>
        Record information edited by {actor}
        <Note event={event} />
      </>
    );
  if (event.fromStage === "Record" && event.toStage === "Deleted")
    return <>Record deleted by {actor}</>;
  if (event.toStage === "Migrated note")
    return (
      <>
        Migrated note created by {actor}
        <Note event={event} />
      </>
    );
  if (event.fromStage === "Note")
    return (
      <>
        Added a note by {actor}
        <Note event={event} />
      </>
    );
  if (event.fromStage === "Follow-up")
    return (
      <>
        {event.toStage} a follow-up by {actor}
        <Note event={event} />
      </>
    );
  if (event.fromStage === "Enquiry")
    return (
      <>
        Booked a new enquiry
        {title && (
          <>
            {" "}named <Value>{title}</Value>
          </>
        )}{" "}
        by {actor}
        <Note event={event} />
      </>
    );
  if (
    event.data.activityType ||
    ["Task", "Follow-up", "Online meeting", "Offline meeting"].includes(
      activity,
    )
  ) {
    const lower = activity.toLowerCase();
    if (lower.includes("meeting"))
      return (
        <>
          {event.toStage === "Completed"
            ? "Logged a completed"
            : "Scheduled an"}{" "}
          <Value>{lower}</Value>
          {title && (
            <>
              {" "}
              named <Value>{title}</Value>
            </>
          )}{" "}
          by {actor}
          <Note event={event} />
        </>
      );
    return (
      <>
        Added a <Value>{lower}</Value>
        {title && (
          <>
            {" "}
            named <Value>{title}</Value>
          </>
        )}{" "}
        by {actor}
        <Note event={event} />
      </>
    );
  }
  if (event.toStage === "Converted")
    return (
      <>
        Lead converted by {actor}
        <Note event={event} />
      </>
    );
  if (event.fromStage && event.toStage)
    return (
      <>
        {record.module === "opportunities" ? "Opportunity" : "Lead"} status
        changed from <Value>{event.fromStage}</Value> to{" "}
        <Value>{event.toStage}</Value> by {actor}
        <Note event={event} />
      </>
    );
  return (
    <>
      Record updated by {actor}
      <Note event={event} />
    </>
  );
}

export default function RecordNotes({
  record,
  events,
}: {
  record: CRMRecord;
  events: StageEvent[];
}) {
  const ordered = [...events].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const format = (value: string) =>
    new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(value));
  return (
    <details className="detail-section story-panel narrative-timeline" open>
      <summary>
        <ChevronRight size={16} className="story-chevron" />
        <span>Record timeline</span>
        <span className="badge">{ordered.length}</span>
      </summary>
      <div className="story-timeline">
        {ordered.length ? (
          ordered.map((event) => (
            <article
              key={event.id}
              className={
                event.data.activityType || event.fromStage === "Follow-up"
                  ? "story-followup"
                  : "story-note"
              }
            >
              <span className="story-marker">
                {event.data.activityType || event.fromStage === "Follow-up" ? (
                  <CalendarDays size={13} />
                ) : (
                  <FileClock size={13} />
                )}
              </span>
              <div className="story-entry narrative-entry">
                <time>{format(event.createdAt)} IST</time>
                <p className="timeline-sentence">
                  <Narrative event={event} record={record} />
                </p>
              </div>
            </article>
          ))
        ) : (
          <p className="subtle">No recorded activity yet.</p>
        )}
      </div>
    </details>
  );
}
