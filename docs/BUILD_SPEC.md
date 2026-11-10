# JAD+ build spec (from JAD_Plus_Master_Plan, 15-Oct-2026, 22 pages)

Source: `Jad Global Share Point - IT\JAD+\JAD_Plus_Master_Plan[39].pdf`. Written 09-Nov-2026 by going through it page by page.

> In this repository everything starts as TODO. The BUILT / PARTIAL marks below describe the **prototype**
> (portal-live) and mean "proven logic exists to port, with tests". Mark a row DONE only when it is built,
> tested and passing `pnpm check` in this repository. A "· repo:" note after the prototype status says what is
> built in this repository so far (e.g. "repo: DONE (API)" = API + rules + tests done, app screens still to come).

Status: **BUILT** = exists in portal-live today · **PARTIAL** = exists but not to the plan · **TODO** = to build.
Phase = build order (A first). Every view is published to the private preview (portal.jadglobal.ae) as it is built.

## Build order (the plan's "working prototype" first: job queue, clock, scorecard)

| Phase | What                                                                                                                                                                                                     | Why first                                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **A** | Partner (supplier) view + emergency engine + backup partner + on-call + scorecard thresholds                                                                                                             | The prototype partners are briefed on (p.10 step 1) |
| **B** | Tenant view + tenancy lifecycle + owner approves tenant requests + quote expiry rules                                                                                                                    | "Control over their tenant" (p.4)                   |
| **C** | Admin console additions: building FM, incidents, on-call rota, rate cards, coming-soon, reclassify, owner-arranged, Talk to a person, ownership transfer, freeze, education bookings, complaints/reviews | JAD+ Admin runs it day to day (p.7)                 |
| **D** | Owner journey extras: handover checklist, snagging reports + snag tracking, education (course dates, book), "JAD+ verified", covered/chargeable (DLP), view switching                                    | Owner journey steps 1-5 (p.4)                       |
| **E** | Notifications: email now; WhatsApp (Anantya) + push when the native app ships                                                                                                                            | p.5, p.13                                           |
| Deck  | PowerPoint of every flow, case, edge case and button                                                                                                                                                     | requested 09-Nov                                    |

## 1. Roles (p.4)

| ID  | Requirement                                                                          | View    | Status                                       | Phase |
| --- | ------------------------------------------------------------------------------------ | ------- | -------------------------------------------- | ----- |
| R1  | Owner: units, approvals waiting, open requests, payment plan first                   | Owner   | BUILT (approvals waiting TODO with tenants)  | B     |
| R2  | Tenant: their unit, one "Request a service" button, request status; invited by owner | Tenant  | TODO                                         | B     |
| R3  | Supplier: job queue with SLA clocks and next action due; partner + its technicians   | Partner | TODO · repo: API + app queue DONE (ADR 0008) | A     |
| R4  | JAD admin: every request, SLA risk list, provider scorecards                         | Admin   | PARTIAL (scorecard thresholds, risk list)    | A/C   |
| R5  | One person owns one unit and rents another: switch views without logging out         | All     | TODO · repo: API switch view DONE; app TODO  | B     |

## 2. Owner journey (p.4)

| ID  | Requirement                                                                                                                                 | Status                                                                                       | Phase |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----- |
| O1  | Off-plan: construction progress, payment plan, "Pay now" (Salesforce data)                                                                  | BUILT (pay.jadglobal.ae link)                                                                | -     |
| O2  | Handover: checklist to key collection                                                                                                       | TODO                                                                                         | D     |
| O3  | Book independent snagging; inspector uploads standard PDF report; owner opens it; track each snag to closure                                | PARTIAL (snagging request only)                                                              | D     |
| O4  | Living/leasing: maintenance requests, invite tenant, approve tenant requests and quotes in one tap, hand to Harbor for leasing / management | PARTIAL (no tenant)                                                                          | B     |
| O5  | Growing: valuation, mortgage, Golden Visa, furnishing, interior design, investor education                                                  | BUILT as requests (+SF leads for leasing/resale/valuation/mortgage); education bookings TODO | C/D   |
| O6  | Exit: resale through Harbor; buyer becomes next owner                                                                                       | PARTIAL (lead); transfer TODO                                                                | C     |

## 3. Services, SLAs, partners (p.10-11)

