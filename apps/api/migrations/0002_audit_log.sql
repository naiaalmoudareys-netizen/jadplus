-- 0002 Audit log (C-AUD-1): who did what, in which role, when, from where (hashed IP).
-- Every state change and every admin action is written here in the same batch as the change itself.
-- Append-only: rows can never be edited, and can only be deleted once older than the 1-year retention
-- minimum (CLAUDE.md "Audit trail"; docs/DATA_PROTECTION.md). detail never holds personal data (C-LOG-1).

CREATE TABLE audit_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor_user_id TEXT REFERENCES users (id),
  actor_role TEXT NOT NULL CHECK (
    actor_role IN ('owner', 'tenant', 'partner', 'partner_admin', 'jad_admin', 'jad_viewer', 'system', 'anonymous')
  ),
  action TEXT NOT NULL CHECK (action GLOB '[a-z]*' AND length(action) <= 64),
  target_type TEXT CHECK (length(target_type) <= 32),
  target_id TEXT CHECK (length(target_id) <= 64),
  ip_hash BLOB,
  http_request_id TEXT CHECK (length(http_request_id) <= 64),
  detail TEXT CHECK (detail IS NULL OR (json_valid(detail) AND length(detail) <= 4096)),
  CHECK ((actor_role IN ('system', 'anonymous')) = (actor_user_id IS NULL))
) STRICT;

CREATE INDEX audit_log_target ON audit_log (target_type, target_id, at);
CREATE INDEX audit_log_actor ON audit_log (actor_user_id, at);

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

-- 366 days so a leap year never shortens the guaranteed year.
CREATE TRIGGER audit_log_retention BEFORE DELETE ON audit_log
WHEN old.at > (unixepoch('now') - 366 * 86400) * 1000
BEGIN
  SELECT RAISE(ABORT, 'audit_log rows are kept for at least one year');
END;
