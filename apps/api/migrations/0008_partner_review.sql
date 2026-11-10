-- 0008 Partner review list and compliance suspensions (BUILD_SPEC S6, S7, P3; ADR 0006).
-- The daily partner check writes here; JAD+ Admin works through the open items and resolves them.

-- Who suspended a partner: the daily document check (lifted automatically once renewed) or an admin
-- (only an admin lifts it). NULL while the partner is not suspended.
ALTER TABLE partners ADD COLUMN suspended_by TEXT CHECK (suspended_by IS NULL OR suspended_by IN ('compliance', 'admin'));

-- Items on JAD+ Admin's partner review list. One open item per partner and concern (dedupe_key), so the
-- daily check never piles up duplicates. detail holds counts and dates only, never personal data.
CREATE TABLE partner_review_items (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners (id),
  kind TEXT NOT NULL CHECK (
    kind IN (
      'low_rating', 'missed_emergencies', 'safety_breach', 'honesty_breach',
      'document_expiring', 'suspended', 'open_jobs'
    )
  ),
  dedupe_key TEXT NOT NULL CHECK (length(dedupe_key) BETWEEN 1 AND 80),
  detail TEXT CHECK (detail IS NULL OR (json_valid(detail) AND length(detail) <= 2048)),
  opened_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by TEXT REFERENCES users (id),
  resolution_note TEXT CHECK (resolution_note IS NULL OR length(resolution_note) BETWEEN 1 AND 1000),
  CHECK ((resolved_at IS NULL) = (resolved_by IS NULL)),
  CHECK ((resolved_at IS NULL) = (resolution_note IS NULL)),
  CHECK (resolved_at IS NULL OR resolved_at >= opened_at)
) STRICT;

CREATE UNIQUE INDEX partner_review_items_one_open ON partner_review_items (partner_id, dedupe_key)
  WHERE resolved_at IS NULL;
CREATE INDEX partner_review_items_open ON partner_review_items (opened_at) WHERE resolved_at IS NULL;
