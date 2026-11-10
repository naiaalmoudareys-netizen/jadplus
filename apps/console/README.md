# JAD+ Console

The web console for JAD Global's staff and partner offices (ADR 0023): **JAD+ Admin** (Needs action, Requests,
Partners) and the **Partner office** (Jobs board, Team, Our numbers). React + Vite + TypeScript. English only
for now: the console is used by staff.

Sign-in is the same one-time email code as the app. The session lives in an HttpOnly `__Host-` cookie the page
cannot read; every change also sends the anti-forgery token (`x-jadplus-csrf`) and must come from the console's
own address (ADR 0022).

## Run it on your computer

You need two windows, both started from the repository folder (`C:\dev\jadplus`).

1. Once, put the demo people and data in the local database:

   ```
   pnpm --filter @jadplus/api db:migrate:local
   pnpm --filter @jadplus/api db:seed:local
   ```

2. Window 1, the API (keep it open; the sign-in codes appear here):

   ```
   pnpm --filter @jadplus/api dev
   ```

3. Window 2, the console:

   ```
   pnpm --filter @jadplus/console dev
   ```

4. Open http://localhost:5173 and sign in with a demo account:
   - `admin.demo@jadplus.ae`: JAD+ Admin
   - `office.demo@jadplus.ae`: Partner office of the demo partner

   No email is sent locally: the 6-digit code is printed in the API window.

The console's local server sends every `/api/...` call to the API on http://127.0.0.1:8787, so the browser sees
one address and the cookie stays first-party. Use exactly `http://localhost:5173` (not 127.0.0.1): that is the
address the local API accepts changes from.

## Checks

```
pnpm --filter @jadplus/console typecheck
pnpm --filter @jadplus/console test     # router, formatting, grouping, API client, security headers
pnpm --filter @jadplus/console build    # production files in apps/console/dist
```

## Production

`pnpm --filter @jadplus/console build` writes static files to `dist/`, including `_headers` (strict CSP with no
inline scripts or styles, HSTS, no referrer, no framing) for Cloudflare Pages. The console must be served from
the same site as the API (for example `/api/*` routed to the Worker) and behind Cloudflare Access; the
console's address must be listed in the API's `CONSOLE_ORIGINS`. Fonts are bundled (Hanken Grotesk, SIL Open
Font License), so no visitor is sent to a third party.
