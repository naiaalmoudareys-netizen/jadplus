-- 0030 Handover checklist (O2) and investor education bookings (O5, S4; ADR 0033).
--
-- 1. A handover checklist per owner unit, opened from the owner's handover request (service 'handover') by the
--    JAD Global team that has the request, or by JAD+ Admin. One checklist per unit and per request. Its steps are
--    fixed and listed in HANDOVER_STEPS (packages/shared/src/handover.ts, drift-tested); every step row is created
--    when the checklist starts. The key collection appointment is a Dubai working day and a visit window (VISIT_SLOT_KEYS).
--    A step's note is written by staff for the owner and stored encrypted like every free-text staff note
--    (C-PD-2). Who ticked what and when is in the audit log (C-AUD-1); the row keeps the latest state.
--
-- 2. Investor education: sessions (in person or online, a number of seats), one seat per owner per session
--    (cancelled seats stay as history), and requests for the book (one per owner, requested then sent).
--    Modes and statuses mirror SESSION_MODES and BOOK_REQUEST_STATUSES in packages/shared/src/education.ts.
--    No personal data is stored here beyond the owner's user id.

CREATE TABLE handover_checklists (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE REFERENCES requests (id),
  sf_unit_id TEXT NOT NULL UNIQUE CHECK (length(sf_unit_id) IN (15, 18) AND sf_unit_id NOT GLOB '*[^A-Za-z0-9]*'),
  started_at INTEGER NOT NULL,
  started_by TEXT NOT NULL REFERENCES users (id),
  key_date TEXT CHECK (key_date IS NULL OR date(key_date) = key_date),
  key_slot TEXT CHECK (key_slot IN ('morning', 'midday', 'afternoon')),
  completed_at INTEGER,
  -- Every change sets updated_at only if it still has the value the API read, else 0, which breaks the CHECK
  -- below: two changes at once cannot both win, and the losing batch (audit entry included) is rolled back.
  updated_at INTEGER NOT NULL,
  CHECK ((key_date IS NULL) = (key_slot IS NULL)),
  CHECK (completed_at IS NULL OR completed_at >= started_at),
  CHECK (updated_at >= started_at)
) STRICT;

CREATE TABLE handover_steps (
  checklist_id TEXT NOT NULL REFERENCES handover_checklists (id),
  step TEXT NOT NULL CHECK (
    step IN (
      'final_payment', 'documents', 'snagging', 'utilities', 'service_charges', 'key_appointment', 'keys_collected'
    )
  ),
  done_at INTEGER,
  done_by TEXT REFERENCES users (id),
  note_enc BLOB,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (checklist_id, step),
  CHECK ((done_at IS NULL) = (done_by IS NULL))
) STRICT;

CREATE TABLE education_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 2000),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('in_person', 'online')),
  place TEXT NOT NULL CHECK (length(place) BETWEEN 1 AND 300),
  seats INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 500),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES users (id),
  updated_at INTEGER NOT NULL,
  cancelled_at INTEGER,
  CHECK (ends_at > starts_at),
  CHECK (updated_at >= created_at)
) STRICT;

CREATE INDEX education_sessions_by_start ON education_sessions (starts_at);

CREATE TABLE education_bookings (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES education_sessions (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  booked_at INTEGER NOT NULL,
  cancelled_at INTEGER,
  attended_at INTEGER,
  -- The API books a seat in one statement that writes booked_at = 0 when the session is already full, so a
  -- full session refuses the seat (and the whole batch, audit entry included) even when two owners book at once.
  CHECK (booked_at > 0),
  CHECK (cancelled_at IS NULL OR cancelled_at >= booked_at),
  CHECK (cancelled_at IS NULL OR attended_at IS NULL)
) STRICT;

-- One seat per owner per session; a seat given back stays as history and the owner may book again.
CREATE UNIQUE INDEX education_bookings_one_seat ON education_bookings (session_id, user_id)
  WHERE cancelled_at IS NULL;
CREATE INDEX education_bookings_by_user ON education_bookings (user_id);

CREATE TABLE education_book_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users (id),
  requested_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'sent')),
  sent_at INTEGER,
  sent_by TEXT REFERENCES users (id),
  CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
  CHECK ((sent_at IS NULL) = (sent_by IS NULL)),
  CHECK (sent_at IS NULL OR sent_at >= requested_at)
) STRICT;
