import { Clock } from "lucide-react";
import { stageRules, type StageEvent } from "../lib/stage-rules";
const fields = Object.values(stageRules).flatMap((stages) =>
  Object.values(stages).flatMap((s) => s.fields),
);
const format = (v: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(v));
export default function StageHistory({ events }: { events: StageEvent[] }) {
  return (
    <section className="detail-section stage-history">
      <h3>
        Record activity history <span className="badge">{events.length}</span>
      </h3>
      {events.length ? (
        events.map((e) => (
          <article className="history-event" key={e.id}>
            <span className="history-marker">
              <Clock size={16} />
            </span>
            <div>
              <h4>
                {e.fromStage} → {e.toStage}
              </h4>
              <small>
                {format(e.createdAt)} IST · {e.actor}
              </small>
              <p>{e.data.stageNote}</p>
              <details>
                <summary>Captured information</summary>
                <dl>
                  {Object.entries(e.data)
                    .filter(([key, value]) => value && key !== "stageNote")
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt>
                          {Object.values(stageRules)
                            .flatMap((group) => group[e.toStage]?.fields || [])
                            .find((f) => f.key === key)?.label ||
                            (
                              {
                                taskDisposition: "Current task decision",
                                currentTaskDate: "Current task date",
                                currentTaskAction: "Current task action",
                                linkedTasks: "Linked tasks",
                                followUpNeeded: "Follow-up needed",
                                nextFollowUp: "Follow-up date",
                                followUpAction: "Follow-up action",
                                followUpTime: "Follow-up time",
                                followUpStatus: "Follow-up status",
                                opportunityName: "Opportunity",
                                companyName: "Company",
                                contactName: "Contact",
                                amount: "Amount (INR)",
                                activityTitle: "Meeting / task",
                                activityType: "Activity type",
                                activityStatus: "Meeting status",
                                participants: "Participants",
                                dueDate: "Meeting date",
                                time: "Meeting time",
                                stageContext: "Stage",
                              } as Record<string, string>
                            )[key] ||
                            fields.find((f) => f.key === key)?.label ||
                            key}
                        </dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                </dl>
              </details>
            </div>
          </article>
        ))
      ) : (
        <p className="subtle">
          Record edits, stage changes, follow-ups, meetings, tasks and
          conversions will appear here.
        </p>
      )}
    </section>
  );
}
