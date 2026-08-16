-- Migration 067: create per-applicant briefing key material table
-- Stores a per-applicant random salt used to derive encryption keys from user passwords
CREATE TABLE IF NOT EXISTS navigator_briefing_user_keys (
    applicantid integer PRIMARY KEY,
    salt bytea NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_navigator_briefing_user_keys_applicant ON navigator_briefing_user_keys(applicantid);
