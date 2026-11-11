# JAD+ — project guide for Claude

JAD+ is JAD Global Real Estate Development's after-sales platform: "Every request, on the clock."
One backend, a native iPhone/Android app (owners, tenants, partner technicians) and a web console
(JAD+ Admin, partner offices). It stores personal data of property buyers (names, emails, phones,
Emirates ID / passport documents) and **will be audited line by line before launch**.
Every change must be clean, tested, secure and explainable to an auditor.

Product source of truth: `docs/BUILD_SPEC.md` (requirement IDs R/O/S/L/E/A/U/P/T/V, from the
JAD+ Master Plan of 15-Oct-2026). Cite the requirement ID in code comments, tests and commits.

## People

- **Naya** (IT / Tech Manager): owner of this codebase. Non-developer stakeholders read our summaries,
  so explain in plain language.
- Steven (Marketing Director) owns the plan; Mr. Omar (GM) approves all payments; Dr. Mohanad approves the plan.
- Never put personal data, phone numbers or partner contact details in code, tests, fixtures, docs or commits.
  Fixtures use obviously fictional people (e.g. "Layla Haddad", `demo@jadplus.ae`, `+971 50 000 0000`).

## Architecture (pnpm monorepo)

| Path              | What                                                                                                                                                        | Stack                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/shared` | Domain logic and types shared by every app: statuses + allowed transitions, SLA clock, working calendar, emergency rules, zod schemas for every API payload | TypeScript, zod, Vitest                                           |
| `apps/api`        | The only backend. REST JSON API on Cloudflare Workers; D1 (SQLite) + R2 (photos/PDFs) + KV; scheduled jobs (SLA timers, escalation, reminders)              | TypeScript, Hono, zod, Vitest (`@cloudflare/vitest-pool-workers`) |
| `apps/mobile`     | Owner / tenant / partner-technician app for iOS and Android                                                                                                 | Expo (React Native), TypeScript, expo-router, expo-secure-store   |
| `apps/console`    | JAD+ Admin console and partner office console (web)                                                                                                         | TypeScript, React, Vite                                           |
| `docs/`           | BUILD_SPEC, ARCHITECTURE, SECURITY (threat model), DATA_PROTECTION, `adr/` decision records                                                                 | Markdown                                                          |

Salesforce stays the system of record for owners, units, deals, payment plans and construction progress.
JAD+ reads it through the existing finance worker proxy (integration user, read-only + lead creation) —
never store Salesforce credentials in this repo or in the apps.

The previous prototype lives at `Jad Global Share Point - IT\steven leads\portal-live` (plain JS, deployed as
the private preview on portal.jadglobal.ae). Use it as the **reference for proven logic** (SLA clock, calendar,
sign-in hardening, Salesforce proxy, service catalogue); port it into TypeScript with tests — never copy-paste blindly.

## Non-negotiable engineering rules

1. **TypeScript strict** everywhere (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). No `any`, no `@ts-ignore`, no non-null `!` without a comment saying why it is safe.
2. **Zero warnings**: `pnpm lint`, `pnpm typecheck`, `pnpm test` must pass with no warnings before any commit. ESLint `--max-warnings 0`.
3. **Every input validated** with a zod schema at the API boundary (body, query, params, headers we rely on). Reject unknown keys.
4. **Business rules live in `packages/shared`** as pure functions with unit tests (every rule in BUILD_SPEC gets at least one test named after its ID, e.g. `E6: emergency moves to backup after 30 min`).
5. **Database changes only through numbered migration files** in `apps/api/migrations` (`wrangler d1 migrations`). Never edit an applied migration.
6. **Small, readable modules**; no file over ~400 lines; no dead code, no commented-out code, no `console.log` (use the structured logger, which redacts personal data).
7. **Dependencies**: only well-maintained packages; pin via lockfile; `pnpm audit --prod` must be clean; justify every new dependency in the commit message.
8. **Commits**: conventional commits (`feat(api): …`, `fix(shared): …`), small, with requirement IDs. Never commit secrets, `.dev.vars`, `.env`, keys or real data.

## Security standard (highest — personal data of buyers)

Full threat model and controls: `docs/SECURITY.md`. Minimum on every change:

- **AuthN**: passwordless email (later WhatsApp) one-time code, 6 digits, single use, 10-minute expiry, hashed at rest, constant-time compare, rate-limited per IP and per identity, lockout after repeated failures. Sessions: random 256-bit tokens, stored **hashed**, idle + absolute expiry, revocable ("sign out everywhere"), rotated on privilege change. Mobile stores the token only in `expo-secure-store`.
- **AuthZ**: deny by default. Every endpoint declares its role(s) (owner, tenant, partner, partner_admin, jad_admin, jad_viewer) and checks **object ownership** (an owner sees only their units; a tenant only their tenancy; a partner only jobs assigned to it). Never trust IDs from the client without an ownership check. Admin console additionally behind Cloudflare Access.
- **Personal data**: collect the minimum. Emirates ID / passport files only in R2 with private access, served through short-lived signed URLs after an authZ check. Sensitive columns (phone, email, ID numbers) encrypted at the application layer (AES-GCM, key in Workers secrets) where stored outside Salesforce. Never log personal data; the logger redacts emails, phones and tokens.
- **Web security**: strict CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`, CSRF protection (same-origin + token for cookie sessions), CORS allow-list only (app origins), `SameSite=Strict` HttpOnly Secure cookies on the web.
- **Uploads**: type sniffing (not just extension), size limits, images re-encoded/stripped of EXIF location, PDFs size-limited; filenames never trusted.
- **Secrets**: only in Cloudflare secrets / EAS secrets; `.dev.vars` is git-ignored; secret scanning (gitleaks) in CI.
- **Audit trail**: every state change and every admin action written to an append-only `audit_log` (who, role, what, when, IP hash). Kept 1 year minimum.
- **Legal (L1-L4)**: terms + make-safe cap + marketing consent accepted with timestamp and version; the app never gives instructions; emergency screen text is exactly as in the spec.
- When in doubt, choose the safer option and write it down in `docs/adr/`.

