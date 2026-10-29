import { leadSources } from "./lead-picklists.ts";
export type Action = "view" | "create" | "edit" | "delete";
export type Role = { id: string; name: string; parentId: string | null };
export type PermissionMap = Record<string, Record<Action, boolean>>;
export type Member = {
  id: string;
  name: string;
  email: string;
  authId: string | null;
  roleId: string;
  profileId: string;
  active: number;
};
export type CRMRecord = {
  id: string;
  module: string;
  title: string;
  ownerId: string;
  companyId: string | null;
  data: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};
export type Field = {
  key: string;
  label: string;
  type?: string;
  options?: string[];
  required?: boolean;
};
export function dateTimeKey(dateKey: string, module = "") {
  return dateKey === "discoveryDate"
    ? "discoveryTime"
    : dateKey === "nextFollowUp"
      ? "followUpTime"
      : dateKey === "dueDate" && module === "activities"
        ? "time"
        : dateKey.endsWith("Date")
          ? dateKey.slice(0, -4) + "Time"
          : dateKey + "Time";
}
export const leadPrimaryStages = [
  "New Lead",
  "Discovery to be Scheduled",
  "Discovery scheduled",
  "Discovery completed",
  "Converted",
];
export const leadFollowupStages = [
  "Not Contacted",
  "Not Pitched",
  "Followup Later",
];
export const leadStages = [
  ...leadPrimaryStages,
  ...leadFollowupStages,
  "Junk Lead",
  "Lead Lost",
];
export const currencies = ["INR", "AED", "USD", "SAR", "QAR"];
export const stages = [
  "Solution planning",
  "Proposal preparation",
  "Proposal sent",
  "Negotiation",
  "Accepted",
  "Closed lost",
];
export function normalizeData(module: string, data: Record<string, string>) {
  const copy = { ...data };
  if (module === "enquiries") {
    const map: Record<string, string> = {
      New: "New Lead",
      Reviewing: "Not Contacted",
      Contacted: "Not Contacted",
      "Not connected": "Not Contacted",
      Qualified: "Discovery completed",
      "Not qualified": "Disqualified",
    };
    copy.status = map[copy.status] || copy.status || "New Lead";
  }
  if (module === "opportunities") {
    const map: Record<string, string> = {
      "New enquiry": "Solution planning",
      Qualification: "Solution planning",
      Discovery: "Solution planning",
      Proposal: "Proposal sent",
    };
    copy.stage = map[copy.stage] || copy.stage || "Solution planning";
  }
  return copy;
}
export function canConvertLead(data: Record<string, string>) {
  return data.status === "Discovery completed" && !data.convertedOpportunityId;
}
export const modules: Record<
  string,
  { name: string; singular: string; description: string; fields: Field[] }
