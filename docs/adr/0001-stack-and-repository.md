# ADR 0001 — Stack, repository and rebuild

Date: 09-Nov-2026 · Decided by: Naya

## Context

A plain-JavaScript prototype (portal-live) runs as a private preview. JAD+ will hold buyers' personal data and
will be audited line by line before launch; the master plan budgets Expo for the iPhone/Android apps.

## Decision

1. **Expo (React Native, TypeScript)** for the iPhone and Android app (not a web wrapper).
2. **Private GitHub repository under a JAD organisation**, with CI (lint, typecheck, tests, audit, CodeQL, secret scan) on every change.
3. **Rebuild cleanly in TypeScript**, porting the prototype's proven logic with tests; the prototype stays as the preview until replaced.
4. pnpm monorepo: `apps/api` (Hono on Cloudflare Workers, D1, R2), `apps/mobile` (Expo), `apps/console` (React + Vite), `packages/shared` (domain rules).

## Consequences

Strict standards from day one (zero warnings, tests per requirement ID), auditable history, one source of
business rules for every app. The repo lives at `C:\dev\jadplus` (not OneDrive-synced); GitHub is the off-laptop copy.
