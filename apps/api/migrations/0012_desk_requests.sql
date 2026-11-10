-- 0012 Requests to the JAD+ desk (ADR 0011). In production the request is a JAD+ Request record in
-- Salesforce (the desk works there, as with the prototype) and this table keeps JAD+'s own log of what the
-- owner asked and the Salesforce record it became. Until Salesforce is connected (local, preview) this table
-- is the record the demo shows. Types and statuses mirror packages/shared/src/desk.ts.

CREATE TABLE desk_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  type TEXT NOT NULL CHECK (
    type IN (
      'Reservation Form', 'SPA', 'Stamped Statement of Account', 'NOC', 'Oqood or Title Deed copy',
      'Update my contact details', 'Close my JAD+ account', 'Other'
    )
  ),
  -- The Salesforce deal (Opportunity) the request is about, if any.
  deal_id TEXT CHECK (deal_id IS NULL OR (length(deal_id) BETWEEN 15 AND 18 AND deal_id NOT GLOB '*[^A-Za-z0-9]*')),
  -- What the owner wrote (e.g. the new mobile number): personal data, encrypted (C-PD-2).
  details_enc BLOB,
  status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'In progress', 'Completed', 'Cancelled')),
  -- The Salesforce JAD+ Request id and number once created there (production).
  sf_request_id TEXT CHECK (sf_request_id IS NULL OR length(sf_request_id) BETWEEN 15 AND 18),
  sf_request_ref TEXT CHECK (sf_request_ref IS NULL OR length(sf_request_ref) <= 40),
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX desk_requests_by_user ON desk_requests (user_id, created_at);
