# ADR 0025 — The full console: JAD+ Admin and the partner office

Date: 10-Nov-2026 · Decided by: Naya ("do all of this … from the admin to the partner page everything must be
fully professional and cover everything that is needed"), details by Claude · To review: Naya

## Decision

The console (ADR 0023) grows into the operations tool for the whole platform.

**JAD+ Admin: operations** (`apps/api/src/admin/ops.ts`, migration 0019): overview; request actions (timeline,
internal notes, "owner called" for A1, reassign to another partner, reclassify an emergency as routine (E13),
cancel, raise on an owner's behalf (U8, V3)); people (find owners and tenants, their units, tenancies, requests,
consents and sessions; sign out everywhere; freeze for U9; extend or end a tenancy for the owner); the JAD+ desk
queue with replies; staff accounts; the audit log viewer; monthly reports and CSV export.

**JAD+ Admin: platform** (`apps/api/src/admin/platform.ts`, migration 0020): services with their primary and
backup partners (S1-S3); buildings with building management contacts (E12), building notices to residents (V1)
and the home guide; owners interested in offers (N2) for sales; on-call weeks (E6, E7); settings (versions,
make-safe limits, working calendar, SLA targets).

**Partner office** (`apps/api/src/partner/company.ts` and `apps/api/src/admin/partner-extras.ts`, migration
0021): overview; dispatch (technicians' skills and availability, the day's visits, unassigned jobs, suggested
technician); messages; quotes; documents uploaded by the partner and verified by JAD+ Admin before they count
(S7, S10); rate card and price-change requests with 60 days' notice, approved by JAD (S9, P1); after-hours contact
per week (E5-E7); monthly scorecard (S5) and resident feedback without names; CSV export.

Staff screens are English only. Viewing personal data in the console is audited. Every change is audited.

**Invoices**: recorded in JAD+, paid directly to the partner (ADR 0026, next round). **Parked**: move-in and
move-out checklists.

## Proposed targets (for Naya's sign-off)

The partner overview compares each partner with: on time 95% or more, average rating 4.0 or more (S6), repeat
visits 5% or less. It warns when the 30-day rating is within 0.3 of 4.0, or after one missed emergency (two in 90
days flag the partner, S6). These figures live in `PARTNER_TARGETS` (packages/shared) and can be changed.

## Known gaps after this round

- Building management alerts (E12) still cannot be delivered: building contacts are not JAD+ accounts, so the
  delivery engine needs its own recipient type.
- The partner's after-hours contact is recorded but not yet used by the escalation job (E5-E7).
- Residents get no notification when JAD+ cancels or moves their request, or publishes a building notice.
