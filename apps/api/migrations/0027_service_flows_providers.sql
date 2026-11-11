-- 0027 Service flows and in-house teams as providers (ADR 0030; S1-S4, S10, O5, P6).
--
-- 1. Each service says how a request for it runs (flow): visit, report, consultation or booking. Mirrors
--    SERVICE_FLOWS and SERVICES in packages/shared/src/services.ts (drift-tested). Only the visit journey is built
--    today; the report, consultation and booking flows follow and branch on this column.
--
-- 2. A provider company is an outside partner ('external', the default for every existing partner) or a JAD Global
--    group team ('jad_group'), which delivers in-house services through the same primary/backup assignment
--    (service_partners) and the same partner office. Mirrors PROVIDER_KINDS in services.ts (drift-tested).
--
-- 3. Staff notes on a request (0019) gain the kind 'handled_by_jad': the reason JAD+ Admin gives when it marks an
--    old in-house request, raised before in-house teams were providers, as handled. SQLite cannot change a CHECK,
--    so the table is rebuilt with every row copied; no other table refers to it. The append-only triggers are
--    created again on the new table. Kinds mirror NOTE_KINDS in packages/shared/src/admin-ops.ts.

ALTER TABLE services ADD COLUMN flow TEXT NOT NULL DEFAULT 'visit'
  CHECK (flow IN ('visit', 'report', 'consultation', 'booking'));

UPDATE services SET flow = 'report' WHERE code IN ('snagging', 'valuation');
UPDATE services SET flow = 'consultation'
  WHERE code IN ('property-management', 'leasing', 'resale', 'mortgage', 'golden-visa');
UPDATE services SET flow = 'booking' WHERE code = 'education';

ALTER TABLE partners ADD COLUMN kind TEXT NOT NULL DEFAULT 'external' CHECK (kind IN ('external', 'jad_group'));

CREATE TABLE request_notes_new (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests (id),
  author_user_id TEXT NOT NULL REFERENCES users (id),
  kind TEXT NOT NULL CHECK (
    kind IN ('note', 'owner_called', 'reassigned', 'reclassified', 'cancelled', 'handled_by_jad')
  ),
  body_enc BLOB NOT NULL,
  at INTEGER NOT NULL
) STRICT;

INSERT INTO request_notes_new (id, request_id, author_user_id, kind, body_enc, at)
  SELECT id, request_id, author_user_id, kind, body_enc, at FROM request_notes;

DROP TABLE request_notes;
ALTER TABLE request_notes_new RENAME TO request_notes;
CREATE INDEX request_notes_by_request ON request_notes (request_id, at);

CREATE TRIGGER request_notes_no_update BEFORE UPDATE ON request_notes
BEGIN
  SELECT RAISE(ABORT, 'request_notes are append-only');
END;

CREATE TRIGGER request_notes_no_delete BEFORE DELETE ON request_notes
BEGIN
  SELECT RAISE(ABORT, 'request_notes are append-only');
END;
