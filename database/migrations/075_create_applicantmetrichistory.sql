-- Migration: 075_create_applicantmetrichistory.sql
-- Create table to persist historic snapshots of navigator metrics for an applicant
BEGIN;

-- Sequence for primary key

CREATE SEQUENCE public.applicantmetrichistory_id_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

-- Table to store serialized metric snapshots per applicant

CREATE TABLE public.applicantmetrichistory (id integer NOT NULL,
                                                       applicantid integer NOT NULL,
                                                                           metricdata jsonb NOT NULL,
                                                                                            created_at timestamp with time zone DEFAULT now(),
                                                                                                                                        updated_at timestamp with time zone DEFAULT now());

-- Set default for id column to use the sequence

ALTER TABLE public.applicantmetrichistory
ALTER COLUMN id
SET DEFAULT nextval('public.applicantmetrichistory_id_seq');

-- Register sequence ownership

ALTER SEQUENCE public.applicantmetrichistory_id_seq OWNED BY public.applicantmetrichistory.id;

-- Helpful index for lookups by applicant

CREATE INDEX applicantmetrichistory_applicantid_idx ON public.applicantmetrichistory (applicantid);


COMMIT;