-- 0026 Building help lines (E12; ADR 0029): the building's security desk and building management, two numbers
-- residents may call directly about their building (noise, parking, lifts, shared pipes). Kinds mirror
-- BUILDING_LINE_KINDS in packages/shared/src/building-lines.ts (drift-tested). A place is a project and
-- optionally one building in it; building '' means the whole project, the default for its buildings (as in 0020).
-- These are building service lines, not personal data, but the number is stored as AES-GCM ciphertext like every
-- phone field (C-PD-2) and never logged. One line per kind and place; removing a line deletes its row (the audit
-- log keeps who set and removed it, and when, without the number: C-AUD-1).

CREATE TABLE building_lines (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL CHECK (length(project) BETWEEN 1 AND 120),
  building TEXT NOT NULL CHECK (length(building) <= 80),
  kind TEXT NOT NULL CHECK (kind IN ('security', 'management')),
  phone_enc BLOB NOT NULL,
  hours TEXT CHECK (hours IS NULL OR length(hours) BETWEEN 1 AND 60),
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL REFERENCES users (id),
  UNIQUE (project, building, kind)
) STRICT;
