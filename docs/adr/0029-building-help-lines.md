# ADR 0029: Building help lines (security and building management)

- Status: accepted
- Date: 11-Nov-2026
- Decided by: Naya (IT / Tech Manager)
- Requirements: E12 (water from roof / shared pipe / neighbour), L3 (no instructions), ADR 0009 (all contact
  through JAD+), ADR 0025 (buildings in JAD+ Admin)

## Context

Naya asked: "can we add security number and building management number, 2 buttons that can be clicked on if the
service is not inside the house ... and we also need a place where they can contact security for noise
complaint".

Some problems are not inside the resident's home and are not the job of a JAD+ partner: water from shared pipes
or a neighbour, the fire sprinklers, the lobby, lifts, corridors, parking, noise. The building's own security desk
and building management deal with these. Until now the app had no way to reach them.

## Decision

1. **Two lines per building**: Security (noise, parking, access, visitors) and Building management (common
   areas, lifts, shared pipes, building-wide AC). Each is a phone number and, optionally, its hours ("24/7",
   up to 60 characters). A line can also be set for a whole project; it is used by every building of the project
   that has no line of its own (the same rule as the home guide).
2. **A deliberate exception to ADR 0009** ("all contact goes through JAD+"). Building security and building
   management are not JAD+ partners and JAD+ does not run them, and Naya asked for direct calling. Residents call
   the building's number from their phone; JAD+ does not record the call. Partner and JAD+ staff contact details
   are still never shown to residents.
3. **JAD+ Admin keeps the numbers** on the building page of the console ("Resident help lines"): set, change or
   remove each line. JAD+ viewers only read. Every change is written to the audit log (who, when, which place
   and which line) **without the number itself**.
4. **Stored like other phone numbers**: these are service lines, not personal data, but the number is stored
   encrypted (AES-GCM, as for building management contacts) and never written to the log. Numbers are saved in
   international form (+971...); a UAE landline written locally ("04 ...") is accepted and converted. The app only
   dials a number in that form.
5. **Residents see only their own buildings**: owners for the buildings of their units, tenants for the building
   of their current tenancy (`GET /api/me/building-lines`). Partners and staff cannot call this route.
6. **Where residents see them**:
   - Emergency screen: when the water comes from outside the home (shared pipes, a neighbour, the sprinklers), a
     short message "This comes from outside your home, so the building is responsible. Contact them directly:"
     with "Call security" and "Call building management" (a button is hidden when its line is not set; with
     neither: "Building contacts are not available yet. Your report still reaches JAD+."). The same buttons are
     shown after the emergency is sent. **The report is still sent as before** (partner makes the unit safe,
     building management alerted, E12), and the fixed confirmation sentence (ADR 0020) does not change. No
     safety instructions are given (L3).
   - New request: a line at the top, "Problem outside your home (lobby, lift, corridor, parking, noise)?", opens
     Building help instead of creating a partner request.
   - Building help: a page reachable from My unit, Profile (Help) and the tenant's home card, with both lines,
     their hours and a Call button, and one chip per building when the person's homes are in several.

## Consequences

- JAD+ Admin must enter the numbers for each building (or project) before go-live; until then residents see
  "not available yet".
- Calls to the building are outside JAD+: JAD+ has no record of a noise complaint made by phone. If JAD+ later
  needs to track these, a "building issue" request type would be a separate decision.
- The texts in Arabic, French, Russian and Chinese were drafted by Claude and need a native speaker's review
  before go-live (ADR 0016).
