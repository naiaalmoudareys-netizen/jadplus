# ADR 0015 — New request: project, unit, then a pop-up for the details

Date: 10-Nov-2026 · Decided by: Naya ("when we click one a pop up menu shows where he picks the date the time
and adds image and writing rather than having to scroll all the way down also we need to be able to select the
unit and the project"), details by Claude · To review: Naya

## Decision

The New request screen is short and asks in this order:

1. **Project**: one chip per project the owner has a unit in (with "1 unit" / "n units"). Pre-selected when
   there is only one. Units without a project in Salesforce are listed under "Other".
2. **Unit**: the owner's units in that project, with building and address. Pre-selected when there is only one.
   Changing the project selects the first unit of the new project.
3. **Service**: the catalogue as before (S1, S2: "coming soon" cannot be chosen).

Tapping a service opens a **pop-up from the bottom** (a native modal sheet; no new library) showing the
service and the chosen unit, then the day (next 10 working days), the time window, the description, up to 3
photos, and **Send**. Closing the pop-up (cross, tap outside, Android back) discards what was typed in it; it
cannot be closed while sending. Errors from the API are shown inside the pop-up.

Nothing changes on the server: the request, its checks (the unit must be one of the owner's, the day must be
one of the offered days) and the photo handling are those of ADR 0012 and 0013.

## Why

Naya found the single long form tiring to scroll. Owners with several units across projects must see clearly
which home the request is for, so the project and unit are chosen explicitly before anything else.

## Demo data

The local demo seed now gives the demo owner the same two units the demo portal shows (1204-J188 in J188 and
506-JAD288-C in JAD 288, Block C), replacing the older single "JAD288-1102" unit, so My unit and New request
agree.