## Commands

```
pnpm install            # once
pnpm lint               # eslint, max-warnings 0
pnpm typecheck          # tsc --noEmit in every package
pnpm test               # vitest in every package
pnpm check              # all three — must be green before every commit
pnpm --filter @jadplus/api dev        # local API (wrangler dev)
pnpm --filter @jadplus/mobile start   # Expo
```

## How to work in this repo

- Start every task by reading the relevant BUILD_SPEC rows and the existing code; plan, then build with tests.
- **Design (decided 10-Nov-2026):** every screen follows `docs/DESIGN.md`, the prototype's look (cream, slate,
  navy, bronze, Hanken Grotesk) with the logos, project photos and videos in `apps/mobile/assets/brand/`.
  The owner app also gets **News & exclusive offers (N1–N4)**, specified in `docs/DESIGN.md` (not in the Master Plan).
- Build view by view in the order of BUILD_SPEC "Build order" (Phase A partner view + emergency engine first).
- After each feature: run `pnpm check`, update BUILD_SPEC status (TODO → BUILT) and, if a decision was made, add an ADR.
- Never deploy to production or touch real Salesforce data without Naya's explicit go-ahead in the chat.
  The private preview (portal.jadglobal.ae, demo data only) is the place to show progress.
- Report to Naya in plain language: what was built, how it was verified, what is left.

## Current state and next steps (update at the end of every session)

- 09-Nov-2026: repo created. Done: strict tooling, CI (lint/typecheck/test/audit/CodeQL/gitleaks, Dependabot),
  `packages/shared` calendar + emergency rules + role/status transitions (17 tests), `apps/api` foundation
  (security headers, request id, body limit, safe errors; 4 tests), docs (SECURITY, ARCHITECTURE, DATA_PROTECTION, ADR 0001).
- 09-Nov-2026 (session 2, autonomous, nothing committed yet): 158 tests, `pnpm check` green.
  Done: D1 migrations 0001-0006 (STRICT tables, CHECK lists mirrored from shared + drift tests, append-only
  triggers; applied to real local D1) — ADR 0002. Sign-in by email code, rate limits/lockout, hashed sessions,
  switch view, sign out everywhere, deny-by-default + requireRole, ownership rules, redacting logger, audit log,
  AES-GCM field encryption + blind indexes — ADR 0003. Phase A engine: raise emergency (E1-E3, E12, E14, L3),
  partner queue + acknowledge (R3, E4, E17), escalation cron (E5-E7), SLA clocks (S4), scorecard + compliance
  rules (S6, S7), notifications outbox — ADR 0004. Verified end to end in `wrangler dev` (sign-in, cron move to backup).
  Tests use Node's built-in SQLite through a D1 stand-in (`apps/api/test/d1.ts`); Node 24 required.
