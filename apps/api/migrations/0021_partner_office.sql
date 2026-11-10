-- 0021 Partner office company tools (ADR 0025; R3, S5, S7, S9, S10, P1, E5-E7).
-- Technicians' skills and days away (dispatch), contract documents waiting for JAD+ to verify them, rate cards
-- and price-change requests, and the partner's after-hours emergency contact per week. Lists mirror
-- packages/shared/src/partner-office/rules.ts. Free text written by JAD+ staff (rejection reasons, who approved
-- a price change) can name people, so it is stored only as AES-GCM ciphertext (C-PD-2).

-- What each technician can do (dispatch suggestions). The office replaces the whole list at once.
CREATE TABLE technician_skills (
  technician_id TEXT NOT NULL REFERENCES technicians (id),
  skill TEXT NOT NULL CHECK (
    skill IN ('ac', 'plumbing', 'electrical', 'carpentry', 'painting', 'appliances', 'general')
  ),
  PRIMARY KEY (technician_id, skill)
) STRICT;

-- Days a technician is away, first and last day included (Dubai dates). The reason is a category only.
CREATE TABLE technician_unavailability (
  id TEXT PRIMARY KEY,
  technician_id TEXT NOT NULL REFERENCES technicians (id),
  from_date TEXT NOT NULL CHECK (date(from_date) = from_date),
  to_date TEXT NOT NULL CHECK (date(to_date) = to_date),
  reason TEXT NOT NULL CHECK (reason IN ('leave', 'sick', 'training', 'other')),
  created_by TEXT NOT NULL REFERENCES users (id),
  created_at INTEGER NOT NULL,
  CHECK (to_date >= from_date)
) STRICT;

CREATE INDEX technician_unavailability_by_tech ON technician_unavailability (technician_id, to_date);

-- A contract document the partner office uploaded (S7, S10). It counts only once JAD+ Admin accepts it: then a
-- partner_documents row is written (document_id), which the daily check reads. The PDF is in private R2; the
-- client's filename is never stored (C-UPL-1). One upload per kind may wait at a time.
CREATE TABLE partner_document_uploads (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners (id),
  kind TEXT NOT NULL CHECK (kind IN ('trade_licence', 'insurance', 'signed_sop_sla_kpi', 'rate_card')),
  r2_key TEXT NOT NULL UNIQUE CHECK (length(r2_key) <= 200),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 15728640),
  sha256 BLOB NOT NULL CHECK (length(sha256) = 32),
  expires_on TEXT CHECK (expires_on IS NULL OR date(expires_on) = expires_on),
  uploaded_by TEXT NOT NULL REFERENCES users (id),
  uploaded_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  decided_by TEXT REFERENCES users (id),
  decided_at INTEGER,
  reason_enc BLOB,
  document_id TEXT REFERENCES partner_documents (id),
  CHECK (kind NOT IN ('trade_licence', 'insurance') OR expires_on IS NOT NULL),
  CHECK ((status = 'pending') = (decided_at IS NULL)),
  CHECK ((decided_at IS NULL) = (decided_by IS NULL)),
  CHECK ((status = 'accepted') = (document_id IS NOT NULL)),
  CHECK ((status = 'rejected') = (reason_enc IS NOT NULL))
) STRICT;

CREATE UNIQUE INDEX partner_document_uploads_one_pending ON partner_document_uploads (partner_id, kind)
  WHERE status = 'pending';
CREATE INDEX partner_document_uploads_by_status ON partner_document_uploads (status, uploaded_at);

-- A rate card the partner proposed (S9, P1). Accepted by JAD+ (named written approval), it is the partner's card
-- from effective_from for 12 months (valid_until). The newest accepted card already started is the current one.
CREATE TABLE rate_card_changes (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners (id),
  effective_from TEXT NOT NULL CHECK (date(effective_from) = effective_from),
  valid_until TEXT NOT NULL CHECK (date(valid_until) = valid_until),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  proposed_by TEXT NOT NULL REFERENCES users (id),
  proposed_at INTEGER NOT NULL,
  decided_by TEXT REFERENCES users (id),
  decided_at INTEGER,
  approved_by_enc BLOB,
  reason_enc BLOB,
  CHECK (valid_until > effective_from),
  CHECK ((status = 'pending') = (decided_at IS NULL)),
  CHECK ((decided_at IS NULL) = (decided_by IS NULL)),
  CHECK ((status = 'accepted') = (approved_by_enc IS NOT NULL)),
  CHECK (status <> 'rejected' OR reason_enc IS NOT NULL)
) STRICT;

CREATE UNIQUE INDEX rate_card_changes_one_pending ON rate_card_changes (partner_id) WHERE status = 'pending';
CREATE INDEX rate_card_changes_by_partner ON rate_card_changes (partner_id, status, effective_from);

-- The lines of a proposed card, as sent. Never changed afterwards: a new card is a new change.
CREATE TABLE rate_card_items (
  change_id TEXT NOT NULL REFERENCES rate_card_changes (id),
  line INTEGER NOT NULL CHECK (line BETWEEN 1 AND 200),
  service_code TEXT NOT NULL REFERENCES services (code),
  item TEXT NOT NULL CHECK (length(item) BETWEEN 2 AND 120),
  unit TEXT NOT NULL CHECK (
    unit IN ('per_job', 'per_hour', 'per_visit', 'per_item', 'per_sqm', 'per_metre', 'per_day')
  ),
  price_fils INTEGER NOT NULL CHECK (price_fils > 0 AND price_fils <= 100000000),
  PRIMARY KEY (change_id, line)
) STRICT;

CREATE TRIGGER rate_card_items_no_update BEFORE UPDATE ON rate_card_items
BEGIN
  SELECT RAISE(ABORT, 'rate_card_items are fixed once sent');
END;

CREATE TRIGGER rate_card_items_no_delete BEFORE DELETE ON rate_card_items
BEGIN
  SELECT RAISE(ABORT, 'rate_card_items are fixed once sent');
END;

-- The partner's own emergency contact out of hours, per week starting Monday (Dubai) (E5-E7).
CREATE TABLE partner_after_hours (
  partner_id TEXT NOT NULL REFERENCES partners (id),
  week_starting TEXT NOT NULL CHECK (
    date(week_starting) = week_starting AND strftime('%w', week_starting) = '1'
  ),
  technician_id TEXT NOT NULL REFERENCES technicians (id),
  set_by TEXT NOT NULL REFERENCES users (id),
  set_at INTEGER NOT NULL,
  PRIMARY KEY (partner_id, week_starting)
) STRICT;
