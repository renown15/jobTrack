-- Migration 080: Add Performance Indexes
-- Created: 2025-12-17
-- Purpose: Improve query performance for frequently accessed tables
-- Reference: CODE_REVIEW_STRATEGIC_IMPROVEMENTS.md Section 2.3

-- Note: Using CONCURRENTLY to avoid table locks during index creation
-- This allows the application to continue running during migration

-- ============================================================================
-- CONTACT INDEXES
-- ============================================================================

-- Index for contact queries filtered by applicantid + name
-- Used by: GET /api/<applicantid>/contacts with name filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contact_applicantid_name 
    ON contact(applicantid, name) 
    WHERE applicantid IS NOT NULL;

-- Index for contact queries joining to current organisation
-- Used by: Contact detail views showing current employer
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contact_currentorgid 
    ON contact(currentorgid) 
    WHERE currentorgid IS NOT NULL;

-- Index for contact queries by role type
-- Used by: Analytics queries grouping contacts by role type
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contact_applicantid_roletypeid
    ON contact(applicantid, roletypeid)
    WHERE applicantid IS NOT NULL;

-- Index for LinkedIn connection status filtering
-- Used by: Contact list filtering by connection status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contact_applicantid_linkedin
    ON contact(applicantid, islinkedinconnected)
    WHERE applicantid IS NOT NULL AND islinkedinconnected = true;

-- ============================================================================
-- ENGAGEMENT LOG INDEXES
-- ============================================================================

-- Index for engagement log queries by contact and date range
-- Used by: Contact engagement history, timeline views
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_engagementlog_contactid_logdate 
    ON engagementlog(contactid, logdate DESC) 
    WHERE logdate IS NOT NULL;

-- Index for engagement queries by applicant
-- Used by: Analytics dashboard, applicant-scoped engagement queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_engagementlog_applicantid_logdate
    ON engagementlog(applicantid, logdate DESC)
    WHERE applicantid IS NOT NULL;

-- Index for engagement type filtering
-- Used by: Filtering engagements by type (Interview, Email, etc.)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_engagementlog_engagementtypeid
    ON engagementlog(engagementtypeid)
    WHERE engagementtypeid IS NOT NULL;

-- Composite index for analytics queries (contact + date + type)
-- Used by: Complex analytics queries with multiple filters
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_engagementlog_analytics
    ON engagementlog(applicantid, contactid, logdate, engagementtypeid)
    WHERE applicantid IS NOT NULL AND logdate IS NOT NULL;

-- ============================================================================
-- ORGANISATION INDEXES
-- ============================================================================

-- Index for organisation queries by applicant and sector
-- Used by: Organisation list filtering by sector
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organisation_applicantid_sectorid 
    ON organisation(applicantid, sectorid)
    WHERE applicantid IS NOT NULL;

-- Index for organisation name lookups (case-insensitive)
-- Used by: Organisation search, autocomplete
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organisation_name_lower
    ON organisation(LOWER(name))
    WHERE name IS NOT NULL;

-- Index for talent community filtering
-- Used by: Filtering organisations in talent community
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organisation_talentcommunity
    ON organisation(applicantid, talentcommunitydateadded)
    WHERE talentcommunitydateadded IS NOT NULL;

-- ============================================================================
-- JOB ROLE INDEXES
-- ============================================================================

-- Index for job role status queries
-- Used by: Application pipeline views filtered by status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobrole_applicantid_statusid 
    ON jobrole(applicantid, statusid)
    WHERE applicantid IS NOT NULL;

-- Index for job roles by contact
-- Used by: Contact detail view showing application history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobrole_contactid_applicationdate
    ON jobrole(contactid, applicationdate DESC NULLS LAST)
    WHERE contactid IS NOT NULL;

-- Index for job roles by company organisation
-- Used by: Organisation detail view showing applications to that company
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobrole_companyorgid
    ON jobrole(companyorgid, applicantid)
    WHERE companyorgid IS NOT NULL;

