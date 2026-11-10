# ADR 0021 — Tenants: invitation, owner approval, end of tenancy

Date: 10-Nov-2026 · Decided by: Naya ("do 1 and then 2"), details by Claude following the Master Plan (R2,
O4, A1, U4, U5) · To review: Naya

## Decision

### Invitation (R2, O4)

The owner invites a tenant to one of their units: the tenant's name, email **or** mobile, and the dates (end
after start, at most 3 years, start at most 30 days in the past). JAD+ creates the tenant's account if the
person is new (name and contact encrypted with a blind index, like every account) and grants the tenant role.
The tenant signs in like everyone else, with a code to that email or mobile, and **accepts** the invitation in
the app; the acceptance is recorded with its time. A unit has at most one invited or active tenancy.

The owner sees the tenant's name and a masked contact ("n•••t@example.com"); the full contact is never sent back
to the app (C-PD-1). Until message providers are connected, the owner tells the tenant to install JAD+; the
invitation then waits in the tenant's notifications.

### Requests (A1, E1)

A tenant raises routine requests for their current home, for **repairs (Maintenance) only** (Naya, 10-Nov-2026:
tenants should not raise the same requests as owners). Every other service (snagging, handover, leasing, resale,
valuation, mortgage, Golden Visa, furnishing, interior design, education) is the owner's: a tenant does not see
it and the API refuses it ( in ). They first wait for the owner
("awaiting owner"): the owner is told at once, reminded after 24 hours, and the JAD+ team calls the owner after
48 hours (admin console, to come). Approve: the request goes to the service's partner (or the JAD+ team) and the
4-working-hour response clock starts then. Decline: the request closes as "owner declined". The tenant is told
either way. Emergencies never wait for the owner (E1). Quotes on a tenant's request are still decided by the
owner only (L4).

### End of tenancy (U4, U5)

- 30 days before the end, the tenant and the owner are told (once per end date).
- Access ends on the end date by itself (the date check in `isTenancyCurrent`); the day after, the tenancy is
  marked ended and both are told.
- The owner can extend in one tap, also right after it ended; an extension only moves the end later. To
  shorten, the owner ends the tenancy, which takes effect at once.

### Notifications

The in-app inbox (ADR 0019) also carries tenancy items; an item is about a request or a tenancy (migration 0017
rebuilds the table to allow this). Tenancy items show in the view they belong to: the owner's in the owner view,
the tenant's in the tenant view.

## Why

The plan's owner promise is "control over their tenant" (p.4): the owner decides who lives there, for how long,
and which routine work is done, while emergencies are never delayed.
