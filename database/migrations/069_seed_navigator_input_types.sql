-- Migration 069: Seed NAVIGATOR_INPUT_TYPE reference data
-- Date: 2025-12-01
-- Inserts common navigator input types used by the Navigator Actions UI

INSERT INTO referencedata (refdataclass, refvalue)
VALUES
  ('NAVIGATOR_INPUT_TYPE', 'DOCUMENT_ID'),
  ('NAVIGATOR_INPUT_TYPE', 'TEXT'),
  ('NAVIGATOR_INPUT_TYPE', 'CSV_EXPORT_ID'),
  ('NAVIGATOR_INPUT_TYPE', 'APPLICANT_ID'),
  ('NAVIGATOR_INPUT_TYPE', 'URL')
ON CONFLICT (refdataclass, refvalue) DO NOTHING;

-- End migration 069
