-- Migration: create usersalt table to store per-applicant salts
-- Add to main jobtrack database
 BEGIN;

-- Create the usersalt table

CREATE TABLE IF NOT EXISTS public.usersalt (applicantid bigint PRIMARY KEY,
                                                               salt text NOT NULL,
                                                                         created_at timestamptz DEFAULT now());


COMMIT;