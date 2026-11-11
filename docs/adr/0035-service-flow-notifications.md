# ADR 0035: Notifications for the service flows

- Status: accepted (built; open points for Naya at the end)
- Date: 11-Nov-2026
- Decided by: Naya (IT / Tech Manager), wave 2 of the service coverage plan (the notifications ADR 0031, 0032 and
  0033 left for later)
- Requirements: O2, O3, O5, P5, S4, A4, R2, C-AZ-2, C-PD-1; builds on ADR 0019 (in-app inbox), 0024 (partner
  notifications), 0027 (inbox targets), 0031-0033 (the flows themselves)

## Context

Consultations, reports and snag lists, the handover checklist and investor education were built without
notifications: the owner had to open the app to see that a stage was reached, a report arrived or the key
collection was booked, and the provider was not told when the owner reopened a snag. The reminders after "Done" on
a consultation asked "Is the work done?", which does not fit a mortgage or a sale.

## Decision

1. **Same model as before (ADR 0019).** An item is a kind plus a few codes (service code, stage id, handover step,
   report kind, a date or a start time). It never holds words, notes, names or contact details; the app writes the
   sentence in the person's language. Each item is written in the same database batch as the change it describes,
   so it exists exactly when the change does.

2. **New kinds for the owner** (owner only, shown only in the owner view; tenants never see these services, R2):

   | Kind                        | When                                                        | Tapping opens           |
   | --------------------------- | ----------------------------------------------------------- | ----------------------- |
   | `consultation_contact_made` | the provider marks "Contact made"                           | the request             |
   | `stage_reached`             | a consultation stage (and later interior design stages)     | the request             |
   | `consultation_closed`       | Done (please close it) or Did not go ahead (reason on it)   | the request             |
   | `report_ready`              | a snagging, valuation or re-inspection report is uploaded   | the request             |
   | `snag_fixed`                | a snag is marked fixed: please check it                     | the request             |
   | `handover_step_done`        | a checklist step is done (putting one back says nothing)    | My unit, handover card  |
   | `key_collection_booked`     | the key collection is booked, or moved                      | My unit, handover card  |
   | `handover_complete`         | keys collected                                              | My unit, handover card  |
   | `session_changed`           | a session with the owner's seat changes time, mode or place | Investor Education      |
   | `session_cancelled`         | ...is cancelled                                             | Investor Education      |
   | `session_reminder`          | ...starts within a day (reminders job)                      | Investor Education      |
   | `book_sent`                 | staff mark the book sent                                    | Investor Education      |
   | `statement_ready`           | a managed unit's statement (for the next flows)             | the request, or My unit |
   | `delivery_scheduled`        | a furnishing delivery is booked or moved (next flows)       | the request             |

3. **New kinds for the provider office** (and its technician on the job, the ADR 0024 rule):
   `reinspection_requested` (book the free re-inspection), `snag_reopened`, `snags_all_confirmed` (the last snag
   confirmed). **`snags_to_fix`** goes to the office of the JAD Global team assigned to the handover service, when
   a snagging report with open snags arrives and when a snag is reopened. That team is not the request's provider,
   so it sees the item only while the request is open and it still has the handover service, and the item carries
   the reference and the number of snags only (never the report or the owner, ADR 0032). Tapping it in the app
   opens nothing: the team fixes snags from the console ("Snags to fix"). With soft snagging the team is the
   provider and gets its provider items instead, never both.

4. **Where an item points (migration 0031).** The inbox table is rebuilt as in 0023 (every row copied, the
   one-target rule kept): an item points at exactly one of a request, a tenancy, a building notice or, new, an
   **education session** (`session_id`; sessions are not requests). Handover items point at the handover request
   the checklist belongs to. Two kinds may point at nothing: `book_sent` (a book request is not a place in the app)
   and `statement_ready` when the statement is not tied to a request.

5. **Visibility, defence in depth.** Besides "only your own items", reading the inbox now applies a rule per kind
   (`inboxViewAllows` in shared): provider kinds only in the technician or office view (`snags_to_fix` in the office
   view only), service-flow owner kinds only in the owner view.

6. **Session reminder.** From 24 hours before the start, once per owner and per start time (a dedupe key that
   names the start time, so a moved session reminds again), not for a seat taken in the last 2 hours (as the
   visit reminders, ADR 0019). A title-only change sends nothing.

7. **Reminders that fit the flow (A4).** The "please confirm" reminders and the auto-close item carry the
   service's flow when it is not a home visit. A consultation reads "Please close this request", a report "Please
   confirm the report"; a home visit keeps "Is the work done?".

8. **JAD+ Admin console.** The request page shows a read-only consultation panel: the owner's answers, best time
   to call, the consent given (wording, time, version, provider) and the stage timeline with the notes the owner
   sees. No contact details there, and no step can be taken (the provider moves the stages).

9. **Helpers for the next flows.** `apps/api/src/requests/inbox-flows.ts` exports one-statement helpers for the
   same batch: `requestOwnerInboxStatement`, `stageReachedStatement`, `deliveryScheduledStatement`,
   `statementReadyStatement` (once per period), `sessionInboxStatement`, `userInboxStatement`,
   `handoverTeamInboxStatement`, `handoverStepStatement`. Recipients are read when the batch runs.

10. **Languages.** Every sentence is in English, Arabic, French, Russian and Chinese (non-English drafted by
    Claude for native review, ADR 0016). A stage id the app has no words for yet shows readable English.

## Consequences

- Migration 0031 (inbox rebuilt; CHECK lists mirror `packages/shared/src/inbox.ts`, drift-tested).
- Tests: shared (recipients and views per kind, facts are codes only), API (each kind once at the right moment,
  who sees it, session reminder dedupe, the migration keeps rows), mobile (every kind in five languages, the
  consultation reminder wording, where tapping goes).
- Known limit: two confirmations of the last two snags at the very same moment could each see the other
  snag unconfirmed, and then "all snags confirmed" is not sent; the snag list still shows the truth.

## Open for Naya

- Joint buyers: handover items go to the owner on the handover request only, not to a co-owner of the unit.
- Whether the education team should be told when an owner takes or gives back a seat (ADR 0033 suggested a daily
  summary).
- Whether a consultation office should be told when the owner says "No longer needed" with its own wording (today
  it gets the generic "job cancelled").
