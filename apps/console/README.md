# JAD+ Console

The web console for JAD Global's staff and partner offices (ADR 0023, 0025). React + Vite + TypeScript. English
only for now: the console is used by staff.

- **JAD+ Admin**: Overview · Needs action · Requests (request page with timeline, internal notes, replies, move
  to another partner, reclassify, cancel) · People (person page: units, tenancies, requests, agreements, sign out
  everywhere, freeze, raise a request for an owner) · Desk · Partners (partner page: documents to verify, rate-card
  changes, scorecard) · Services · Buildings (contacts, notices, home guide) · Offers · On-call · Reports · Audit
  log · Staff · Settings · Invoices (ADR 0026, being built). A JAD+ viewer sees the same pages without any change
  buttons, and not Audit log or Staff.
- **Partner office**: Overview · Dispatch (day view per technician) · Jobs (board and job page with every step) ·
  Messages · Quotes · Team (technician page: skills, time away) · Documents · Rate card · After-hours ·
  Performance (scorecard, feedback, CSV) · Invoices (ADR 0026, being built).

Pages live in `src/admin` and `src/partner`; logic without a screen (routing, sorting, dates, labels, dispatch
grid, rate cards, job steps) lives in `src/lib` with tests in `test/`.

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

4. Open http://localhost:5173 and sign in with a demo account. Each partner office sees its own workspace
   (ADR 0036): the header names the company, its kind and the services it handles, and the menu holds exactly
   its pages.
   - `admin.demo@jadplus.ae`: **JAD+ Admin**, every page, grouped: Today (Overview, Needs action), Requests
     (Service requests, Documents & account, Handovers, Education), People & places (People, Buildings,
     Offers), Providers (Partners, Services, Invoices), Control (On-call, Reports, Audit log, Staff, Settings).
     Each partner's page says which workspace it has and which pages its console shows.
   - `harbor.pm.demo@jadplus.ae`: Harbor Property Management (demo), a JAD Global team, workspace
     **Property management & handover**: Overview (handovers in progress, key collections this week, snags open
     and reopened, managed units, tenant repairs to approve, statements due), Dispatch, Jobs, Consultations
     (property management), Inspections & reports (soft snagging), Handovers, Snags to fix, Messages, Managed
     units, Team, Performance, Documents. No quotes, invoices, rate card or after-hours.
   - `harbor.re.demo@jadplus.ae`: Harbor Real Estate (demo), a JAD Global team, workspace **Sales & leasing
     advisory**: Overview (consultations by stage, first calls due and overdue, valuation reports due, next
     investor session and seats, books to send), Consultations (leasing and resale pipelines), Inspections &
     reports (valuations), Messages, Education, Team, Documents. No dispatch, jobs, quotes, invoices or rate card.
   - `office.demo@jadplus.ae`: Demo Fixers LLC, an outside partner, workspace **Maintenance & home services**
     (also finance & residency advisory: mortgage, Golden Visa): Overview (emergencies to acknowledge, visits
     today, jobs without a technician, quotes waiting, overdue, the month against JAD+ targets, who is away,
     then reports and consultations), Dispatch, Jobs, Consultations, Inspections & reports (professional
     snagging), Quotes, Messages, Team, Performance, After-hours, Documents, Rate card, Invoices.

   No email is sent locally: the 6-digit code is printed in the API window.

The console's local server sends every `/api/...` call to the API on http://127.0.0.1:8787, so the browser sees
one address and the cookie stays first-party. Use exactly `http://localhost:5173` (not 127.0.0.1): that is the
address the local API accepts changes from.

## Checks

```
pnpm --filter @jadplus/console typecheck
pnpm --filter @jadplus/console test     # router, API client, sorting, dates, dispatch, rate cards, security headers
pnpm --filter @jadplus/console build    # production files in apps/console/dist
```

## Production

`pnpm --filter @jadplus/console build` writes static files to `dist/`, including `_headers` (strict CSP with no
inline scripts or styles, HSTS, no referrer, no framing) for Cloudflare Pages. The console must be served from
the same site as the API (for example `/api/*` routed to the Worker) and behind Cloudflare Access; the
console's address must be listed in the API's `CONSOLE_ORIGINS`. Fonts are bundled (Hanken Grotesk, SIL Open
Font License), so no visitor is sent to a third party.
