# ADR 0033: Handover checklist and investor education bookings

- Status: accepted
- Date: 11-Nov-2026
- Decided by: Naya (IT / Tech Manager), wave 2 of the service coverage plan (part 3)
- Requirements: O2, O5, S4; builds on ADR 0009 (contact through JAD+), 0025 (console), 0030 (service flows, JAD
  Global teams as providers)

## Context

ADR 0030 gave every service a flow and made JAD Global teams providers with the partner office console. Two
services still had nothing behind them:

- **Handover** (flow `visit`): the plan promises a checklist "from completion to key collection" (O2), but a
  handover request ran the maintenance journey only.
- **Investor education** (flow `booking`): the plan says "book copy + free seats, admin manages bookings" and
  "education: next course date" (S4). Tapping it opened the visit pop-up.

## Decision

### Handover checklist (O2)

1. **Seven fixed steps, in this order:** final payment cleared, handover documents ready, snagging done,
   utilities (DEWA / district cooling) registration, service charges and building access, key collection
   appointment, keys collected. They are data in `packages/shared/src/handover.ts` (`HANDOVER_STEPS`), mirrored by
   the database CHECK list (migration 0030, drift-tested).
2. **A checklist starts from the owner's handover request.** The handover team (the partner office of the JAD
   Global team that has the request) or JAD+ Admin presses "Start checklist" on the request in the console
   (Handovers page, "Handover requests without a checklist"). **Choice made:** we did not add an owner/unit picker.
   Starting from the request means the unit always comes from a request the owner raised (never from the
   client), and an office's reach is the rule it already has: "jobs assigned to your company". It also gives the
   owner a place to talk to the team (the request's messages). An owner without a request can still be helped:
   JAD+ Admin raises a handover request for them (existing "raise for an owner"), then starts the checklist.
   One checklist per unit and per request.
3. **Who changes it:** the office whose company has the request now (reassigning the request moves the checklist
   with it), and JAD+ Admin. JAD+ viewers read. Owners read their own units' checklists in My unit ("Your
   handover"); joint buyers see the same one. Tenants never.
4. **Rules (pure, tested):**
   - a step is marked done or put back to pending, with an optional note for the owner (plain text, 300
     characters, stored encrypted like other staff notes; the audit log records only that there was a note);
   - "Key collection appointment" is never ticked by hand: booking the appointment (a working day on the JAD+
     calendar, today up to 180 days ahead, and a visit time window) completes it; moving it keeps it done;
   - the appointment can be booked only once the final payment has cleared (no keys before payment);
   - "Keys collected" needs every other step done; it completes the checklist, which is then locked.
5. **The owner asks to change the appointment by writing on the handover request** ("Ask to change" opens the
   request page with its messages). No new channel, and contact stays inside JAD+ (ADR 0009).
6. **Concurrency:** every change starts its batch with a guarded update of `updated_at` (the value read, else 0,
   which breaks the table's CHECK), so two people changing the same checklist at once cannot both win; the losing
   batch, audit entry included, is rolled back (409).

### Investor education (O5, S4)

7. **Sessions** have a title, description, Dubai date and times (at most 12 hours), in person (an address) or
   online (an `https://` joining link), and a number of seats (1-500). JAD+ Admin, or the partner office of the
   JAD Global team assigned to the education service (active, primary or backup), schedules, changes (before the
   start, never below the seats booked) and cancels them. Viewers read. Any other office sees nothing.
8. **Owners** open Investor Education from New request (tapping the `booking` service opens the screen instead of
   the visit pop-up). The **next date is always shown**, or "Next date to be announced" when none is scheduled
   (S4). One seat per owner per session; a seat can be given back until the start.
9. **Choice made: "Full", no waiting list.** A full session shows "Full". A seat given back is open to anyone
   again. A waiting list would need promotion rules and notifications for a free session; we can add one if
   sessions fill up in practice. The last seat is taken in one SQL statement that writes an invalid `booked_at`
   (refused by the CHECK) when the session is already full, so two owners booking the last seat at once cannot
   both get it.
10. **Online links** are shown to owners only once they hold a seat, and only `https` links ever become tappable.
11. **"Send me the book"** is recorded once per owner; staff see the requests (with names; the read is audited)
    and mark each one sent. Fulfilment itself (printing, courier) happens outside JAD+, with the owner's address
    from Salesforce.
12. **Staff follow-up:** bookings per session with owners' names (audited read), "Mark attended" once the session
    has started, and a CSV export built in the browser from that list (spreadsheet-safe cells, seats given back
    left out).
13. **Cancelled sessions** stay visible to owners who held a seat ("This session was cancelled") until their end
    time, and are hidden from everyone else.

### Both

14. Every change is written to the audit log in the same batch (13 new actions in
    `apps/api/src/audit-actions/handover-education.ts`). No notifications yet: the inbox kinds are added in a
    separate change (see Consequences).
15. The app's words are in five languages (`screens-handover.ts`, `screens-education.ts`); Arabic, French, Russian
    and Chinese were drafted by Claude for native review (ADR 0016).

## Consequences

- Migration 0030: `handover_checklists`, `handover_steps`, `education_sessions`, `education_bookings`,
  `education_book_requests` (STRICT, CHECK lists mirrored from shared and drift-tested).
- API: `GET /api/me/handovers`; `/api/{admin|partner}/handovers` (list, start, steps, appointment);
  `GET /api/education`, seat, give back, book; `/api/{admin|partner}/education/...` (sessions, bookings,
  attendance, book requests).
- Console: "Handovers" and "Education" in both navigations (an office that is not the team sees an empty list or
  "run by the JAD Global team assigned to it").
- Demo seed: a checklist in progress for the demo owner's second unit (506-JAD288-C) and two upcoming sessions.
- Notifications wanted next (not built here): owner when a step is done, when the key collection is booked or
  moved, when a session they hold a seat on is changed or cancelled, a reminder the day before a session, and when
  the book is sent; the handover team when an owner writes on the handover request (already covered by message
  notifications); the education team when an owner reserves or gives back a seat (optional, could be a daily
  summary).
- Open for Naya: confirm the "no waiting list" choice; confirm that the key collection needs the final payment
  first; whether the book is printed or a PDF (if a PDF, it can be served from R2 instead of "sent").
