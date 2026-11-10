# ADR 0018 — The request journey: visit, quote, work done, confirm, rate

Date: 10-Nov-2026 · Decided by: Naya ("go ahead and continue what is required next"), details by Claude
following the Master Plan (L4, A2-A5, E10, S4, S5) · To review: Naya

## Decision

After a request reaches a partner, it follows these steps. The rules are pure functions in
`packages/shared/src/jobflow.ts`; the API enforces them and the app shows only the buttons they allow
(`actions` on the request page).

| Step              | Who                   | Result                                                                                                                                  |
| ----------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Book the visit    | Partner               | Technician + window (30 min to 4 h, within 30 days); the resident sees the name and window (E4). Moving it cancels the earlier booking. |
| Quote             | Partner               | Amount (AED) + what it covers; valid 14 days (A2). Contact details in the text are removed (ADR 0009).                                  |
| Decide the quote  | **Owner only** (L4)   | Approve: the work is booked. Decline: back to the partner for ONE revised quote; declining that closes the request (A3).                |
| Start / work done | Partner               | Finished-work photos (same upload rules as residents, ADR 0013) and an optional note, sent as a message.                                |
| Confirm           | Owner or tenant       | "Done" closes the request (E10). "Not done" reopens it with the same partner; the next visit is marked as a repeat visit (A5).          |
| Rate              | Owner or tenant, once | 1-5 stars + optional comment, after a confirmed or auto-closed request; feeds the scorecard (S5).                                       |

**Clock** (`apps/api/src/jobs/request-clock.ts`, every minute): a quote nobody decides expires after 14 days
and the request closes as "quote expired" (A2); finished work nobody confirms closes by itself after 72 hours
as "auto closed" (A4).

**Scorecard**: the partner's first answer to a routine request (a visit or a quote) is measured against the
4-working-hour target (S4) once, in `sla_outcomes`.

**Evidence**: every step is one atomic batch with the request history and the audit log, guarded by the request
version, so two people acting at the same moment cannot both win (as in ADR 0004).

No migration was needed: quotes, visits, attachments, ratings and SLA outcomes were designed in migration 0005.

## Not yet

- Reminders (quote day 10, confirmation at 24 h and 48 h, visit day-before and hour-before, A8): they need
  message providers (phase E). The deadlines already apply.
- Make-safe within the owner's pre-authorised cap (E8), "no access" with a photo (A7), and owner-arranged
  contractors (E19).
- After a first decline, a partner who never sends a revised quote leaves the request open; the admin console
  will list these.

## Why

This completes what owners already use every day: raising a request was possible, but nothing could happen
after the partner received it. Keeping the rules in one pure module means the app never shows a button the
API would refuse.
