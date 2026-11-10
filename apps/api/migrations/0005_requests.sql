-- 0005 Requests and everything that happens to them: events, quotes, visits, attachments, ratings,
-- and the facts the partner scorecard is computed from (S5 "real data only").
-- Requirements: R3, R4, E1-E19, A1-A8, L4, S5, S6, V4. Status lists mirror packages/shared/src/lifecycle.ts
-- and emergency.ts; apps/api/test/migrations.test.ts fails if they drift apart.

CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  -- Short reference people can read out on the phone.
  ref TEXT NOT NULL UNIQUE CHECK (length(ref) BETWEEN 6 AND 16),
  service_code TEXT NOT NULL REFERENCES services (code),
  sf_unit_id TEXT NOT NULL CHECK (length(sf_unit_id) BETWEEN 15 AND 18),
  -- Current owner of the unit; moves to the new owner on sale (U3).
  owner_user_id TEXT NOT NULL REFERENCES users (id),
  tenancy_id TEXT REFERENCES tenancies (id),
  raised_by_user_id TEXT NOT NULL REFERENCES users (id),
  -- jad_admin = logged on the owner's behalf (U8, V3).
  raised_by_role TEXT NOT NULL CHECK (raised_by_role IN ('owner', 'tenant', 'jad_admin')),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 2000),
  is_emergency INTEGER NOT NULL CHECK (is_emergency IN (0, 1)),
  emergency_type TEXT CHECK (
    emergency_type IN (
      'water_leak', 'no_power', 'ac_failure', 'lockout', 'door_window_wont_lock',
      'fire', 'smoke', 'gas_smell', 'injury'
    )
  ),
  fault_source TEXT CHECK (fault_source IN ('unit', 'building', 'neighbour', 'fire_system')),
  status TEXT NOT NULL CHECK (
    status IN (
      'awaiting_owner', 'submitted', 'assigned', 'quote_sent', 'scheduled', 'in_progress',
      'on_hold', 'completed', 'reopened', 'closed', 'cancelled'
    )
  ),
  close_reason TEXT CHECK (
    close_reason IN (
      'confirmed', 'auto_closed', 'owner_arranged', 'quote_declined', 'quote_expired',
      'owner_declined_request', 'cancelled_by_requester', 'cancelled_by_jad'
    )
  ),
  on_hold_reason TEXT CHECK (length(on_hold_reason) <= 500),
  partner_id TEXT REFERENCES partners (id),
  technician_id TEXT REFERENCES technicians (id),
  -- Emergency acknowledgement (E4): when, and the arrival window promised to the resident.
  acknowledged_at INTEGER,
  arrival_window_start INTEGER,
  arrival_window_end INTEGER,
  -- How far an unacknowledged emergency has escalated (E5-E7).
  escalation TEXT NOT NULL DEFAULT 'none' CHECK (escalation IN ('none', 'reminded', 'moved_to_backup', 'on_call')),
  -- Next deadline on the clock, for the partner queue and the admin SLA risk list (R3, R4).
  next_due_at INTEGER,
  next_due_kind TEXT CHECK (length(next_due_kind) <= 40),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  status_changed_at INTEGER NOT NULL,
  -- Optimistic concurrency: every update must match and increment it.
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK (is_emergency = (emergency_type IS NOT NULL)),
  CHECK (raised_by_role <> 'tenant' OR tenancy_id IS NOT NULL),
  CHECK ((status IN ('closed', 'cancelled')) = (close_reason IS NOT NULL)),
  CHECK (status <> 'cancelled' OR close_reason IN ('cancelled_by_requester', 'cancelled_by_jad')),
  CHECK ((status = 'on_hold') = (on_hold_reason IS NOT NULL)),
  CHECK (technician_id IS NULL OR partner_id IS NOT NULL),
  CHECK ((arrival_window_start IS NULL) = (arrival_window_end IS NULL)),
  CHECK (arrival_window_end IS NULL OR arrival_window_end > arrival_window_start),
  CHECK ((next_due_at IS NULL) = (next_due_kind IS NULL)),
  CHECK (updated_at >= created_at AND status_changed_at >= created_at)
) STRICT;

