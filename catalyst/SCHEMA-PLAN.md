# OHO CRM — Catalyst backend migration

Status: project OHO-CRM (77605000000054301) created in India organization 60091125992 with 19 tables and 322 verified columns. The insert restriction has been resolved; local records are migrated and the Catalyst-backed web client/function are deployed. See README.md for storage details and verification.

The user selected the connected India account. Project-Rainfall was not modified. The following design guided provisioning; actual column names and properties are recorded in schema.json. UUID relationships are enforced by the CRM API rather than Catalyst foreign-key columns.

## Tables

All entities retain a unique application UUID alongside Catalyst ROWID. Monetary values use decimal INR amounts. Keep user-selected identity and CRM role/profile permissions separate from Catalyst platform authentication.

| Table | Core fields and relationships |
| --- | --- |
| Roles | AppId unique, Name unique, ParentRole reference to Roles |
| Profiles | AppId unique, Name |
| ModulePermissions | Profile reference, Module, CanView, CanCreate, CanEdit, CanDelete; one entry per profile/module |
| Users | AppId unique, Email unique, Name, Role reference, Profile reference, Active |
| Companies | AppId unique, Name, Owner reference, Industry, Website, Email, Phone, TaxNumber, Address, Relationship, Notes |
| Contacts | AppId unique, Company reference, Owner reference, Name, Designation, Email, Phone, DecisionMaker, Notes |
| Leads | AppId unique, optional Company/Contact references, Owner reference, Title, CompanyName, ContactName, Email, Phone, Source, ReceivedDate, Stage, Requirements, Products, DiscoveryDate/Time/Mode/Location, ConvertedOpportunity reference, ConvertedAt, Notes |
| Opportunities | AppId unique, Company/Contact/Lead references, Owner reference, Title, Stage, Products, Amount, ExpectedClose, Scope, ProposalDueDate, ProposalReference, ProposalSentDate, ProposalSentTo, ProposalUrl, NegotiationDate, NegotiationPoints, AcceptedDate, AcceptedBy, AcceptanceReference, ClosedDate, LostReason, Notes |
| Activities | AppId unique, Company/Contact/Lead/Opportunity references, Owner reference, Title, Type, DueDate, Time, Status, Outcome, Location, Notes |
| Proposals | AppId unique, Company/Opportunity references, Owner reference, Title, Version, Amount, Status, SentDate, DocumentUrl, AcceptedDate, AcceptedBy, AcceptanceUrl, Notes; unique opportunity/version identity |
| Invoices | AppId unique, Company/Proposal references, Owner reference, Title, InvoiceNumber unique, InvoiceDate, Amount, PaidAmount, DueDate, Status, Notes |
| Implementations | AppId unique, Company/Opportunity references, Owner reference, Title, Products, Status, StartDate, DueDate, Notes |
| FollowUps | AppId unique, RecordModule, RecordAppId, Owner reference, DueDate, Time, Action, Status, CompletedAt, CompletionNote |
| StageHistory | AppId unique, RecordModule, RecordAppId, Actor reference, FromStage, ToStage, CapturedDetails, EventTime |
| AuditLog | AppId unique, Actor reference, Action, Target, BeforeDetails, AfterDetails, EventTime |
| Settings | Key unique, Value; configuration and migration version |
| ConversionClaims | LeadAppId unique, OpportunityAppId, Status, CreatedCompanyAppId, CreatedContactAppId; idempotent conversion recovery |

## Required behavior during migration

- Retain Admin → Manager → Executive hierarchy and separate module permissions, enforced on the server.
- Keep email-only user selection as requested; never expose privileged Catalyst OAuth credentials to the browser.
- Preserve the current HTTP API response shape so the local frontend continues to work.
- Capture stage-required information before writing a stage change, and preserve history.
- Prevent duplicate lead conversion and stale concurrent stage edits. Verify Catalyst concurrency/transaction capabilities before replacing the current D1 atomic operations.
- Keep invoices manual. Keep the frontend on localhost.
- Preserve the local database as a migration backup; do not delete or overwrite it.
- Import local records only after foreign-key mapping and record-count checks are implemented.
- Treat MCP provisioning credentials as connector-only: the application needs a supported server runtime or separately configured server credentials for ongoing access.

## Validation before switching backend

Verify schema metadata, user lookup, hierarchy visibility, module CRUD permissions, companies with multiple contacts, stage validation/history, conversion idempotency, follow-up dashboard/list consistency, proposal versions, and invoice validation against the Catalyst development project. Report any unsupported concurrency behavior rather than silently weakening guarantees.
