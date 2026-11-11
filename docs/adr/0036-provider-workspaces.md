# ADR 0036: Provider workspaces (each partner office sees exactly its work)

- Status: accepted (built; open points for Naya at the end)
- Date: 11-Nov-2026
- Decided by: Naya (IT / Tech Manager): "each dashboard should see only what it sees and exactly that"
- Requirements: O2, O3, O4, O5, P5, S4, A1, A2, E1-E7, C-AZ-1, C-AZ-2; builds on ADR 0023/0025 (console),
  0026 (invoices), 0030 (service flows, JAD Global teams), 0031-0034 (the flows and managed units)

## Context

Every partner office console had the same menu (Dispatch, Jobs, Quotes, Rate card, After-hours, Invoices, ...)
plus a few pages switched on by service (ADR 0034). A JAD Global property management team saw a rate card and
invoices it never uses; a sales and leasing team saw Dispatch and Quotes; the handover team found "Snags to fix"
hidden at the top of the jobs board; nothing said which kind of office you were looking at. Pages were hidden
from the menu, but most API endpoints still answered any office.

## Decision

1. **A workspace per company, derived, not configured.** `packages/shared/src/workspace.ts` works it out from
   what JAD+ already records: the services the company is assigned to now (primary or backup), the services of
   open requests it still has in hand (so a company whose assignment ended can finish its jobs), its kind
   (outside partner or JAD Global team) and whether it manages units today. Nothing new is stored; no migration.

2. **Title.** Each service belongs to a kind of work: property (handover, property management, managing units),
   home services (maintenance, snagging, furnishing, interior design), advisory (leasing, resale, valuation,
   mortgage, Golden Visa, education). The kind with the most services names the workspace: "Property management
   & handover", "Maintenance & home services", "Sales & leasing advisory" (or "Finance & residency advisory",
   "Investor education"). Other kinds show as "Also: ...". A company with no work yet is "Partner office" or
   "JAD Global team".

3. **Pages.** Everyone: Overview, Team, Documents. Then, by what the company handles:

   | Work                                                             | Pages                                      |
   | ---------------------------------------------------------------- | ------------------------------------------ |
   | Home visits (maintenance, furnishing, design, handover)          | Dispatch, Jobs, Performance                |
   | A service whose work is quoted (maintenance, furnishing, design) | Quotes (handover is never quoted)          |
   | Any request (visit, report, consultation)                        | Messages                                   |
   | Consultations                                                    | Consultations (new pipeline board)         |
   | Reports (snagging, valuation) or handover (soft snagging)        | Inspections & reports (new)                |
   | Handover                                                         | Handovers, Snags to fix (now its own page) |
   | Property management, or managing units today                     | Managed units                              |
   | Education                                                        | Education                                  |
   | Maintenance (the only service with emergencies)                  | After-hours                                |
   | Outside partners only                                            | Rate card, Invoices                        |

4. **JAD Global teams do not invoice through JAD+.** Invoices and the rate card are for outside partners (ADR
   0026): JAD Global teams are paid inside the group, not by owners through JAD+, and have no partner price list.
   Their offices never see these pages and the API refuses them.

5. **The API enforces the same boundary.** A guard (`workspacePage`) follows `requireRole` on every office
   endpoint of a page: dispatch, quotes, messages, feedback/scorecard/export, rate card, invoices, after-hours,
   handovers, education, managed units and statements, consultation steps, snags, and the new boards. Outside
   its workspace an office gets 403, whatever the menu shows (C-AZ-1). Inside it, the existing ownership checks
   still give 404 for another company's records (C-AZ-2). JAD+ Admin's routes are unchanged. Consultations stay
   off Dispatch and off the home-services figures: nobody is sent to a conversation.

6. **New endpoints.** `GET /api/partner/workspace` (company, kind, title, services, pages; replaces
   `/capabilities`), `GET /api/partner/consultations` (open consultations and those finished in 30 days, with
   steps and the first-call deadline), `GET /api/partner/inspections` (own inspections with reports on file and
   open snags). `GET /api/partner/overview` now returns only the workspace's sections (home services, handovers,
   managed units, consultations, reports, education); the others are null. Units are named by unit and project,
   never by the owner.

7. **Console.** The header shows the company, a kind tag ("JAD Global team" / "Partner"), the workspace title and
   the services as chips. The menu is grouped (Today, Work, Clients, Company) with one line icon per page; JAD+
   Admin's menu keeps every page, grouped (Today, Requests, People & places, Providers, Control). Page eyebrows
   name the workspace; empty lists say what will appear there. Typing the address of a page outside the
   workspace sends the office to its overview. JAD+ Admin sees "Workspace: ..." on the Partners list and, on each
   partner's page, the pages its console shows.

## Consequences

- Assigning or ending a service (Services page) changes the provider's console on its next page load, with no
  other step. A new provider starts with Overview, Team and Documents (plus Rate card and Invoices if outside).
- Some endpoints that used to answer any office with an empty list now answer 403 (e.g. handovers or education
  for a company without them). Tests were updated to the new boundary.
- The jobs list (`GET /api/partner/jobs`) now also carries the service code, so the console can keep
  consultations off the jobs board. The phone app ignores the extra field.

## Review of 11-Nov-2026 (screenshots of the four demo workspaces)

- **Document kinds have one source.** `packages/shared/src/partner-documents.ts` holds the kinds, the two every
  partner must hold (trade licence, insurance) and their names. The console had checked a code that does not exist
  ("licence"), so every partner showed "Trade licence: not on file"; the daily check (S7, P3) was already right
  and now uses the same list.
- **Overview sections only for work the company holds.** "Reports" shows only for a company holding a report
  service (snagging, valuation). A handover team's soft snagging stays on its Handovers section, so the same
  figure never shows twice. Wording follows the report kind: a valuation team reads "Reports due" and
  "Delivered", never snags.
- **Names.** The menu says "Reports" (was "Inspections & reports"), "Jobs" and "Education", and each page title
  matches its menu label; Education sits under Work. A partner office reads statuses from its own side ("New",
  "Waiting for you" instead of "With the partner"). An emergency is named by its type everywhere (Dispatch too).
- **Tests.** The D1 stand-in used by the API tests now refuses a query whose bound values do not match its
  placeholders, as real D1 does (a query like this had passed the tests and failed on real D1 with a 500).

## Open points for Naya

- The handover team also gets "Reports" (was "Inspections & reports"), because soft snagging is its work (ADR 0032). If you would
  rather show soft snagging only on the jobs board, it is one line in `officePages`.
- Performance is shown for home-visit work only (as asked). Consultation and report deadlines are measured too
  (S4); a later step could show them to advisory teams.
