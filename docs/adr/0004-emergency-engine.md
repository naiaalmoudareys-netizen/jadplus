# ADR 0004 — Emergency engine, partner queue and scorecard rules (Phase A)

Date: 09-Nov-2026 · Decided by: Claude (on Naya's standing instruction to pick the recommended option) · To review: Naya

## Context

Phase A of the build order: partner view, emergency engine, backup partner, on-call, scorecard thresholds
(BUILD_SPEC E1-E8, E12, E14, L3, R3, S3-S7). The plan fixes most numbers. This ADR records where it was
silent or ambiguous and a choice had to be made.

## Decisions

1. **Backup partner window (E7).** The plan says "backup also fails → on-call" without a time. The backup gets
   the same 15 minutes as the primary: 0 min primary alerted, 15 min reminder, 30 min backup + on-call
   alerted, 45 min on-call takes over and informs building FM and the owner. With no active backup, the
   30-minute step goes straight to on-call. Rules: `packages/shared/src/escalation.ts`.
2. **The sweep runs every minute** (Worker cron `* * * * *`). A missed run catches up to the right step
   rather than replaying each one. Each step is one atomic batch.
3. **Concurrency.** Every change to a request uses a version guard. A stale version turns the update into
   one that breaks a CHECK constraint, so D1 rolls back the whole batch (change + history + outbox +
   audit). A partner acknowledging at the moment the sweep moves the job therefore wins cleanly, and the
   sweep skips. Tested, including that no partial history is left.
4. **Who is measured.** The acknowledgement clock of each partner starts when _that_ partner got the job. A
   primary that lets a job move to the backup gets a "missed" acknowledgement on its scorecard. That record
   feeds S6 "two missed emergencies in 90 days". One outcome per partner per metric per request, so a
   repeated sweep never double-counts.
5. **Notifications outbox.** Delivery (push, WhatsApp, email) is Phase E. Until then every alert the engine
   must send is written to `notifications` (migration 0006) in the same batch as the change. Rows contain no
   text or contact details, only template + recipient + request; the sender renders them later. Nothing is
   lost while delivery is being built, and the outbox shows exactly what was due to be sent. **Until the
   sender exists, no one is actually alerted; this must be live before any real emergency is handled.**
6. **Confirmation text (L3)** is exactly the spec text with the provider's name. With no partner available
   it names "the JAD+ on-call team". For a fire system (E12, building FM only) it names "the building
   management team". Fire, smoke, gas or injury (E3) returns only the emergency numbers and no text at all.
7. **AC outside May-October (E14)** is refused as an emergency with code `not_emergency`, so the app can
   offer the routine request instead (routine requests are phase B).
8. **Arrival window (E4).** Up to 4 hours long, starting within the next 24 hours, with a 5-minute
   allowance for phone clock differences. Only an active technician of the acknowledging partner may be
   named (E17).
9. **Owners raising by unit** need Salesforce to confirm they own the unit. That lookup (`unitOwner`) is a
   port to the finance-worker proxy and is **not connected**, so nothing touches Salesforce. Until Naya
   approves it, owners get "temporarily unavailable" and tenants raise through their tenancy. If the unit is
   let, an owner's emergency is linked to the current tenancy so the tenant can follow it.
10. **SLA clocks (S4).** "Quote 24 h after visit" is read as 24 clock hours, because the plan says "working"
    wherever it means working time. "2 working days" = 18 working hours (2 × 09:00-18:00). Only maintenance
    targets are coded now; the other services' milestones come with their phases.
11. **Low reviews (S6)**: average below 4.0 over the trailing 30 days, evaluated daily, so every 30-day
    window is checked as it closes. Any number of ratings counts. A flag only puts the partner on the
    admin review list; ending a contract stays a human decision.
12. **Documents (S7, P3)**: flagged from 30 days before expiry (including the expiry day itself), lapsed the
    day after. A missing licence or insurance counts as lapsed (suspend), because a partner without them on
    file must not take jobs.
13. **The maintenance service row** is created by migration 0006 because the engine depends on it. The rest
    of the 12-service catalogue is loaded when ported from the prototype.

## Consequences

The emergency path is fully exercised in tests against the real schema, and was run once in the real
Workers runtime: a 40-minute-old unacknowledged emergency was moved to the backup by the cron trigger.
Still to build for Phase A: the delivery worker for the outbox, the daily scorecard/compliance job and
admin review list, the partner app screens, and on-call rota management in the console.
