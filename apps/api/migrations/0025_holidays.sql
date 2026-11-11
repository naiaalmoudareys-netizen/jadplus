-- 0025 UAE public holidays kept by JAD+ Admin (BUILD_SPEC E20, S4; ADR 0028). Islamic holiday dates are only
-- confirmed close to the day, so JAD+ Admin adds and removes them in the console. The SLA working-hour clocks and
-- the preferred visit days read this table (apps/api/src/calendar.ts loadCalendar). Only days after today (Dubai)
-- can change (shared holidayChangeProblem); every change is audited with the date and name (C-AUD-1).
-- A date and a holiday name are not personal data. added_by is NULL for the rows JAD+ shipped with (seeded here
-- from DEFAULT_HOLIDAYS in packages/shared/src/calendar.ts; drift-tested). Removing a holiday deletes its row;
-- the audit log keeps who removed it, when, and its date and name.

CREATE TABLE holidays (
  date TEXT PRIMARY KEY CHECK (
    date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(date) IS date
  ),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 80 AND name = trim(name)),
  added_by TEXT REFERENCES users (id),
  added_at INTEGER NOT NULL CHECK (added_at > 0)
) STRICT;

INSERT INTO holidays (date, name, added_by, added_at) VALUES
  ('2026-01-01', 'New Year''s Day', NULL, 1794355200000),
  ('2026-03-19', 'Eid al-Fitr (expected)', NULL, 1794355200000),
  ('2026-03-20', 'Eid al-Fitr (expected)', NULL, 1794355200000),
  ('2026-03-21', 'Eid al-Fitr (expected)', NULL, 1794355200000),
  ('2026-05-26', 'Arafat Day (expected)', NULL, 1794355200000),
  ('2026-05-27', 'Eid al-Adha (expected)', NULL, 1794355200000),
  ('2026-05-28', 'Eid al-Adha (expected)', NULL, 1794355200000),
  ('2026-05-29', 'Eid al-Adha (expected)', NULL, 1794355200000),
  ('2026-06-16', 'Hijri New Year (expected)', NULL, 1794355200000),
  ('2026-08-25', 'Prophet''s Birthday (expected)', NULL, 1794355200000),
  ('2026-12-01', 'Commemoration Day', NULL, 1794355200000),
  ('2026-12-02', 'National Day', NULL, 1794355200000),
  ('2026-12-03', 'National Day', NULL, 1794355200000),
  ('2027-01-01', 'New Year''s Day', NULL, 1794355200000),
  ('2027-03-09', 'Eid al-Fitr (expected)', NULL, 1794355200000),
  ('2027-03-10', 'Eid al-Fitr (expected)', NULL, 1794355200000),
  ('2027-03-11', 'Eid al-Fitr (expected)', NULL, 1794355200000),
  ('2027-05-15', 'Arafat Day (expected)', NULL, 1794355200000),
  ('2027-05-16', 'Eid al-Adha (expected)', NULL, 1794355200000),
  ('2027-05-17', 'Eid al-Adha (expected)', NULL, 1794355200000),
  ('2027-05-18', 'Eid al-Adha (expected)', NULL, 1794355200000),
  ('2027-06-06', 'Hijri New Year (expected)', NULL, 1794355200000),
  ('2027-08-14', 'Prophet''s Birthday (expected)', NULL, 1794355200000),
  ('2027-12-01', 'Commemoration Day', NULL, 1794355200000),
  ('2027-12-02', 'National Day', NULL, 1794355200000),
  ('2027-12-03', 'National Day', NULL, 1794355200000);
