-- ============================================================================
-- Migration 004: Sector Consolidation
-- Consolidates 47 sectors down to 14 manageable categories
-- Created: 2025-11-02
-- ============================================================================

-- Start transaction
BEGIN;

-- ============================================================================
-- STEP 1: Create backup table
-- ============================================================================
DROP TABLE IF EXISTS sector_backup_20251102;
CREATE TABLE sector_backup_20251102 AS SELECT * FROM sector;

DROP TABLE IF EXISTS organisation_sector_backup_20251102;
CREATE TABLE organisation_sector_backup_20251102 AS 
    SELECT orgid, sectorid FROM organisation WHERE sectorid IS NOT NULL;

SELECT 'Backup created' AS status;

-- ============================================================================
-- STEP 2: Create new consolidated sectors (if they don't exist)
-- ============================================================================

-- Ensure all new sectors exist
INSERT INTO sector (summary, description) 
VALUES ('Recruitment & Executive Search', 'Consolidated sector - recruitment and executive search services')
ON CONFLICT (summary) DO NOTHING;

INSERT INTO sector (summary, description) 
VALUES ('Banking & Financial Services', 'Consolidated sector - banking and financial services')
ON CONFLICT (summary) DO NOTHING;

INSERT INTO sector (summary, description) 
VALUES ('Investment & Asset Management', 'Consolidated sector - investment and asset management')
ON CONFLICT (summary) DO NOTHING;

INSERT INTO sector (summary, description) 
VALUES ('Private Equity', 'Private equity and investment firms')
ON CONFLICT (summary) DO NOTHING;

INSERT INTO sector (summary, description) 
VALUES ('Insurance', 'Consolidated sector - insurance and risk management')
ON CONFLICT (summary) DO NOTHING;

INSERT INTO sector (summary, description) 
VALUES ('Consulting & Professional Services', 'Consolidated sector - consulting and professional services')
ON CONFLICT (summary) DO NOTHING;

INSERT INTO sector (summary, description) 
VALUES ('Technology & Software', 'Consolidated sector - technology, software, and fintech')
ON CONFLICT (summary) DO NOTHING;

INSERT INTO sector (summary, description) 
VALUES ('Financial Infrastructure', 'Financial infrastructure and payment systems')
ON CONFLICT (summary) DO NOTHING;

INSERT INTO sector (summary, description) 
VALUES ('Information & Media Services', 'Consolidated sector - information and media services')
ON CONFLICT (summary) DO NOTHING;

INSERT INTO sector (summary, description) 
VALUES ('Healthcare & Pharmaceuticals', 'Healthcare and pharmaceutical industry')
ON CONFLICT (summary) DO NOTHING;

INSERT INTO sector (summary, description) 
VALUES ('Government', 'Government and public sector')
ON CONFLICT (summary) DO NOTHING;

INSERT INTO sector (summary, description) 
VALUES ('Legal Services', 'Legal services and law firms')
ON CONFLICT (summary) DO NOTHING;

INSERT INTO sector (summary, description) 
VALUES ('Consumer Goods & Retail', 'Consolidated sector - consumer goods, retail, and entertainment')
ON CONFLICT (summary) DO NOTHING;

INSERT INTO sector (summary, description) 
VALUES ('Other', 'Other/uncategorized sectors')
ON CONFLICT (summary) DO NOTHING;

SELECT 'New sectors created/verified' AS status;

-- ============================================================================
-- STEP 3: Update organisations to use new consolidated sectors
-- ============================================================================

-- 1. Recruitment & Executive Search
UPDATE organisation SET sectorid = (SELECT sectorid FROM sector WHERE summary = 'Recruitment & Executive Search')
WHERE sectorid IN (
    SELECT sectorid FROM sector WHERE summary IN (
        'Executive Search',
        'Recruitment',
        'Recruitment & Tech Services',
        'Tech Education & Recruitment',
        'Tech Training & Placement'
    )
);

-- 2. Banking & Financial Services
UPDATE organisation SET sectorid = (SELECT sectorid FROM sector WHERE summary = 'Banking & Financial Services')
WHERE sectorid IN (
    SELECT sectorid FROM sector WHERE summary IN (
        'Banking & Finance',
        'Investment Banking',
        'Banking & Investment',
        'Banking',
        'Banking & Fintech'
    )
);

-- 3. Investment & Asset Management
UPDATE organisation SET sectorid = (SELECT sectorid FROM sector WHERE summary = 'Investment & Asset Management')
WHERE sectorid IN (
    SELECT sectorid FROM sector WHERE summary IN (
        'Investment Management',
        'Investment Services',
        'Insurance & Asset Mgmt',
        'Startup & Investment Network'
    )
);

-- 4. Private Equity (keep as-is or create)
UPDATE organisation SET sectorid = (SELECT sectorid FROM sector WHERE summary = 'Private Equity')
WHERE sectorid IN (
    SELECT sectorid FROM sector WHERE summary IN (
        'Private Equity'
    )
);

-- 5. Insurance
UPDATE organisation SET sectorid = (SELECT sectorid FROM sector WHERE summary = 'Insurance')
WHERE sectorid IN (
    SELECT sectorid FROM sector WHERE summary IN (
        'Insurance',
        'Insurance & Investment',
        'Healthcare & Insurance',
        'Insurance & Reinsurance',
        'Insurance & Risk',
        'Insurance & Tech'
    )
);

-- 6. Consulting & Professional Services
UPDATE organisation SET sectorid = (SELECT sectorid FROM sector WHERE summary = 'Consulting & Professional Services')
WHERE sectorid IN (
    SELECT sectorid FROM sector WHERE summary IN (
        'Consulting',
        'Consulting & Tech',
        'Consulting & Professional Services',
        'Consulting & Advisory',
        'Consulting & Fintech',
        'Consulting & Risk',
        'Consulting & Talent',
        'Consulting & Technology'
    )
);

-- 7. Technology & Software
UPDATE organisation SET sectorid = (SELECT sectorid FROM sector WHERE summary = 'Technology & Software')
WHERE sectorid IN (
    SELECT sectorid FROM sector WHERE summary IN (
        'Technology',
        'Fintech',
        'Technology & AI',
        'Technology & Data',
        'Technology & Infrastructure',
        'SaaS & Analytics',
        'IT Services & Infrastructure',
        'Payments & Technology'
    )
);

-- 8. Financial Infrastructure (keep as-is)
UPDATE organisation SET sectorid = (SELECT sectorid FROM sector WHERE summary = 'Financial Infrastructure')
WHERE sectorid IN (
    SELECT sectorid FROM sector WHERE summary IN (
        'Financial Infrastructure'
    )
);

-- 9. Information & Media Services
UPDATE organisation SET sectorid = (SELECT sectorid FROM sector WHERE summary = 'Information & Media Services')
WHERE sectorid IN (
    SELECT sectorid FROM sector WHERE summary IN (
        'Information Services',
        'Media & Publishing'
    )
);

-- 10. Healthcare & Pharmaceuticals
UPDATE organisation SET sectorid = (SELECT sectorid FROM sector WHERE summary = 'Healthcare & Pharmaceuticals')
WHERE sectorid IN (
    SELECT sectorid FROM sector WHERE summary IN (
        'Pharmaceuticals & Healthcare'
    )
);

-- 11. Government (keep as-is)
UPDATE organisation SET sectorid = (SELECT sectorid FROM sector WHERE summary = 'Government')
WHERE sectorid IN (
    SELECT sectorid FROM sector WHERE summary IN (
        'Government'
    )
);

-- 12. Legal Services (keep as-is)
UPDATE organisation SET sectorid = (SELECT sectorid FROM sector WHERE summary = 'Legal Services')
WHERE sectorid IN (
    SELECT sectorid FROM sector WHERE summary IN (
        'Legal Services'
    )
);

-- 13. Consumer Goods & Retail
UPDATE organisation SET sectorid = (SELECT sectorid FROM sector WHERE summary = 'Consumer Goods & Retail')
WHERE sectorid IN (
    SELECT sectorid FROM sector WHERE summary IN (
        'Beverages',
        'Technology & Retail',
        'Toys & Entertainment'
    )
);

-- 14. Other
UPDATE organisation SET sectorid = (SELECT sectorid FROM sector WHERE summary = 'Other')
WHERE sectorid IN (
    SELECT sectorid FROM sector WHERE summary IN (
        'Unknown'
    )
);

SELECT 'Organisations updated to new sectors' AS status;

-- ============================================================================
-- STEP 4: Delete old unused sectors
-- ============================================================================

-- Delete sectors that are no longer used and aren't the new consolidated ones
DELETE FROM sector 
WHERE sectorid NOT IN (
    -- Keep sectors that are currently assigned to organisations
    SELECT DISTINCT sectorid FROM organisation WHERE sectorid IS NOT NULL
)
AND summary NOT IN (
    -- Also keep the new consolidated sector names even if not yet used
    'Recruitment & Executive Search',
    'Banking & Financial Services',
    'Investment & Asset Management',
    'Private Equity',
    'Insurance',
    'Consulting & Professional Services',
    'Technology & Software',
    'Financial Infrastructure',
    'Information & Media Services',
    'Healthcare & Pharmaceuticals',
    'Government',
    'Legal Services',
    'Consumer Goods & Retail',
    'Other'
);

SELECT 'Old unused sectors deleted' AS status;

-- ============================================================================
-- STEP 5: Verification
-- ============================================================================

-- Show final sector distribution
SELECT 
    s.sectorid,
    s.summary,
    COUNT(o.orgid) as org_count
FROM sector s
LEFT JOIN organisation o ON s.sectorid = o.sectorid
GROUP BY s.sectorid, s.summary
ORDER BY org_count DESC, s.summary;

-- Show summary stats
SELECT 
    'Total Sectors' AS metric,
    COUNT(*) AS value
FROM sector
UNION ALL
SELECT 
    'Orgs Without Sector',
    COUNT(*)
FROM organisation
WHERE sectorid IS NULL
UNION ALL
SELECT 
    'Total Organisations',
    COUNT(*)
FROM organisation;

-- ============================================================================
-- COMMIT or ROLLBACK
-- ============================================================================

-- Review the output above. If everything looks good:
-- COMMIT;

-- If something is wrong:
-- ROLLBACK;

-- For now, let's hold the transaction open for review
SELECT 'Transaction ready - Review results above, then COMMIT or ROLLBACK' AS status;
