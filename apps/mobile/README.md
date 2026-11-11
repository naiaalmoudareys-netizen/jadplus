# JAD+ mobile app (iPhone and Android)

Expo (React Native, TypeScript). Today: sign-in by email or mobile code, and the **partner technician** view —
job queue with clocks (R3) and acknowledging an emergency (E4). Owner and tenant screens come in phase B.
Decisions: `docs/adr/0008-mobile-app.md`.

## Try it on your phone (local demo data, about 10 minutes)

You need: this repo installed (`pnpm install`), the **Expo Go** app on your phone, and the phone on the same
Wi-Fi as the computer.

1. **Local keys** (once). Copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` and fill `INDEX_KEY` and
   `DATA_KEY`, each with the output of:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
2. **Local database with demo data**:

   ```
   pnpm --filter @jadplus/api db:migrate:local
   pnpm --filter @jadplus/api db:seed:local
   ```

   Each seed run adds one new fictional emergency job for "Demo Fixers LLC".

   **Or a whole running company** (recommended to see every screen full): from the repository folder run
   `pnpm db:migrate:local`, then `pnpm db:demo:company`. This **replaces** everything in your local database
   with about three months of a fictional JAD+ (40 owners, 13 tenants, 9 providers, ~210 requests in every
   state, photos and PDFs). It takes about a minute and a half; run it again any time to start afresh with
   "today" as now. App accounts to try (the code is printed in the API window):
   - `layla.haddad@example.com`: owner of 1204-J188 and 506-JAD288-C; repairs in every state, a quote waiting
     for her decision, an invoice, a valuation report, a leasing consultation, a seat at an investor session,
     inbox, building notices, help lines and home guide.
   - `omar.al.mansoori@example.com`: owner whose unit is let to Rania Khoury; the tenancy ends within 30 days.
   - `priya.raman@example.com`: owner whose tenancy ended during the quarter (her email is one of two demo
     addresses that never receive alerts, so JAD+ Admin's undelivered list has entries).
   - `rania.khoury@example.com`: a tenant with repairs, approvals by the owner and messages.
   - `demo@jadplus.ae` (Sami Demo): a Demo Fixers LLC technician with jobs across the quarter (open ones
     on Today / Jobs, finished ones on Done).
     More accounts and what each console workspace shows: `apps/console/README.md`.

3. **Start the API so the phone can reach it**: `pnpm --filter @jadplus/api dev --ip 0.0.0.0`
   (allow it through the Windows firewall on private networks if asked).
4. **Tell the app where the API is**: find the computer's Wi-Fi address with `ipconfig` (IPv4, e.g.
   `192.168.1.20`) and create `apps/mobile/.env.local` (git-ignored) containing
   `EXPO_PUBLIC_API_URL=http://192.168.1.20:8787`
5. **Start the app**: `pnpm --filter @jadplus/mobile start`, then scan the QR code with the phone camera
   (iPhone) or with Expo Go (Android).
6. **Sign in** as the fictional technician `demo@jadplus.ae`. The 6-digit code is printed in the API's
   terminal (on a developer machine only; real email/SMS delivery is not connected yet).

You should see the emergency with its 15-minute clock. Open it, choose who is going and when, and press
**Acknowledge**: the job moves to "Scheduled" with the arrival time.

## For developers

- `pnpm --filter @jadplus/mobile typecheck` / `test` — part of `pnpm check`.
- Logic lives in plain TypeScript under `src/` (API client, session, formatting) and is unit-tested; screens in
  `app/` stay thin.
- The session token is kept only in the phone's secure storage (`src/session/secure-token-store.ts`).
- Every API answer is checked against the shared schemas (`packages/shared/src/responses.ts`).
