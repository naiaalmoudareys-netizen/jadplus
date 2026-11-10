-- 0016 In-app notifications and make-safe work (ADR 0019): what happened on a person's requests and what is coming up.
-- Rows hold the kind and a few facts (times, amounts), never wording or contact details: the app writes the
-- sentence in the person's language. dedupe_key makes each reminder happen once even if the clock job runs
-- twice. Kinds mirror packages/shared/src/inbox.ts (tested: no drift).

CREATE TABLE inbox (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  request_id TEXT NOT NULL REFERENCES requests (id),
  kind TEXT NOT NULL CHECK (
    kind IN (
      'visit_booked', 'visit_tomorrow', 'visit_soon', 'on_the_way', 'no_access', 'quote_received',
      'quote_reminder', 'quote_expired', 'make_safe_done', 'work_done', 'confirm_reminder', 'auto_closed'
    )
  ),
  data TEXT CHECK (data IS NULL OR (json_valid(data) AND length(data) <= 1024)),
  at INTEGER NOT NULL,
  read_at INTEGER,
  dedupe_key TEXT UNIQUE CHECK (dedupe_key IS NULL OR length(dedupe_key) <= 120),
  CHECK (read_at IS NULL OR read_at >= at)
) STRICT;

CREATE INDEX inbox_user ON inbox (user_id, at);

-- Make-safe work (E8): urgent work on an emergency within the limit the owner agreed in advance, so no quote
-- is needed. Kept apart from quotes (a quote is a proposal the owner decides; this is a record of work done
-- under the owner's standing consent, which it points to). Append-only evidence.
CREATE TABLE make_safe_works (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE REFERENCES requests (id),
  partner_id TEXT NOT NULL REFERENCES partners (id),
  amount_fils INTEGER NOT NULL CHECK (amount_fils > 0),
  scope TEXT NOT NULL CHECK (length(scope) BETWEEN 1 AND 2000),
  consent_id TEXT NOT NULL REFERENCES consents (id),
  recorded_by_user_id TEXT NOT NULL REFERENCES users (id),
  at INTEGER NOT NULL
) STRICT;

CREATE TRIGGER make_safe_works_no_update BEFORE UPDATE ON make_safe_works
BEGIN
  SELECT RAISE(ABORT, 'make_safe_works are append-only');
END;

CREATE TRIGGER make_safe_works_no_delete BEFORE DELETE ON make_safe_works
BEGIN
  SELECT RAISE(ABORT, 'make_safe_works are append-only');
END;
