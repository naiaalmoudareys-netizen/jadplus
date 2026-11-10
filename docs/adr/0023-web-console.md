# ADR 0023 — The web console: JAD+ Admin and the partner office

Date: 10-Nov-2026 · Decided by: Naya ("lets move next to the admin console but also the supplier console …
needs work"), details by Claude · To review: Naya

## Decision

One web console (`apps/console`, React + Vite) for two kinds of staff, each seeing only their own pages:

| Who                                        | Pages                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| JAD+ Admin (`jad_admin`, viewer read-only) | Needs action · Requests (search, the request's full page) · Partners (status, documents, suspend / reinstate) |
| Partner office (`partner_admin`)           | Jobs board (assign the technician) · Team (add, remove) · Our numbers                                         |

Sign-in is the email code into an HttpOnly cookie with origin and anti-forgery checks (ADR 0022); in
production the console is also behind Cloudflare Access.

**Needs action** (`GET /api/admin/attention`, rules in `packages/shared/src/console.ts`), most urgent first:

1. emergencies nobody has acknowledged (E4-E7)
2. open requests past their next deadline (R4)
3. "no access" without a new visit within 24 hours (A7)
4. tenants' requests waiting 48 hours for the owner: JAD+ calls the owner (A1)
5. a declined quote with no revised quote within 3 days (A3)
6. JAD+ desk requests not yet handled (ADR 0011)

**Partner office**: adds technicians by name and email or mobile (they sign in with a code); removing one takes
effect at once: their partner role and sessions end and they can no longer be sent (E17). It chooses who goes
to each open job. It sees its own numbers (`GET /api/partner/stats`, company scope); a technician sees their
own. Owners never see scorecards (S8).

**Technicians** keep the phone app: tabs Today · Jobs · Done · Profile, the job page with one clear next step and
"Open in Maps".

**Not yet**: partner documents uploaded by the partner office (JAD+ Admin records them for now), rate cards (S9),
building notices and incidents (V1), on-call rota screens.

## Why

JAD Global's team must be able to run what the apps create without touching the database, and a supplier's
office must manage its own people and jobs. One console with strict role separation keeps one sign-in and one
place to secure.
