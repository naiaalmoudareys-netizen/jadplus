# ADR 0010 — Owner app tabs: Salesforce data passed through, demo until go-live

Date: 10-Nov-2026 · Decided by: Claude (Naya: "start with #1", owner tabs per docs/DESIGN.md) · To review: Naya

## Context

docs/DESIGN.md gives owners the prototype's tabs: Home, My unit, Payments, Services, News & offers (N1-N4),
Progress, Profile. Their data (units, payment plans, receipts, construction updates, JAD+ posts) lives in
Salesforce and is already exposed by the read-only Apex `JADPortalApi.owner` that the prototype uses. Naya wants
Salesforce connected only at go-live.

## Decisions

1. **One owner endpoint** `GET /api/owner/portal` returns everything the owner tabs show. It looks the owner up
   by their **own verified email** from JAD+'s encrypted record, never by anything the app sends (C-AZ-2).
2. **Pass-through, not stored.** JAD+ keeps no copy of payment plans, receipts or posts; they are fetched
   for the owner and shown. Only what the screens use is passed on: passport/Emirates ID documents,
   nationality and desk requests in Salesforce's answer are dropped (`packages/shared/src/portal.ts`).
   Salesforce's answer is validated; odd values become empty rather than breaking the app; only https links.
3. **Demo until go-live.** Only `ENVIRONMENT=production` reads Salesforce (finance-worker route
   `jadplus-owner`, same secret as the identity route, see integrations/salesforce/README.md). Local and the
   private preview return a fictional demo owner (ported from the prototype's demo, dates moving with today)
   and the app shows **"DEMO DATA · NOT A REAL ACCOUNT"** on every owner tab.
4. **Payment rules are the prototype's**, now in `packages/shared/src/payments.ts` with tests: paid
   (balance ≤ AED 1), overdue (days), due soon (≤ 30 days), part paid, upcoming, on completion; totals, % paid,
   overdue amount, next payment. **Pay now** opens pay.jadglobal.ae; JAD+ never takes payments (U11).
5. **News rules** (N1, N3) in `packages/shared/src/news.ts`: pinned first then newest; All / News / Offers
   (count). Salesforce already filters visibility; JAD+ re-checks publish/expiry dates so a stale answer never
   shows an expired offer.
6. **"I'm interested" (N2)** is recorded in JAD+ (migration 0011 `offer_interests`, audited, once per owner and
   offer) and only for an offer that owner can see today. Creating the Salesforce lead for sales follows when
   Salesforce is connected; the console will list open interests. Nothing is reserved or paid in the app.
7. **Tabs** (changed by Naya, 10-Nov-2026): owners get Home · My unit · Payments · Profile, with news &
   offers at the end of Home and construction progress (for that unit's project) at the end of My unit; tenants get Home · Profile (the
   unit's payments and owner news are the owner's). Services joins with phase B (routine requests). Owners
   with more than one unit switch units at the top of My unit and Payments.
8. **Photos** (construction updates, offers) come through `GET /api/owner/files/:id`: owner only, Salesforce
   file ids only, fetched for that owner's email so Salesforce's own check (`JADPortalApi.file`) decides, and
   only images or PDFs are passed on, marked private to the phone. Demo photos are the bundled project photos.
9. **Design follow-up (Naya, 10-Nov-2026)**: photo boxes keep their size; project photos use wide versions cut to the building (`assets/brand/projects/wide/`, only sky and road trimmed) so the building fills the box; Salesforce photos of unknown shape are fitted whole inside, over a soft blurred copy, receipts and
   fees as tidy two-sided rows, news as calm cards (photo, "TYPE · DATE", title, summary; tap for the full text;
   owners' price with the list price crossed out), and every owner tab says when it could not load, with
   "Try again".
10. **Documents (Naya, 10-Nov-2026: owners see their own identity documents too).** My unit shows the floor plan
    (whole, on a plain background) and the owner's passport / Emirates ID / visa copies held by JAD Global;
    Payments makes each receipt open. Salesforce's answer lists them by name and file id only; the files come
    through the owner file route (Salesforce checks they are this owner's). On the phone a file is written to a
    private JAD+ folder in temporary storage, shown in the system viewer, and that folder is emptied before the
    next document and on sign-out. Only PDFs and images are accepted. Demo documents are a generated
    "SAMPLE DOCUMENT" PDF and a drawn sample floor plan, never served in production.
11. **SPA and statement of account** are not files in Salesforce: the prototype requested the SPA from the
    JAD+ desk and received statements from a separate Salesforce PDF push. Both are desk requests (ADR 0011), until the
    PDF push is connected to JAD+.
12. **Desk requests**: ADR 0011. **Not yet**: notification and marketing switches (N4, L1), Arabic.

## Consequences

Owners see the prototype's content in the new app today, on demo data, and the switch to real data is a
configuration step at go-live (finance-worker route + production binding), not a code change.
