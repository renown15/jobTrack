-- Migration: Drop existing sector text column, create Sector reference table, and add sectorid FK and membership flag to Organisation

BEGIN;

-- If Organisation has a text 'sector' column we will drop it safely
ALTER TABLE Organisation DROP COLUMN IF EXISTS sector;

CREATE TABLE IF NOT EXISTS Sector (
    sectorid SERIAL PRIMARY KEY,
    -- high-level sector label (e.g., Recruitment, Technology, Finance)
    summary TEXT NOT NULL UNIQUE,
    -- optional longer description / detailed sector
    description TEXT,
    -- notes or provenance from import
    notes TEXT
);

-- Add sectorid foreign key and membership boolean to Organisation
-- If Organisation already has rows, allow NULLs so the migration is safe
ALTER TABLE Organisation
    ADD COLUMN IF NOT EXISTS sectorid INTEGER REFERENCES Sector(sectorid) ON DELETE SET NULL;

ALTER TABLE Organisation
    ADD COLUMN IF NOT EXISTS membership_of_talent_community BOOLEAN DEFAULT false;

COMMIT;
