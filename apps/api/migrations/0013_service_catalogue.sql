-- 0013 The 12-service catalogue (BUILD_SPEC S1-S3; ADR 0012), mirroring packages/shared/src/services.ts
-- (drift-tested). delivery: 'partner' = by a signed service partner (needs an active partner, else "coming
-- soon", S2); 'inhouse' = by the JAD+ team. Maintenance was created in 0006 and gets its group and text here.

ALTER TABLE services ADD COLUMN grp TEXT NOT NULL DEFAULT 'Property care'
  CHECK (grp IN ('Property care', 'Investment services', 'Lifestyle'));
ALTER TABLE services ADD COLUMN delivery TEXT NOT NULL DEFAULT 'partner' CHECK (delivery IN ('partner', 'inhouse'));
ALTER TABLE services ADD COLUMN blurb TEXT NOT NULL DEFAULT '' CHECK (length(blurb) <= 200);

UPDATE services SET name = 'Maintenance', grp = 'Property care', delivery = 'partner', blurb = 'Repairs, AC, plumbing and electrical.', sort_order = 10
  WHERE code = 'maintenance';
INSERT INTO services (code, name, grp, delivery, blurb, sort_order) VALUES
  ('snagging', 'Snagging & Inspection', 'Property care', 'partner', 'Independent pre-handover snagging with a full report.', 20);
INSERT INTO services (code, name, grp, delivery, blurb, sort_order) VALUES
  ('handover', 'Handover Management', 'Property care', 'inhouse', 'A dedicated team guiding you from completion to key collection.', 30);
INSERT INTO services (code, name, grp, delivery, blurb, sort_order) VALUES
  ('property-management', 'Property Management', 'Property care', 'inhouse', 'Full management of your residence, from tenants to bills and upkeep.', 40);
INSERT INTO services (code, name, grp, delivery, blurb, sort_order) VALUES
  ('leasing', 'Leasing', 'Investment services', 'inhouse', 'Finding and managing tenants at the right rent.', 50);
INSERT INTO services (code, name, grp, delivery, blurb, sort_order) VALUES
  ('resale', 'Resale', 'Investment services', 'inhouse', 'Selling with a team that knows the value of each JAD project.', 60);
INSERT INTO services (code, name, grp, delivery, blurb, sort_order) VALUES
  ('valuation', 'Property Valuation', 'Investment services', 'inhouse', 'An up-to-date valuation built on real JAD project data.', 70);
INSERT INTO services (code, name, grp, delivery, blurb, sort_order) VALUES
  ('mortgage', 'Mortgage & Finance', 'Investment services', 'partner', 'Financing pre-approved for JAD projects.', 80);
INSERT INTO services (code, name, grp, delivery, blurb, sort_order) VALUES
  ('furnishing', 'Furnishing', 'Lifestyle', 'partner', 'Furniture packages by unit type, delivered and installed.', 90);
INSERT INTO services (code, name, grp, delivery, blurb, sort_order) VALUES
  ('interior-design', 'Interior Design', 'Lifestyle', 'partner', 'From concept to handover, by one accountable team.', 100);
INSERT INTO services (code, name, grp, delivery, blurb, sort_order) VALUES
  ('golden-visa', 'Golden Visa', 'Lifestyle', 'partner', 'Residency guidance and processing for qualifying investors.', 110);
INSERT INTO services (code, name, grp, delivery, blurb, sort_order) VALUES
  ('education', 'Investor Education', 'Lifestyle', 'inhouse', 'Sessions and resources for owners, free of charge.', 120);
