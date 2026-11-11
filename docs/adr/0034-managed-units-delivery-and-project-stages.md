# ADR 0034: Managed units, furnishing delivery dates and interior design stages

- Status: accepted (built; open points for Naya at the end)
- Date: 11-Nov-2026
- Decided by: Naya (IT / Tech Manager), wave 3 of the service coverage plan
- Requirements: O4, O5, A1, R2, S4, U4, U5, L4, C-AZ-1, C-AZ-2, C-AUD-1, C-UPL-1; builds on ADR 0021 (tenants),
  0026 (invoices), 0030 (JAD Global teams as providers), 0031 (consultations), 0032 (reports, PDF uploads), 0035
  (service-flow notifications)

## Context

The plan (O4) promises owners who let their home that they can "hand to Harbor for leasing / management". Until now
a property management consultation ended at the stage "Active" and nothing changed: the owner still had to invite
the tenant, approve every repair and had no statements. Units sold with complimentary management (for example one
year) had no place in JAD+ at all. Two partner services also stopped short of the plan: furnishing promises a
"delivery date in writing" (S4) and interior design runs "from concept to handover" (O5).

## Decision

### Managed units (O4)

1. **When a unit becomes managed.** An arrangement links a unit, its owner and a JAD Global property management team
   (partners.kind `jad_group`, ADR 0030), with a first day ("since") and an optional last day ("until"). It starts:
   - when the owner's **property management consultation reaches "Active"** (ADR 0031): from that day, open-ended;
   - when **JAD+ Admin sets it** on the person page (one of the person's units, a team, since, until);
   - by **bulk entry** for units sold with complimentary management (JAD+ Admin only, on the team's page in Partners):
     one line per unit with the unit name, the owner's email and the until date. The whole list is saved or nothing
     is: every row with a problem (unknown owner or unit, unit listed twice, unit already managed, date out of
     range) is shown and nothing is saved. The owner must have signed in once (JAD+ knows an owner's units only from
     Salesforce at sign-in); the audit log records ids and dates, never the email.
     History is kept: an arrangement is ended (JAD+ Admin, "End management"), never changed or deleted, and a new one
     is a new row (migration 0032 `managed_units`, database triggers). A unit has at most one arrangement not ended.
2. **The tenant (O4, U4, U5).** While a unit is managed, the managing team's office invites, extends and ends the
   tenant in the console ("Managed units" page), with exactly the owner's rules of ADR 0021 (dates, one tenant at a
   time, the tenant's account, masked contact). The tenancy still belongs to the owner (`owner_user_id`) and records
   the office person who created it. The owner sees the tenancy read-only with a "Managed by Harbor Property
   Management" card; the owner's invite / extend / end are refused with "Harbor … looks after its tenant". When the
   arrangement ends, the owner has these rights again.
3. **Tenant repairs (A1).** A tenant's repair request on a managed unit waits for the **managing team** instead of
   the owner: it shows on the team's Managed units page ("waiting for your approval"); the owner is not asked, not
   reminded and has no Approve / Decline buttons (the API refuses them). The team approves or declines with the same
   effects as the owner (ADR 0021): approve sends it on with the 4-working-hour clock from the approval; decline
   closes it ("declined"). The status stays "awaiting owner" in the database (the requests table's status list is not
   rebuilt, ADR 0030 §6); the lifecycle now allows the office (`partner_admin`) the same two moves.
4. **The maintenance company.** Each managing team may choose one outside maintenance partner for its managed units
   (for example the VIP portfolio maintenance company): "Maintenance company" on the Managed units page (or JAD+
   Admin on the team's page). An approved tenant repair goes to that partner when it is set, an outside partner and
   active **at the moment of approval**; otherwise the normal maintenance routing applies (primary, or backup).
5. **The owner's own requests (choice made).** An owner can still raise any request for a managed unit; it runs the
   **normal owner flow and routing**, not the manager's maintenance company. Reason: the owner chose and pays for that
   work (L4), and a quote for it is the owner's decision. The managing team is kept informed by seeing the unit's
   repair requests (raised by the owner or the tenant, and emergencies) on its Managed units page. It never sees the
   owner's resale, mortgage, Golden Visa or other private requests.
6. **Quotes stay with the owner (L4).** On a tenant repair approved by the team, a chargeable quote is still decided
   by the owner, as everywhere else.
7. **Monthly statements.** The managing team's office uploads one PDF statement per unit per month (20 MB at most,
   recognised by its first bytes `%PDF-`, private R2 storage, size and SHA-256 kept, the client's file name never
   kept), for months from the start of the arrangement up to the current month and never after it ended. A later
   upload for the same month corrects it; the earlier one stays as evidence. The owner (or a joint buyer on the same
   deal, while they own the unit) opens them in My unit → Documents → Statements; the team and JAD+ staff can too.
   Tenants never. Every download is written to the audit log. The owner gets a "statement ready" notification once
   per month (ADR 0035).

### Furnishing delivery date (S4)

8. After the owner approves the furnishing quote, the provider sets the **delivery date and time window** (morning,
   midday, afternoon) from the console job page or the technician app ("Set delivery date"): today up to one year
   ahead, while the job is booked or in progress. The owner sees "Delivery: [date, window]" on the request. **Moving
   it needs a reason**, which the owner sees (contact details masked, ADR 0009); every date ever given is kept
   (append-only), and the owner is notified each time (ADR 0035).

### Interior design stages (O5)

9. After the owner approves the interior design quote, the provider's office may mark **project stages**: Concept →
   Design approved → Fit-out → Handover (data in `packages/shared/src/project-delivery.ts`, mirrored by the database
   CHECK, drift-tested). They are optional, move forward only (skipping allowed, like consultation stages), may carry
   a short note for the owner, and can still be marked once the work is marked done. The owner sees a small stage
   timeline on the request and is notified at each stage (ADR 0035). Stages do not change the request's status or
   clocks.

### Partner office menu

10. The office's menu shows "Handovers" and "Snags to fix" only to a company assigned to the handover service,
    "Education" only to the education team, and "Managed units" only to a company assigned to property management
    or managing units now (`GET /api/partner/capabilities`). JAD+ Admin's menu is unchanged. The API checks every
    call again, as before.

## Consequences

- Migration 0032 adds `managed_units`, `manager_settings`, `managed_statements`, `delivery_dates`, `project_stages`
  (STRICT; CHECK lists mirrored from shared with drift tests; history tables append-only by trigger).
- New endpoints: `/api/admin/managed-units` (list, set, end, bulk), `/api/admin/manager-settings/:providerId`;
  `/api/partner/managed-units` (list, unit, tenancies, approval, statements upload), `/api/partner/manager-settings`,
  `/api/partner/capabilities`; `/api/owner/managed-units`; `/api/managed-units/:id/statements/:statementId/file`;
  `/api/requests/:id/project`, `PUT /api/partner/jobs/:id/delivery`, `POST /api/partner/jobs/:id/project-stage`.
  Every route declares its roles and checks the company or the owner (404 otherwise).
- 12 new audit actions (`apps/api/src/audit-actions/managed-units.ts`).
- App words in five languages (`apps/mobile/src/i18n/strings/screens-managed.ts`; Arabic, French, Russian and Chinese
  drafted by Claude for native review, ADR 0016). The console is English.
- Demo seed: the demo owner's unit 506-JAD288-C is managed by "Harbor Property Management (demo)" (complimentary,
  one year from the first of last month) with last month's SAMPLE statement in the local R2 bucket. 1204-J188 stays
  run by the owner, so inviting a tenant from the app can still be tried there.

## Open for Naya

- The managing team is not yet notified in its inbox when a tenant request waits for it, nor of the 30-day /
  end-of-tenancy notices on a managed unit (no partner inbox kind for these yet); today it sees them on the Managed
  units page. The owner still receives the end-of-tenancy notices.
- Confirm the choice for the owner's own requests (normal routing, team informed by seeing them) and that quotes on
  managed units stay the owner's decision (L4).
- Confirm that the JAD+ 48-hour "call the owner" list (A1) should call the managing team instead for managed units
  (today it lists them like any other waiting request).
- Bulk entry finds units by the owner's email; owners who never signed in must sign in once first (or JAD+ Admin
  sets them one by one later).