> = {
  companies: {
    name: "Companies",
    singular: "company",
    description: "Your customer relationships, in one place.",
    fields: [
      { key: "industry", label: "Industry" },
      { key: "website", label: "Website", type: "url", required: true },
      { key: "email", label: "Company email", type: "email" },
      { key: "phone", label: "Phone" },
      { key: "gst", label: "GST / tax number" },
      { key: "address", label: "Address", type: "textarea" },
      {
        key: "status",
        label: "Relationship",
        options: ["Prospect", "Customer", "Partner", "Inactive"],
      },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  contacts: {
    name: "Contacts",
    singular: "contact",
    description: "The people behind every company.",
    fields: [
      { key: "designation", label: "Designation" },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", required: true },
      { key: "decisionMaker", label: "Decision maker", options: ["No", "Yes"] },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  enquiries: {
    name: "Leads",
    singular: "lead",
    description:
      "Make contact, schedule discovery, and convert qualified leads.",
    fields: [
      { key: "companyName", label: "Company name (if not linked)" },
      { key: "contactName", label: "Contact person" },
      { key: "email", label: "Lead email", type: "email" },
      { key: "phone", label: "Lead phone", required: true },
      { key: "contactId", label: "Contact", type: "contact" },
      { key: "source", label: "Lead Source", options: leadSources },
      {
        key: "receivedDate",
        label: "Received date",
        type: "date",
        required: true,
      },
      {
        key: "status",
        label: "Lead stage",
        options: [...leadStages, "Connected"],
        required: true,
      },
      { key: "importedAt", label: "Imported into OHO CRM" },
      { key: "zohoCRMId", label: "Zoho CRM lead ID" },
      { key: "zohoCRMStatus", label: "Original Zoho CRM status" },
      { key: "zohoCRMOwner", label: "Owner in Zoho CRM" },
      { key: "notInterestedReason", label: "Reason For Not Interested" },
      {
        key: "requirements",
        label: "Customer requirements",
        type: "textarea",
        required: true,
      },
      { key: "products", label: "Zoho products / solution" },
      { key: "discoveryDate", label: "Discovery meeting date", type: "date" },
      { key: "discoveryTime", label: "Discovery time (India)", type: "time" },
      {
        key: "discoveryMode",
        label: "Discovery meeting mode",
        options: ["Online", "Offline"],
      },
      { key: "discoveryLocation", label: "Meeting link / location" },
      { key: "nextFollowUp", label: "Next follow-up", type: "date" },
      { key: "notes", label: "Outreach / discovery notes", type: "textarea" },
    ],
  },
  leadEnquiries: {
    name: "Enquiries",
    singular: "enquiry",
    description: "Repeated customer enquiries linked to their lead record.",
    fields: [
      {
        key: "enquiryId",
        label: "Linked lead",
        type: "enquiry",
        required: true,
      },
      { key: "phone", label: "Phone", required: true },
      { key: "email", label: "Email", type: "email" },
      { key: "source", label: "Lead source", options: leadSources },
      { key: "enquiryAt", label: "Enquiry received", type: "date" },
      { key: "zohoCreatedTime", label: "Zoho CRM created time" },
      { key: "status", label: "Enquiry status", options: ["Booked"] },
      { key: "notes", label: "Enquiry details", type: "textarea" },
      { key: "zohoCRMId", label: "Zoho CRM lead ID" },
    ],
  },
  integrationErrors: {
    name: "Integration Errors",
    singular: "integration error",
    description:
      "Failures captured from connected services and scheduled integrations.",
    fields: [
      { key: "integration", label: "Integration" },
      { key: "operation", label: "Operation" },
      { key: "status", label: "Status", options: ["Open", "Resolved"] },
      { key: "errorMessage", label: "Error message", type: "textarea" },
      { key: "occurredAt", label: "Occurred at" },
      { key: "technicalContext", label: "Technical context", type: "textarea" },
      { key: "resolvedAt", label: "Resolved at" },
    ],
  },
  opportunities: {
    name: "Opportunities",
    singular: "opportunity",
    description: "Plan the solution, send proposals, negotiate, and close.",
    fields: [
      { key: "enquiryId", label: "Original lead", type: "enquiry" },
      { key: "contactId", label: "Contact", type: "contact" },
      {
        key: "stage",
        label: "Opportunity stage",
        options: stages,
        required: true,
      },
      {
        key: "acceptedProposalId",
        label: "Accepted proposal revision",
        type: "proposal",
      },
      { key: "products", label: "Zoho products / solution" },
      { key: "amount", label: "Estimated value", type: "number" },
      { key: "expectedClose", label: "Expected close", type: "date" },
      { key: "nextFollowUp", label: "Next follow-up", type: "date" },
      { key: "scope", label: "Solution scope", type: "textarea" },
      {
        key: "negotiationPoints",
        label: "Negotiation points / open items",
        type: "textarea",
      },
      { key: "lossReason", label: "Closure reason", type: "textarea" },
      { key: "notes", label: "Discovery findings", type: "textarea" },
    ],
  },
  activities: {
    name: "Activities",
    singular: "activity",
    description: "Every conversation. Every next step.",
    fields: [
      { key: "contactId", label: "Contact", type: "contact" },
      { key: "enquiryId", label: "Lead", type: "enquiry" },
      { key: "opportunityId", label: "Opportunity", type: "opportunity" },
      {
        key: "type",
        label: "Activity type",
        options: [
          "Call",
          "Online meeting",
          "Offline meeting",
          "Email",
          "Follow-up",
          "Task",
        ],
      },
      {
        key: "meetingMode",
        label: "Meeting mode",
        options: ["Online", "Offline"],
      },
      { key: "participants", label: "Participant user IDs" },
      { key: "participantNames", label: "Participants" },
      { key: "dueDate", label: "Due date", type: "date", required: true },
      { key: "time", label: "Time (India)", type: "time" },
      {
        key: "status",
        label: "Status",
        options: ["Scheduled", "Completed", "Cancelled"],
      },
      {
        key: "outcome",
        label: "Call / meeting outcome",
        options: [
          "Pending",
          "Connected",
          "Disconnected",
          "No answer",
          "Rescheduled",
          "Completed",
        ],
      },
      { key: "stageContext", label: "Stage when activity was logged" },
      { key: "location", label: "Meeting link / location" },
      { key: "notes", label: "Meeting notes / next action", type: "textarea" },
    ],
  },
  proposals: {
    name: "Proposals",
    singular: "proposal",
    description: "Keep each version and record customer acceptance.",
    fields: [
      {
        key: "opportunityId",
        label: "Opportunity",
        type: "opportunity",
        required: true,
      },
      { key: "version", label: "Version", type: "number", required: true },
      { key: "amount", label: "Proposal amount", type: "number" },
      {
        key: "status",
        label: "Status",
        options: [
          "Draft",
          "Sent",
          "Negotiating",
          "Accepted",
          "Rejected",
          "Superseded",
        ],
      },
      { key: "sentDate", label: "Sent date", type: "date" },
      { key: "documentUrl", label: "Proposal document link", type: "url" },
      { key: "acceptedDate", label: "Acceptance date", type: "date" },
      { key: "acceptedBy", label: "Accepted by" },
      { key: "acceptanceUrl", label: "Acceptance document link", type: "url" },
      { key: "notes", label: "Scope / negotiation notes", type: "textarea" },
    ],
  },
  invoices: {
    name: "Invoices",
    singular: "invoice",
    description: "Manual invoice records with payment follow-ups.",
    fields: [
      { key: "proposalId", label: "Accepted proposal", type: "proposal" },
      { key: "invoiceNumber", label: "Invoice number", required: true },
      {
        key: "invoiceDate",
        label: "Invoice date",
        type: "date",
        required: true,
      },
      {
        key: "amount",
        label: "Invoice amount",
        type: "number",
        required: true,
      },
      { key: "paidAmount", label: "Amount received", type: "number" },
      {
        key: "dueDate",
        label: "Payment due date",
        type: "date",
        required: true,
      },
      {
        key: "status",
        label: "Payment status",
        options: ["Unpaid", "Part paid", "Paid", "Cancelled"],
      },
      { key: "nextFollowUp", label: "Next payment follow-up", type: "date" },
      { key: "notes", label: "Payment notes", type: "textarea" },
    ],
  },
  projects: {
    name: "Implementation",
    singular: "project",
    description: "Turn accepted solutions into successful delivery.",
    fields: [
      {
        key: "opportunityId",
        label: "Accepted opportunity",
        type: "opportunity",
      },
      { key: "products", label: "Zoho products" },
      {
        key: "status",
        label: "Delivery status",
        options: [
          "Not started",
          "Planning",
          "In progress",
          "Customer review",
          "Completed",
          "On hold",
        ],
      },
      { key: "startDate", label: "Start date", type: "date" },
      { key: "dueDate", label: "Target date", type: "date" },
      { key: "nextFollowUp", label: "Next follow-up", type: "date" },
      { key: "notes", label: "Milestones / delivery notes", type: "textarea" },
    ],
  },
};
export const moduleKeys = [...Object.keys(modules), "administration"];
export function fullPermissions(): PermissionMap {
  return Object.fromEntries(
    moduleKeys.map((k) => [
      k,
      { view: true, create: true, edit: true, delete: true },
    ]),
  );
}
export function hasPermission(
  permissions: PermissionMap,
  module: string,
  action: Action,
) {
  if (module === "leadEnquiries") module = "enquiries";
  if (module === "integrationErrors")
    return (
      ["view", "edit"].includes(action) &&
      permissions.administration?.view === true
    );
  return (
    permissions[module]?.view === true && permissions[module]?.[action] === true
  );
}
export function isDescendant(
  roles: Role[],
  childId: string,
  ancestorId: string,
) {
  if (childId === ancestorId) return false;
  const visited = new Set<string>();
  let current: string | null = childId;
  while (current && !visited.has(current)) {
    visited.add(current);
    const role = roles.find((r) => r.id === current);
    if (!role) return false;
    if (role.parentId === ancestorId) return true;
    current = role.parentId;
  }
  return false;
}
export function visibleOwner(
  me: Member,
  owner: Member | undefined,
  roles: Role[],
) {
  return (
    !!owner &&
    (owner.id === me.id || isDescendant(roles, owner.roleId, me.roleId))
  );
}
export function validHierarchy(roles: Role[]) {
  for (const r of roles) {
    const seen = new Set<string>();
    let current: string | null = r.id;
    while (current) {
      if (seen.has(current)) return false;
      seen.add(current);
      const node = roles.find((x) => x.id === current);
      if (!node) return false;
      current = node.parentId;
    }
  }
  return true;
}
export function indiaToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function followUpDate(r: CRMRecord) {
  if (
    [
      "Completed",
      "Cancelled",
      "Paid",
      "Rejected",
      "Not qualified",
      "Converted",
    ].includes(r.data.status) ||
    (["Disqualified", "Junk Lead", "Lead Lost"].includes(r.data.status) &&
      r.data.followUpNeeded !== "Yes") ||
    ["Completed", "Cancelled"].includes(r.data.followUpStatus)
  )
    return "";
  if (
    ["Closed lost", "Accepted"].includes(r.data.stage) &&
    r.data.followUpNeeded !== "Yes"
  )
    return "";
  return (
    r.data.nextFollowUp ||
    (r.module === "enquiries" &&
    r.data.status === "Discovery scheduled" &&
    !r.data.discoveryActivityId
      ? r.data.discoveryDate
      : "") ||
    (r.module === "opportunities" && r.data.stage === "Proposal preparation"
      ? r.data.proposalDueDate
      : "") ||
    (["activities", "invoices", "projects"].includes(r.module)
      ? r.data.dueDate
      : "") ||
    ""
  );
}
export function followUpAction(r: CRMRecord) {
  return (
    r.data.followUpAction ||
    (r.module === "enquiries" && r.data.status === "Discovery scheduled"
      ? "Attend discovery meeting"
      : r.module === "opportunities" && r.data.stage === "Proposal preparation"
        ? "Prepare and review the proposal"
        : r.module === "activities"
          ? r.data.notes || r.data.type || "Complete activity"
          : r.module === "invoices"
            ? "Follow up on invoice payment"
            : r.module === "projects"
              ? "Review implementation progress"
              : "Follow up with customer")
  );
}
export function followUpTime(r: CRMRecord) {
  if (r.data.followUpTime) return r.data.followUpTime;
  if (
    r.module === "enquiries" &&
    r.data.status === "Discovery scheduled" &&
    (!r.data.nextFollowUp || r.data.nextFollowUp === r.data.discoveryDate)
  )
    return r.data.discoveryTime || "";
  if (
    ["activities", "invoices", "projects"].includes(r.module) &&
    (!r.data.nextFollowUp || r.data.nextFollowUp === r.data.dueDate)
  )
    return r.data[dateTimeKey("dueDate", r.module)] || "";
  if (
    r.module === "opportunities" &&
    r.data.stage === "Proposal preparation" &&
    (!r.data.nextFollowUp || r.data.nextFollowUp === r.data.proposalDueDate)
  )
    return r.data.proposalDueTime || "";
  return "";
}
export function followUpLabel(r: CRMRecord, today = indiaToday()) {
  const due = followUpDate(r);
  if (due)
    return due < today ? "Overdue" : due === today ? "Due today" : "Upcoming";
  if (r.data.followUpStatus === "Completed") return "Completed";
  if (r.data.followUpStatus === "Cancelled") return "Cancelled";
  return "No follow-up";
}
export const followUpFields: Field[] = [
  { key: "followUpAction", label: "Follow-up action", type: "textarea" },
  { key: "followUpTime", label: "Follow-up time (India)", type: "time" },
];
for (const key of ["enquiries", "opportunities", "invoices", "projects"])
  modules[key].fields.push(...followUpFields);
for (const [module, config] of Object.entries(modules))
  for (const field of [...config.fields])
    if (field.type === "date") {
      const key = dateTimeKey(field.key, module);
      if (!config.fields.some((f) => f.key === key))
        config.fields.push({
          key,
          label: field.label + " time (India)",
          type: "time",
        });
    }

for (const key of ["opportunities", "proposals", "invoices"])
  modules[key].fields.push({
    key: "currency",
    label: "Currency",
    options: currencies,
  });
modules.opportunities.fields.push(
  { key: "advanceAmount", label: "Advance amount received", type: "number" },
  { key: "paidDate", label: "Paid date", type: "date" },
  { key: "paidTime", label: "Paid time", type: "time" },
);

modules.opportunities.fields.push(
  { key: "companyName", label: "Company name (if not linked)" },
  { key: "source", label: "Lead source", options: leadSources },
  { key: "contactName", label: "Contact person" },
  { key: "email", label: "Contact email", type: "email" },
  { key: "phone", label: "Contact phone" },
  {
    key: "paymentStatus",
    label: "Payment status",
    options: ["Advance Pending", "Advance Received", "Complete"],
  },
  { key: "paidAmount", label: "Total amount received", type: "number" },
  { key: "proposalSentDate", label: "Proposal submitted date", type: "date" },
  { key: "negotiationDate", label: "Last negotiation date", type: "date" },
  { key: "discoveryDate", label: "Discovery meeting date", type: "date" },
  { key: "discoveryLocation", label: "Meeting link / location" },
  { key: "lossReason", label: "Reason lost", type: "textarea" },
  { key: "zohoCRMId", label: "Zoho CRM deal ID" },
  { key: "zohoCRMStage", label: "Original Zoho stage" },
  {
    key: "zohoProposalHistory",
    label: "Imported proposal history",
    type: "textarea",
  },
);
for (const field of modules.opportunities.fields.filter(
  (f) => f.type === "date",
)) {
  const key = dateTimeKey(field.key, "opportunities");
  if (!modules.opportunities.fields.some((f) => f.key === key))
    modules.opportunities.fields.push({
      key,
      label: field.label + " time",
      type: "time",
    });
}
