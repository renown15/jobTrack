-- Migration: create ContactTargetOrganisation linking table
-- Adds a table to link Contact (contactid) to target Organisations (orgid)
-- Run this against your jobtrack database to create the new table.

BEGIN;

-- Create table to map contacts to their target organisations
CREATE TABLE IF NOT EXISTS ContactTargetOrganisation (
    id SERIAL PRIMARY KEY,
    contactid INT NOT NULL,
    target_orgid INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT fk_cto_contact FOREIGN KEY(contactid) REFERENCES Contact(contactid) ON DELETE CASCADE,
    CONSTRAINT fk_cto_org FOREIGN KEY(target_orgid) REFERENCES Organisation(orgid) ON DELETE CASCADE,
    CONSTRAINT uq_cto UNIQUE(contactid, target_orgid)
);

COMMIT;
