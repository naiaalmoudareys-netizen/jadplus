# JAD+ architecture

## Components

```
 iPhone / Android app (Expo, TypeScript)          Web console (React + Vite, TypeScript)
 owner · tenant · technician                       JAD+ Admin · viewer · partner office
            │  HTTPS, bearer session token                  │  HTTPS, Cloudflare Access + session
            └──────────────────────┬────────────────────────┘
                                   ▼
                    JAD+ API — Cloudflare Worker (Hono, TypeScript)
          auth · roles · requests · SLA engine · escalation · notifications · audit
            │ D1 (SQLite)   │ R2 (photos, PDFs, ID docs, private)   │ Cron triggers
            ▼                                                       ▼
   Salesforce via the finance-worker proxy (read owners/units/payment plans; write leads)
   Email (Microsoft Graph, jadplus@) · WhatsApp (Anantya/Meta, Phase E) · Push (Expo, Phase E)
```

## Shared domain package

`packages/shared` holds every business rule as pure, unit-tested TypeScript: calendar, statuses and
transitions per role, SLA clock, emergency rules, escalation, quote expiry, tenancy rules, scorecard thresholds,
and the zod schemas used by both the API and the apps. One rule, one place, one test.

## Environments

| Environment | Data                      | Who                                   | Domain                             |
| ----------- | ------------------------- | ------------------------------------- | ---------------------------------- |
| local       | fictional seed data       | developer                             | localhost                          |
| preview     | fictional demo data only  | JAD team, partners in briefings       | portal.jadglobal.ae (private link) |
| production  | real owners (pilot first) | owners, tenants, partners, JAD+ Admin | to be decided at launch            |

Production is created only after the security test and Naya's go-ahead.

## Data ownership

Salesforce = owners, units, deals, payment plans, construction progress, leads.
JAD+ D1 = requests, events, quotes, visits, tenancies, partners, scorecards, consents, sessions, audit log.
R2 = photos, reports, partner documents, identity documents (private, signed URLs).
