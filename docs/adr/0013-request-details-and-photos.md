# ADR 0013 — Request details: residence, preferred visit and photos

Date: 10-Nov-2026 · Decided by: Naya ("select which unit, which day and time works, optional photo"), details
by Claude · To review: Naya

## Decisions

1. **Residence always shown** on a new request and pre-selected, so the owner sees which one it is for.
2. **Preferred visit**: a working day (Mon-Fri, UAE holidays off; the plan's calendar) among the next 10 from
   tomorrow, and a window inside working hours: Morning 9-12, Midday 12-15, Afternoon 15-18. Required on a
   routine request; checked by the API against the days it offers (migration 0014). The partner sees it on the
   job and books the actual visit; the resident sees it until a visit is promised.
3. **Photos**: optional, up to 3 per request, added after the request is saved (a failed photo never loses the
   request). Security (CLAUDE.md "Uploads", C-PD-1):
   - the phone shrinks each photo to at most 1600 px and re-saves it as a new JPEG (no location data);
   - the API takes the type from the file's own bytes and requires it to match the declared type (JPEG or
     PNG only), limits size to 10 MB (only this route accepts more than the API's 64 KB), and removes EXIF /
     XMP / IPTC / comments (JPEG) and text / EXIF chunks (PNG) before storing;
   - photos are stored in private R2 under the request; every view checks the request's access rules; the
     file's SHA-256 is kept as evidence; adding one is audited and recorded in the request history;
   - the app asks for camera or photo-library access only when the person taps the button.
4. Residents (owner, tenant on the request) add photos; the partner and JAD+ staff on the request view them.
   Partner completion photos come with the partner's routine steps.
