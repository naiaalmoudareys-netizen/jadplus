-- 0024 The offer's title kept with each "I'm interested" (docs/DESIGN.md N2; ADR 0025).
-- Offers are Salesforce posts, so JAD+ keeps the title the owner saw at that moment for the console's Offers page
-- (marketing text, not personal data). Older rows stay NULL; the console then shows the post id.

ALTER TABLE offer_interests ADD COLUMN title TEXT CHECK (title IS NULL OR length(title) BETWEEN 1 AND 200);
