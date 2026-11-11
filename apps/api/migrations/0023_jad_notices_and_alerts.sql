-- 0023 Residents told when JAD+ acts, after-hours partner contacts and building management alerts (ADR 0027).
--
-- 1. The in-app inbox (0016-0018, 0022) gains four kinds: a request cancelled by JAD+, a request moved to another
--    partner by JAD+, an emergency reclassified as routine (E13), and a building notice (V1). A building notice
--    item points at the notice (notice_id) instead of a request or a tenancy. SQLite cannot change a CHECK, so
--    the table is rebuilt again; no other table refers to it. Kinds mirror packages/shared/src/inbox.ts.
--
-- 2. Alert deliveries (0009) can go to a building management contact (E12). Building contacts are not JAD+ users;
--    their phone and email stay AES-GCM ciphertext in building_contacts and are decrypted only at send time
--    (C-PD-2). recipient_contact_id has no foreign key on purpose: removing a contact deletes its row (data
--    minimisation, 0020), and the delivery history must survive that; a removed contact is simply "no_address".
--    The after-hours technician (E5-E7) is a JAD+ user, so those deliveries use recipient_user_id as before.

CREATE TABLE inbox_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  request_id TEXT REFERENCES requests (id),
  tenancy_id TEXT REFERENCES tenancies (id),
  notice_id TEXT REFERENCES building_notices (id),
  kind TEXT NOT NULL CHECK (
    kind IN (
      'visit_booked', 'visit_tomorrow', 'visit_soon', 'on_the_way', 'no_access', 'quote_received',
      'quote_reminder', 'quote_expired', 'make_safe_done', 'work_done', 'confirm_reminder', 'auto_closed',
      'approval_needed', 'approval_reminder', 'request_approved', 'request_declined',
      'tenancy_invited', 'tenancy_ending', 'tenancy_ended', 'message_received',
      'job_new', 'job_reminder', 'job_moved_away', 'job_assigned_to_you', 'quote_approved', 'quote_declined',
      'work_confirmed', 'work_reopened', 'job_rated', 'job_cancelled',
      'invoice_issued', 'invoice_overdue', 'invoice_paid', 'invoice_not_received', 'invoice_cancelled',
      'invoice_paid_claimed',
      'request_cancelled_by_jad', 'request_moved_by_jad', 'request_reclassified', 'building_notice'
    )
  ),
  data TEXT CHECK (data IS NULL OR (json_valid(data) AND length(data) <= 1024)),
  at INTEGER NOT NULL,
  read_at INTEGER,
  dedupe_key TEXT UNIQUE CHECK (dedupe_key IS NULL OR length(dedupe_key) <= 120),
  CHECK (read_at IS NULL OR read_at >= at),
  CHECK ((request_id IS NOT NULL) + (tenancy_id IS NOT NULL) + (notice_id IS NOT NULL) = 1),
  CHECK ((kind LIKE 'tenancy_%') = (tenancy_id IS NOT NULL)),
  CHECK ((kind = 'building_notice') = (notice_id IS NOT NULL))
) STRICT;

INSERT INTO inbox_new (id, user_id, request_id, tenancy_id, kind, data, at, read_at, dedupe_key)
  SELECT id, user_id, request_id, tenancy_id, kind, data, at, read_at, dedupe_key FROM inbox;

DROP TABLE inbox;
ALTER TABLE inbox_new RENAME TO inbox;
CREATE INDEX inbox_user ON inbox (user_id, at);

CREATE TABLE notification_deliveries_new (
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL REFERENCES notifications (id),
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
  recipient_user_id TEXT REFERENCES users (id),
  recipient_partner_id TEXT REFERENCES partners (id),
  recipient_contact_id TEXT CHECK (recipient_contact_id IS NULL OR length(recipient_contact_id) <= 64),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  next_attempt_at INTEGER,
  sent_at INTEGER,
  provider_ref TEXT CHECK (provider_ref IS NULL OR length(provider_ref) <= 120),
  last_error TEXT CHECK (last_error IS NULL OR (last_error GLOB '[a-z]*' AND last_error NOT GLOB '*[^a-z_]*' AND length(last_error) <= 40)),
  created_at INTEGER NOT NULL,
  CHECK ((recipient_user_id IS NOT NULL) + (recipient_partner_id IS NOT NULL) + (recipient_contact_id IS NOT NULL) = 1),
  CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
  CHECK ((status = 'pending') = (next_attempt_at IS NOT NULL))
) STRICT;

INSERT INTO notification_deliveries_new (id, notification_id, channel, recipient_user_id, recipient_partner_id,
    status, attempts, next_attempt_at, sent_at, provider_ref, last_error, created_at)
  SELECT id, notification_id, channel, recipient_user_id, recipient_partner_id, status, attempts, next_attempt_at,
    sent_at, provider_ref, last_error, created_at FROM notification_deliveries;

DROP TABLE notification_deliveries;
ALTER TABLE notification_deliveries_new RENAME TO notification_deliveries;

-- One delivery per notification, channel and recipient (SQLite treats NULLs as distinct, hence COALESCE).
CREATE UNIQUE INDEX notification_deliveries_one ON notification_deliveries
  (notification_id, channel, COALESCE(recipient_user_id, ''), COALESCE(recipient_partner_id, ''),
   COALESCE(recipient_contact_id, ''));
CREATE INDEX notification_deliveries_due ON notification_deliveries (next_attempt_at) WHERE status = 'pending';
CREATE INDEX notification_deliveries_of ON notification_deliveries (notification_id);