| ID  | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                      | Status                                                                | Phase |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----- |
| S1  | 12 services catalogue                                                                                                                                                                                                                                                                                                                                                                                                            | BUILT                                                                 | -     |
| S2  | Service with no signed partner shows "coming soon" (no promise)                                                                                                                                                                                                                                                                                                                                                                  | TODO                                                                  | C     |
| S3  | Each service: primary partner + backup partner                                                                                                                                                                                                                                                                                                                                                                                   | TODO · repo: DONE (data + dispatch, backup takes over)                | A     |
| S4  | SLAs per plan: emergency ack 15 min / on site 2 h 24/7; routine respond 4 working h, visit 2 working days, quote 24 h after visit; snagging booking 48 h, report 24 h, free re-inspection; leasing listing 3 wd; resale valuation+plan 3 wd; valuation report 3 wd; mortgage first call 1 wd; Golden Visa eligibility 2 wd; furnishing quote 2 wd + delivery date in writing; interior proposal 5 wd; education next course date | PARTIAL · repo: maintenance targets DONE (rules); other services TODO | A     |
| S5  | Scorecard from real data only: SLA hits, response and completion times, ratings, repeat visits, complaints. Admin reviews monthly                                                                                                                                                                                                                                                                                                | PARTIAL (no repeat visits/complaints/thresholds)                      | A     |
| S6  | "Low client reviews" = avg rating < 4.0 over any 30 days, OR 2 missed emergencies in 90 days, OR 1 safety/honesty breach → flag, admin may end contract; backup becomes primary same day, open jobs move                                                                                                                                                                                                                         | TODO · repo: daily check + review list API DONE (ADR 0006)            | A     |
| S7  | Licence and insurance expiry flagged 30 days ahead; lapse → partner suspended, jobs to backup                                                                                                                                                                                                                                                                                                                                    | PARTIAL · repo: auto-suspend + jobs to backup DONE (ADR 0006)         | A     |
| S8  | Owners see partner name + "JAD+ verified", never scorecards                                                                                                                                                                                                                                                                                                                                                                      | TODO                                                                  | D     |
| S9  | Rate card: partner proposes, admin checks vs 3 market quotes, Steven approves, fixed 12 months; raise only with 60 days notice + written approval                                                                                                                                                                                                                                                                                | TODO                                                                  | C     |
| S10 | Partner contract fields: rate card, SOP/SLA/KPI signed, licence, insurance (JAD named), no off-platform                                                                                                                                                                                                                                                                                                                          | PARTIAL (docs)                                                        | C     |

## 4. Legal (p.12)

| ID  | Requirement                                                                                                                                                                                                                          | Status                                               | Phase |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ----- |
| L1  | Terms accepted at sign-up by owner, tenant, partner; date + time recorded                                                                                                                                                            | PARTIAL (owner only, draft text)                     | B     |
| L2  | Terms content: platform only, no advice, indicative valuations, targets not guarantees, not an emergency service (999/997/998), owner-provider contract, make-safe cap pre-authorised, liability limited, separate marketing consent | PARTIAL (draft)                                      | B     |
| L3  | App gives no instructions. Emergency screen text exactly: "Your emergency has been sent to [provider]. If anyone is in danger, call 999."                                                                                            | TODO · repo: DONE (exact text from API)              | A     |
| L4  | JAD never approves chargeable work; owner approves every quote; only exception make-safe within cap                                                                                                                                  | PARTIAL · repo: database guard DONE; quote flow TODO | A     |

## 5. Emergencies and maintenance (p.13-14)

