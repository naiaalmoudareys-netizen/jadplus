-- 0015 Profile settings (ADR 0016): app language and notification switches, one row per person.
-- No row means the defaults (English, every switch on). Consents (terms, marketing) stay in the append-only
-- consents table (0001), so withdrawing marketing consent is a new row there, never an edit here.
-- Lists mirror packages/shared/src/preferences.ts (tested: no drift). Not personal data.

CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users (id),
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ar', 'fr', 'ru', 'zh')),
  notify_payments INTEGER NOT NULL DEFAULT 1 CHECK (notify_payments IN (0, 1)),
  notify_construction INTEGER NOT NULL DEFAULT 1 CHECK (notify_construction IN (0, 1)),
  notify_news INTEGER NOT NULL DEFAULT 1 CHECK (notify_news IN (0, 1)),
  notify_offers INTEGER NOT NULL DEFAULT 1 CHECK (notify_offers IN (0, 1)),
  updated_at INTEGER NOT NULL
) STRICT;
