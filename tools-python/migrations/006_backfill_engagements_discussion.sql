-- 006_backfill_engagements_discussion.sql
-- Backfill existing EngagementLog rows to set engagementtype_refid to the
-- "Discussion" engagement type. Idempotent and safe to re-run.

BEGIN;

-- Ensure the Discussion ref exists and capture its refid (new schema)
WITH ensured AS (
    INSERT INTO ReferenceData (refdataclass, refvalue)
    SELECT 'engagement_type', 'Discussion'
    WHERE NOT EXISTS (
        SELECT 1 FROM ReferenceData
        WHERE refdataclass = 'engagement_type' AND refvalue = 'Discussion'
    )
    RETURNING refid
)
, target AS (
    SELECT refid FROM ensured
    UNION ALL
    SELECT refid FROM ReferenceData
    WHERE refdataclass = 'engagement_type' AND refvalue = 'Discussion'
    LIMIT 1
)
UPDATE EngagementLog e
SET engagementtype_refid = (SELECT refid FROM target LIMIT 1)
WHERE e.engagementtype_refid IS NULL;

COMMIT;
