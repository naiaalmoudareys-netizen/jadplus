# ADR 0027 — Residents told when JAD+ acts, after-hours partner contacts, building management alerts

Date: 11-Nov-2026 · Decided by: Claude (gaps listed after ADR 0025/0026) · To review: Naya

## Decision

**1. Residents are told when JAD+ acts on their request.** Four new in-app kinds (migration 0023), written in
the same batch as the change they describe. As always, an item holds the kind and a few facts only; the app
writes the sentence in the person's language. The staff reason stays a staff note and never reaches residents.

| Kind                     | When                                                       | To                                     |
| ------------------------ | ---------------------------------------------------------- | -------------------------------------- |
| request_cancelled_by_jad | JAD+ Admin cancels a request                               | the owner and the person who raised it |
| request_moved_by_jad     | JAD+ Admin gives the job to another partner                | the owner and the person who raised it |
| request_reclassified     | E13: JAD+ reviewed an emergency, handles it as routine     | the owner and the person who raised it |
| building_notice          | V1: JAD+ Admin publishes a notice for a building / project | every owner and current tenant there   |

The partners keep their own items: the old partner gets "moved away" and the new one "new job" (ADR 0024), and a
cancelled job reaches the partner as "job cancelled". A building notice item carries only what the notice is
about (water, power, lift...), opens Home where the notice is shown, and disappears if the notice is withdrawn.
It is shown in the owner and tenant views only. Who receives it is a shared rule (`noticeAudience`): owners of
units in that building (or anywhere in the project for a project-wide notice) and tenants of a current tenancy.

These are service messages, like every other request update: they have no switch (ADR 0016). The switches only
govern payments, construction, news and offers.

**2. After-hours contact (E5-E7).** Each partner names a technician for out-of-hours emergencies per week
(ADR 0025). Outside JAD+ working hours (the shared calendar: Monday-Friday 09:00-18:00 Dubai, public holidays
off), a new emergency job (E1, and E6 when it moves to the backup) and the 15-minute reminder (E5) now also go to
that week's technician by SMS and email, on top of the partner's alert line and office. Rule: `afterHoursWeek`
in `packages/shared/src/audiences.ts`. A technician removed from the team is never alerted.

**3. Building management alerts (E12).** Building management contacts are not JAD+ users, so an alert delivery
can now point at a contact (`notification_deliveries.recipient_contact_id`). When an emergency comes from shared
parts, a neighbour or the fire system, or when on-call takes over (E7), the contacts kept for the unit's building
and for its whole project are alerted by SMS and/or email. Their wording says what was reported and asks them to
check the building side; it never asks them to act in JAD+. With no contact on file the alert is flagged at once,
as before. Until providers are connected every such alert shows as undelivered, like all others (ADR 0007).

## Privacy

Nothing personal is copied. A delivery stores the contact's id only; the phone or email stays encrypted in
`building_contacts` and is decrypted in memory at send time (C-PD-2), never logged (C-LOG-1). The id has no
database link on purpose: removing a contact deletes its row (data minimisation), the delivery history stays,
and a later attempt fails as "no_address". Alert texts carry the reference and the kind of emergency only.

## Open

- Building management gets the reference, not the unit number. Whether SMS/email to building management may name
  the unit (not personal data, but it passes through outside providers) is for Naya to decide.
- E13 "repeated misuse reported to owner, call-out may be charged" and V1 "link many requests to one building
  incident" are not built.
