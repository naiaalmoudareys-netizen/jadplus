-- 0007 Owner units: which Salesforce units each owner may act on (C-AUTH-3, C-AZ-2, U3, T2).
-- Salesforce decides (buyer or joint buyer on a Sold or Booked deal). JAD+ keeps this copy, refreshed at every
-- sign-in and whenever it is more than a day old, so owners can still raise emergencies if Salesforce is down
-- (T2). The whole list of a person is replaced on each refresh; a unit that was sold disappears (U3).
-- Unit names and project names are not personal data; no buyer details are stored here.

CREATE TABLE owner_units (
  user_id TEXT NOT NULL REFERENCES users (id),
  sf_unit_id TEXT NOT NULL CHECK (length(sf_unit_id) IN (15, 18) AND sf_unit_id NOT GLOB '*[^A-Za-z0-9]*'),
  sf_deal_id TEXT NOT NULL CHECK (length(sf_deal_id) IN (15, 18) AND sf_deal_id NOT GLOB '*[^A-Za-z0-9]*'),
  unit_name TEXT NOT NULL CHECK (length(unit_name) BETWEEN 1 AND 80),
  project TEXT CHECK (project IS NULL OR length(project) BETWEEN 1 AND 120),
  deal_role TEXT NOT NULL CHECK (deal_role IN ('Buyer', 'Joint buyer')),
  synced_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, sf_unit_id)
) STRICT;

CREATE INDEX owner_units_by_unit ON owner_units (sf_unit_id);

-- When the person's unit list was last confirmed by Salesforce, even if it is now empty.
ALTER TABLE users ADD COLUMN owner_synced_at INTEGER;
