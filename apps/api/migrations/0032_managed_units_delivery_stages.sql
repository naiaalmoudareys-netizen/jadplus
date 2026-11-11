-- 0032 Managed units, furnishing delivery dates and interior design stages (ADR 0034; O4, O5, A1, S4).
--
-- 1. managed_units: a unit run by a JAD Global property management team (partners.kind = 'jad_group') for its
--    owner. Started by the owner's property management consultation reaching "Active" (source 'consultation',
--    with the request), by JAD+ Admin ('admin') or by the bulk entry of units sold with complimentary management
--    ('complimentary'). History is kept: an arrangement is ended (ended_at), never deleted, and a unit has at
--    most one arrangement that is not ended. Sources mirror MANAGED_SOURCES in packages/shared/src/managed-units.ts
--    (drift-tested). No personal data: user ids, the Salesforce unit id and dates only.
--
-- 2. manager_settings: per managing team, the outside maintenance company it chose for its managed units' repairs
--    (null = the normal maintenance routing).
--
-- 3. managed_statements: the monthly PDF statements the managing team uploads for the owner (private R2, size and
--    SHA-256 kept, the client's file name never stored). Append-only: a correction is a newer upload for the same
--    month, and the owner sees the latest.
--
-- 4. delivery_dates: furnishing delivery date and window set by the provider after the owner approved the quote,
--    every setting kept (append-only); the latest is the current one. A move carries the reason the owner sees
--    (contact details masked before saving, ADR 0009).
--
-- 5. project_stages: interior design stages reached (append-only, each stage once per request). Stage ids mirror
--    PROJECT_STAGES in packages/shared/src/project-delivery.ts (drift-tested).

CREATE TABLE managed_units (
  id TEXT PRIMARY KEY,
  sf_unit_id TEXT NOT NULL CHECK (length(sf_unit_id) IN (15, 18) AND sf_unit_id NOT GLOB '*[^A-Za-z0-9]*'),
  owner_user_id TEXT NOT NULL REFERENCES users (id),
  provider_id TEXT NOT NULL REFERENCES partners (id),
  source TEXT NOT NULL CHECK (source IN ('consultation', 'admin', 'complimentary')),
  request_id TEXT REFERENCES requests (id),
  since TEXT NOT NULL CHECK (date(since) = since),
  until TEXT CHECK (until IS NULL OR date(until) = until),
  set_at INTEGER NOT NULL,
  set_by TEXT NOT NULL REFERENCES users (id),
  ended_at INTEGER,
  ended_by TEXT REFERENCES users (id),
  CHECK (until IS NULL OR until > since),
  CHECK ((source = 'consultation') = (request_id IS NOT NULL)),
  CHECK ((ended_at IS NULL) = (ended_by IS NULL)),
  CHECK (ended_at IS NULL OR ended_at >= set_at)
) STRICT;

CREATE UNIQUE INDEX managed_units_one_open ON managed_units (sf_unit_id) WHERE ended_at IS NULL;
CREATE INDEX managed_units_by_provider ON managed_units (provider_id, ended_at);
CREATE INDEX managed_units_by_owner ON managed_units (owner_user_id);

-- Only ending an arrangement is a change; everything else about it is history.
CREATE TRIGGER managed_units_only_end BEFORE UPDATE ON managed_units
WHEN old.ended_at IS NOT NULL
  OR new.id IS NOT old.id OR new.sf_unit_id IS NOT old.sf_unit_id OR new.owner_user_id IS NOT old.owner_user_id
  OR new.provider_id IS NOT old.provider_id OR new.source IS NOT old.source OR new.request_id IS NOT old.request_id
  OR new.since IS NOT old.since OR new.until IS NOT old.until OR new.set_at IS NOT old.set_at
  OR new.set_by IS NOT old.set_by
BEGIN
  SELECT RAISE(ABORT, 'managed_units keep their history: only ending is allowed');
END;

CREATE TRIGGER managed_units_no_delete BEFORE DELETE ON managed_units
BEGIN
  SELECT RAISE(ABORT, 'managed_units keep their history');
END;

CREATE TABLE manager_settings (
  provider_id TEXT PRIMARY KEY REFERENCES partners (id),
  maintenance_partner_id TEXT REFERENCES partners (id),
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL REFERENCES users (id),
  CHECK (maintenance_partner_id IS NULL OR maintenance_partner_id <> provider_id)
) STRICT;

CREATE TABLE managed_statements (
  id TEXT PRIMARY KEY,
  managed_unit_id TEXT NOT NULL REFERENCES managed_units (id),
  month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(month, 6, 2) BETWEEN '01' AND '12'),
  r2_key TEXT NOT NULL UNIQUE CHECK (length(r2_key) <= 200),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 20971520),
  sha256 BLOB NOT NULL CHECK (length(sha256) = 32),
  uploaded_by TEXT NOT NULL REFERENCES users (id),
  uploaded_at INTEGER NOT NULL
) STRICT;

CREATE INDEX managed_statements_by_unit ON managed_statements (managed_unit_id, month);

CREATE TRIGGER managed_statements_no_update BEFORE UPDATE ON managed_statements
BEGIN
  SELECT RAISE(ABORT, 'managed_statements are append-only');
END;

CREATE TRIGGER managed_statements_no_delete BEFORE DELETE ON managed_statements
BEGIN
  SELECT RAISE(ABORT, 'managed_statements are append-only');
END;

CREATE TABLE delivery_dates (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests (id),
  delivery_date TEXT NOT NULL CHECK (date(delivery_date) = delivery_date),
  slot TEXT NOT NULL CHECK (slot IN ('morning', 'midday', 'afternoon')),
  -- Shown to the owner; null only for the first date.
  reason TEXT CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 300),
  partner_id TEXT NOT NULL REFERENCES partners (id),
  set_by TEXT NOT NULL REFERENCES users (id),
  set_at INTEGER NOT NULL
) STRICT;

CREATE INDEX delivery_dates_by_request ON delivery_dates (request_id, set_at);

CREATE TRIGGER delivery_dates_no_update BEFORE UPDATE ON delivery_dates
BEGIN
  SELECT RAISE(ABORT, 'delivery_dates are append-only');
END;

CREATE TRIGGER delivery_dates_no_delete BEFORE DELETE ON delivery_dates
BEGIN
  SELECT RAISE(ABORT, 'delivery_dates are append-only');
END;

CREATE TABLE project_stages (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests (id),
  stage TEXT NOT NULL CHECK (stage IN ('concept', 'design_approved', 'fit_out', 'handover')),
  note TEXT CHECK (note IS NULL OR length(note) BETWEEN 1 AND 500),
  partner_id TEXT NOT NULL REFERENCES partners (id),
  actor_user_id TEXT NOT NULL REFERENCES users (id),
  at INTEGER NOT NULL,
  UNIQUE (request_id, stage)
) STRICT;

CREATE TRIGGER project_stages_no_update BEFORE UPDATE ON project_stages
BEGIN
  SELECT RAISE(ABORT, 'project_stages are append-only');
END;

CREATE TRIGGER project_stages_no_delete BEFORE DELETE ON project_stages
BEGIN
  SELECT RAISE(ABORT, 'project_stages are append-only');
END;
