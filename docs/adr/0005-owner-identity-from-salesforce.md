# ADR 0005 — Owners sign in with their Salesforce email or mobile number

Date: 10-Nov-2026 · Requested by: Naya ("owners log into JAD+ using the email or phone number registered in
Salesforce") · Decided by: Claude · To review: Naya

## Context

Owners are not invited to JAD+: Salesforce already knows them (buyer or joint buyer on a deal). Naya asked
that an owner can sign in with the email **or** the mobile number registered in Salesforce. The prototype
(portal-live) does this by email only, through the finance worker and the read-only Apex class
`JADPortalApi` (`whois`, `owner`). Controls: C-AUTH-3 (identity must exist in Salesforce and not be shared),
C-AZ-2 (an owner sees only their units), U3 (owner sells → loses access), T2 (Salesforce down → JAD+ runs on
its own data).

"Opportunity owner" in Salesforce is the JAD salesperson on the deal. Here "owner" means the **buyer** on a
Sold or Booked deal (opportunity), as in the prototype.

## Decisions

1. **Same path as the prototype, new door.** JAD+ asks the finance worker over a service binding (`FIN`) with
   a shared secret; the worker calls a **new** read-only Apex class `JADPlusIdentity`
   (`integrations/salesforce`). The live `JADPortalApi` is not modified, so the owner portal cannot break. The
   finance worker gets its own secret for JAD+ (`JADPLUS_KEY`) so either app's access can be cut alone.
2. **Minimum data.** The new class returns only name, email, mobile, Salesforce contact id and the unit list
   (unit id, deal id, unit name, project, buyer/joint buyer). No prices, payments or documents reach the JAD+
   API. The answer is validated with zod before use (C-VAL-1).
3. **Phone matching** uses a new Account formula field `Mobile_Match_Key__c` = last 9 digits of the mobile
   (falling back to phone), the rule JAD already uses on Leads (`Phone_Match_Key__c`). JAD+ normalises what
   the owner types ("050 000 0000", "+971 50…", "00971…") to `+9715…` before asking.
4. **Shared email or number → nobody signs in with it** (as in the prototype). Spouses or agents sharing an
   address must be fixed in Salesforce; otherwise one person would see the other's units and documents.
5. **When a code is sent.** A person already in JAD+ (any role) gets a code as before. Anyone else gets one
   only if Salesforce says they are an owner. The lookup runs in the background, so the answer is identical
   and equally fast either way (no customer discovery).
6. **Salesforce is asked again at every sign-in.** Owner → the owner role is granted if missing and the unit
   list is replaced. No longer an owner (sold, cancelled, now shared) → the owner role ends, which ends every
   owner session at once (sessions are bound to a live role grant, ADR 0003), and the unit list is emptied
   (U3). The person keeps any other role (e.g. tenant elsewhere).
7. **JAD+ keeps its own copy of each owner's units** (`owner_units`, migration 0007). An owner's emergency is
   checked against this copy, refreshed from Salesforce when older than 24 hours. If Salesforce is down the
   copy is used as is, so an owner can always raise an emergency (T2). Consequence: after a sale, the old
   owner can act on the unit for at most 24 hours (or until their next sign-in). Accepted: raising an
   emergency for a unit is low risk, and Salesforce outages must not block emergencies.
8. **Salesforce down at sign-in.** People already in JAD+ continue on JAD+ data (T2). A brand-new owner is
   told to try again shortly (503), because JAD+ cannot know they are an owner.
9. **Ambiguity goes to a person.** If the Salesforce person matches two different JAD+ users (e.g. their
   email is one user's and their number another's), sign-in stops with "please contact the JAD+ desk" (U2)
   instead of guessing. A **closed** JAD+ account is never reopened by a Salesforce answer.
10. **Existing details are not overwritten.** For a person already in JAD+, Salesforce fills a missing email or
    number and the name; it never replaces the email or number they sign in with.
11. **The private preview never calls Salesforce** (refused in code), in line with "demo data only". Only a
    production Worker with `FIN` + `PORTAL_KEY` configured does.
12. **Code delivery** by SMS is a separate decision (provider: SMS or WhatsApp Business). Until a provider and
    the Microsoft Graph email sender are connected, codes are delivered only on a developer machine.

## Consequences

The JAD+ side is built and tested (fake Salesforce in tests). Switching it on needs, in order: deploy the Apex
class and field (sandbox first), grant the class to the integration user, add the finance-worker door,
configure `FIN`/`PORTAL_KEY` in production, connect email and SMS senders. Steps are in
`integrations/salesforce/README.md`. The Apex tests have not been run against the org yet.
