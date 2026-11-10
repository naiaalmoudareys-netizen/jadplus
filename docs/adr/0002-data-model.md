# ADR 0002 — Data model and database conventions

Date: 09-Nov-2026 · Decided by: Claude (on Naya's standing instruction to pick the recommended option) · To review: Naya

## Context

JAD+ needs its own database for requests, partners, tenancies, sessions, consents and the audit trail
(Salesforce stays the system of record for owners, units and deals). The auditor will read the schema line by line.

## Decisions

1. **Migrations** live in `apps/api/migrations/NNNN_name.sql`, applied by `wrangler d1 migrations apply`.
   Split by area: 0001 identity, 0002 audit log, 0003 partners and catalogue, 0004 tenancies, 0005 requests.
   A test fails if numbers have gaps. Applied migrations are never edited; changes go in the next number.
2. **Every table is `STRICT`** (SQLite refuses wrong types) and every status, role or type column has a
   `CHECK` list. The lists repeat the constants in `packages/shared`. A test inserts every shared value and
   one made-up value, so the database and the code cannot quietly drift apart.
3. **The database enforces business rules too**, as a second line of defence behind the API. For example: an
   approved quote must name the owner, or point at the owner's make-safe cap consent (L4, E8); "no access"
   needs a photo (A7); one current primary and one current backup partner per service (S3); one current
   tenancy per unit; only a 32-byte hash of a session token can be stored (C-SES-1); a sign-in code
   cannot live longer than 10 minutes (C-AUTH-1).
4. **Append-only evidence, enforced by triggers**: `audit_log` cannot be edited, and a row can be deleted only
   after 366 days (the 1-year retention minimum). `request_events` and `consents` can be neither edited nor
   deleted. Withdrawing marketing consent or changing the make-safe cap adds a new row. Retention purges for
   consents and request history will come in a later migration once legal confirms the periods
   (DATA_PROTECTION.md).
5. **Conventions**: ids are random TEXT made by the API; instants are INTEGER milliseconds UTC (the same
   unit the shared calendar uses); calendar dates are `YYYY-MM-DD` TEXT; money is INTEGER fils (AED × 100)
   to avoid rounding errors.
6. **Personal data** (email, phone, name, partner alert phone) is stored only as AES-GCM ciphertext
   (`*_enc`). Where we must find someone by email or phone (sign-in), a keyed HMAC-SHA-256 "blind index"
   (`*_hash`) is stored alongside. A copy of the database alone reveals no contact details. Client
   filenames are never stored; attachments keep only the sniffed type, size and SHA-256.
7. **Salesforce data is referenced, not copied**: requests and tenancies hold the Salesforce unit id only.
8. **Schema tests run on Node's built-in SQLite** (`node:sqlite`, the same engine family as D1).
   `@cloudflare/vitest-pool-workers` supports only vitest 4, and this repo pins vitest 5.1. The migrations
   were also applied to a real local D1 (`pnpm --filter @jadplus/api db:migrate:local`), which confirmed that
   D1 enforces the triggers, CHECKs and foreign keys. CI and `engines` now pin Node 24 (LTS), which
   `node:sqlite` needs.
9. **Test-only Node typings**: `apps/api/tsconfig.json` checks `src` with Cloudflare Workers types only. Tests
   have their own `test/tsconfig.json` that adds Node types, so Worker code cannot use Node-only APIs by mistake.

## Consequences

The schema is self-documenting and self-defending, and each rule has a test named after its requirement ID.
Adding a status now means changing `packages/shared` and adding a migration (SQLite cannot alter a CHECK in
place; the migration rebuilds the table). That is deliberate friction for an audited system.
