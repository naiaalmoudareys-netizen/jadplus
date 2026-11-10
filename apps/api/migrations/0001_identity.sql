-- 0001 Identity: people, roles, sign-in codes, throttling, sessions, consents.
-- Controls: C-AUTH-1, C-AUTH-2, C-SES-1, C-PD-2, C-LEG-1 (docs/SECURITY.md). Requirements: R1-R5, L1, L2, E8, U7, U9, T3.
-- Conventions (docs/adr/0002-data-model.md): ids are random TEXT made by the API; instants are INTEGER
-- milliseconds since the Unix epoch (UTC); calendar dates are TEXT 'YYYY-MM-DD' (Dubai); money is INTEGER fils.
-- Personal data (email, phone, name) is stored only as AES-GCM ciphertext (*_enc) plus, where we must look it
-- up, a keyed HMAC-SHA-256 blind index (*_hash). Neither the key nor plaintext is ever in the database.
-- partners (referenced below) is created in 0003; SQLite resolves foreign keys when rows are written.

-- A person who can sign in. Owners are linked to their Salesforce contact (C-AUTH-3); tenants, technicians and
-- staff are created by invitation. One person can hold several roles (U7: owns one unit, rents another).
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  sf_contact_id TEXT UNIQUE,
  email_hash BLOB UNIQUE,
  email_enc BLOB,
  phone_hash BLOB UNIQUE,
  phone_enc BLOB,
  name_enc BLOB,
  -- frozen: owner deceased / incapacitated, no changes allowed (U9); closed: account closed.
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((email_hash IS NULL) = (email_enc IS NULL)),
  CHECK ((phone_hash IS NULL) = (phone_enc IS NULL)),
  CHECK (email_hash IS NOT NULL OR phone_hash IS NOT NULL),
  CHECK (updated_at >= created_at)
) STRICT;

-- Role grants. Partner roles are scoped to one partner; other roles have no partner.
-- Object scope (which units, which tenancy, which jobs) is checked separately on every request (C-AZ-2).
CREATE TABLE user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'tenant', 'partner', 'partner_admin', 'jad_admin', 'jad_viewer')),
  partner_id TEXT REFERENCES partners (id),
  granted_at INTEGER NOT NULL,
  granted_by TEXT REFERENCES users (id),
  revoked_at INTEGER,
  CHECK ((role IN ('partner', 'partner_admin')) = (partner_id IS NOT NULL)),
  CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
) STRICT;

-- At most one live grant of a role per person and partner.
CREATE UNIQUE INDEX user_roles_one_active ON user_roles (user_id, role, COALESCE(partner_id, ''))
  WHERE revoked_at IS NULL;

-- One-time sign-in codes (C-AUTH-1): 6 digits, stored only as a hash, single use, 10-minute expiry,
-- limited wrong guesses per code. identity_hash is the blind index of the email (or phone) it was sent to.
CREATE TABLE sign_in_codes (
  id TEXT PRIMARY KEY,
  identity_hash BLOB NOT NULL,
  code_hash BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 10),
  ip_hash BLOB NOT NULL,
  CHECK (expires_at > created_at AND expires_at - created_at <= 600000),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
) STRICT;

CREATE INDEX sign_in_codes_identity ON sign_in_codes (identity_hash, created_at);

-- Fixed-window counters for rate limits and lockout (C-AUTH-2). key is 'ip:<hash>' or 'id:<hash>' (hex).
CREATE TABLE sign_in_throttle (
  key TEXT PRIMARY KEY CHECK (key GLOB 'ip:*' OR key GLOB 'id:*'),
  window_started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts >= 0),
  locked_until INTEGER
) STRICT;

-- Sessions (C-SES-1): the client holds a random 256-bit token; only its SHA-256 hash is stored.
-- A session is bound to one role context (and partner for partner roles); switching view (R5) rotates it.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash BLOB NOT NULL UNIQUE CHECK (length(token_hash) = 32),
  user_id TEXT NOT NULL REFERENCES users (id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'tenant', 'partner', 'partner_admin', 'jad_admin', 'jad_viewer')),
  partner_id TEXT REFERENCES partners (id),
  client TEXT NOT NULL CHECK (client IN ('mobile', 'console')),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  idle_expires_at INTEGER NOT NULL,
  absolute_expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  revoked_reason TEXT CHECK (
    revoked_reason IN ('sign_out', 'sign_out_everywhere', 'rotated', 'new_login', 'role_revoked', 'account_frozen', 'admin')
  ),
  ip_hash BLOB NOT NULL,
  CHECK ((role IN ('partner', 'partner_admin')) = (partner_id IS NOT NULL)),
  CHECK (absolute_expires_at > created_at),
  CHECK (idle_expires_at <= absolute_expires_at),
  CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
) STRICT;

CREATE INDEX sessions_user ON sessions (user_id) WHERE revoked_at IS NULL;

-- Consent evidence (L1, L2, C-LEG-1): terms, make-safe cap (E8) and marketing, each with version and time.
-- Append-only: a withdrawal or a new cap is a new row; the latest row per (user, kind) is the current state.
CREATE TABLE consents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  kind TEXT NOT NULL CHECK (kind IN ('terms', 'make_safe_cap', 'marketing')),
  version TEXT NOT NULL CHECK (length(version) BETWEEN 1 AND 32),
  accepted INTEGER NOT NULL CHECK (accepted IN (0, 1)),
  make_safe_cap_fils INTEGER CHECK (make_safe_cap_fils > 0),
  at INTEGER NOT NULL,
  ip_hash BLOB NOT NULL,
  CHECK ((kind = 'make_safe_cap' AND accepted = 1) = (make_safe_cap_fils IS NOT NULL)),
  CHECK (kind <> 'terms' OR accepted = 1)
) STRICT;

CREATE INDEX consents_user_kind ON consents (user_id, kind, at);

CREATE TRIGGER consents_no_update BEFORE UPDATE ON consents
BEGIN
  SELECT RAISE(ABORT, 'consents are append-only');
END;

CREATE TRIGGER consents_no_delete BEFORE DELETE ON consents
BEGIN
  SELECT RAISE(ABORT, 'consents are append-only');
END;
