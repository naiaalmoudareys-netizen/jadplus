-- 0010 Messages on requests, and where a unit is (ADR 0009: "all contact must be done on JAD+").
-- Residents, the assigned partner and JAD+ staff talk inside JAD+; nobody is given another person's phone or
-- email. Contact details typed into a message are removed before it is saved (packages/shared/src/
-- conversation.ts). Messages are evidence of what was said, so they can be neither edited nor deleted.

CREATE TABLE request_messages (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests (id),
  author_user_id TEXT NOT NULL REFERENCES users (id),
  author_role TEXT NOT NULL CHECK (
    author_role IN ('owner', 'tenant', 'partner', 'partner_admin', 'jad_admin')
  ),
  -- The partner the author spoke for (partner roles only), so the label stays right after a job moves.
  author_partner_id TEXT REFERENCES partners (id),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1200),
  -- 1 when contact details were removed from what the author typed.
  masked INTEGER NOT NULL CHECK (masked IN (0, 1)),
  at INTEGER NOT NULL,
  CHECK ((author_role IN ('partner', 'partner_admin')) = (author_partner_id IS NOT NULL))
) STRICT;

CREATE INDEX request_messages_by_request ON request_messages (request_id, at);

CREATE TRIGGER request_messages_no_update BEFORE UPDATE ON request_messages
BEGIN
  SELECT RAISE(ABORT, 'request_messages is append-only');
END;

CREATE TRIGGER request_messages_no_delete BEFORE DELETE ON request_messages
BEGIN
  SELECT RAISE(ABORT, 'request_messages is append-only');
END;

-- Where the unit is, from Salesforce (building name, project address): shown to the technician on the job.
ALTER TABLE owner_units ADD COLUMN building TEXT CHECK (building IS NULL OR length(building) BETWEEN 1 AND 80);
ALTER TABLE owner_units ADD COLUMN address TEXT CHECK (address IS NULL OR length(address) BETWEEN 1 AND 300);
