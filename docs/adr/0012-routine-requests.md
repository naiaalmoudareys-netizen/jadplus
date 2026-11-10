# ADR 0012 — Routine requests and the Requests tab

Date: 10-Nov-2026 · Decided by: Naya ("owners must be able to raise requests"; a Requests tab between Payments
and Profile), details by Claude · To review: Naya

## Context

Owners could report emergencies but not everyday needs (a dripping tap, AC servicing, a valuation). The plan's
service catalogue (S1) has 12 services; a partner service with no signed partner must not be promised (S2);
each partner service has a primary and a backup partner (S3); the first response is due within 4 working hours
(S4, maintenance baseline).

## Decisions

1. **Catalogue** in `packages/shared/src/services.ts` (from the prototype), mirrored in the database
   (migration 0013, drift-tested): 12 services in three groups, each delivered by a partner or by the JAD+ team.
2. **Routing of a new request**: partner service with an active partner → straight to it (primary, or backup when
   the primary is suspended), status "assigned"; in-house service → the JAD+ team, status "submitted"; partner
   service with no active partner → "coming soon", cannot be requested. Today only Maintenance has partners.
3. **Clock**: every routine request gets the first-response deadline of 4 working hours (Mon-Fri 9-18, UAE
   holidays off) as its next action due, for the partner queue and, later, the admin SLA risk list.
4. **Owners only for now.** A tenant's routine request needs the owner's approval first (A1, with reminders);
   that comes with tenant invitations. Tenants keep the emergency button and their request list.
5. **App**: the bottom bar is Home · My unit · Payments · **Requests** · Profile. Requests holds "Report an
   emergency", "New request" (service → residence → what you need → sent to the named partner or the JAD+
   team) and the list of requests with status. Requests show their service name ("Furnishing"), emergencies
   their kind ("Water leak").
6. **Not yet**: alerts to the partner for a new routine job (the outbox template list grows with the delivery
   work, ADR 0007; partners see it in their queue meanwhile), photos on a request, the partner's routine steps
   (visit booking, quotes, completion), and Salesforce leads for leasing / resale / valuation / mortgage.
