# ADR 0009 — All contact happens inside JAD+; resident emergency screens

Date: 10-Nov-2026 · Decided by: Naya ("all the contact must be done on JAD+"), details by Claude · To review: Naya

## Context

Technicians need to reach residents (access, timing) and residents need to reach whoever is handling their
request. The plan forbids off-platform dealings (S10). Giving technicians residents' phone numbers (or the other
way round) would leak personal data and move the relationship outside JAD+.

## Decisions

1. **No contact details are exchanged.** No API answer gives a resident's phone or email to a partner, or a
   technician's to a resident. Residents see the partner **company**; partners see **"Owner"** or **"Tenant"**;
   JAD+ staff appear as **"JAD+"** (`packages/shared/src/conversation.ts`).
2. **Messages on each request** (migration 0010 `request_messages`, `POST /api/requests/:id/messages`): the
   resident(s), the assigned partner and JAD+ Admin write in the app. Only people allowed to see the request
   (C-AZ-2) can read it; JAD+ viewers read only; a closed request takes no more messages. Messages are evidence
   and cannot be edited or deleted (database triggers).
3. **Contact details typed into a message are removed before saving**: phone numbers (9+ digits in groups,
   any common writing), email addresses and WhatsApp/Telegram links become "[contact details removed: please
   keep all contact in JAD+]", and the writer is told. Dates, times, unit names, references and amounts stay.
   The check is a single pass over the text without regular expressions that could be made slow by a crafted
   message. The original text is never stored.
4. **Calls** between resident and technician are not built. If needed later they go through a masked-number
   provider (part of the provider choice, ADR 0007), never by showing numbers.
5. **Where the unit is** is shown to the technician: unit, building, project and project address from Salesforce
   (`JADPlusIdentity` now also returns building and address; stored with the owner's units). Not personal data.
6. **Resident emergency screen** (app): "What is happening?" lists fire, smoke, gas smell and "someone is
   injured" first, in red: choosing one shows **only** the emergency numbers with call buttons at once (E3), and
   JAD+ is alerted in the background (if that fails, the screen says so). Other emergencies ask where (if more
   than one home), where the water comes from (leaks only, E12) and a short description, then show the API's
   **exact** confirmation text (L3). No instructions anywhere.
7. **No new-message alerts yet**: the request screens refresh every 30 seconds. A "new message" alert joins the
   delivery engine (ADR 0007) together with app push notifications.

## Consequences

Residents can report and follow emergencies and talk to the technician without either side seeing the other's
details. Staff can read every conversation for disputes (E16, E18). Still to do: message alerts, admin replies in
the console, and a resident's ability to share access details (e.g. gate code) privately is just a message.
