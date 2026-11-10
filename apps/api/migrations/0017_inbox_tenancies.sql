-- 0017 Tenancy notifications (ADR 0021): the in-app inbox (0016) also carries tenancy items (invited, ending,
-- ended) and the owner-approval items for tenants' requests (A1). An item is about a request OR a tenancy.
-- SQLite cannot change a CHECK, so the table is rebuilt; no other table refers to it. Kinds mirror
-- packages/shared/src/inbox.ts (tested: no drift).

CREATE TABLE inbox_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  request_id TEXT REFERENCES requests (id),
  tenancy_id TEXT REFERENCES tenancies (id),
  kind TEXT NOT NULL CHECK (
    kind IN (
      'visit_booked', 'visit_tomorrow', 'visit_soon', 'on_the_way', 'no_access', 'quote_received',
      'quote_reminder', 'quote_expired', 'make_safe_done', 'work_done', 'confirm_reminder', 'auto_closed',
      'approval_needed', 'approval_reminder', 'request_approved', 'request_declined',
      'tenancy_invited', 'tenancy_ending', 'tenancy_ended'
    )
  ),
  data TEXT CHECK (data IS NULL OR (json_valid(data) AND length(data) <= 1024)),
  at INTEGER NOT NULL,
  read_at INTEGER,
  dedupe_key TEXT UNIQUE CHECK (dedupe_key IS NULL OR length(dedupe_key) <= 120),
  CHECK (read_at IS NULL OR read_at >= at),
  CHECK ((request_id IS NULL) <> (tenancy_id IS NULL)),
  CHECK ((kind LIKE 'tenancy_%') = (tenancy_id IS NOT NULL))
) STRICT;

INSERT INTO inbox_new (id, user_id, request_id, tenancy_id, kind, data, at, read_at, dedupe_key)
  SELECT id, user_id, request_id, NULL, kind, data, at, read_at, dedupe_key FROM inbox;

DROP TABLE inbox;
ALTER TABLE inbox_new RENAME TO inbox;
CREATE INDEX inbox_user ON inbox (user_id, at);
