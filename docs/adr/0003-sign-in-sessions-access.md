# ADR 0003 — Sign-in, sessions and access control

Date: 09-Nov-2026 · Decided by: Claude (on Naya's standing instruction to pick the recommended option) · To review: Naya

## Context

CLAUDE.md "Security standard" fixes the shape: passwordless email codes, hashed sessions, deny-by-default
roles, object ownership checks, an audit trail and a logger that redacts personal data. This ADR records
the specific numbers and choices made while building it (controls C-AUTH-1/2/4, C-SES-1, C-AZ-1/2,
C-VAL-1, C-LOG-1, C-AUD-1).

## Decisions

1. **No account discovery.** "Send me a code" always answers the same neutral message, whether or not the
   email is registered, and the email is sent after the response (`waitUntil`). That way neither the
   answer nor its timing reveals who has an account.
2. **Codes**: 6 digits drawn without bias, valid 10 minutes, single use (consumed with a conditional update,
   so two parallel requests cannot both use it). A new code replaces the old one, and a code dies after 5
   wrong guesses. Codes are stored only as HMAC-SHA-256 with the secret `INDEX_KEY`, bound to the code's row
   id: a plain hash of a 6-digit number could be reversed by trying all million values.
3. **Rate limits and lockout** (stored in D1 so they are consistent across Cloudflare locations):
   code requests 10 per 15 min per network address and 5 per hour per email; code checks 30 per 15 min
   per address; 10 wrong codes per hour per email lock that email for an hour. A lockout is written to
   the audit log. Cloudflare edge rate limiting (C-RL-1) will be configured in front as well.
4. **Sessions**: 256-bit random token; the database keeps only its SHA-256. Phone: ends after 30 idle days,
   90 days at most. Console: 30 idle minutes, 12 hours at most. Activity extends the idle limit at most
   every 5 minutes, to limit database writes.
5. **One session = one role.** A person with several roles (owns one unit, rents another: R5/U7) switches
   with `POST /api/auth/switch`. That issues a new token and revokes the old one. Revoking a role ends
   every session bound to it immediately.
6. **Lost phone (T3)**: signing in on a phone ends that person's other phone sessions. "Sign out everywhere"
   ends all sessions on every device.
7. **Admin and partner-office roles only in the console** (C-AUTH-4): the phone app is never offered
   `jad_admin`, `jad_viewer` or `partner_admin`, even when the person holds them.
8. **Deny by default**: every `/api` route needs a session except `GET /api/health`, `POST /api/auth/code` and
   `POST /api/auth/verify` (`PUBLIC_ROUTES`). Unknown API paths answer "Please sign in" (401) rather than
   404, so the API does not reveal which routes exist. A test calls every registered route without a
   session and expects 401. Routes declare roles with `requireRole(...)`.
9. **Object ownership** rules are pure functions in `packages/shared/src/access.ts`. Owners see their units'
   requests; a tenant sees only their current tenancy's; a partner only jobs assigned to it (a job moved to
   the backup partner disappears from the first partner); JAD+ staff see all, and viewers never write.
   Request endpoints will call these rules.
10. **Tenancy end date (U4)**: access lasts through the end date and ends at 00:00 Dubai the next day. A lease
    "ending 31 December" normally includes 31 December. A tenant who still had access on that day could
    also raise an emergency then.
11. **Frozen accounts (U9)** can still read but cannot change anything, except signing out.
12. **Email delivery is not connected yet.** In preview and production, delivery fails safely: the failure
    is logged without the address or code, and the person sees the usual neutral message. On a developer's
    machine only (`ENVIRONMENT=local`) the code is printed in the terminal. Connecting Microsoft Graph
    (jadplus@) is a separate task.
13. **People must already exist in JAD+ to sign in.** Linking an owner from Salesforce on first sign-in
    (C-AUTH-3) needs the finance-worker proxy and Naya's go-ahead; it is not built and nothing touches
    Salesforce yet.
14. **Console cookies are deferred.** Both clients currently use a bearer token. The console will move to
    `__Host-` HttpOnly SameSite=Strict cookies with CSRF protection when `apps/console` is built; that work
    must land before the console handles real data.
15. **Errors**: one `ApiError` type, rendered centrally, so every error answer carries the security headers and
    request id. Validation errors name the field and the problem but never repeat the submitted value.
16. **Logs**: one JSON line per entry through `logger.ts`, the only module allowed to write to the console
    (apart from the local-only code outbox). Emails, phone numbers and token-like strings are removed from all
    text, and fields named like personal data or secrets are blanked. It errs towards over-redaction (an ISO
    date in a message can be mistaken for a phone number).

## Consequences

The sign-in flow is fully tested against the real schema (Node SQLite) and was run end to end against
real local D1 in `wrangler dev`. Open items: email delivery, Salesforce owner linking, console cookies + CSRF,
Cloudflare edge rate limiting rules.