CREATE INDEX requests_partner_queue ON requests (partner_id, status, next_due_at);
CREATE INDEX requests_owner ON requests (owner_user_id, created_at);
CREATE INDEX requests_unit ON requests (sf_unit_id, created_at);
CREATE INDEX requests_tenancy ON requests (tenancy_id) WHERE tenancy_id IS NOT NULL;
CREATE INDEX requests_due ON requests (next_due_at) WHERE next_due_at IS NOT NULL;

-- Everything that happened to a request, in order. Append-only: the history is evidence (C-AUD-1).
CREATE TABLE request_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests (id),
  at INTEGER NOT NULL,
  actor_user_id TEXT REFERENCES users (id),
  actor_role TEXT NOT NULL CHECK (
    actor_role IN ('owner', 'tenant', 'partner', 'partner_admin', 'jad_admin', 'jad_viewer', 'system')
  ),
  kind TEXT NOT NULL CHECK (
    kind IN (
      'created', 'status_changed', 'assigned', 'acknowledged', 'reminder_sent', 'escalated',
      'reclassified', 'visit_booked', 'no_access', 'quote_sent', 'quote_decided', 'attachment_added',
      'rated', 'owner_changed', 'note'
    )
  ),
  from_status TEXT,
  to_status TEXT,
  partner_id TEXT REFERENCES partners (id),
  -- Small structured detail, never personal data.
  data TEXT CHECK (data IS NULL OR (json_valid(data) AND length(data) <= 4096)),
  CHECK ((actor_role = 'system') = (actor_user_id IS NULL)),
  CHECK ((kind = 'status_changed') = (from_status IS NOT NULL AND to_status IS NOT NULL))
) STRICT;

CREATE INDEX request_events_request ON request_events (request_id, at);

CREATE TRIGGER request_events_no_update BEFORE UPDATE ON request_events
BEGIN
  SELECT RAISE(ABORT, 'request_events are append-only');
END;

CREATE TRIGGER request_events_no_delete BEFORE DELETE ON request_events
BEGIN
  SELECT RAISE(ABORT, 'request_events are append-only');
END;

-- Quotes (L4, A2, A3, E8). Only the owner approves chargeable work. The single exception is make-safe work
-- within the cap the owner pre-authorised: that approval points at the owner's make_safe_cap consent row.
-- revision 2 is the one revised quote a partner may offer after a decline (A3).
CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests (id),
  partner_id TEXT NOT NULL REFERENCES partners (id),
  revision INTEGER NOT NULL CHECK (revision IN (1, 2)),
  amount_fils INTEGER NOT NULL CHECK (amount_fils > 0),
  scope TEXT NOT NULL CHECK (length(scope) BETWEEN 1 AND 2000),
  is_make_safe INTEGER NOT NULL CHECK (is_make_safe IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'declined', 'expired', 'withdrawn')),
  sent_at INTEGER NOT NULL,
  -- Reminder on day 10, expiry on day 14 (A2).
  expires_at INTEGER NOT NULL,
  reminded_at INTEGER,
  decided_at INTEGER,
  decided_by_user_id TEXT REFERENCES users (id),
  make_safe_consent_id TEXT REFERENCES consents (id),
  UNIQUE (request_id, partner_id, revision),
  CHECK (expires_at > sent_at),
  CHECK ((status = 'pending') = (decided_at IS NULL)),
  CHECK (make_safe_consent_id IS NULL OR (is_make_safe = 1 AND status = 'approved')),
  CHECK (status <> 'approved' OR decided_by_user_id IS NOT NULL OR make_safe_consent_id IS NOT NULL),
  CHECK (status <> 'declined' OR decided_by_user_id IS NOT NULL)
) STRICT;

CREATE INDEX quotes_pending ON quotes (expires_at) WHERE status = 'pending';

-- Visits booked with the resident (A5, A7, A8, E4).
CREATE TABLE visits (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests (id),
  technician_id TEXT REFERENCES technicians (id),
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('booked', 'on_the_way', 'arrived', 'done', 'no_access', 'cancelled')),
  -- Return visit after the resident said the work was not done (A5): counts on the scorecard.
  is_repeat INTEGER NOT NULL DEFAULT 0 CHECK (is_repeat IN (0, 1)),
  -- "No access" must be evidenced by a photo (A7).
  no_access_attachment_id TEXT REFERENCES attachments (id),
  reminder_day_sent_at INTEGER,
  reminder_hour_sent_at INTEGER,
  created_at INTEGER NOT NULL,
  CHECK (window_end > window_start),
  CHECK ((status = 'no_access') = (no_access_attachment_id IS NOT NULL))
) STRICT;

