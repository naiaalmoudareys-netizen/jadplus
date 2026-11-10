# ADR 0017 — Emergencies: water leak and AC failure only

Date: 10-Nov-2026 · Decided by: Naya ("our emergencies are water leak and AC not working, everything else
shouldn't be there") · To review: Dr. Mohanad (this changes the Master Plan's E2, E3 and E15)

## Decision

Owners and tenants can report only two emergencies in JAD+:

- **Water leak** (still asks where the water comes from: the unit, the building, a neighbour or the fire
  system, so building management is alerted when it is not the unit's fault, E12)
- **AC failure** (an emergency from May to October, as in the plan, E14; outside those months it is a routine
  request)

Removed from the app and refused by the API (`raiseEmergencyBody` accepts `RAISABLE_EMERGENCY_TYPES` only):
no power, locked out, door or window won't lock, and the life-safety screen (fire, smoke, gas smell, injury)
with the 999 / 997 / 998 buttons. The API code that handled life-safety reports is removed.

Unchanged: the emergency engine (15-minute acknowledgement, backup at 30 minutes, on-call, E4-E7), the exact
L3 confirmation, which still ends "If anyone is in danger, call 999.", and the terms, which say JAD+ is not an
emergency service and name 999 / 998 / 997.

The full type lists stay in `packages/shared` and in the database, so requests raised before this decision keep
their meaning and label. The `emergency_life_safety` message template stays for the same reason.

## Why

JAD Global's partners respond to leaks and AC failures. Fire, gas and injuries belong to the emergency
services, and the terms already say so; a JAD+ screen for them could suggest JAD+ responds to them.

## Consequences

- BUILD_SPEC E2, E3 and E15 are marked "changed by ADR 0017".
- Lockouts and power cuts can still be raised as routine maintenance requests.
