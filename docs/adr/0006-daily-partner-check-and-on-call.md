# ADR 0006 — Daily partner check, admin review list and on-call rota (Phase A)

Date: 10-Nov-2026 · Decided by: Claude (Naya: "let's do that", Phase A remainder) · To review: Naya

## Context

BUILD_SPEC S6 (low reviews → flag), S7 / P3 (licence and insurance: flag 30 days ahead, lapse → suspended,
jobs to backup) and section 11 (weekly on-call rota: JAD+ Admin + a second person). The rules were already in
`packages/shared/src/scorecard.ts` (ADR 0004); this ADR covers how they are applied.

## Decisions

1. **One daily run at 06:00 Dubai** (cron `0 2 * * *`, `apps/api/src/jobs/partner-review.ts`). Documents
   expire by date, so once a day is enough; 06:00 means a lapse at midnight is acted on before the working day.
2. **Lapsed or missing licence/insurance suspends the partner automatically** (`suspended_by = 'compliance'`).
   No human step: S7 says "lapse → suspended", and an uninsured partner must not take the next job. The
   partner is **reinstated automatically** once both documents on file are valid again. A suspension made by an
   admin (`suspended_by = 'admin'`) is never lifted by the check; an ended contract is never touched.
3. **Jobs to backup (S7)**: jobs of the suspended partner that are still waiting for acknowledgement
   (status `assigned`) move at once to the other active partner of the service. The new partner must
   acknowledge afresh; an emergency keeps its escalation clock (moved to backup → on-call 15 minutes later if
   not acknowledged). Jobs already under way (scheduled, in progress, on hold…) are **not** moved
   automatically, because the lifecycle only lets the system reassign `assigned` jobs and a half-done job needs
   a person to arrange the hand-over. They are listed for the admin ("open_jobs").
4. **Review list instead of messages.** Every concern opens an item on JAD+ Admin's partner review list
   (migration 0008 `partner_review_items`): document expiring in 30 days, suspended, open jobs to move, low
   rating average, two missed emergencies in 90 days, safety or honesty breach. One open item per partner and
   concern, so the daily run never piles up duplicates. Resolving needs an admin and a note, and is audited.
   Emails to the partner office about expiring documents come with the delivery work (Phase E).
5. **Ending a contract stays human** (S6 "admin may end contract"). The check only flags. Promoting the backup
   to primary and finding a new backup (P4) are console actions (phase C).
6. **On-call rota API**: an admin sets each week (Monday start, Dubai). The first person must hold the JAD+
   Admin role, the second may be an admin or JAD+ viewer, and they must be different people. Past weeks cannot
   be changed. Reading shows 12 weeks with empty weeks as gaps, so a missing week is visible.

## Consequences

S7 is fully automatic; S6 produces the admin's work list. Still to build: message delivery (alerts to
partners, on-call and residents) and the console screens for the review list and rota.
