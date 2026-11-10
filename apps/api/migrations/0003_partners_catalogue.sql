-- 0003 Partners, technicians, partner documents, service catalogue with primary/backup partner, on-call rota.
-- Requirements: R3, S1-S3, S7, S10, E6, E7, E17, P3, P4.

-- A signed service partner (company). suspended: licence/insurance lapsed or under review (S7, P3);
-- ended: contract ended (S6, P2, P4). The partner's alert phone (E6) is personal/business contact data: encrypted.
CREATE TABLE partners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'ended')),
  status_reason TEXT CHECK (length(status_reason) <= 500),
  alert_phone_enc BLOB,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (status = 'active' OR status_reason IS NOT NULL),
  CHECK (updated_at >= created_at)
) STRICT;

-- Contract documents in private R2 (S10). Expiry is flagged 30 days ahead; lapse suspends the partner (S7, P3).
CREATE TABLE partner_documents (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners (id),
  kind TEXT NOT NULL CHECK (kind IN ('trade_licence', 'insurance', 'signed_sop_sla_kpi', 'rate_card')),
  r2_key TEXT NOT NULL UNIQUE CHECK (length(r2_key) <= 200),
  valid_from TEXT CHECK (valid_from IS NULL OR date(valid_from) = valid_from),
  expires_on TEXT CHECK (expires_on IS NULL OR date(expires_on) = expires_on),
  uploaded_at INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users (id),
  CHECK (kind NOT IN ('trade_licence', 'insurance') OR expires_on IS NOT NULL),
  CHECK (valid_from IS NULL OR expires_on IS NULL OR expires_on > valid_from)
) STRICT;

CREATE INDEX partner_documents_expiry ON partner_documents (expires_on) WHERE expires_on IS NOT NULL;

-- A partner's technician (signs in with the 'partner' role for that partner).
-- removed: taken off JAD+ jobs at once after misconduct (E17).
CREATE TABLE technicians (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  removed_reason TEXT CHECK (length(removed_reason) <= 500),
  created_at INTEGER NOT NULL,
  removed_at INTEGER,
  UNIQUE (partner_id, user_id),
  CHECK ((status = 'removed') = (removed_at IS NOT NULL)),
  CHECK ((status = 'removed') = (removed_reason IS NOT NULL))
) STRICT;

-- The service catalogue (S1). SLA targets live in packages/shared (S4), keyed by code.
-- A service without an active primary partner shows "coming soon" (S2, P6); that is derived, not stored.
CREATE TABLE services (
  code TEXT PRIMARY KEY CHECK (code GLOB '[a-z]*' AND length(code) <= 40),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  sort_order INTEGER NOT NULL DEFAULT 0,
  listed INTEGER NOT NULL DEFAULT 1 CHECK (listed IN (0, 1))
) STRICT;

-- Who serves each service (S3). History is kept: ending an assignment sets ended_at, never deletes.
-- When the primary is suspended or ended, the backup becomes primary the same day (S6, P4).
CREATE TABLE service_partners (
  id TEXT PRIMARY KEY,
  service_code TEXT NOT NULL REFERENCES services (code),
  partner_id TEXT NOT NULL REFERENCES partners (id),
  rank TEXT NOT NULL CHECK (rank IN ('primary', 'backup')),
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  CHECK (ended_at IS NULL OR ended_at >= started_at)
) STRICT;

-- One current primary and one current backup per service, and never the same partner in both.
CREATE UNIQUE INDEX service_partners_one_per_rank ON service_partners (service_code, rank) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX service_partners_one_rank_per_partner ON service_partners (service_code, partner_id)
  WHERE ended_at IS NULL;

-- Weekly on-call rota (section 11): JAD+ Admin plus a second person, alerted when an emergency escalates (E6, E7).
CREATE TABLE on_call_rota (
  week_starting TEXT NOT NULL CHECK (date(week_starting) = week_starting AND strftime('%w', week_starting) = '1'),
  position TEXT NOT NULL CHECK (position IN ('first', 'second')),
  user_id TEXT NOT NULL REFERENCES users (id),
  PRIMARY KEY (week_starting, position)
) STRICT;
