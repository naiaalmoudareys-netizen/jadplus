# ADR 0016 — Profile, languages and consents

Date: 10-Nov-2026 · Decided by: Naya ("that entire section needs to also be professionally done … languages
to English Arabic French Russian Chinese and other profile settings"; "go ahead" on Claude-drafted
translations), details by Claude · To review: Naya, legal (texts), native speakers (translations)

## Decision

**Profile** is one page of grouped settings, like the phone's own settings app:

| Group                | Rows                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Header               | Initials, name, role and number of residences                                                                                        |
| Personal details     | Name, email, mobile from the JAD Global record; "Update my contact details" goes to the JAD+ desk (U2)                               |
| Preferences          | Language                                                                                                                             |
| Notifications        | Request and emergency updates (always on), payment reminders, construction updates, marketing consent, news, owners-only offers (N4) |
| JAD+ desk            | The person's desk requests and their status (ADR 0011)                                                                               |
| Privacy and terms    | Terms (accepted on …), privacy notice, request a copy of my data, close my JAD+ account                                              |
| Sign-in and security | Current view, switch view (R5, U7), sign out of this phone, sign out everywhere (T3)                                                 |
| Help                 | Talk to a person (JAD+ desk), report an emergency, app version                                                                       |

**Languages**: English, Arabic, French, Russian, Simplified Chinese.

- The app's own words live in `apps/mobile/src/i18n/strings/`, one file per part of the app, every language with
  exactly the English keys (the compiler refuses a missing one; tests check `{marks}` and empty texts).
- English is the reference. The other languages were **drafted by Claude** and must be checked by a native
  speaker before go-live, above all the emergency texts (L3).
- Arabic lays the whole app out right to left at once (a `direction` style on the app frame), without restarting.
  Hanken Grotesk has no Arabic, Cyrillic or Chinese letters; the phone's own font is used for them.
- Names that come from Salesforce or JAD Global (projects, unit types, documents, news) are shown as written.
- The choice is kept on the phone (so even the sign-in screen is in the person's language) and in their account
  (`user_preferences`, migration 0015), so later messages can be sent in it. The phone's choice wins; a phone
  with no choice takes the account's.
- No new library: a small typed dictionary, `Intl` for dates.

**Notifications** (`messageAllowed` in `packages/shared/src/preferences.ts`): updates about the person's own
requests and emergencies are the service itself and always sent. Payment reminders and construction updates
can be switched off. News and offers are marketing: sent only with marketing consent and the switch on (N4).
No provider is connected yet (ADR 0009), so the switches take effect when messages start.

**Consents** (L1): the current terms must be accepted before the app is used: a screen covers the app until
then, with the terms and privacy notice to read, an "I accept" switch, and a separate optional marketing switch
that starts off. Each answer is a new row in the append-only `consents` table (version, time, IP hash) plus an
audit entry. Marketing consent can be withdrawn at any time in Profile (a new row, never an edit). If the
settings cannot be loaded (no connection), the app opens anyway so nobody is kept from reporting an emergency;
the terms are asked again next time.

**Legal texts**: ported from the prototype's drafts (version 2026-11-05) with the plan's L2 points added
(platform only, no advice, not an emergency service, partners contract with the owner, make-safe cap, targets
not guarantees). Version `2026-11-draft`, marked "Draft for legal review". Shown in English in every language,
with a note that the English text is the reference; translations follow after legal review. A new text means a
new `TERMS_VERSION`, and everyone is asked again.

**Privacy rights**: "Request a copy of my data" opens a JAD+ desk request with the text filled in; "Close my
JAD+ account" and "Update my contact details" are the existing desk requests. No new Salesforce fields.

## Why

Naya asked for a professional profile and five languages. Keeping words in typed per-part files makes a missing
translation a build error instead of a blank on a phone. Legal wording is risky to machine-translate, so it
stays English until legal approves it. The terms screen does not lock out emergencies.

## Still to do

- Native-speaker review of ar, fr, ru, zh; legal approval of the terms and privacy texts (then translations).
- The rest of the app's screens move to the dictionary part by part (Profile, tabs, titles and terms are done).
- Messages in the person's language once providers are connected.
