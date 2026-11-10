-- 0011 "I'm interested" on an exclusive offer (docs/DESIGN.md N2; ADR 0010).
-- An owner taps "I'm interested" on an owners-only residence; JAD+ records it so the JAD+ desk and sales can
-- follow up (and, once Salesforce is connected, a lead is created there). No payment, no price agreed here.
-- One live interest per owner and offer; withdrawing keeps the record (withdrawn_at) as evidence.

CREATE TABLE offer_interests (
  id TEXT PRIMARY KEY,
  -- The Salesforce JAD+ Post id of the offer (or a demo id): text, validated by the API.
  post_id TEXT NOT NULL CHECK (length(post_id) BETWEEN 1 AND 64 AND post_id NOT GLOB '*[^A-Za-z0-9_-]*'),
  user_id TEXT NOT NULL REFERENCES users (id),
  at INTEGER NOT NULL,
  -- When sales picked it up (console, later) or the owner withdrew it.
  handled_at INTEGER,
  withdrawn_at INTEGER,
  CHECK (handled_at IS NULL OR handled_at >= at),
  CHECK (withdrawn_at IS NULL OR withdrawn_at >= at)
) STRICT;

CREATE UNIQUE INDEX offer_interests_one_live ON offer_interests (post_id, user_id) WHERE withdrawn_at IS NULL;
CREATE INDEX offer_interests_open ON offer_interests (at) WHERE handled_at IS NULL AND withdrawn_at IS NULL;
