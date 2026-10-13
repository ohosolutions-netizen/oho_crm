# Manual regression — OHO CRM

## Verified in local preview

- Sign-in loads the Overview and initializes the administrator and default roles/profiles.
- Add Company persists a customer company and returns to the dashboard.
- Open Company shows the recorded industry and email.
- Add Contact from Company preselects the company; the saved contact appears under related records.
- Administration displays the signed-in user, role, profile, and linked sign-in status.
- Permission Sets / Profiles is separate from Role Designer.
- Profile editor displays independent View, Create, Edit, Delete checkboxes for every module.
- Role Designer displays the Admin → Manager → Executive hierarchy separately from profiles.
- Mobile settings layout and navigation verified at a 390px viewport; viewport restored afterward.

## Verified by API regression against local D1

- One company supports multiple contacts.
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

## Production onboarding checks

- First owner sign-in initializes the actual production administrator.
- Configure permitted hosting audience before teammates attempt sign-in.
- Add the six remaining real users, assigning each role and profile.
- Confirm real user sign-in email matches the CRM membership email.
- Have one Manager and one Executive verify visibility with representative company/enquiry records.

Local mock identity and disposable regression fixtures are never included in the production database.
