# Manual regression — OHO CRM

## Verified in local preview

- Email-only entry loads Overview without a password or ChatGPT sign-in.
- Add Company persists a customer company and returns to the dashboard.
- Open Company shows the recorded industry and email.
- Add Contact from Company preselects the company; the saved contact appears under related records.
- Administration displays the selected email's user, role, profile, and email-only entry method.
- Permission Sets / Profiles is separate from Role Designer.
- Profile editor displays independent View, Create, Edit, Delete checkboxes for every module.
- Role Designer displays the Admin → Manager → Executive hierarchy separately from profiles.
- Mobile settings layout and navigation verified at a 390px viewport; viewport restored afterward.
- New Lead saved to the lead board; Contacted and Connected actions updated the stage.
- Schedule discovery retained the meeting date, time, online mode, and outreach notes.
- Complete discovery enabled conversion; the conversion form created a linked company/contact and opened the opportunity board.
- The resulting opportunity retained the original lead, contact, value, requirements, owner, and follow-up date.
- The opportunity stage selector moved the converted opportunity to Negotiation and updated its board column.
- Stage changes now open the required-information dialog, including repeat updates within Negotiation.
- Saved negotiation details with a dated action at 14:30 IST; the action appeared on the dashboard as Due today and on the opportunity list with the same date, time, action, and status.
- Desktop body/navigation text verified at 16px, record cells at 15px, and table headings at 14px.
- Completed the follow-up through the dashboard with an outcome note; it left the pending queue and remained visible in the list's Follow-up completed filter.
- Mobile stage form verified at 390px viewport with 16px inputs, readable labels, visible save controls, and no document overflow; viewport restored.

## Verified by API regression against local D1

- One company supports multiple contacts.
- Email selection validates addresses, normalizes case and whitespace, and requires an active team user after initial setup.
- Lead outreach and discovery convert to an opportunity while retaining company, contact, requirements, owner, and history.
- Discovery scheduled requires a meeting date. Unconnected leads cannot convert.
- Duplicate and concurrent conversions cannot create more than one opportunity per lead.
- Enquiries, opportunities, disconnected calls, and next-action dates persist.
- Proposal version uniqueness and acceptance requirements are enforced.
- Accepted proposal contents are protected and earlier versions retained.
- Manual invoices link only to accepted proposals and validate received amounts against status.
- Implementation links to accepted opportunities.
- Linked records block deletion; invalid dates/emails and cross-origin writes are rejected.
- Hierarchy cycles are rejected; new users require both role and profile.
- Managers see direct and indirect subordinate records, but not peer, superior, or unrelated branch records.
- A Manager can edit a visible enquiry while Delete and Administration remain forbidden by profile.
- Revoking View immediately removes the module's data and blocks direct edits.
- Deactivated accounts cannot access the API.
- Incomplete transition requests and normal-edit stage bypasses leave records unchanged.
- Stage history retains captured information and actor, and excludes hidden peer/branch records.
- Follow-up completion requires an outcome, suppresses the pending action, and retains that outcome after rescheduling.
- Stale updates are rejected without overwriting newer changes.

## Production onboarding checks

- The first email entered in an empty production CRM initializes its administrator.
- Add the six remaining real users, assigning each role and profile.
- Confirm work emails match active CRM users; email-only selection does not verify identity.
- Have one Manager and one Executive verify visibility with representative company/enquiry records.

Local mock identity and disposable regression fixtures are never included in the production database.
