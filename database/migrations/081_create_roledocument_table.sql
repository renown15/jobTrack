-- Migration: 081_create_roledocument_table.sql
-- Purpose: Add roledocument join table linking jobrole to document for an applicant

BEGIN;

-- Create sequence for PK
CREATE SEQUENCE IF NOT EXISTS roledocument_roledocumentid_seq;

-- Create table
CREATE TABLE IF NOT EXISTS roledocument (
    roledocumentid integer PRIMARY KEY DEFAULT nextval('roledocument_roledocumentid_seq'),
    applicantid integer NOT NULL,
    jobroleid integer NOT NULL,
    documentid integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Foreign keys: reference jobrole and document (cascade on delete)
ALTER TABLE roledocument ADD CONSTRAINT roledocument_jobrole_fkey FOREIGN KEY (jobroleid) REFERENCES jobrole(jobid) ON DELETE CASCADE;
ALTER TABLE roledocument ADD CONSTRAINT roledocument_document_fkey FOREIGN KEY (documentid) REFERENCES document(documentid) ON DELETE CASCADE;

-- Unique constraint to avoid duplicates per applicant/jobrole/document
CREATE UNIQUE INDEX IF NOT EXISTS roledocument_unique_app_jobrole_document ON roledocument (applicantid, jobroleid, documentid);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS roledocument_jobrole_idx ON roledocument (jobroleid);
CREATE INDEX IF NOT EXISTS roledocument_document_idx ON roledocument (documentid);
CREATE INDEX IF NOT EXISTS roledocument_applicant_idx ON roledocument (applicantid);

COMMIT;
-- Migration 081: create roledocument table linking jobrole -> document
BEGIN;

-- Create the roledocument join table to link job roles with documents
CREATE TABLE IF NOT EXISTS roledocument (
    roledocumentid SERIAL PRIMARY KEY,
    applicantid integer NOT NULL,
    jobroleid integer NOT NULL,
    documentid integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT roledocument_jobrole_fkey FOREIGN KEY (jobroleid) REFERENCES jobrole(jobid) ON DELETE CASCADE,
    CONSTRAINT roledocument_document_fkey FOREIGN KEY (documentid) REFERENCES document(documentid) ON DELETE CASCADE
);

-- Ensure records are scoped per applicant and unique per jobrole/document pair
CREATE UNIQUE INDEX IF NOT EXISTS roledocument_unique_app_jobrole_document ON roledocument (applicantid, jobroleid, documentid);

-- Indexes to support lookups
CREATE INDEX IF NOT EXISTS roledocument_jobrole_idx ON roledocument (jobroleid);
CREATE INDEX IF NOT EXISTS roledocument_document_idx ON roledocument (documentid);
CREATE INDEX IF NOT EXISTS roledocument_applicant_idx ON roledocument (applicantid);

COMMIT;
