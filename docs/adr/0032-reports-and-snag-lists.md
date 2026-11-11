# ADR 0032: Reports and snag lists (Flow B, inspection with a report)

- Status: accepted
- Date: 11-Nov-2026
- Decided by: Naya (IT / Tech Manager), wave 2 of the service coverage report (ADR 0030)
- Requirements: O3, S4, L2; builds on ADR 0013 (photos), 0018 (request journey), 0025 (console), 0030 (flows)

## Context

ADR 0030 gave snagging and valuation the flow `report`, but they still ran the maintenance journey (quote,
"work finished"). The plan (O3) says: book independent snagging, the inspector uploads a standard PDF report,
the owner opens it, each snag is tracked to closure, and one re-inspection is free. The product owner's report
adds a choice between free "soft" snagging by the JAD Global handover team and professional snagging (from
AED 999). S4 gives the deadlines; L2 says valuations are indicative.

## Decision

1. **Snagging choice (O3).** In the new-request pop-up for snagging the owner chooses **soft snagging** (free,
   by the JAD Global handover team) or **professional snagging** (an independent inspector, from AED 999). The
   request stays a snagging request; only the provider differs: soft goes to the team assigned to the
   `handover` service (ADR 0030), professional to the snagging provider. If the chosen side has nobody, it is
   "coming soon" (P6). An app that does not send a choice gets professional snagging, which is what snagging
   was before. The rule is `providerServiceFor` in `packages/shared/src/reports.ts`; the choice is stored in
   `report_requests` (migration 0029) and never changes.

2. **The report replaces "work finished".** A report request keeps the visit steps (book the inspection, on my
   way, start, no access) and has no quote, no "work finished", no make-safe and no "not done". The provider
   uploads the **report PDF** instead: at most 20 MB, recognised by its first bytes (`%PDF-`), stored in private
   R2 with its size and SHA-256, the client's file name never kept. One report of each kind per request
   (snagging, re-inspection, valuation); reports are append-only evidence.
   - Snagging: the report can be sent once the inspection has started.
   - Valuation: the visit is optional; the report can be sent at any time while the request is with the team.
   - The console is where reports are uploaded. The technician app keeps the visit steps only; picking a PDF on
     the phone would need a new dependency (a document picker), which the plan does not require.

3. **Who sees reports.** The owner (request page "Open report", and My unit → Documents for that unit, matched
   by the unit's name as on the owner's deal), the provider the job is assigned to, and JAD+ staff. **Tenants
   never** (reports are the owner's, R2). Every download is written to the audit log (`report_downloaded`).

4. **Snag list (snagging only).** During the inspection, before the report, the provider lists each snag
   (what, room or place, an optional photo) and may remove one listed by mistake. Sending the report closes the
   list; the owner sees it from then on. Each snag then goes **open → fixed → confirmed**, or back to open when
   the owner says it is not fixed:
   - **Fixed** needs a photo of the fix and can be done by the snagging provider of the request **or** by a
     JAD Global team assigned to the `handover` service (the developer side, which fixes before handover). The
     handover team sees only the snag list and its photos of an open snagging request with a report, through
     "Snags to fix" on its jobs board, never the report, the messages or the owner.
   - The owner **confirms** each fix or **reopens** the snag; the fix photo stays in the snag's history.
   - Contact details typed in a snag are removed before saving, as in messages (ADR 0009).
   - Every step is in `snag_events` (append-only) and the audit log. A change made at the same moment by
     someone else is refused (409), with nothing saved.

5. **Status path.** The requests table and its status list do not change (rebuilding it is unsafe, ADR 0030 §6).
   - A report with snags keeps the request **in progress** while the snags are fixed. A report without snags,
     a valuation report, or the re-inspection report moves it to **work done**: the owner confirms ("confirm"
     only) or it closes by itself after 72 hours, as today (A4).
   - When no snag is open, the owner may ask **once** for the **free re-inspection**: the request goes back to
     the provider ("reopened") to book it. The re-inspection visit is not counted as a repeat visit. Its report
     moves the request to work done and the owner's confirmation closes it.
   - The lifecycle table allows these moves: provider assigned/scheduled → work done (a valuation without a
     visit), owner in progress → reopened (the re-inspection).

6. **Deadlines (S4).** On the requests' existing clock (`next_due_at`, shown to the provider and JAD+ staff,
   never to the owner; an overdue one appears in JAD+ Admin "Needs action"):

   | Moment                  | Next deadline                                     |
   | ----------------------- | ------------------------------------------------- |
   | Snagging raised         | Inspection booked within 48 hours (ADR 0030)      |
   | Inspection booked       | The visit, as in the visit journey                |
   | Inspection started      | Snagging report within 24 hours                   |
   | Valuation raised        | Report within 3 working days, kept through visits |
   | Re-inspection asked for | Re-inspection booked within 48 hours              |
   | Re-inspection started   | Re-inspection report within 24 hours              |
   - **Choice made:** "24 hours after the inspection visit" counts from when the inspector starts the inspection.
     A separate "inspection finished" tap was not added: it could be forgotten, leaving no deadline at all.
   - A valuation report (and a snagging report when the booking was not already measured) counts on the
     provider's scorecard as the service milestone.

7. **L2.** Every valuation report shows "Indicative valuation, not a formal appraisal." The English text is
   `VALUATION_DISCLAIMER` in `packages/shared/src/reports.ts`; the app shows it in five languages (a test checks
   the English matches).

## Consequences

- Migration 0029 adds `report_requests`, `request_reports`, `snags` and `snag_events` (STRICT, CHECK lists
  mirrored from `reports.ts` and `snags.ts` with drift tests, append-only triggers). No existing table changes.
- New endpoints: `GET/POST /api/requests/:id/report`, `GET /api/requests/:id/report/:reportId/file`,
  `POST /api/requests/:id/reinspection`, `GET /api/me/reports`, the snag routes under
  `/api/requests/:id/snags`, and `GET /api/partner/snags`. The report PDF route takes a 20 MB body, the snag
  photo routes 10 MB; everything else keeps 64 KB.
- Notifications for these steps are not sent yet (added with the other wave 2 parts).
- Open for Naya: whether professional snagging's AED 999 is paid to the inspector through a JAD+ invoice
  (ADR 0026) or arranged by the inspector; whether the developer's own handover team, not only a JAD Global
  team, should be able to mark snags fixed; whether the technician app should upload reports.
- Non-English texts were drafted by Claude and need a native speaker's review (ADR 0016).