-- Index for application date range queries
-- Used by: Timeline views, date range filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobrole_applicantid_appdate
    ON jobrole(applicantid, applicationdate DESC NULLS LAST)
    WHERE applicantid IS NOT NULL;

-- ============================================================================
-- REFERENCE DATA INDEXES
-- ============================================================================

-- Index for reference data lookups by class (very frequent queries)
-- Used by: Dropdowns, form field population, validation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_referencedata_refdataclass_refvalue 
    ON referencedata(refdataclass, refvalue);

-- Index for reference data lookups by refid
-- Used by: JOIN queries resolving refid to label
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_referencedata_refid
    ON referencedata(refid);

-- ============================================================================
-- DOCUMENT INDEXES
-- ============================================================================

-- Index for document queries by applicant and type
-- Used by: Document list filtering by type (CV, Cover Letter, etc.)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_applicantid_documenttypeid 
    ON document(applicantid, documenttypeid)
    WHERE applicantid IS NOT NULL;

-- Index for document creation date sorting
-- Used by: Document list sorted by recent uploads
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_applicantid_created
    ON document(applicantid, created_at DESC)
    WHERE applicantid IS NOT NULL;

-- ============================================================================
-- CONTACT TARGET ORGANISATION INDEXES (Junction Table)
-- ============================================================================

-- Index for contact target lookups (contact -> organisations)
-- Used by: Contact detail view showing target companies
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cto_contactid_applicantid
    ON contacttargetorganisation(contactid, applicantid)
    WHERE applicantid IS NOT NULL;

-- Index for reverse lookups (organisation -> contacts targeting it)
-- Used by: Organisation detail view showing who is targeting it
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cto_targetid_applicantid
    ON contacttargetorganisation(targetid, applicantid)
    WHERE applicantid IS NOT NULL;

-- Composite index for analytics queries
-- Used by: Heat map calculations, network analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cto_analytics
    ON contacttargetorganisation(applicantid, contactid, targetid)
    WHERE applicantid IS NOT NULL;

-- ============================================================================
-- SECTOR INDEX
-- ============================================================================

-- Index for sector lookups by name
-- Used by: Sector filtering, autocomplete
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sector_summary
    ON sector(summary)
    WHERE summary IS NOT NULL;

-- ============================================================================
-- TASK INDEXES
-- ============================================================================

-- Index for task queries by applicant and due date
-- Used by: Task list, upcoming tasks, overdue tasks
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_applicantid_duedate
    ON task(applicantid, duedate NULLS LAST)
    WHERE applicantid IS NOT NULL;

-- ============================================================================
-- LEAD INDEXES
-- ============================================================================

-- Index for lead queries by applicant
-- Used by: Lead list, import review
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_applicantid_created
    ON lead(applicantid, created_at DESC)
    WHERE applicantid IS NOT NULL;

-- Index for lead review status
-- Used by: Filtering leads by review outcome
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_reviewoutcomeid
    ON lead(applicantid, reviewoutcomeid)
    WHERE applicantid IS NOT NULL AND reviewoutcomeid IS NOT NULL;

-- ============================================================================
-- ANALYTICS SUPPORT INDEXES
-- ============================================================================

-- Index for sector-based analytics
-- Used by: Analytics dashboard grouping by sector
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contact_sector_analytics
    ON contact(applicantid, currentorgid)
    WHERE applicantid IS NOT NULL AND currentorgid IS NOT NULL;

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================

-- All indexes created with CONCURRENTLY to avoid locking tables
-- Indexes include WHERE clauses to reduce index size (partial indexes)
-- Indexes are ordered to support both exact matches and range queries
-- Consider running VACUUM ANALYZE after index creation to update statistics

-- To verify index usage, run queries with EXPLAIN ANALYZE:
-- EXPLAIN ANALYZE SELECT * FROM contact WHERE applicantid = 1 ORDER BY name;

-- To check index sizes:
-- SELECT schemaname, tablename, indexname, pg_size_pretty(pg_relation_size(indexrelid))
-- FROM pg_stat_user_indexes
-- ORDER BY pg_relation_size(indexrelid) DESC;
