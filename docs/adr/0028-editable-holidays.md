# ADR 0028: JAD+ Admin keeps the public holidays

- Status: accepted
- Date: 11-Nov-2026
- Decided by: Naya (IT / Tech Manager)
- Requirements: E20 (working calendar), S4 (service-level clocks), ADR 0013 (preferred visit day)

## Context

Routine requests run on a working-hour clock (Monday to Friday, 09:00 to 18:00 Dubai) that skips UAE public
holidays, and residents choose a preferred visit day from the next working days. Until now the holidays were
written in the code (`packages/shared/src/calendar.ts`). Islamic holidays (Eid al-Fitr, Arafat Day, Eid
al-Adha, Hijri New Year, the Prophet's Birthday) depend on the moon sighting and are only confirmed a few days
before, so waiting for a new release of JAD+ to correct a date is too slow.

## Decision

1. The holidays live in a database table (`holidays`, migration 0025), first filled with the list JAD+ shipped
   with. Working hours stay fixed in the code.
2. In the console, Settings has a **Public holidays** section. JAD+ Admin adds a holiday (a day and a name) or
   removes one; JAD+ viewers only read. Everything else on the Settings page stays a fixed rule: "These are fixed
   rules. To change one, contact IT."
3. **Only days after today can change.** Today and past days never change, so a deadline already running and the
   figures already reported stay as they were. A day that is already a holiday cannot be added twice.
4. Every change is written to the audit log with who made it, when, and the day and name (no personal data).
5. Every place that uses the working calendar reads the table: the routine 4-working-hour clock (new request,
   owner approval, request moved or reclassified by JAD+ Admin), the days offered and accepted as a preferred
   visit day, and the "outside working hours" rule for after-hours alerts (E5-E7).
6. The apps read the holiday list from `GET /api/calendar` (any signed-in person) to offer the right days. If the
   list cannot be read, they fall back to the list JAD+ shipped with; the API still checks the chosen day.

## Consequences

- Correcting an Eid date is a two-minute job for JAD+ Admin, with a trace in the audit log.
- A deadline set before a holiday was added is not recalculated; only new clocks see the change. This is
  deliberate (point 3) and keeps the numbers explainable.
- The shipped list in `calendar.ts` stays as the fallback and for tests; a test checks the migration seeded
  the same rows.
