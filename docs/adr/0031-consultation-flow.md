# ADR 0031: Consultations (Flow C): questions, consent to share contact details, stages

- Status: accepted (built; open points for Naya at the end)
- Date: 11-Nov-2026
- Decided by: Naya (IT / Tech Manager), from the design the product owner agreed (wave 2 of the service coverage
  report)
- Requirements: O5, O6, P5, S4, R2, C-AZ-2, C-AUD-1; builds on ADR 0009 (contact through JAD+), 0018 (request
  journey), 0025 (partner office console), 0030 (flows, first deadlines, JAD Global teams)

## Context

Five services are a conversation, not a home visit: **property management, leasing, resale, mortgage and Golden
Visa** (services.flow = `consultation`, ADR 0030). Until now they used the maintenance form (day, time, photos) and
the maintenance steps (book a visit, quote, work done), which did not fit: a mortgage adviser needs to call the
owner, ask a few questions, and report progress in stages. Calling needs the owner's phone number, and all contact
in JAD+ goes through the app (ADR 0009), so the owner must agree first.

## Decision

1. **Asking for a consultation (owner app).** Tapping one of these services opens its own pop-up instead of the
   visit one:
   - best time to call: a working day (same chips as today) and Morning / Midday / Afternoon;
   - one to three short questions per service (kept as data in `packages/shared/src/consultation.ts`):
     | Service             | Questions                                             |
     | ------------------- | ----------------------------------------------------- |
     | Property management | Is the unit tenanted now?                             |
     | Leasing             | Furnished? Available from (now or the 1st of a month) |
     | Resale              | When would you like to sell?                          |
     | Mortgage            | Buying or refinancing? Approximate amount (4 bands)   |
     | Golden Visa         | For me / me and my family                             |
   - an optional short note;
   - a **required** switch: "Share my name, unit and contact details with [provider] so they can contact me". Send
     stays disabled until it is on. The provider's name comes from the server; if the service moves to another
     provider before the owner presses Send, the request is refused and the owner sees the new name and must agree
     again (the consent always names the company that actually receives the details).
   - Only owners: tenants never see these services (R2). The tenant of the unit cannot see the consultation either
     (a sale or a mortgage is the owner's private matter), so the request is not linked to the tenancy.
   - The visit form refuses these services, so nobody can skip the consent.

2. **What is recorded.** A new append-only table `consultations` (migration 0028) keeps, per request: the answers,
   the provider the owner agreed to share with, the wording version (`consult-2026-11`, the same wording in all five
   languages) and the time. The audit log records "consent given" with the provider and the version, never the
   person's details. The best time to call uses the request's existing preferred day and window.

3. **The answer on screen.** "Sent. [provider] will contact you within [target]", the target being the service's
   first deadline (1 working day; Golden Visa 2 working days).

4. **The provider's office (console only).** Consultations are handled by the provider's office in the console,
   not by technicians. **Choice made:** a consultation job still appears in the technician app list (all of a
   provider's jobs do), but read-only: no step is offered there, and technicians never see the owner's contact
   details. On the console job page for a consultation:
   - the owner's answers, best time to call and the consent (wording, time, version);
   - **the owner's name, mobile and email**, behind a "Show contact details" button, only for the office the owner
     agreed to share with, only while the request is with that office and open. Every view is written to the audit
     log (who, when, which request). If JAD+ moves the request to another provider, that provider does **not** see
     the details (the owner did not agree to it) and uses JAD+ messages. Owner documents are not shared.
   - the steps: **Contact made**, then the service's stages, then **close**:
     | Service                                                                                                          | Stages                                         |
     | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
     | Mortgage                                                                                                         | Pre-approval → Bank valuation → Offer          |
     | Golden Visa                                                                                                      | Eligibility → Documents → Submitted → Approved |
     | Resale                                                                                                           | Valuation & plan → Listed → Offer → Sold       |
     | Leasing                                                                                                          | Listed → Viewings → Tenant found → Contract    |
     | Property management                                                                                              | Proposal → Agreement signed → Active           |
     | Stages move forward only (skipping is allowed). Each step can carry a short note the owner sees (contact details |
     | in it are masked). Closing is **Done** or **Did not proceed**, the latter with a reason the owner sees (P5:      |
     | "Golden Visa refused", "mortgage declined").                                                                     |
   - Stages and outcomes are stored in a new append-only table `consultation_steps` (each step once per request).

5. **Statuses.** The request statuses of lifecycle.ts are reused: assigned (sent to the provider) → in progress
   (Contact made) → completed (Done / Did not proceed) → closed (the owner taps "Close this request", or it closes by
   itself after 72 hours, A4). The rules are in `packages/shared/src/consultation-flow.ts`; the API enforces the same
   rules as the buttons. One difference from a visit: the owner may say **"No longer needed"** at any time before
   the provider finishes, also while in progress (nothing is booked in the home and nothing is charged). There is
   no "not done" on a consultation: if the owner disagrees with "Done", they write a message (JAD+ Admin sees it and can follow up). **Why "completed" for both outcomes:** a closed request needs a close reason, and the close reasons are
   a database rule on the requests table; adding "did not proceed" means rebuilding that table, which we avoid on D1
   (same reasoning as ADR 0030 §6). The outcome itself is in `consultation_steps`.

6. **Rating.** After a consultation that was **done** and is closed, the owner rates it (1-5 stars) as for any job;
   the rating goes on the provider's scorecard. "Did not proceed" is not rated.

7. **Clocks (S4).**
   - The first deadline is set when the request is sent (ADR 0030).
   - "Contact made" meets the first-contact deadline (first call for a mortgage) and is recorded on the scorecard.
   - Then the next deliverable becomes the deadline: **leasing listing within 3 working days** of contact (met by
     reaching "Listed"), **resale valuation and sales plan within 3 working days** of contact (met by reaching
     "Valuation & plan").
   - **Choice made for Golden Visa:** its first deadline is the eligibility answer within 2 working days (S4). First
     contact alone does not answer it, so that deadline keeps running after "Contact made" and is met by reaching the
     "Eligibility" stage (or by closing the request, since "not eligible" is also an answer).
   - An overdue consultation shows in JAD+ Admin "Needs action" like any other overdue request.
   - The scorecard keeps one service milestone per request (database rule): for leasing and resale that is first
     contact; the later listing / valuation deadline is shown on the clocks but not counted separately.

8. **Languages.** All new app texts are in English, Arabic, French, Russian and Chinese (drafted by Claude; to be
   checked by native speakers before go-live, ADR 0016), including the consent wording. The console is English.

## Consequences

- Migration 0028 adds two STRICT, append-only tables (`consultations`, `consultation_steps`); their CHECK lists
  mirror `packages/shared/src/consultation.ts` and a test fails if they drift apart.
- New endpoints: `GET /api/consultations/provider/:serviceCode`, `POST /api/consultations`,
  `GET /api/requests/:id/consultation`, `GET /api/partner/jobs/:id/consultation/contact`, and
  `POST /api/partner/jobs/:id/consultation/contact-made | stage | close`. Each declares its roles and checks that
  the request belongs to the person (owner) or to the office (provider).
- The local demo seed adds one leasing consultation in progress (contact made, listed) for the demo owner.
- Notifications for consultations (stage changes, done / did not proceed to the owner; new consultation and
  "no longer needed" to the office) are added afterwards with the other wave-2 notifications. Until then the
  generic ones apply: the office gets "new job" and "job cancelled"; after "Done" the owner gets the usual
  "please confirm" reminders, whose wording speaks of work and should be adjusted for consultations.

## Open for Naya

- Confirm the Golden Visa reading (eligibility answer keeps its 2-working-day deadline after first contact).
- Confirm that a provider the request is moved to should NOT see the owner's details without a new consent.
- Confirm the questions, the mortgage amount bands and the stage names with the providers (Harbor teams, mortgage
  and Golden Visa partners).
- The consent wording and its translations should be reviewed together with the terms (L1/L2).
