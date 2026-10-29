import { createHmac, timingSafeEqual } from "node:crypto";
import {
  APIError,
  allRecords,
  canSee,
  database,
  permit,
  type Context,
} from "./server";

const endpoint =
  "https://apps.sarvam.ai/api/outbounds/v1/orgs/01a1881f-3396-7077-a2ef-fbefc5fdce27/workspaces/01a1881f-339f-734b-b797-02f6a88df829/outbounds";

function apiKey() {
  const value = process.env.SARVAM_API_KEY?.trim();
  if (!value)
    throw new APIError(
      "Voice calling is not configured. Add SARVAM_API_KEY to the Catalyst function environment.",
      503,
    );
  return value;
}

function signature(leadId: string, actorId: string) {
  return createHmac("sha256", apiKey())
    .update(leadId + ":" + actorId)
    .digest("hex");
}

function validSignature(value: string, leadId: string, actorId: string) {
  const expected = signature(leadId, actorId);
  const supplied = Buffer.from(value || "", "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return supplied.length === wanted.length && timingSafeEqual(supplied, wanted);
}

function phone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15)
    throw new APIError("Add a valid phone number before starting a call.");
  return "+" + (digits.length === 10 ? "91" + digits : digits);
}

function findText(value: unknown, keys: string[]): string {
  if (!value || typeof value !== "object") return "";
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (
      keys.includes(key.toLowerCase()) &&
      ["string", "number", "boolean"].includes(typeof child)
    )
      return String(child);
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    const found = findText(child, keys);
    if (found) return found;
  }
  return "";
}

async function recordCallNote(
  leadId: string,
  actorId: string,
  note: string,
  details: Record<string, unknown>,
) {
  const record = (await allRecords("id=?", [leadId]))[0];
  if (!record || record.module !== "enquiries")
    throw new APIError("Lead unavailable.", 404);
  const now = new Date().toISOString();
  const data = { ...record.data, latestNote: note, lastVoiceCallAt: now };
  const result = await database().batch([
    database()
      .prepare(
        "UPDATE records SET data=?,updated_at=? WHERE id=? AND updated_at=?",
      )
      .bind(JSON.stringify(data), now, leadId, record.updatedAt),
    database()
      .prepare(
        "INSERT INTO audit (id,actor_id,action,target,details,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM records WHERE id=? AND updated_at=?)",
      )
      .bind(
        crypto.randomUUID(),
        actorId,
        "call",
        "record:" + leadId,
        JSON.stringify({ data: { stageNote: note, ...details } }),
        now,
        leadId,
        now,
      ),
  ]);
  if (!result[0].meta.changes)
    throw new APIError("This lead changed. Refresh it before calling.", 409);
}

export async function startVoiceCall(
  c: Context,
  input: Record<string, unknown>,
  requestUrl: string,
) {
  const leadId = String(input.id || "");
  const lead = (await allRecords("id=?", [leadId]))[0];
  if (!lead || lead.module !== "enquiries" || !canSee(c, lead))
    throw new APIError("Lead unavailable.", 404);
  permit(c, "enquiries", "edit");
  const key = apiKey();
  const url = new URL(requestUrl);
  url.pathname = url.pathname.replace(/\/api\/crm$/, "/api/sarvam/webhook");
  url.search = new URLSearchParams({
    leadId,
    actorId: c.me.id,
    token: signature(leadId, c.me.id),
  }).toString();
  const payload = {
    app_config: {
      app_id: "Conversatio-a5f075aa-3940",
      app_version: 1,
      app_type: "agent",
      connection_config: {
        connection_id: "7387ec83-48-3da8ae32-7292",
        agent_phone_number: "+918064269760",
      },
      agent_variables: {
        call_summary: "",
        company_name: lead.data.companyName || "",
        company_size: lead.data.companySize || "",
        contact_email: lead.data.email || "",
        contact_name: lead.data.contactName || lead.title,
        decision_maker_status: lead.data.decisionMakerStatus || "",
        lead_source: lead.data.source || "",
        meeting_booked: "",
        preferred_meeting_time: lead.data.nextFollowUp || "",
        product_interest: lead.data.products || lead.data.requirements || "",
        user_name: c.me.name,
      },
    },
    user_config: { user_phone_number: phone(lead.data.phone || "") },
    webhook_config: {
      url: url.toString(),
      metadata: { lead_id: leadId, actor_id: c.me.id },
    },
  };
  const requestBody = JSON.stringify(payload);
  let response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": key },
    body: requestBody,
  });
  if (response.status === 401)
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": key,
        "api-subscription-key": key,
        Authorization: `Bearer ${key}`,
      },
      body: requestBody,
    });
  const text = await response.text();
  let reply: Record<string, unknown> = {};
  try {
    reply = text ? JSON.parse(text) : {};
  } catch {
    reply = { response: text };
  }
  if (!response.ok)
    throw new APIError(
      findText(reply, ["message", "error", "detail"]) ||
        `Sarvam could not start the call (${response.status}).`,
      502,
    );
  const callId = findText(reply, ["id", "call_id", "outbound_id"]);
  await recordCallNote(leadId, c.me.id, "Voice call initiated", {
    callId,
    callStatus: "Initiated",
  });
  return { ok: true, id: leadId, callId };
}

export async function receiveVoiceCallWebhook(req: Request) {
  const url = new URL(req.url);
  const leadId = url.searchParams.get("leadId") || "";
  const actorId = url.searchParams.get("actorId") || "";
  if (
    !leadId ||
    !actorId ||
    !validSignature(url.searchParams.get("token") || "", leadId, actorId)
  )
    throw new APIError("Invalid webhook signature.", 403);
  const payload = (await req.json()) as Record<string, unknown>;
  const summary = findText(payload, [
    "call_summary",
    "summary",
    "conversation_summary",
  ]);
  const status = findText(payload, ["status", "call_status", "outcome"]);
  const transcript = findText(payload, ["transcript", "conversation"]);
  const note = [
    status ? `Voice call ${status}` : "Voice call completed",
    summary || transcript || "No call summary was returned.",
  ].join(" — ");
  await recordCallNote(leadId, actorId, note, {
    callStatus: status || "Completed",
    callSummary: summary,
    transcript,
  });
  return Response.json({ ok: true });
}
