# ADR 0014 — Home design

Date: 10-Nov-2026 · Decided by: Naya ("redesign the home page based on what you think makes sense"), details by
Claude · To review: Naya

## Decision

Home answers one question: "is everything fine with my home, and is there anything I need to do?". From top:

1. **Project photo with a greeting** ("Good morning, Layla") and the unit.
2. **Needs your attention**, only when something does: an emergency in progress, a technician arriving today,
   an overdue payment. When all is well this section is not shown at all.
3. **Four round shortcuts**: Emergency (red), Request, Pay, Documents (tenants: Emergency, Requests). The
   emergency stays one tap away without a full-width red bar dominating the screen.
4. **Next payment** with the plan's % paid.
5. **Active requests**: at most two (emergencies first, then newest) with "See all (n)" to the Requests tab;
   finished requests never show on Home.
6. **Construction**: one line with the project's % complete, opening My unit.
7. **News & offers**: cards to swipe through, owners-only offers first; "See all" opens the full list.

Rules for 2 and 5 are in `apps/mobile/src/home/attention.ts` (tested).