| ID  | If                                                                      | Then                                                                                                                               | Status                                                                  | Phase |
| --- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----- |
| E1  | Emergency raised (tenant or owner)                                      | Partner gets job at once with loud alert; owner informed at the same moment ("No action is needed from you now"); console flags it | PARTIAL · repo: DONE (API; alerts queued in outbox, delivery Phase E)   | A     |
| E2  | Emergency types                                                         | Water leak/flood; no power to whole unit; AC failure May-Oct; lockout; main door/window won't lock                                 | TODO · repo: DONE                                                       | A     |
| E3  | Fire, smoke, gas smell, injury                                          | App shows 997/998/999 only; building FM alerted; no technician until cleared                                                       | TODO · repo: DONE (API + app, ADR 0008)                                 | A     |
| E4  | Partner must acknowledge in 15 min and name technician + arrival window | Tenant sees name + window                                                                                                          | TODO · repo: DONE (API)                                                 | A     |
| E5  | No ack at 15 min                                                        | Reminder                                                                                                                           | TODO · repo: DONE (API; delivery Phase E)                               | A     |
| E6  | No ack at 30 min                                                        | Job moves to backup automatically + on-call phone alerted                                                                          | TODO · repo: DONE (API; delivery Phase E)                               | A     |
| E7  | Backup also fails                                                       | On-call calls both partners and building FM; owner kept informed                                                                   | TODO · repo: DONE (API; on-call rota screens TODO)                      | A/C   |
| E8  | Make-safe                                                               | Within owner's pre-authorised cap; permanent repair needs owner quote approval                                                     | TODO · repo: cap rule + database guard DONE; make-safe flow TODO        | A     |
| E9  | Unit in defect liability period                                         | Work marked "covered"                                                                                                              | TODO                                                                    | D     |
| E10 | Close                                                                   | Resident confirms with photos; owner gets completion report; job closes                                                            | PARTIAL                                                                 | A     |
| E11 | Next working day                                                        | Admin reviews every emergency; late response lowers scorecard                                                                      | TODO                                                                    | A     |
| E12 | Water from roof / shared pipe / neighbour                               | Building's job: also sent to building FM; partner only makes unit safe. Sprinklers/fire → building FM only                         | TODO · repo: dispatch DONE; per-building FM contacts TODO               | C     |
| E13 | Tenant marks routine as emergency                                       | Partner still responds; admin reclassifies next morning; repeated misuse reported to owner, call-out may be charged                | TODO                                                                    | C     |
| E14 | AC fails May-Oct                                                        | Emergency, same clock                                                                                                              | TODO · repo: DONE                                                       | A     |
| E15 | Lockout                                                                 | Emergency; technician checks Emirates ID against tenancy record                                                                    | TODO                                                                    | A/B   |
| E16 | Technician damages unit                                                 | Partner insurance; complaint recorded; admin updates owner until settled                                                           | TODO                                                                    | C     |
| E17 | Technician behaves badly                                                | Removed from JAD+ jobs at once; partner replaces                                                                                   | TODO · repo: removed technicians cannot be sent DONE; admin action TODO | A     |
| E18 | Owner says free, partner says chargeable                                | JAD+ decides from warranty/DLP dates; partner can only flag for review                                                             | TODO                                                                    | D     |
| E19 | Owner wants own contractor                                              | Allowed; closes as "owner arranged"                                                                                                | TODO                                                                    | C     |
| E20 | Eid / public holiday                                                    | Emergency clocks run; routine clocks pause                                                                                         | BUILT (calendar) · repo: DONE                                           | -     |

## 6. Approvals and the request clock (p.14)

| ID  | If                                   | Then                                                                             | Status                    | Phase |
| --- | ------------------------------------ | -------------------------------------------------------------------------------- | ------------------------- | ----- |
| A1  | Owner never answers tenant's request | Reminder 24 h; admin calls owner at 48 h                                         | TODO                      | B     |
| A2  | Owner never answers a quote          | Reminder day 10; quote expires day 14                                            | PARTIAL (4-day reminder)  | B     |
| A3  | Owner declines quote                 | Tenant told; partner may offer ONE revised quote; else request closes            | PARTIAL                   | B     |
| A4  | Resident never confirms work done    | Reminders 24 h and 48 h; auto-close 72 h with partner photos as evidence         | BUILT                     | -     |
| A5  | Resident says not done               | Reopened; same partner returns; counts as repeat visit                           | PARTIAL (no repeat count) | A     |
| A6  | Work stops for parts/access          | On hold with reason + new date; clock pauses                                     | BUILT                     | -     |
| A7  | Technician cannot get in             | "No access" logged with photo; rebooked within 24 h; not counted against partner | TODO                      | A     |
| A8  | Resident forgets appointment         | Reminders 1 day and 1 hour before + "technician on the way"                      | PARTIAL (day before)      | A     |

## 7. Owners, tenants, units (p.15)

