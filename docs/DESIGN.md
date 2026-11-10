# JAD+ design: the official look of the app

Decided by Naya on 10-Nov-2026: **the new app keeps the design of the owner portal prototype** (portal.jadglobal.ae,
05-Nov-2026 "v2"). Owners have already seen it; the native app must look and feel the same, only better built.
Every owner/tenant screen follows this file. Technician screens may stay plainer (on-site use) but use the same
colours, font and logo.

## Visual reference

- Live reference: the private preview on portal.jadglobal.ae (link in Naya's Desktop file).
- Source of the reference, read-only, in `apps/mobile/assets/brand/reference/`: `styles.css.txt` (all styles),
  `index.html.txt` (screen structure), `app.js.txt` (what each screen shows and in which order). Files end in `.txt`
  so lint/format ignore them. Use them to copy the **design**, never the code (plain JS, not to be pasted in).

## Design language

Taken from jadglobal.ae: warm cream, slate, night navy, bronze, mist. Calm by design: generous space, soft edges,
slow gentle motion, nothing shouts. Uppercase display type with tight tracking, small tracked bronze "eyebrows",
full-bleed architecture photos under a slate veil.

| Token       | Value                 | Use                                        |
| ----------- | --------------------- | ------------------------------------------ |
| cream       | `#F4F0EB`             | App background                             |
| cream-2     | `#EAE4DB`             | Secondary background                       |
| paper       | `#FBF9F6`             | Cards                                      |
| slate       | `#394551`             | Primary buttons, links, photo veil         |
| slate-2     | `#4B5867`             | Hover / pressed slate                      |
| night       | `#000229`             | Headings, darkest navy                     |
| bronze      | `#937831`             | Eyebrows, focus ring, accents              |
| bronze-soft | `#C9B278`             | Eyebrows on dark backgrounds               |
| mist        | `#D2DEE8`             | Soft info surfaces                         |
| ink         | `#1B1F26`             | Body text                                  |
| ink-2       | `#4A525C`             | Secondary text                             |
| muted       | `#7A818A`             | Labels, hints                              |
| line        | `rgba(57,69,81,0.12)` | Dividers                                   |
| good / bg   | `#4E7A5E` / `#E5EEE7` | Paid, done                                 |
| warn / bg   | `#9A6B1F` / `#F4EAD6` | Due soon                                   |
| bad / bg    | `#A2412E` / `#F5E3DE` | Overdue, urgent (emergency red may differ) |
| calm / bg   | `#4B5867` / `#E3E9EF` | Neutral status                             |

- **Font:** Hanken Grotesk, weights 300/400/500/600/700 (Google Fonts, SIL Open Font License). In Expo use
  `@expo-google-fonts/hanken-grotesk` + `expo-font` (justify the dependency in the commit).
- **Type scale:** display = 300 weight, UPPERCASE, letter-spacing −2%, 30–46; title = 300, UPPERCASE, 24–32;
  eyebrow = 11, 600, letter-spacing 0.22em, UPPERCASE, bronze; label = 11, 600, 0.14em, UPPERCASE, muted;
  body 15/1.6; numbers use tabular figures.
- **Shapes:** card radius 14, button radius 6, soft shadow (`0 12 32 −12 rgba(0,2,41,.12)`).
- **Buttons:** min height 48, 12 px 600 UPPERCASE text with 0.16em tracking. Primary = slate on cream text;
  outline = slate border; light = cream outline on photos. Touch targets ≥ 44.
- **Motion:** slow and gentle (ease `cubic-bezier(.22,.8,.24,1)`); respect "reduce motion".
- Accessibility: contrast AA, focus visible (bronze ring on web console), screen-reader labels on every icon.

## Brand assets (already in the repo)

`apps/mobile/assets/brand/`

- `logo/`: JAD+ wordmark for light (`jadplus-ink.png`) and dark (`jadplus-cream.png`) backgrounds, JAD Global
  logo (`logo-ink.png`, `logo-cream.png`), app icon (`icon.svg`, `icon-1024.png` for the store, 512/192, apple-touch).
- `projects/`: hero photos per project: `171gh.jpg`, `j188.jpg`, `jad288.jpg` (shown on the owner's unit/home).
- `media/`: background video loops with poster images: `signin-loop.mp4` (sign-in screen),
  `j188-loop.mp4`, `jad288-loop.mp4` (project hero). Videos are muted, looped, start on the poster, and do not
  autoplay when "reduce motion" or data saver is on. Keep the app download small: consider streaming the loops
  from R2/CDN instead of bundling if the app size budget needs it (decide in an ADR).

## Owner app screens (same order and content as the prototype)

Tabs (changed by Naya, 10-Nov-2026): **Home · My unit · Payments · Profile**. News & offers sit at the end of
Home; construction progress at the end of My unit; Services joins with routine requests (phase B). Unit
switcher when an owner has more than one unit (My unit, Payments).

| Screen   | Shows (from Salesforce through the finance-worker proxy unless noted)                                                  | Spec     |
| -------- | ---------------------------------------------------------------------------------------------------------------------- | -------- |
| Home     | Greeting, project hero photo/video, next payment, open requests, approvals waiting, **latest news (3) + offers count** | R1       |
| My unit  | Unit facts, project, floor plan, documents (SPA, receipts, statement)                                                  | R1       |
| Payments | Payment plan, paid / due / overdue, late fees, receipts, statement, **Pay now** (pay.jadglobal.ae)                     | R1, O1   |
| Services | Service catalogue and requests (JAD+ D1)                                                                               | Phase B  |
| News     | **News & exclusive offers** (see below)                                                                                | N1–N4    |
| Progress | Construction progress per project (photos, % complete)                                                                 | O1       |
| Profile  | Contact details, notification switches (payment reminders, construction, news, offers), language, sign out everywhere  | U-series |

## News & exclusive offers (added 10-Nov-2026, not in the Master Plan)

The prototype already has this and owners expect it. Requirements:

- **N1** News feed: posts published by JAD Global (launches, company news), newest first, pinned first. Filters:
  All / News / Offers (with count).
- **N2** Exclusive offers ("Owners only" badge): a residence offered to JAD+ owners first, with project, unit,
  size, view, offer price vs. list price, offer end date, and an "I'm interested" action that contacts JAD
  (creates a Salesforce lead / sends to sales; no payment in the app).
- **N3** Who sees what: a post is shown only inside its publish/expiry dates, to everyone or only to owners of the
  posts' project; an offer only while its unit is still Available.
- **N4** Owners can switch news and offers notifications off (Profile) and the marketing consent (L1) controls them.
- **Source:** Salesforce object `JAD_Plus_Post__c` (type, title, body, image, pinned, dates, project, unit) read by
  Apex `JADPortalApi.posts()`; both are written in the Salesforce package
  `steven leads/JAD DOCUMENT/salesforce-build/portal_api` but **not deployed yet** (needs Naya's go-ahead).
  Marketing publishes posts in Salesforce; JAD+ only reads them. Until deployed, use the demo posts.
