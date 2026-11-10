-- 0019 JAD+ Admin operations (ADR 0025; A1, E13, S6, U8, U9, V3, ADR 0011): staff-only notes on requests, the
-- reasons behind staff actions on people and tenancies, and the desk's reply to an owner's desk request.
-- Free text written by staff can name people, so it is stored only as AES-GCM ciphertext (C-PD-2). Notes and
-- reasons are evidence of what JAD+ did and why: append-only, like the audit log (C-AUD-1).

-- Notes JAD+ staff keep on a request. Never shown to residents or partners. kind 'owner_called' records the A1
-- call to the owner; reassigned / reclassified / cancelled hold the reason given for that action.
CREATE TABLE request_notes (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests (id),
  author_user_id TEXT NOT NULL REFERENCES users (id),
  kind TEXT NOT NULL CHECK (kind IN ('note', 'owner_called', 'reassigned', 'reclassified', 'cancelled')),
  body_enc BLOB NOT NULL,
  at INTEGER NOT NULL
) STRICT;

CREATE INDEX request_notes_by_request ON request_notes (request_id, at);

CREATE TRIGGER request_notes_no_update BEFORE UPDATE ON request_notes
BEGIN
  SELECT RAISE(ABORT, 'request_notes are append-only');
END;

CREATE TRIGGER request_notes_no_delete BEFORE DELETE ON request_notes
BEGIN
  SELECT RAISE(ABORT, 'request_notes are append-only');
END;

-- Why JAD+ Admin froze or unfroze an account (U9), ended a tenancy for the owner, or removed a staff member.
CREATE TABLE admin_reasons (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'tenancy')),
  target_id TEXT NOT NULL CHECK (length(target_id) <= 64),
  action TEXT NOT NULL CHECK (action IN ('account_frozen', 'account_unfrozen', 'tenancy_ended', 'staff_removed')),
  reason_enc BLOB NOT NULL,
  by_user_id TEXT NOT NULL REFERENCES users (id),
  at INTEGER NOT NULL
) STRICT;

CREATE INDEX admin_reasons_target ON admin_reasons (target_type, target_id, at);

CREATE TRIGGER admin_reasons_no_update BEFORE UPDATE ON admin_reasons
BEGIN
  SELECT RAISE(ABORT, 'admin_reasons are append-only');
END;

CREATE TRIGGER admin_reasons_no_delete BEFORE DELETE ON admin_reasons
BEGIN
  SELECT RAISE(ABORT, 'admin_reasons are append-only');
END;

-- The desk's answer to the owner (ADR 0011, demo mode: in production the desk answers in Salesforce), who
-- handled the request last and when.
ALTER TABLE desk_requests ADD COLUMN reply_enc BLOB;
ALTER TABLE desk_requests ADD COLUMN handled_by TEXT REFERENCES users (id);
ALTER TABLE desk_requests ADD COLUMN updated_at INTEGER CHECK (updated_at IS NULL OR updated_at >= created_at);

CREATE INDEX desk_requests_open ON desk_requests (status, created_at);
