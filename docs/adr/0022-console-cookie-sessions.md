# ADR 0022 — Console sessions in an HttpOnly cookie, with anti-forgery checks

Date: 10-Nov-2026 · Decided by: Naya (go-ahead for the JAD+ Admin console), details by Claude; closes ADR 0003
item 14 · To review: Naya

## Decision

- The web console signs in with the same email codes. Its session token is never given to the page: the API
  sets it in a `__Host-jadplus` cookie that is **HttpOnly** (page scripts cannot read it), **Secure**,
  **SameSite=Strict**, path `/`, no domain (bound to the exact host). Lifetimes stay those of console sessions
  (30 minutes idle, 12 hours at most).
- Because a browser sends cookies by itself, **every change made with the cookie** (anything but GET/HEAD) must
  also (C-WEB-2):
  1. come from an allowed console origin (`Origin` header; `CONSOLE_ORIGINS` per environment, plus
     `http://localhost:5173` on a developer machine), and
  2. carry the anti-forgery token in the `x-jadplus-csrf` header: an HMAC of the session id with the server's
     index key. The console receives it when signing in and from `GET /api/auth/me` after a reload.
- Only console sessions are accepted from the cookie; a phone token placed in it is refused. Signing out clears
  the cookie. The phone app is unchanged (Bearer token from secure storage, which browsers never send by
  themselves).
- In production the console is also behind Cloudflare Access (CLAUDE.md), and served from the same site as the
  API so the cookie stays first-party.

## Why

The console will handle buyers' personal data. A token readable by page scripts could be stolen by any injected
script; a cookie alone could be abused by another site making the browser send it. HttpOnly + SameSite=Strict +
origin check + anti-forgery token closes both.
