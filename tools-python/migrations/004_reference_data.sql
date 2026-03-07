-- 004_reference_data.sql
-- Create a generic reference data table and add engagement type to EngagementLog

BEGIN;

-- 1) ReferenceData table to hold multiple enumerations (categories)
CREATE TABLE IF NOT EXISTS ReferenceData (
    refid SERIAL PRIMARY KEY,
    category TEXT NOT NULL,
    code TEXT NOT NULL,
    label TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Unique constraint per category/code
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_refdata_category_code'
    ) THEN
        ALTER TABLE ReferenceData
        ADD CONSTRAINT uq_refdata_category_code UNIQUE (category, code);
    END IF;
END$$;

-- 2) Add engagement type FK to EngagementLog if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'engagementlog' AND column_name = 'engagementtype_refid'
    ) THEN
        ALTER TABLE EngagementLog
        ADD COLUMN engagementtype_refid INTEGER NULL REFERENCES ReferenceData(refid);
    END IF;
END$$;

-- 3) Seed minimal reference data
-- Engagement Types
INSERT INTO ReferenceData (category, code, label, sort_order)
SELECT 'engagement_type', 'discussion', 'Discussion', 10
WHERE NOT EXISTS (
    SELECT 1 FROM ReferenceData WHERE category='engagement_type' AND code='discussion'
);

INSERT INTO ReferenceData (category, code, label, sort_order)
SELECT 'engagement_type', 'interview', 'Interview', 20
WHERE NOT EXISTS (
    SELECT 1 FROM ReferenceData WHERE category='engagement_type' AND code='interview'
);

-- Source Channels (optional initial values)
INSERT INTO ReferenceData (category, code, label, sort_order)
SELECT 'source_channel', 'linkedin', 'LinkedIn', 10
WHERE NOT EXISTS (
    SELECT 1 FROM ReferenceData WHERE category='source_channel' AND code='linkedin'
);

INSERT INTO ReferenceData (category, code, label, sort_order)
SELECT 'source_channel', 'referral', 'Referral', 20
WHERE NOT EXISTS (
    SELECT 1 FROM ReferenceData WHERE category='source_channel' AND code='referral'
);

INSERT INTO ReferenceData (category, code, label, sort_order)
SELECT 'source_channel', 'direct', 'Direct', 30
WHERE NOT EXISTS (
    SELECT 1 FROM ReferenceData WHERE category='source_channel' AND code='direct'
);

INSERT INTO ReferenceData (category, code, label, sort_order)
SELECT 'source_channel', 'agency', 'Agency', 40
WHERE NOT EXISTS (
    SELECT 1 FROM ReferenceData WHERE category='source_channel' AND code='agency'
);

COMMIT;
