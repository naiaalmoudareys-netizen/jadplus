-- 0031 Notifications for the service flows (ADR 0035): consultations, reports and snags, handover, investor
-- education, managed-unit statements and furnishing deliveries (O2, O3, O5, P5).
--
-- The in-app inbox (0016-0018, 0022, 0023) gains 18 kinds. Kinds mirror packages/shared/src/inbox.ts
-- (INBOX_KINDS, SESSION_KINDS, UNTARGETED_KINDS; drift-tested). SQLite cannot change a CHECK, so the table is
-- rebuilt as in 0023, every row copied; no other table refers to it.
--
-- Targets: an item still points at exactly one thing, now one of a request, a tenancy, a building notice or an
-- education session (new session_id; sessions are not requests). Two owner kinds may point at nothing: "the book
-- was sent" (education_book_requests are not a place in the app) and a statement not tied to a request. A
-- statement may also point at a request; the book never does.

CREATE TABLE inbox_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  request_id TEXT REFERENCES requests (id),
  tenancy_id TEXT REFERENCES tenancies (id),
  notice_id TEXT REFERENCES building_notices (id),
  session_id TEXT REFERENCES education_sessions (id),
  kind TEXT NOT NULL CHECK (
    kind IN (
      'visit_booked', 'visit_tomorrow', 'visit_soon', 'on_the_way', 'no_access', 'quote_received',
      'quote_reminder', 'quote_expired', 'make_safe_done', 'work_done', 'confirm_reminder', 'auto_closed',
      'approval_needed', 'approval_reminder', 'request_approved', 'request_declined',
      'tenancy_invited', 'tenancy_ending', 'tenancy_ended', 'message_received',
      'job_new', 'job_reminder', 'job_moved_away', 'job_assigned_to_you', 'quote_approved', 'quote_declined',
      'work_confirmed', 'work_reopened', 'job_rated', 'job_cancelled',
      'invoice_issued', 'invoice_overdue', 'invoice_paid', 'invoice_not_received', 'invoice_cancelled',
      'invoice_paid_claimed',
      'request_cancelled_by_jad', 'request_moved_by_jad', 'request_reclassified', 'building_notice',
      'consultation_contact_made', 'stage_reached', 'consultation_closed', 'report_ready', 'snag_fixed',
      'handover_step_done', 'key_collection_booked', 'handover_complete',
      'session_changed', 'session_cancelled', 'session_reminder', 'book_sent', 'statement_ready',
      'delivery_scheduled',
      'reinspection_requested', 'snag_reopened', 'snags_all_confirmed', 'snags_to_fix'
    )
  ),
  data TEXT CHECK (data IS NULL OR (json_valid(data) AND length(data) <= 1024)),
  at INTEGER NOT NULL,
  read_at INTEGER,
  dedupe_key TEXT UNIQUE CHECK (dedupe_key IS NULL OR length(dedupe_key) <= 120),
  CHECK (read_at IS NULL OR read_at >= at),
  CHECK (
    (request_id IS NOT NULL) + (tenancy_id IS NOT NULL) + (notice_id IS NOT NULL) + (session_id IS NOT NULL) = 1
    OR (
      kind IN ('book_sent', 'statement_ready')
      AND request_id IS NULL AND tenancy_id IS NULL AND notice_id IS NULL AND session_id IS NULL
    )
  ),
  CHECK ((kind LIKE 'tenancy_%') = (tenancy_id IS NOT NULL)),
  CHECK ((kind = 'building_notice') = (notice_id IS NOT NULL)),
  CHECK ((kind LIKE 'session_%') = (session_id IS NOT NULL)),
  CHECK (kind <> 'book_sent' OR request_id IS NULL)
) STRICT;

INSERT INTO inbox_new (id, user_id, request_id, tenancy_id, notice_id, kind, data, at, read_at, dedupe_key)
  SELECT id, user_id, request_id, tenancy_id, notice_id, kind, data, at, read_at, dedupe_key FROM inbox;

DROP TABLE inbox;
ALTER TABLE inbox_new RENAME TO inbox;
CREATE INDEX inbox_user ON inbox (user_id, at);
