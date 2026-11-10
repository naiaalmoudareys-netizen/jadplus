-- 0009 Delivering the notifications outbox (E1, E4-E7, E12; ADR 0007).
-- Each notification is "fanned out" once into deliveries: one per channel and person (or partner alert line).
-- Deliveries hold no address and no message text: the address is decrypted and the text rendered at send time,
-- so nothing personal is copied. Failures record a short code only, never a provider's raw error.

CREATE TABLE notification_deliveries (
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL REFERENCES notifications (id),
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
  recipient_user_id TEXT REFERENCES users (id),
  recipient_partner_id TEXT REFERENCES partners (id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  next_attempt_at INTEGER,
  sent_at INTEGER,
  provider_ref TEXT CHECK (provider_ref IS NULL OR length(provider_ref) <= 120),
  last_error TEXT CHECK (last_error IS NULL OR (last_error GLOB '[a-z]*' AND last_error NOT GLOB '*[^a-z_]*' AND length(last_error) <= 40)),
  created_at INTEGER NOT NULL,
  CHECK ((recipient_user_id IS NULL) <> (recipient_partner_id IS NULL)),
  CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
  CHECK ((status = 'pending') = (next_attempt_at IS NOT NULL))
) STRICT;

-- One delivery per notification, channel and recipient (SQLite treats NULLs as distinct, hence COALESCE).
CREATE UNIQUE INDEX notification_deliveries_one ON notification_deliveries
  (notification_id, channel, COALESCE(recipient_user_id, ''), COALESCE(recipient_partner_id, ''));
CREATE INDEX notification_deliveries_due ON notification_deliveries (next_attempt_at) WHERE status = 'pending';
CREATE INDEX notification_deliveries_of ON notification_deliveries (notification_id);

-- When the notification was split into deliveries, and why it could not be delivered at all (short code).
ALTER TABLE notifications ADD COLUMN fanned_out_at INTEGER;
ALTER TABLE notifications ADD COLUMN failure TEXT
  CHECK (failure IS NULL OR (failure GLOB '[a-z]*' AND failure NOT GLOB '*[^a-z_]*' AND length(failure) <= 40));

CREATE INDEX notifications_to_fan_out ON notifications (urgent DESC, created_at) WHERE fanned_out_at IS NULL;
