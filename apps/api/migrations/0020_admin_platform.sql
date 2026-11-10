-- 0020 JAD+ Admin platform (ADR 0025): building management contacts (E12), building notices to residents (V1)
-- and the home guide. Kinds and sections mirror packages/shared/src/admin-platform.ts (drift-tested).
-- A place is a project (as Salesforce names it on owner_units.project) and optionally one building in it;
-- building '' means the whole project (stored as '' rather than NULL so uniqueness and upserts work).
-- Project and building names are not personal data. Every change is audited (C-AUD-1).

-- E12: who runs the building (facility management, security desk). Their name, phone and email are personal
-- data: AES-GCM ciphertext only (C-PD-2), decrypted for JAD+ staff on an audited read. Removing a contact
-- deletes the row (data minimisation); the audit log keeps who removed it and when.
CREATE TABLE building_contacts (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL CHECK (length(project) BETWEEN 1 AND 120),
  building TEXT NOT NULL CHECK (length(building) <= 80),
  name_enc BLOB NOT NULL,
  role TEXT CHECK (role IS NULL OR length(role) BETWEEN 1 AND 60),
  phone_enc BLOB,
  email_enc BLOB,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES users (id),
  CHECK (phone_enc IS NOT NULL OR email_enc IS NOT NULL)
) STRICT;

CREATE INDEX building_contacts_place ON building_contacts (project, building);

-- V1: information for residents about their building (water or power cut, lift out of order, works). Plain
-- text, information only (L3: never instructions). Withdrawn notices are kept as evidence of what was said.
CREATE TABLE building_notices (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL CHECK (length(project) BETWEEN 1 AND 120),
  building TEXT NOT NULL CHECK (length(building) <= 80),
  kind TEXT NOT NULL CHECK (kind IN ('water', 'power', 'lift', 'ac', 'works', 'other')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES users (id),
  withdrawn_at INTEGER,
  withdrawn_by TEXT REFERENCES users (id),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK ((withdrawn_at IS NULL) = (withdrawn_by IS NULL))
) STRICT;

CREATE INDEX building_notices_live ON building_notices (project, starts_at) WHERE withdrawn_at IS NULL;

CREATE TRIGGER building_notices_no_delete BEFORE DELETE ON building_notices
BEGIN
  SELECT RAISE(ABORT, 'building_notices are kept as evidence');
END;

-- The home guide: how things work in the building (AC, water, waste, parking, access, amenities). One text per
-- section and place; a building's own section overrides the project-wide one (shared guideFor).
CREATE TABLE home_guide_sections (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL CHECK (length(project) BETWEEN 1 AND 120),
  building TEXT NOT NULL CHECK (length(building) <= 80),
  section TEXT NOT NULL CHECK (section IN ('ac', 'water', 'waste', 'parking', 'access', 'amenities', 'other')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL REFERENCES users (id),
  UNIQUE (project, building, section)
) STRICT;
