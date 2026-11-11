-- 0028 Consultations (Flow C, ADR 0031; O5, O6, P5, S4).
--
-- Property management, leasing, resale, mortgage and Golden Visa run as a conversation in stages. The request
-- itself stays in `requests` (status, provider, clock); these two tables hold what is special to a consultation.
-- Both are append-only: what the owner agreed to and what the provider reported are evidence.
--
-- 1. consultations: one row per consultation request, written when the owner sends it: the answers to the
--    service's questions and the consent to share the owner's name, unit and contact details with the provider
--    named on the screen (consent_partner_id), with the wording version and the time. Without it nothing is sent.
--    Service codes mirror CONSULTATION_SERVICE_CODES in packages/shared/src/consultation.ts (drift-tested).
--
-- 2. consultation_steps: what the provider office recorded, in order: contact made, each stage reached, and the
--    end (done, or did not proceed with the reason the owner sees). Each step once per request. Step ids mirror
--    CONSULTATION_STEP_IDS in packages/shared/src/consultation.ts (drift-tested).

CREATE TABLE consultations (
  request_id TEXT PRIMARY KEY REFERENCES requests (id),
  service_code TEXT NOT NULL CHECK (
    service_code IN ('property-management', 'leasing', 'resale', 'mortgage', 'golden-visa')
  ),
  -- Question id -> option id or date; never personal data.
  answers TEXT NOT NULL CHECK (json_valid(answers) AND length(answers) <= 512),
  consent_partner_id TEXT NOT NULL REFERENCES partners (id),
  consent_version TEXT NOT NULL CHECK (length(consent_version) BETWEEN 1 AND 32),
  consented_at INTEGER NOT NULL,
  consent_ip_hash BLOB
) STRICT;

CREATE TRIGGER consultations_no_update BEFORE UPDATE ON consultations
BEGIN
  SELECT RAISE(ABORT, 'consultations are append-only');
END;

CREATE TRIGGER consultations_no_delete BEFORE DELETE ON consultations
BEGIN
  SELECT RAISE(ABORT, 'consultations are append-only');
END;

CREATE TABLE consultation_steps (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES consultations (request_id),
  step TEXT NOT NULL CHECK (
    step IN (
      'contact_made',
      'pre_approval', 'bank_valuation', 'offer',
      'eligibility', 'documents', 'submitted', 'approved',
      'valuation_plan', 'listed', 'sold',
      'viewings', 'tenant_found', 'contract',
      'proposal', 'agreement_signed', 'active',
      'done', 'did_not_proceed'
    )
  ),
  -- Shown to the owner; contact details are masked before saving (ADR 0009).
  note TEXT CHECK (note IS NULL OR length(note) BETWEEN 1 AND 500),
  partner_id TEXT NOT NULL REFERENCES partners (id),
  actor_user_id TEXT NOT NULL REFERENCES users (id),
  at INTEGER NOT NULL,
  UNIQUE (request_id, step),
  CHECK (step <> 'did_not_proceed' OR note IS NOT NULL)
) STRICT;

CREATE INDEX consultation_steps_by_request ON consultation_steps (request_id, at);

CREATE TRIGGER consultation_steps_no_update BEFORE UPDATE ON consultation_steps
BEGIN
  SELECT RAISE(ABORT, 'consultation_steps are append-only');
END;

CREATE TRIGGER consultation_steps_no_delete BEFORE DELETE ON consultation_steps
BEGIN
  SELECT RAISE(ABORT, 'consultation_steps are append-only');
END;
