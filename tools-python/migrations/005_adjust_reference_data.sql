-- 005_adjust_reference_data.sql
-- Bring ReferenceData schema in line with project conventions:
--   - refid SERIAL PRIMARY KEY
--   - refdataclass TEXT NOT NULL
--   - refvalue TEXT NOT NULL
-- Ensure unique (refdataclass, refvalue)
-- Add EngagementLog.engagementtype_refid if missing
-- Seed minimal values idempotently

BEGIN;

-- Helper: does table exist?
-- If ReferenceData table doesn't exist, create with desired schema
DO $$
BEGIN
    IF to_regclass('public.referencedata') IS NULL THEN
        CREATE TABLE ReferenceData (
            refid SERIAL PRIMARY KEY,
            refdataclass TEXT NOT NULL,
            refvalue TEXT NOT NULL
        );
    END IF;
END$$;

-- If table exists but has legacy columns, migrate to new schema
DO $$
DECLARE
    has_category BOOLEAN;
    has_code BOOLEAN;
    has_label BOOLEAN;
    has_active BOOLEAN;
    has_sort_order BOOLEAN;
    has_refdataclass BOOLEAN;
    has_refvalue BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='referencedata' AND column_name='category'
    ) INTO has_category;
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='referencedata' AND column_name='code'
    ) INTO has_code;
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='referencedata' AND column_name='label'
    ) INTO has_label;
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='referencedata' AND column_name='active'
    ) INTO has_active;
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='referencedata' AND column_name='sort_order'
    ) INTO has_sort_order;
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='referencedata' AND column_name='refdataclass'
    ) INTO has_refdataclass;
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='referencedata' AND column_name='refvalue'
    ) INTO has_refvalue;

    -- Rename columns if legacy names present and new names missing
    IF has_category AND NOT has_refdataclass THEN
        ALTER TABLE ReferenceData RENAME COLUMN category TO refdataclass;
    END IF;
    IF has_code AND NOT has_refvalue THEN
        ALTER TABLE ReferenceData RENAME COLUMN code TO refvalue;
    END IF;

    -- Drop legacy columns we don't use anymore
    IF has_label THEN
        ALTER TABLE ReferenceData DROP COLUMN label;
    END IF;
    IF has_active THEN
        ALTER TABLE ReferenceData DROP COLUMN active;
    END IF;
    IF has_sort_order THEN
        ALTER TABLE ReferenceData DROP COLUMN sort_order;
    END IF;
END$$;

-- Ensure unique constraint on (refdataclass, refvalue)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_refdata_class_value'
    ) THEN
        ALTER TABLE ReferenceData
        ADD CONSTRAINT uq_refdata_class_value UNIQUE (refdataclass, refvalue);
    END IF;
END$$;

-- Ensure EngagementLog.engagementtype_refid exists and references ReferenceData(refid)
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

-- Seed minimal data idempotently using new column names
INSERT INTO ReferenceData (refdataclass, refvalue)
SELECT 'engagement_type', 'Discussion'
WHERE NOT EXISTS (
    SELECT 1 FROM ReferenceData WHERE refdataclass='engagement_type' AND refvalue='Discussion'
);

INSERT INTO ReferenceData (refdataclass, refvalue)
SELECT 'engagement_type', 'Interview'
WHERE NOT EXISTS (
    SELECT 1 FROM ReferenceData WHERE refdataclass='engagement_type' AND refvalue='Interview'
);

INSERT INTO ReferenceData (refdataclass, refvalue)
SELECT 'source_channel', 'LinkedIn'
WHERE NOT EXISTS (
    SELECT 1 FROM ReferenceData WHERE refdataclass='source_channel' AND refvalue='LinkedIn'
);

INSERT INTO ReferenceData (refdataclass, refvalue)
SELECT 'source_channel', 'Referral'
WHERE NOT EXISTS (
    SELECT 1 FROM ReferenceData WHERE refdataclass='source_channel' AND refvalue='Referral'
);

INSERT INTO ReferenceData (refdataclass, refvalue)
SELECT 'source_channel', 'Direct'
WHERE NOT EXISTS (
    SELECT 1 FROM ReferenceData WHERE refdataclass='source_channel' AND refvalue='Direct'
);

INSERT INTO ReferenceData (refdataclass, refvalue)
SELECT 'source_channel', 'Agency'
WHERE NOT EXISTS (
    SELECT 1 FROM ReferenceData WHERE refdataclass='source_channel' AND refvalue='Agency'
);

COMMIT;
