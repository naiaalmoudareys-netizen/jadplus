-- 0004 Tenancies: an owner invites a tenant to one unit for fixed dates (R2, O4, U4, U5, U7).
-- Units, owners and deals stay in Salesforce; sf_unit_id is the Salesforce unit record id (not copied data).

CREATE TABLE tenancies (
  id TEXT PRIMARY KEY,
  sf_unit_id TEXT NOT NULL CHECK (length(sf_unit_id) BETWEEN 15 AND 18),
  owner_user_id TEXT NOT NULL REFERENCES users (id),
  tenant_user_id TEXT NOT NULL REFERENCES users (id),
  starts_on TEXT NOT NULL CHECK (date(starts_on) = starts_on),
  -- Access ends automatically on this date (U4); the owner can extend it in one tap (U5).
  ends_on TEXT NOT NULL CHECK (date(ends_on) = ends_on),
  status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'ended', 'revoked')),
  invited_at INTEGER NOT NULL,
  accepted_at INTEGER,
  ended_at INTEGER,
  -- Owner, or Harbor property manager acting for a managed unit (section 11), or JAD+ Admin.
  created_by TEXT NOT NULL REFERENCES users (id),
  CHECK (ends_on > starts_on),
  CHECK (owner_user_id <> tenant_user_id),
  CHECK ((status = 'invited') = (accepted_at IS NULL)),
  CHECK ((status IN ('ended', 'revoked')) = (ended_at IS NOT NULL))
) STRICT;

-- A unit has at most one current tenancy.
CREATE UNIQUE INDEX tenancies_one_current_per_unit ON tenancies (sf_unit_id) WHERE status IN ('invited', 'active');
CREATE INDEX tenancies_tenant ON tenancies (tenant_user_id, status);
CREATE INDEX tenancies_owner ON tenancies (owner_user_id, status);
CREATE INDEX tenancies_ending ON tenancies (ends_on) WHERE status = 'active';
