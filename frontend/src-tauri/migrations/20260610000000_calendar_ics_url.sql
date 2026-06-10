-- Replace OAuth-based tables with simple ICS URL approach
DROP TABLE IF EXISTS google_calendar_credentials;
DROP TABLE IF EXISTS google_calendar_tokens;

-- Add ICS URL column to existing calendar_settings table
ALTER TABLE calendar_settings ADD COLUMN ics_url TEXT;