- 10-Nov-2026 (session 3): first commit made (one commit, the work did not split cleanly). Owners sign in with
  the email OR mobile number on their Salesforce record (ADR 0005): `packages/shared/src/owners.ts`,
  `apps/api/src/salesforce/directory.ts` (finance worker via service binding FIN + PORTAL_KEY),
  `apps/api/src/owners/` (link + unit check), migration 0007 `owner_units`. Salesforce side written but NOT
  deployed: `integrations/salesforce` (new Apex class JADPlusIdentity + Account.Mobile_Match_Key__c +
  finance-worker door snippet; Apex tests not yet run in the org). 183 tests, `pnpm check` green.
- 10-Nov-2026 (session 3, cont.): pushed to GitHub by Naya. Daily partner check (S6, S7, P3: auto-suspend on
  lapsed documents, waiting jobs to backup, review list), admin review list API, on-call rota API — ADR 0006,
  migration 0008. 203 tests.
- 10-Nov-2026 (session 3, cont.): alert delivery engine (fan-out, SMS/email senders as plug-in points, retries,
  undelivered list for admin) — ADR 0007, migration 0009. No provider connected yet: every alert is marked
  undelivered. 218 tests.
- 10-Nov-2026 (session 3, cont.): `apps/mobile` Expo SDK 58 app (expo-router, SecureStore session, API client
  validating answers with `packages/shared/src/responses.ts`): sign-in by email/mobile code, partner job queue
  with clocks, acknowledge with technician + arrival window, account (switch view, sign out everywhere).
  `GET /api/partner/team`; local demo seed `pnpm --filter @jadplus/api db:seed:local`; try-it guide in
  `apps/mobile/README.md` — ADR 0008. Android + iOS bundles build; end-to-end run against local API. 237 tests.
- 10-Nov-2026 (session 3, cont.): Naya: providers, Salesforce deploy and store accounts wait until go-live;
  **all contact goes through JAD+** (ADR 0009). Built: messages on requests (migration 0010, contact details
  removed before saving), unit location on partner jobs (Salesforce building + address), owner/tenant app home
  with "Report an emergency" (E3 numbers screen, exact L3 text), my requests, request page with messages
  (`apps/api/src/requests/resident.ts`, `views.ts`). 257 tests; end-to-end run against local API.
  Another session added `docs/DESIGN.md` + `apps/mobile/assets/brand/` (prototype look, News & offers N1-N4).
- 10-Nov-2026 (session 3, cont.): design pass (DESIGN.md tokens, Hanken Grotesk, logo, project photos);
  sign-in fixes from Naya's iPhone test. Owner tabs (ADR 0010): Home (next payment, latest news), My unit,
  Payments (prototype rules in `packages/shared/src/payments.ts`, Pay now → pay.jadglobal.ae), News & offers
  (N1-N3, "I'm interested" → migration 0011 `offer_interests`), Progress, Profile. `GET /api/owner/portal`:
  Salesforce `JADPortalApi.owner` via finance-worker route `jadplus-owner` in production only; demo owner
  elsewhere (app shows "DEMO DATA"). 276 tests. Not yet: PDFs (receipts, SPA), floor plan, photos, N4/L1 switches.
- 10-Nov-2026 (session 3, cont.): photo fixes (wide project crops in `assets/brand/projects/wide/`); owner
  documents (ADR 0010 §10-11, Naya: show identity documents too): floor plan, passport/Emirates ID copies,
  receipt PDFs via `/api/owner/files/:id` (demo: generated SAMPLE PDF + drawn sample plan), opened in the
  system viewer from a private temp folder cleared on sign-out. 284 tests. Naya: desk requests stay in
  Salesforce (JAD_Plus_Request__c), like the prototype. Owner view order: documents (done) → desk requests →
  Profile switches (N4, L1), then the console.
