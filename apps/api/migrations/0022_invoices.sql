-- 0022 Partner invoices (ADR 0026): JAD+ records the partner's invoice for a finished job and whether it is paid;
-- it never holds or moves the money (the owner pays the partner directly). Lists mirror
-- packages/shared/src/invoices/rules.ts. The payment instructions can hold account numbers and the cancel reason is
-- free text, so both are stored only as AES-GCM ciphertext (C-PD-2). Money is in fils, VAT 5 %.

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests (id),
  partner_id TEXT NOT NULL REFERENCES partners (id),
  -- The owner who approved the work and pays; kept even if the unit is later sold.
  owner_user_id TEXT NOT NULL REFERENCES users (id),
  seq INTEGER NOT NULL CHECK (seq >= 1),
  number TEXT NOT NULL CHECK (length(number) BETWEEN 8 AND 24),
  issue_date TEXT NOT NULL CHECK (date(issue_date) = issue_date),
  due_date TEXT NOT NULL CHECK (date(due_date) = due_date),
  -- What the owner approved when the invoice was issued (L4 quote, E8 make-safe work).
  quote_fils INTEGER NOT NULL CHECK (quote_fils >= 0),
  make_safe_fils INTEGER NOT NULL CHECK (make_safe_fils >= 0),
  subtotal_fils INTEGER NOT NULL CHECK (subtotal_fils > 0),
  vat_fils INTEGER NOT NULL CHECK (vat_fils >= 0),
  total_fils INTEGER NOT NULL,
  trn TEXT NOT NULL CHECK (length(trn) = 15 AND trn NOT GLOB '*[^0-9]*'),
  payment_instructions_enc BLOB NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'claimed_paid', 'paid', 'cancelled')),
  issued_by TEXT NOT NULL REFERENCES users (id),
  issued_at INTEGER NOT NULL,
  -- The owner's "I have paid" (cleared if the partner says the money did not arrive).
  claimed_paid_on TEXT CHECK (claimed_paid_on IS NULL OR date(claimed_paid_on) = claimed_paid_on),
  claimed_at INTEGER,
  paid_on TEXT CHECK (paid_on IS NULL OR date(paid_on) = paid_on),
  paid_method TEXT CHECK (paid_method IN ('bank_transfer', 'card', 'cash', 'other')),
  paid_recorded_by TEXT REFERENCES users (id),
  paid_recorded_at INTEGER,
  cancelled_by TEXT REFERENCES users (id),
  cancelled_at INTEGER,
  cancel_reason_enc BLOB,
  updated_at INTEGER NOT NULL,
  -- Optimistic concurrency, as on requests (apps/api/src/requests/concurrency.ts).
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (partner_id, seq),
  UNIQUE (partner_id, number),
  CHECK (due_date >= issue_date),
  CHECK (subtotal_fils <= quote_fils + make_safe_fils),
  CHECK (total_fils = subtotal_fils + vat_fils),
  CHECK ((claimed_paid_on IS NULL) = (claimed_at IS NULL)),
  CHECK (status <> 'claimed_paid' OR claimed_paid_on IS NOT NULL),
  CHECK ((status = 'paid') = (paid_on IS NOT NULL)),
  CHECK ((paid_on IS NULL) = (paid_method IS NULL)),
  CHECK ((paid_on IS NULL) = (paid_recorded_by IS NULL)),
  CHECK ((paid_on IS NULL) = (paid_recorded_at IS NULL)),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  CHECK ((cancelled_at IS NULL) = (cancelled_by IS NULL)),
  CHECK ((cancelled_at IS NULL) = (cancel_reason_enc IS NULL)),
  CHECK (updated_at >= issued_at)
) STRICT;

-- One invoice in force per request; a cancelled one can be replaced.
CREATE UNIQUE INDEX invoices_one_active ON invoices (request_id) WHERE status <> 'cancelled';
CREATE INDEX invoices_partner ON invoices (partner_id, status, due_date);
CREATE INDEX invoices_owner ON invoices (owner_user_id, issued_at);
CREATE INDEX invoices_unpaid ON invoices (due_date) WHERE status IN ('issued', 'claimed_paid');

-- The in-app inbox (0016-0018) gains the invoice items (ADR 0026). SQLite cannot change a CHECK, so the table is
-- rebuilt again; no other table refers to it. Kinds mirror packages/shared/src/inbox.ts.

CREATE TABLE inbox_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  request_id TEXT REFERENCES requests (id),
  tenancy_id TEXT REFERENCES tenancies (id),
  kind TEXT NOT NULL CHECK (
    kind IN (
      'visit_booked', 'visit_tomorrow', 'visit_soon', 'on_the_way', 'no_access', 'quote_received',
      'quote_reminder', 'quote_expired', 'make_safe_done', 'work_done', 'confirm_reminder', 'auto_closed',
      'approval_needed', 'approval_reminder', 'request_approved', 'request_declined',
      'tenancy_invited', 'tenancy_ending', 'tenancy_ended', 'message_received',
      'job_new', 'job_reminder', 'job_moved_away', 'job_assigned_to_you', 'quote_approved', 'quote_declined',
      'work_confirmed', 'work_reopened', 'job_rated', 'job_cancelled',
      'invoice_issued', 'invoice_overdue', 'invoice_paid', 'invoice_not_received', 'invoice_cancelled',
      'invoice_paid_claimed'
    )
  ),
  data TEXT CHECK (data IS NULL OR (json_valid(data) AND length(data) <= 1024)),
  at INTEGER NOT NULL,
  read_at INTEGER,
  dedupe_key TEXT UNIQUE CHECK (dedupe_key IS NULL OR length(dedupe_key) <= 120),
  CHECK (read_at IS NULL OR read_at >= at),
  CHECK ((request_id IS NULL) <> (tenancy_id IS NULL)),
  CHECK ((kind LIKE 'tenancy_%') = (tenancy_id IS NOT NULL))
) STRICT;

INSERT INTO inbox_new (id, user_id, request_id, tenancy_id, kind, data, at, read_at, dedupe_key)
  SELECT id, user_id, request_id, tenancy_id, kind, data, at, read_at, dedupe_key FROM inbox;

DROP TABLE inbox;
ALTER TABLE inbox_new RENAME TO inbox;
CREATE INDEX inbox_user ON inbox (user_id, at);
