-- 0014 When the owner would like the visit (ADR 0013): a working day and a time window chosen with the
-- request. Both are set together or both left empty (emergencies and older requests have none).

ALTER TABLE requests ADD COLUMN preferred_date TEXT
  CHECK (preferred_date IS NULL OR date(preferred_date) = preferred_date);
ALTER TABLE requests ADD COLUMN preferred_slot TEXT
  CHECK (preferred_slot IS NULL OR preferred_slot IN ('morning', 'midday', 'afternoon'));
