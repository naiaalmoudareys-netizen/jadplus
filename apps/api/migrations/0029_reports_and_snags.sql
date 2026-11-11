-- 0029 Reports and snag lists: Flow B "inspection with a report" (ADR 0032; BUILD_SPEC O3, S4, L2).
--
-- 1. report_requests: one row per snagging or valuation request raised from now on. Holds the owner's
--    snagging choice (soft: the JAD Global handover team; professional: the independent inspector) and the one
--    free re-inspection. Only the re-inspection may be filled in later, once; everything else is fixed.
--    Kinds mirror REPORT_SERVICES and SNAGGING_TYPES in packages/shared/src/reports.ts (drift-tested).
--
-- 2. request_reports: the report PDFs, one of each kind per request (snagging, valuation, re-inspection). The
--    file is in private R2 (C-PD-3); here only its key, size and SHA-256. The client's file name is never
--    stored (C-UPL-1). Append-only: a report is evidence. Kinds mirror REPORT_KINDS (drift-tested).
--
-- 3. snags: the snag list of a snagging inspection. Status open -> fixed (with a photo of the fix) ->
--    confirmed by the owner, or reopened (back to open). A snag listed by mistake may be removed only before
--    the report is uploaded (removed_at). Statuses mirror SNAG_STATUSES in packages/shared/src/snags.ts.
--
-- 4. snag_events: the append-only history of every snag (who, role, when, and the fix photo each time).
--    Kinds mirror SNAG_EVENT_KINDS (drift-tested).
--
-- No existing table changes.

CREATE TABLE report_requests (
  request_id TEXT PRIMARY KEY REFERENCES requests (id),
  service TEXT NOT NULL CHECK (service IN ('snagging', 'valuation')),
  snagging_type TEXT CHECK (snagging_type IN ('soft', 'professional')),
  reinspection_requested_at INTEGER,
  reinspection_requested_by TEXT REFERENCES users (id),
  created_at INTEGER NOT NULL,
  CHECK ((service = 'snagging') = (snagging_type IS NOT NULL)),
  CHECK (service = 'snagging' OR reinspection_requested_at IS NULL),
  CHECK ((reinspection_requested_at IS NULL) = (reinspection_requested_by IS NULL))
) STRICT;

-- The choice never changes, and the re-inspection is asked for at most once.
CREATE TRIGGER report_requests_fixed BEFORE UPDATE ON report_requests
WHEN OLD.reinspection_requested_at IS NOT NULL
  OR NEW.request_id IS NOT OLD.request_id
  OR NEW.service IS NOT OLD.service
  OR NEW.snagging_type IS NOT OLD.snagging_type
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'report_requests: only one re-inspection may be recorded');
END;

CREATE TRIGGER report_requests_no_delete BEFORE DELETE ON report_requests
BEGIN
  SELECT RAISE(ABORT, 'report_requests are kept');
END;

CREATE TABLE request_reports (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests (id),
  kind TEXT NOT NULL CHECK (kind IN ('snagging', 'valuation', 'reinspection')),
  r2_key TEXT NOT NULL UNIQUE CHECK (length(r2_key) <= 200),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 20971520),
  sha256 BLOB NOT NULL CHECK (length(sha256) = 32),
  partner_id TEXT NOT NULL REFERENCES partners (id),
  uploaded_by_user_id TEXT NOT NULL REFERENCES users (id),
  uploaded_at INTEGER NOT NULL,
  UNIQUE (request_id, kind)
) STRICT;

CREATE TRIGGER request_reports_no_update BEFORE UPDATE ON request_reports
BEGIN
  SELECT RAISE(ABORT, 'request_reports are append-only');
END;

CREATE TRIGGER request_reports_no_delete BEFORE DELETE ON request_reports
BEGIN
  SELECT RAISE(ABORT, 'request_reports are append-only');
END;

CREATE TABLE snags (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests (id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  room TEXT NOT NULL CHECK (length(room) BETWEEN 1 AND 100),
  status TEXT NOT NULL CHECK (status IN ('open', 'fixed', 'confirmed')),
  photo_r2_key TEXT CHECK (length(photo_r2_key) <= 200),
  photo_type TEXT CHECK (photo_type IN ('image/jpeg', 'image/png')),
  fix_photo_r2_key TEXT CHECK (length(fix_photo_r2_key) <= 200),
  fix_photo_type TEXT CHECK (fix_photo_type IN ('image/jpeg', 'image/png')),
  fixed_at INTEGER,
  fixed_by_partner_id TEXT REFERENCES partners (id),
  reopen_count INTEGER NOT NULL DEFAULT 0 CHECK (reopen_count >= 0),
  created_by_user_id TEXT NOT NULL REFERENCES users (id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  removed_at INTEGER,
  CHECK ((photo_r2_key IS NULL) = (photo_type IS NULL)),
  CHECK ((fix_photo_r2_key IS NULL) = (fix_photo_type IS NULL)),
  CHECK ((status = 'open') = (fix_photo_r2_key IS NULL)),
  CHECK ((status = 'open') = (fixed_at IS NULL)),
  CHECK ((fixed_at IS NULL) = (fixed_by_partner_id IS NULL)),
  CHECK (removed_at IS NULL OR status = 'open'),
  CHECK (updated_at >= created_at)
) STRICT;

CREATE INDEX snags_by_request ON snags (request_id, created_at);
CREATE INDEX snags_to_fix ON snags (status) WHERE status = 'open' AND removed_at IS NULL;

CREATE TRIGGER snags_no_delete BEFORE DELETE ON snags
BEGIN
  SELECT RAISE(ABORT, 'snags are kept (removed_at marks one listed by mistake)');
END;

CREATE TABLE snag_events (
  id TEXT PRIMARY KEY,
  snag_id TEXT NOT NULL REFERENCES snags (id),
  request_id TEXT NOT NULL REFERENCES requests (id),
  at INTEGER NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES users (id),
  actor_role TEXT NOT NULL CHECK (actor_role IN ('owner', 'partner', 'partner_admin', 'jad_admin')),
  partner_id TEXT REFERENCES partners (id),
  kind TEXT NOT NULL CHECK (kind IN ('added', 'photo_added', 'removed', 'fixed', 'confirmed', 'reopened')),
  photo_r2_key TEXT CHECK (length(photo_r2_key) <= 200),
  CHECK ((kind IN ('photo_added', 'fixed')) = (photo_r2_key IS NOT NULL))
) STRICT;

CREATE INDEX snag_events_by_snag ON snag_events (snag_id, at);

CREATE TRIGGER snag_events_no_update BEFORE UPDATE ON snag_events
BEGIN
  SELECT RAISE(ABORT, 'snag_events are append-only');
END;

CREATE TRIGGER snag_events_no_delete BEFORE DELETE ON snag_events
BEGIN
  SELECT RAISE(ABORT, 'snag_events are append-only');
END;