- 10-Nov-2026 (session 3, cont.): image fix (bundled images need explicit 100% size, else drawn at their own
  pixel size: Naya's floor plan screenshot); desk requests (ADR 0011, migration 0012): Documents rows
  (Reservation Form, SPA, statement, NOC, title deed) with Request / status / Open, Profile "JAD+ desk"
  (contact change, close account, other). Production → Salesforce `jadplus-desk` route. 292 tests.
  Next: Profile switches (N4, L1), then the console.
- 10-Nov-2026 (session 3, cont.): Naya: tabs Home · My unit · Payments · Requests · Profile (news at the end of
  Home, construction at the end of My unit). Routine requests (ADR 0012, migration 0013 catalogue):
  `GET /api/services`, `POST /api/requests` (owners; partner / JAD+ team / "coming soon"; 4-working-hour
  clock), New request screen. Mr. Omar real-data pilot postponed by Naya. 302 tests.
  Next: tenant requests with owner approval (A1), partner routine steps, Profile switches, console.
- 10-Nov-2026 (session 3, cont.): request details (ADR 0013, migration 0014): residence always shown,
  preferred working day + window, up to 3 photos (phone re-encode + API sniff/strip, private R2,
  `/api/requests/:id/photos`). New Home (ADR 0014): greeting, needs-your-attention, shortcuts, next payment,
  top 2 requests, construction line, news carousel (+ hidden `news` route for "See all"). 317 tests.
- 10-Nov-2026 (session 3, cont.): New request reworked (ADR 0015): project → unit → service; tapping a
  service opens a bottom pop-up (day, time, description, photos, Send). Demo seed now gives the demo owner
  the portal's two units (1204-J188, 506-JAD288-C). 320 tests.
- 10-Nov-2026 (session 3, cont.): Home shortcuts land on the right section (scrollTarget). Profile redone
  (ADR 0016): grouped settings, languages en/ar/fr/ru/zh (typed dictionary `apps/mobile/src/i18n/`, Arabic RTL
  via `direction`, non-English drafted by Claude for native review), notification switches + marketing consent
  (N4), terms screen until current draft terms accepted (L1), migration 0015 `user_preferences`,
  `/api/me/preferences`, `/api/me/consents`. Every screen translated. Emergencies: water leak + AC only
  (ADR 0017, Naya; Dr. Mohanad to see). Request journey (ADR 0018): partner books visit, quotes, finishes with
  photos; owner decides quotes; resident confirms or reopens and rates; clock job expires quotes (14 d) and
  auto-closes (72 h). API `dev:phone` for phone testing. In-app notifications + reminders, on my way, no access,
  make-safe limit, cancel / arranged myself (ADR 0019, migration 0016); emergency text without "call 999"
  (ADR 0020). 414 tests.
- Waiting on Naya (all before go-live, not now): providers (SMS/voice, Graph email, WhatsApp); Salesforce
  deploy (`integrations/salesforce/README.md`, sandbox first); Apple/Google/Expo company accounts; review
  ADRs 0002-0009. Claude's `git push` sometimes needs Naya to run it.
- 10-Nov-2026 (session 3, cont.): web console `apps/console` (React 19.3 + Vite 8, ADR 0022/0023): cookie sign-in
  with origin + anti-forgery checks (verified end to end on wrangler), JAD+ Admin (Needs action, Requests,
  request page, Partners, review list) and partner office (Jobs board with assign, Team, Our numbers). Technician
  app tabs Today / Jobs / Done / Profile. Tenants (ADR 0021), repairs only. 504 tests. Console local run:
  `apps/console/README.md` (Chrome/Firefox, http://localhost:5173). Gaps: request timeline API, admin reply box,
  on-call rota and undelivered-alert screens, partner document upload.
- 10-Nov-2026 (session 3, cont.): notifications for technicians and partner offices, and for new messages
  (ADR 0024, migration 0018). Full console API and screens (ADR 0025, migrations 0019-0021): JAD+ Admin
  (overview, needs action, requests with timeline/notes/reassign/reclassify/cancel, people, desk, partners,
  services, buildings with notices and home guide, offers, on-call, reports, audit log, staff, settings) and
  partner office (overview, dispatch, jobs, messages, quotes, team, documents, rate card, after-hours,
  performance). Partner invoices recorded in JAD+, paid directly to the partner, 5% VAT, no commission
  (ADR 0026, migration 0022); owner app shows invoices, building notices and the home guide. 708 tests.
  Open: invoice pages in the console (placeholders; API ready), per-technician office stats, deadline on the
  console job page, completion photos from the console, offer titles, audit search by name, E12 building
  management delivery, after-hours contact in escalation, resident notice when JAD+ cancels/moves a request or
  posts a building notice, PDF tab vs CSP check, console bundle split. Waiting on Naya: whether payment
  instructions may hold bank details/links; partner targets (95% on time, 4.0 rating, 5% repeat visits).
- 11-Nov-2026: those open items built (ADR 0025 follow-up, ADR 0027, migrations 0023-0024): console invoice
  pages, per-technician numbers, deadline + acknowledged on job pages, office completion photos, offer titles,
  audit lookup by exact email/mobile, PDFs download, console split per role; residents told when JAD+ cancels,
  moves or reclassifies a request and of building notices; after-hours technician alerted out of hours;
  building management alerts queued (undelivered until providers). 768 tests. Open: invoice CSV export, E13
  misuse reporting, V1 incident linking, after-hours per-partner calendar, whether building management may get
  the unit number by SMS/email (Naya).
- 11-Nov-2026 (cont.): Naya approved: public holidays editable by JAD+ Admin (future dates only, audited;
  ADR 0028, migration 0025, `loadCalendar(db)` feeds clocks and preferred days, `GET /api/calendar` for the
  apps); other Settings stay read-only with a note; console menu "Service requests" and "Documents & account"
  (was Requests / Desk); "Needs action" warns when this week or next has someone missing on the on-call rota
  (E6, E7). 793 tests.
- 11-Nov-2026 (cont.): invoice payment text allows bank details and links, refuses phones/emails (ADR 0026).
  Management deck with real screenshots (89 slides) on Naya's Desktop: "JAD+ Every Case Every Screen.pptx" (built
  outside the repo). Building help lines (ADR 0029, migration 0026): Security and Building management numbers per
  building or project set in the console; app shows Call buttons when a leak comes from outside the home, on New
  request ("problem outside your home") and on a Building help page (noise complaints → security). 836 tests.
  Open: whole-building AC failure and common-area reports routed to building management (E12, asked Naya),
  linking requests to one building incident (V1).
- 11-Nov-2026 (cont.): Service coverage map for Naya (Desktop "JAD+ Service Coverage Map.docx/.pdf", from her
  services sheet; contacts left out). Built to cover it, in three waves: service flows + per-service first
  deadlines + JAD Global teams as providers (ADR 0030, mig 0027); consultation flow with consent and stages
  (ADR 0031, mig 0028); PDF reports, snag lists, re-inspection (ADR 0032, mig 0029); handover checklist and
  education bookings (ADR 0033, mig 0030); notifications for all of them (ADR 0035, mig 0031); managed units
  with Harbor PM, monthly statements, furnishing delivery dates, interior design stages, capability-based
  office menu (ADR 0034, mig 0032). 1,075 tests. Open: office notification for managed-unit approvals,
  48-hour "call the owner" for managed units, report upload from the technician app, Hospital check-ups
  as a News & offers post (no build), native-speaker review of new texts, Naya's confirmations listed in
  ADRs 0030-0035.
- 11-Nov-2026 (cont.): provider workspaces (ADR 0036: each office's console derived from its services, API
  403 outside it); console review fixes (strict D1 stand-in for bind counts, shared partner document kinds);
  `pnpm db:demo:company` (scripts/company: fictional company simulated through the real API over 90 days);
  wording fixes (visit status from the real on-my-way fact, "Visited", consultation facts, plurals).
  Desktop for Naya: deck "JAD+ Every Case Every Screen.pptx" (100 slides, built in the scratchpad, not in
  the repo), "JAD+ How Every Case Is Covered.pdf" (6 pages), "JAD+ Management Summary.pdf" (2 pages).
  1,124 tests.
- Parked by Naya (10-Nov-2026, "put it aside"): tenant page extras: "My home" card (dates, days left, managed
  via JAD+), tenant "needs your attention", building notices (V1), move-in / move-out checklists with photos,
  home guide per building. Tenants request repairs only (ADR 0021).
- Next, in order:
  1. Connect providers once Naya confirms them (SMS/voice, Graph email, WhatsApp): one Sender each (ADR 0007),
     and use the same senders for sign-in codes.
  2. Mobile: documents/receipts as PDFs through a secure file route, notification + marketing switches (N4, L1),
     message + push alerts, screen tests.
  3. `apps/console` scaffold with cookie sessions + CSRF (ADR 0003 item 14): admin requests inbox, SLA risk list, scorecards.
  4. Phase B: tenant invitations, routine requests, owner approvals, quotes (A1-A3, U4/U5).
- Reference prototype: `Jad Global Share Point - IT/steven leads/portal-live` (in Naya's OneDrive).
- Flow deck (all views, cases, edge cases): Desktop `JAD+ Complete Flow.pptx` (produced 09-Nov).
