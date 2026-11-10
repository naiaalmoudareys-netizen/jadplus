# ADR 0011 — Requests to the JAD+ desk, handled in Salesforce

Date: 10-Nov-2026 · Decided by: Naya (handled in Salesforce like the prototype; SPA and Reservation Form listed
under Documents with "Request"), details by Claude · To review: Naya

## Context

Owners ask JAD for papers (Reservation Form, SPA, stamped statement of account, NOC, Oqood / title deed copy)
and for account changes (contact details, closing JAD+). The prototype sends these to Salesforce as JAD+
Request records (`JAD_Plus_Request__c`, Apex `JADPortalApi.request`), and the desk already works there.

## Decisions

1. **Salesforce is where the desk works.** In production `POST /api/owner/desk-requests` creates the JAD+
   Request in Salesforce through the finance worker (`jadplus-desk` route); Salesforce checks the deal is this
   owner's and returns the open request instead of a duplicate. The owner's list (status, the desk's reply,
   attached files) comes from Salesforce's own answer.
2. **JAD+ keeps a log** of every request (migration 0012 `desk_requests`: type, deal, status, Salesforce id),
   audited. What the owner writes (e.g. a new mobile number) is stored **encrypted** (C-PD-2) and is not shown
   back in the list. Until Salesforce is connected (local, preview) this log is the demo's request list.
3. **Documents tab**: Reservation Form, SPA, Stamped Statement of Account, NOC and Oqood / title deed copy are
   listed per residence: **REQUEST** until asked, then the status, and **OPEN** once the desk has attached the
   document in Salesforce (opened through the owner file route, ADR 0010).
4. **Profile**: "Update my contact details", "Close my JAD+ account" and "Ask the JAD+ desk something else",
   with the list of all desk requests. Contact details are never edited in the app: the desk checks identity
   and updates Salesforce (U2).
5. Types and statuses mirror Salesforce (`packages/shared/src/desk.ts`, drift-tested against the table).

## Consequences

Owners can ask for and receive their SPA and other papers in the app; the desk keeps using Salesforce. No
alert reaches the desk or the owner yet when a request changes (delivery engine, ADR 0007).