| ID  | If                                  | Then                                                                                      | Status                                               | Phase |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----- |
| U1  | Owner logs in, unit missing         | One tap opens a case; fixed within 2 working days                                         | TODO                                                 | C     |
| U2  | Owner's mobile/email wrong in SF    | Can't get code; "Talk to a person" reaches admin who verifies ID and updates SF           | TODO · repo: ambiguous match → JAD+ desk (409) DONE  | C     |
| U3  | Owner sells unit                    | Old owner loses access; open requests move to new owner; history stays with unit          | TODO · repo: access ends at next sign-in / 24 h DONE | C     |
| U4  | Tenancy ends                        | Tenant warned 30 days before; access ends automatically on end date                       | TODO                                                 | B     |
| U5  | Tenant stays past end date          | Access still ends; owner alerted; extend in one tap                                       | TODO                                                 | B     |
| U6  | Owner lives in unit                 | Owner does resident steps (book, confirm)                                                 | BUILT                                                | -     |
| U7  | Owns one, rents another             | Switch views without logging out                                                          | TODO · repo: API switch view DONE; app TODO          | B     |
| U8  | Family/manager acts for owner       | Launch: admin raises on their behalf (BUILT "log on behalf"); Phase 2 delegate role       | BUILT                                                | -     |
| U9  | Owner dies/incapacitated            | Account frozen for changes; JAD deals with legal representative only                      | TODO                                                 | C     |
| U10 | Off-plan instalment overdue         | Shown overdue; Pay now opens payment link; collections stays with team                    | BUILT                                                | -     |
| U11 | Payment link fails                  | Talk to a person; no card data in JAD+                                                    | PARTIAL                                              | C     |
| U12 | Owner asks staff for advice         | No advice; connect to licensed partner                                                    | Process (admin script)                               | C     |
| U13 | Owner blames JAD for partner's work | Terms name partner; admin connects to partner complaints + insurer; recorded on scorecard | TODO                                                 | C     |

## 8. Partners and commercial (p.15-16)

| ID  | If                                                       | Then                                                                       | Status                | Phase |
| --- | -------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------- | ----- |
| P1  | Partner wants to raise prices                            | Not within 12-month rate card; later 60 days notice + JAD written approval | TODO                  | C     |
| P2  | Partner takes client off platform                        | Breach; contract ends                                                      | TODO (record breach)  | A     |
| P3  | Licence/insurance about to expire                        | Flag 30 days ahead; lapse → suspended, jobs to backup                      | PARTIAL · repo: DONE  | A     |
| P4  | Partner out of business                                  | Backup primary same day; new backup within 30 days                         | TODO                  | A     |
| P5  | Golden Visa refused / mortgage declined / furniture late | Partner status updates shown to owner                                      | TODO (status updates) | C     |
| P6  | Harbor team not trained                                  | Service shows "coming soon"                                                | TODO                  | C     |

## 9. Technology and data (p.16)

| ID  | If                     | Then                                                           | Status                                          | Phase |
| --- | ---------------------- | -------------------------------------------------------------- | ----------------------------------------------- | ----- |
| T1  | App down               | Admin portal + WhatsApp keep working; status message to owners | TODO (status banner)                            | E     |
| T2  | Salesforce link breaks | JAD+ runs on own data; nightly check                           | PARTIAL · repo: owners on stored units DONE     | E     |
| T3  | Lost phone             | New login ends old session; only a session token on the phone  | PARTIAL · repo: DONE (API + app secure storage) | B     |
| T4  | Data breach            | Incident process (document)                                    | Process                                         | -     |

## 10. Reputation and volume (p.16-17)

| ID  | If                                         | Then                                                                                       | Status          | Phase |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------ | --------------- | ----- |
| V1  | Building-wide incident floods 100 requests | Admin links them to one building incident; one update to every resident; building FM leads | TODO            | C     |
| V2  | Bad public review                          | Reply in 24 h, case opened, public follow-up                                               | TODO (case log) | C     |
| V3  | Owner goes to management                   | Logged in JAD+ on their behalf                                                             | BUILT           | -     |
| V4  | Owner rates closed job poorly              | Scorecard drops; admin calls owner within 2 working days (task)                            | PARTIAL         | A     |

## 11. Operating facts (p.18-19)

Working hours Mon-Fri 9-18, UAE holidays off (BUILT). "Talk to a person": admin in hours, logged out of hours, emergencies to on-call (TODO, C).
Building FM + 24/7 number per building in admin (TODO, C). On-call rota: Admin + second person weekly (TODO, A/C · repo: rota API DONE, ADR 0006).
Existing owners invited in waves with Owner ID (TODO, E). Tenants invited by owner or by Harbor PM for managed units (TODO, B).
Investor education: book copy + free seats, admin manages bookings (TODO, D).