CREATE INDEX visits_request ON visits (request_id);
CREATE INDEX visits_upcoming ON visits (window_start) WHERE status = 'booked';

-- Photos and PDFs. The file itself is in private R2 (C-PD-3); here only metadata. The client's filename is
-- never stored (C-UPL-1); content_type is the sniffed type, not the declared one.
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests (id),
  visit_id TEXT REFERENCES visits (id),
  quote_id TEXT REFERENCES quotes (id),
  purpose TEXT NOT NULL CHECK (
    purpose IN ('request_photo', 'completion_photo', 'no_access_photo', 'quote_pdf', 'report_pdf')
  ),
  r2_key TEXT NOT NULL UNIQUE CHECK (length(r2_key) <= 200),
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  sha256 BLOB NOT NULL CHECK (length(sha256) = 32),
  uploaded_by_user_id TEXT NOT NULL REFERENCES users (id),
  uploaded_at INTEGER NOT NULL,
  CHECK ((content_type = 'application/pdf') = (purpose IN ('quote_pdf', 'report_pdf'))),
  CHECK (byte_size <= CASE WHEN content_type = 'application/pdf' THEN 15728640 ELSE 10485760 END)
) STRICT;

CREATE INDEX attachments_request ON attachments (request_id);

-- One rating per closed request, by the resident (S5, S6, V4).
CREATE TABLE ratings (
  request_id TEXT PRIMARY KEY REFERENCES requests (id),
  partner_id TEXT NOT NULL REFERENCES partners (id),
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT CHECK (length(comment) <= 1000),
  rated_by_user_id TEXT NOT NULL REFERENCES users (id),
  at INTEGER NOT NULL
) STRICT;

CREATE INDEX ratings_partner ON ratings (partner_id, at);

-- Each SLA target a partner was measured on (S4, S5, E11). excused: not counted against the partner,
-- e.g. no access (A7); the reason is recorded.
CREATE TABLE sla_outcomes (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests (id),
  partner_id TEXT NOT NULL REFERENCES partners (id),
  metric TEXT NOT NULL CHECK (
    metric IN ('emergency_ack', 'emergency_on_site', 'routine_response', 'routine_visit', 'quote_after_visit', 'service_milestone')
  ),
  due_at INTEGER NOT NULL,
  met_at INTEGER,
  outcome TEXT NOT NULL CHECK (outcome IN ('met', 'missed', 'excused')),
  excuse TEXT CHECK (length(excuse) <= 500),
  recorded_at INTEGER NOT NULL,
  UNIQUE (request_id, partner_id, metric),
  CHECK ((outcome = 'met') = (met_at IS NOT NULL AND met_at <= due_at)),
  CHECK ((outcome = 'excused') = (excuse IS NOT NULL))
) STRICT;

CREATE INDEX sla_outcomes_partner ON sla_outcomes (partner_id, due_at);

-- Events that count against a partner beyond SLA timing (S6, E16, E17, P2, U13):
-- two missed emergencies in 90 days or one safety/honesty breach flag the partner for review.
CREATE TABLE partner_incidents (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners (id),
  technician_id TEXT REFERENCES technicians (id),
  request_id TEXT REFERENCES requests (id),
  kind TEXT NOT NULL CHECK (
    kind IN ('missed_emergency', 'safety_breach', 'honesty_breach', 'off_platform', 'complaint', 'damage', 'misconduct')
  ),
  note TEXT NOT NULL CHECK (length(note) BETWEEN 1 AND 2000),
  at INTEGER NOT NULL,
  recorded_by TEXT REFERENCES users (id),
  resolved_at INTEGER,
  CHECK (resolved_at IS NULL OR resolved_at >= at)
) STRICT;

CREATE INDEX partner_incidents_partner ON partner_incidents (partner_id, kind, at);
