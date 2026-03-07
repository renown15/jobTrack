-- Migration: 073_create_organisation_star_schema_views.sql
-- Create fully-described dimension views for a star-schema centered on organisation

BEGIN;

-- Dimension: sector
CREATE OR REPLACE VIEW public.dim_sector AS
SELECT
  s.sectorid,
  s.summary    AS sector_summary,
  s.description AS sector_description
FROM public.sector s;

COMMENT ON VIEW public.dim_sector IS 'Dimension: sector (sectors lookup)';

-- Dimension: referenced data (generic reference lookup)
CREATE OR REPLACE VIEW public.dim_referencedata AS
SELECT
  r.refid,
  r.refdataclass,
  r.refvalue
FROM public.referencedata r;

COMMENT ON VIEW public.dim_referencedata IS 'Dimension: referenced data (generic lookup)';

-- Dimension: lead (contact source / recruiting lead info)
CREATE OR REPLACE VIEW public.dim_lead AS
SELECT
  l.leadid,
  l.name         AS lead_name,
  l.company      AS lead_company,
  l."position"  AS lead_position,
  l.linkedinurl  AS lead_linkedinurl,
  l.email        AS lead_email,
  l.connectedon  AS lead_connectedon,
  l.reviewdate   AS lead_reviewdate,
  l.reviewoutcomeid,
  r.refvalue     AS reviewoutcome_value,
  l.created_at,
  l.updated_at,
  l.applicantid
FROM public.lead l
LEFT JOIN public.referencedata r ON r.refid = l.reviewoutcomeid;

COMMENT ON VIEW public.dim_lead IS 'Dimension: lead records with resolved review outcome';

-- Dimension: applicant (owner / user)
CREATE OR REPLACE VIEW public.dim_applicant AS
SELECT
  a.applicantid,
  a.firstname   AS applicant_firstname,
  a.lastname    AS applicant_lastname,
  a.email       AS applicant_email,
  a.isactive,
  a.issuperuser,
  a.lastlogin,
  a.searchstartdate
FROM public.applicantprofile a;

COMMENT ON VIEW public.dim_applicant IS 'Dimension: applicantprofile (user accounts)';

-- Dimension: organisation (fully described)
CREATE OR REPLACE VIEW public.dim_organisation AS
SELECT
  o.orgid,
  o.name                                AS organisation_name,
  o.talentcommunitydateadded,
  o.created_at                          AS organisation_created_at,
  o.updated_at                          AS organisation_updated_at,
  o.sectorid,
  s.summary                             AS sector_summary,
  s.description                         AS sector_description,
  o.applicantid                         AS owner_applicantid,
  ap.firstname                          AS owner_firstname,
  ap.lastname                           AS owner_lastname,
  ap.email                              AS owner_email
FROM public.organisation o
LEFT JOIN public.sector s ON s.sectorid = o.sectorid
LEFT JOIN public.applicantprofile ap ON ap.applicantid = o.applicantid;

COMMENT ON VIEW public.dim_organisation IS 'Dimension: organisation with resolved sector and owner metadata';

-- Dimension: contact (fully described)
CREATE OR REPLACE VIEW public.dim_contact AS
SELECT
  c.contactid,
  c.name                                AS contact_name,
  c.currentorgid,
  org.name                              AS current_org_name,
  org.sectorid                          AS current_org_sectorid,
  sec.summary                           AS current_org_sector_summary,
  c.currentrole,
  c.latestcvsent,
  c.islinkedinconnected,
  c.roletypeid,
  rd.refvalue                           AS roletype_value,
  rd.refdataclass                       AS roletype_class,
  c.leadid,
  l.name                                AS lead_name,
  l.company                             AS lead_company,
  c.applicantid,
  ap.firstname                          AS owner_firstname,
  ap.lastname                           AS owner_lastname,
  c.created_at,
  c.updated_at
FROM public.contact c
LEFT JOIN public.organisation org ON org.orgid = c.currentorgid
LEFT JOIN public.sector sec ON sec.sectorid = org.sectorid
LEFT JOIN public.referencedata rd ON rd.refid = c.roletypeid
LEFT JOIN public.lead l ON l.leadid = c.leadid
LEFT JOIN public.applicantprofile ap ON ap.applicantid = c.applicantid;

COMMENT ON VIEW public.dim_contact IS 'Dimension: contact with resolved organisation, sector, role type, lead and owner';

-- Dimension: jobrole (fully described)
CREATE OR REPLACE VIEW public.dim_jobrole AS
SELECT
  jr.jobid,
  jr.contactid,
  c.name                                AS contact_name,
  jr.rolename,
  jr.companyorgid,
  o.name                                AS company_org_name,
  jr.applicationdate,
  jr.statusid,
  rs.refvalue                           AS application_status_value,
  jr.sourcechannelid,
  rsrc.refvalue                         AS sourcechannel_value,
  jr.introducedbycontactid,
  ic.name                               AS introduced_by_contact_name,
  jr.applicantid
FROM public.jobrole jr
LEFT JOIN public.contact c ON c.contactid = jr.contactid
LEFT JOIN public.organisation o ON o.orgid = jr.companyorgid
LEFT JOIN public.referencedata rs ON rs.refid = jr.statusid
LEFT JOIN public.referencedata rsrc ON rsrc.refid = jr.sourcechannelid
LEFT JOIN public.contact ic ON ic.contactid = jr.introducedbycontactid;

COMMENT ON VIEW public.dim_jobrole IS 'Dimension: jobrole with resolved company, status, source channel and introducer';

-- Dimension: document (fully described)
CREATE OR REPLACE VIEW public.dim_document AS
SELECT
  d.documentid,
  d.documenttypeid,
  rd.refvalue                           AS document_type_value,
  d.documentname,
  d.documenturi,
  d.created_at,
  d.applicantid
FROM public.document d
LEFT JOIN public.referencedata rd ON rd.refid = d.documenttypeid;

COMMENT ON VIEW public.dim_document IS 'Dimension: document with resolved document type';

-- Dimension: engagementlog (fully described)
CREATE OR REPLACE VIEW public.dim_engagementlog AS
SELECT
  el.engagementlogid,
  el.contactid,
  c.name                                AS contact_name,
  el.logdate,
  el.logentry,
  el.engagementtypeid,
  rt.refvalue                           AS engagement_type_value,
  el.applicantid
FROM public.engagementlog el
LEFT JOIN public.contact c ON c.contactid = el.contactid
LEFT JOIN public.referencedata rt ON rt.refid = el.engagementtypeid;

COMMENT ON VIEW public.dim_engagementlog IS 'Dimension: engagement log with resolved contact and engagement type';

COMMIT;
