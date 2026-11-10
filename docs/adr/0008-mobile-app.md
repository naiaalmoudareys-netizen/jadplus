# ADR 0008 — Mobile app scaffold and partner technician screens

Date: 10-Nov-2026 · Decided by: Claude (Naya: "go ahead and build it") · To review: Naya

## Context

ADR 0001 chose Expo for the iPhone/Android app. BUILD_SPEC build order puts the partner view first (phase A):
job queue with clocks (R3) and emergency acknowledgement (E4).

## Decisions

1. **Expo SDK 58** (current release) with **expo-router** (screens are files in `apps/mobile/app`). Versions
   chosen by `expo install` so all native libraries match the SDK; `expo-doctor` passes 20/20 checks.
   New dependencies, all from the Expo / React Native core teams: expo, expo-router, expo-secure-store,
   expo-status-bar, expo-linking, expo-constants, react, react-native, react-native-safe-area-context,
   react-native-screens (react-dom only for expo-router's web build).
2. **Session token only in secure storage** (iOS Keychain / Android Keystore via expo-secure-store), readable
   only while the phone is unlocked and never copied to backups or another device. Never in plain storage.
   A token the API rejects is wiped at once. "Sign out" forgets the token even if the phone is offline.
3. **The app trusts nothing it receives**: every API answer is validated with the shared response schemas
   (`packages/shared/src/responses.ts`). The API's tests check its real answers against the same schemas, so
   the two cannot drift apart. Outside development the API address must be https.
4. **Arrival windows are chosen, not typed**: three choices (within 1 h, 1-2 h, 2-4 h) built by the shared
   `arrivalChoices`; the API applies the same shared rule (`arrivalWindowAllowed`). The technician defaults to
   the signed-in person; only active technicians of the same partner are offered (E17, new `GET /api/partner/team`).
5. **No push notifications yet**: the job queue refreshes every 30 seconds and when the screen is reopened.
   Push alerts join the delivery engine (ADR 0007) as a channel later.
6. **Testing**: logic (API client, session, formatting) is plain TypeScript, unit-tested with Vitest. Screens
   are kept thin and checked by building real Android and iOS bundles (`expo export`) and by an end-to-end
   run against the local API (sign in → queue → team → acknowledge). Screen-level automated tests
   (jest-expo / Maestro) are a later step.
7. **Audit fix by override**: Expo's build tools (@expo/cli) pull `glob` 13 and `minimatch` 10, which have
   two moderate advisories (GHSA-3g3m-2fjr-6pw4 and a minimatch denial-of-service). They are build-time tools,
   not shipped in the app, but `pnpm audit --prod` must be clean, so the root `package.json` pins the
   patched versions (glob 14.0.4, minimatch 11.0.1) through `pnpm.overrides`. Both phone bundles and
   `expo-doctor` were re-checked with them. Remove the overrides once Expo ships the fix.
8. **Owners and tenants** see a placeholder home with account settings until their phase-B screens exist.

## Known gap

A technician's job shows the description and clocks but **not yet where the unit is** (building and unit
number) or how to reach the resident. Location comes from the unit (Salesforce / owner units) and resident
contact must be designed with privacy in mind (e.g. calls through JAD+). To do before partners use the app.
