# ADR 0019 — In-app notifications, visit day, make-safe and closing a request

Date: 10-Nov-2026 · Decided by: Naya ("continue working on whatever is required next for the requests …
make [the reminders] more elegant and professional"), details by Claude · To review: Naya

## Decision

### In-app notifications (instead of waiting for message providers)

A bell on Home opens the person's notifications, written by the app in their own language. The server stores
only the kind and a few facts (times, amounts, the request reference) in `inbox` (migration 0016), never the
wording and never contact details. Each item is written in the same batch as the change it describes, so a
notification exists exactly when the change does; reminders carry a dedupe key so they happen once.

| Kind             | When                                                             | To               |
| ---------------- | ---------------------------------------------------------------- | ---------------- |
| visit_booked     | The partner books or moves the visit                             | Owner (+ tenant) |
| visit_tomorrow   | 24 h before the visit, if it was booked more than 2 h ahead (A8) | Owner (+ tenant) |
| visit_soon       | 1 h before the visit (A8)                                        | Owner (+ tenant) |
| on_the_way       | The technician taps "on my way" (A8)                             | Owner (+ tenant) |
| no_access        | Nobody let the technician in (A7)                                | Owner (+ tenant) |
| quote_received   | A quote arrives (L4)                                             | Owner only       |
| quote_reminder   | Day 10, the quote expires on day 14 (A2)                         | Owner only       |
| quote_expired    | Day 14 (A2)                                                      | Owner only       |
| make_safe_done   | Urgent work within the owner's limit (E8)                        | Owner only       |
| work_done        | The partner marks the work done (E10)                            | Owner (+ tenant) |
| confirm_reminder | 24 h and 48 h after "work done" (A4)                             | Owner (+ tenant) |
| auto_closed      | 72 h after "work done" without an answer (A4)                    | Owner (+ tenant) |

"+ tenant" = the person who raised the request when it is not the owner. A tenant whose tenancy ended no longer
sees that unit's notifications. When providers are connected (phase E), the same items are also sent by SMS,
WhatsApp or push in the person's language, following their switches (request updates are always on).

### Visit day

- **On my way** (A8): the visit shows "on the way" and the resident is told.
- **No access** (A7): the technician takes a photo at the door (stored as evidence, ADR 0013 rules), the visit
  is marked "no access", and the partner must book a new visit within 24 hours. It is not held against them.

### Make-safe (E8)

The owner chooses a limit in Profile (none, AED 250, 500, 1,000 or 2,000), recorded as a consent with version,
time and IP hash. On an acknowledged emergency the partner may record urgent make-safe work up to that limit
without a quote; above it, or without a limit, the API refuses and the partner sends a quote. The record points
to the owner's consent and is append-only (`make_safe_works`). Every permanent repair still needs the owner's
approval of a quote (L4). Kept apart from `quotes`, whose two revision numbers belong to real quotes (A3).

### Closing a request

- **Cancel**: before the work starts, by the owner, or by a tenant for their own request. A booked visit is
  called off and a waiting quote is withdrawn.
- **I arranged it myself** (E19): the owner closes the request as "owner arranged".

### Demo data

The local seed closes demo requests of emergency kinds no longer offered (ADR 0017) and keeps exactly one open
demo emergency, adding one only when none is open.

## Why

Naya asked for the reminders to be elegant and professional now rather than waiting for providers. An in-app
inbox works today, in every language, with no personal data leaving JAD+, and becomes the source for SMS /
WhatsApp / push later without redoing anything.
