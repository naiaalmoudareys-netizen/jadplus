-- 0006 Notifications outbox and the maintenance service.
-- The emergency engine records every alert it must send (E1 partner + owner, E5 reminder, E6 backup +
-- on-call, E7 on-call + building FM, E4 resident told who is coming). Delivery (push, email, WhatsApp) is
-- Phase E: a sender reads this table, renders the template and marks the row sent. Rows hold no message
-- text and no contact details: the template and the request id are enough to render it at send time.

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  -- user: a person (owner, tenant); partner: the partner's alert line; on_call: this week's on-call rota;
  -- building_fm: the building's facilities manager (section 11).
  recipient_kind TEXT NOT NULL CHECK (recipient_kind IN ('user', 'partner', 'on_call', 'building_fm')),
  recipient_user_id TEXT REFERENCES users (id),
  recipient_partner_id TEXT REFERENCES partners (id),
  template TEXT NOT NULL CHECK (
    template IN (
      'emergency_new_job', 'emergency_owner_notice', 'emergency_reminder', 'emergency_backup_alert',
      'emergency_on_call', 'emergency_life_safety', 'emergency_acknowledged', 'emergency_owner_update'
    )
  ),
  -- Loud alert (E1): delivered as a high-priority push/call, not a quiet message.
  urgent INTEGER NOT NULL CHECK (urgent IN (0, 1)),
  request_id TEXT NOT NULL REFERENCES requests (id),
  sent_at INTEGER,
  failed_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  CHECK ((recipient_kind = 'user') = (recipient_user_id IS NOT NULL)),
  CHECK ((recipient_kind = 'partner') = (recipient_partner_id IS NOT NULL))
) STRICT;

CREATE INDEX notifications_pending ON notifications (urgent DESC, created_at) WHERE sent_at IS NULL;
CREATE INDEX notifications_request ON notifications (request_id);

-- The emergency engine dispatches to this service's primary/backup partner (S3). Reference data, not
-- personal data. The rest of the 12-service catalogue (S1) is loaded when it is ported from the prototype.
INSERT INTO services (code, name, sort_order) VALUES ('maintenance', 'Maintenance', 10);
