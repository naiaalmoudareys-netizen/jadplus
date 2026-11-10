# ADR 0026 — Partner invoices: recorded in JAD+, paid directly to the partner

Date: 10-Nov-2026 · Decided by: Naya ("we see the amount, who paid and who didn't, but we shouldn't become the
middle man") · To review: Mr. Omar, finance, legal

## Decision

JAD+ records partner invoices and whether they are paid; it never holds or moves the money.

1. **Invoice**: after the work is confirmed (or auto-closed after 72 h, A4), the partner issues the invoice in
   JAD+ for the approved quote (or the make-safe amount, E8): amount, **5% UAE VAT**, total, the partner's TRN,
   the request reference, and how to pay the partner (their bank details or payment link as text). An invoice
   can never exceed what the owner approved.
2. **The owner pays the partner directly** (bank transfer, the partner's link, card at the door): not through
   JAD Global and not through JAD+. JAD+ never sees card details. **No commission.**
3. **Paid or not**: the partner marks the invoice paid (date, method); the owner can say "I have paid" so the
   partner is reminded to confirm. Unpaid invoices are visible to the owner, the partner office and JAD+ Admin,
   with their age.
4. **JAD+ Admin** sees every invoice, who has paid and who has not, by partner and by owner, for follow-up and
   disputes (handled by the JAD+ desk), but takes no part in the payment.

## Why

JAD Global stays out of the money flow: no client funds held, no refunds or payouts to run, no payment
licensing, while still seeing the amounts and which owners or partners are behind. The work and the record stay
on JAD+ (P2: arranging work off the platform is still a breach).
