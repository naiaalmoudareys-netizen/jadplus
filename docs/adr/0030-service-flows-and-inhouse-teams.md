# ADR 0030: Service flows, first deadlines per service, and JAD Global teams as providers

- Status: accepted
- Date: 11-Nov-2026
- Decided by: Naya (IT / Tech Manager), from the service coverage report the product owner approved (wave 1 of 3)
- Requirements: S1-S4, S10, O5, P6; builds on ADR 0004 (clocks), 0012 (catalogue), 0018 (request journey),
  0023/0025 (console), 0026 (invoices)

## Context

The app lists 12 services. Until now:

- every service ran the maintenance journey (book a visit, quote, work, confirm), although snagging and valuation
  end with a report, leasing or a mortgage is a conversation, and investor education is a seat on a session;
- every new request got the maintenance clock (answer within 4 working hours), although the plan (S4) gives each
  service its own target;
- the six in-house services (handover, property management, leasing, resale, valuation, investor education) went
  to "the JAD+ team" with no company behind them: the request waited with nobody able to work on it or close it.

## Decision

1. **A flow per service.** Each service says how its requests run: `visit` (maintenance, handover, furnishing,
   interior design), `report` (snagging, valuation), `consultation` (property management, leasing, resale,
   mortgage, Golden Visa) or `booking` (investor education). It is kept in the code
   (`packages/shared/src/services.ts`) and in the database (`services.flow`, migration 0027; a test fails if
   the two differ), and the app receives it with the service list. Only the visit journey exists today; the
   report, consultation and booking screens come in the next waves and will branch on this value.

2. **A first deadline per service (S4).** A new request's clock now follows its service
   (`packages/shared/src/service-targets.ts`), on the working calendar JAD+ Admin keeps (holidays count as days
   off):

   | Service                       | First deadline                       | Clock           |
   | ----------------------------- | ------------------------------------ | --------------- |
   | Maintenance                   | Answer within 4 working hours        | working hours   |
   | Snagging                      | Inspection booked within 48 hours    | round the clock |
   | Handover, property management | First contact within 1 working day   | working hours   |
   | Leasing, resale               | First contact within 1 working day   | working hours   |
   | Mortgage                      | First call within 1 working day      | working hours   |
   | Valuation                     | Report within 3 working days         | working hours   |
   | Golden Visa                   | Eligibility answer in 2 working days | working hours   |
   | Furnishing                    | Quote within 2 working days          | working hours   |
   | Interior design               | Proposal within 5 working days       | working hours   |
   | Investor education            | none (next course date on request)   | -               |
   - **Choice made:** for leasing (listing in 3 working days) and resale (valuation and sales plan in 3 working
     days) the first deadline is **first contact within 1 working day**. The later deliverable needs the
     consultation flow and is added with it.
   - "48 hours" for snagging is written in hours, not working hours, so that clock runs round the clock (same
     reading as the 24-hour quote in ADR 0004).
   - A working day is 9 working hours (09:00-18:00).
   - The provider's first answer (booking a visit or sending a quote) is recorded on the scorecard when it
     meets the deadline: any answer for maintenance and "first contact"; a booked visit for snagging; a quote
     for furnishing and interior design. A valuation report or eligibility answer is recorded by the report and
     consultation flows when they exist.
   - The same first deadline applies when JAD+ Admin moves a request to another provider or raises one for an
     owner.

3. **JAD Global teams are providers (Flow D).** A provider company now has a kind: an **outside partner**
   (`external`, every existing partner) or a **JAD Global team** (`jad_group`, e.g. the group's real estate or
   property management company). In-house services are delivered by a JAD Global team assigned through the same
   primary/backup mechanism as partners; partner services by outside partners. JAD+ Admin can only assign the
   fitting kind, and a mismatched assignment never receives work. A JAD Global team gets the full partner office
   console (jobs, team, documents, quotes, invoices, scorecard) exactly like an outside partner, and sees only its
   own jobs.

4. **No team, no promise (P6).** An in-house service with no active JAD Global team assigned shows "coming soon"
   and cannot be requested, as a partner service without a partner already did (S2).

5. **Adding a provider company.** JAD+ Admin can add a company in the console (Partners, "Add a provider
   company"): name, kind and the office administrator's name and email. The administrator signs in with a code
   sent to that email. The company **starts suspended** ("Trade licence not on file; Insurance not on file"),
   exactly as the daily check would leave it, so it gets no jobs and cannot be chosen for a service until its
   trade licence and insurance are uploaded and verified; the daily check then reinstates it. This applies to
   JAD Global teams too (same rules as outside partners). The audit log records the kind, never the person's name
   or email.

6. **Old in-house requests.** Requests raised before this change for an in-house service have no provider. They
   stay visible to JAD+ Admin and can be:
   - **moved** to a JAD Global team ("Move to another partner"; only JAD Global teams are offered for an in-house
     service), with the service's first deadline from now; or
   - **marked as handled by JAD+**, with a reason, when JAD+ dealt with it directly. The request moves to "work
     done", the resident gets the usual "Work done, please confirm" notice and confirms (or says it is not done),
     and it closes by itself after 72 hours as for any job. The reason is kept as a staff note (new note kind
     `handled_by_jad`) and the action is in the audit log. There is no provider to rate.

   We chose "work done, please confirm" rather than closing the request at once because closing needs a new close
   reason, and the close reasons are a database rule on the requests table. Changing that rule means rebuilding
   the requests table, which nine other tables point to; SQLite's rebuild method cannot be run safely on D1 with
   data in place. The chosen path uses rules that already exist and gives the resident the final word.

7. **The app.** Where an owner sees who handles a request, a JAD Global team shows a "JAD Global team" badge
   instead of "JAD+ verified" (five languages).

## Consequences

- Migration 0027 adds `services.flow` and `partners.kind` (default `external`) and rebuilds `request_notes` to
  allow the new note kind (every note copied; the notes stay append-only). Nothing else changes in the database.
- In the demo, two fictional JAD Global teams ("Harbor Real Estate (demo)", "Harbor Property Management (demo)")
  take the in-house services and the demo partner takes the other partner services, so every service is live.
- Open for Naya: confirm that JAD Global teams must keep a trade licence and insurance on file like outside
  partners (today: yes, same rule); confirm the first-contact choice for leasing and resale.
- Next waves: report flow (snagging list, valuation report), consultation stages and consent, handover checklist,
  education bookings, managed units.
