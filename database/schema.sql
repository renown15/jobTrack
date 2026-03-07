--
-- PostgreSQL database dump
--
 -- Dumped from database version 17.7 (Homebrew)
-- Dumped by pg_dump version 17.7 (Homebrew)

SET statement_timeout = 0;

-- Usersalt table: per-applicant salts used for encryption key derivation

CREATE TABLE IF NOT EXISTS public.usersalt (applicantid bigint PRIMARY KEY,
                                                               salt text NOT NULL,
                                                                         created_at timestamptz DEFAULT now());


SET lock_timeout = 0;


SET idle_in_transaction_session_timeout = 0;


SET client_encoding = 'UTF8';


SET standard_conforming_strings = on;


SELECT pg_catalog.set_config('search_path', '', false);


SET check_function_bodies = false;


SET xmloption = content;


SET client_min_messages = warning;


SET row_security = off;

--
-- Name: staging; Type: SCHEMA; Schema: -; Owner: -
--

SET default_tablespace = '';


SET default_table_access_method = heap;

--
-- Name: applicantprofile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.applicantprofile (applicantid integer NOT NULL,
                                                          email character varying(255),
                                                                          phone character varying(50),
                                                                                          addressline1 character varying(255),
                                                                                                                 city character varying(100),
                                                                                                                                postcode character varying(20),
                                                                                                                                                   linkedinurl character varying(255),
                                                                                                                                                                         personalwebsiteurl character varying(255),
                                                                                                                                                                                                      firstname character varying(100),
                                                                                                                                                                                                                          lastname character varying(100),
                                                                                                                                                                                                                                             avatarurl character varying(500),
                                                                                                                                                                                                                                                                 uipreferences jsonb DEFAULT '{}'::jsonb,
                                                                                                                                                                                                                                                                                             passwordhash text, isactive boolean DEFAULT true NOT NULL,
                                                                                                                                                                                                                                                                                                                                              lastlogin timestamp with time zone,
                                                                                                                                                                                                                                                                                                                                                                            searchstartdate date, issuperuser boolean DEFAULT false,
                                                                                                                                                                                                                                                                                                                                                                                                                              searchstatusid integer);

--
-- Name: TABLE applicantprofile; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON TABLE public.applicantprofile IS 'Profile information for the applicant (user of the software)';

--
-- Name: COLUMN applicantprofile.applicantid; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON COLUMN public.applicantprofile.applicantid IS 'Primary key for applicant (NOT a foreign key to contact)';

-- (roledocument deferred: moved later to ensure dependencies exist)

--
-- Name: COLUMN applicantprofile.firstname; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON COLUMN public.applicantprofile.firstname IS 'Applicant first name';

--
-- Name: COLUMN applicantprofile.lastname; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON COLUMN public.applicantprofile.lastname IS 'Applicant last name';

--
-- Name: COLUMN applicantprofile.avatarurl; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON COLUMN public.applicantprofile.avatarurl IS 'Direct URL to avatar image (since LinkedIn images require OAuth)';

--
-- Name: COLUMN applicantprofile.uipreferences; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON COLUMN public.applicantprofile.uipreferences IS 'UI preferences stored as JSON (e.g., column widths for contacts/orgs/roles views)';

--
-- Name: COLUMN applicantprofile.searchstartdate; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON COLUMN public.applicantprofile.searchstartdate IS 'Date when applicant started search; set by Settings -> Applicant profile';

--
-- Name: applicantprofile_applicantid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.applicantprofile_applicantid_seq
START WITH 2 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

--
-- Name: applicantprofile_applicantid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.applicantprofile_applicantid_seq OWNED BY public.applicantprofile.applicantid;

--
-- Name: contact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact (contactid integer NOT NULL,
                                               name character varying(255) NOT NULL,
                                                                           currentorgid integer, currentrole character varying(255),
                                                                                                                       statusid integer, islinkedinconnected boolean, roletypeid integer, applicantid integer NOT NULL,
                                                                                                                                                                                                                  leadid integer, created_at timestamp with time zone DEFAULT now(),
                                                                                                                                                                                                                                                                              updated_at timestamp with time zone DEFAULT now());

--
-- Name: COLUMN contact.roletypeid; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON COLUMN public.contact.roletypeid IS 'Contact role type: Recruiter, Friend/Colleague, Contact, or Interviewer';

--
-- Name: contact_contactid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contact_contactid_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

--
-- Name: contact_contactid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contact_contactid_seq OWNED BY public.contact.contactid;

--
-- Name: contacttargetorganisation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacttargetorganisation (id integer NOT NULL,
                                                          contactid integer NOT NULL,
                                                                            targetid integer NOT NULL,
                                                                                             created_at timestamp with time zone DEFAULT now(),
                                                                                                                                         applicantid integer NOT NULL);

--
-- Name: contacttargetorganisation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contacttargetorganisation_id_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

--
-- Name: contacttargetorganisation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contacttargetorganisation_id_seq OWNED BY public.contacttargetorganisation.id;

--
-- Name: dim_applicant; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.dim_applicant AS
SELECT applicantid,
       firstname AS applicant_firstname,
       lastname AS applicant_lastname,
       email AS applicant_email,
       isactive,
       issuperuser,
       lastlogin,
       searchstartdate
FROM public.applicantprofile a;

--
-- Name: VIEW dim_applicant; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON VIEW public.dim_applicant IS 'Dimension: applicantprofile (user accounts)';

--
-- Name: lead; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead (leadid integer NOT NULL,
                                         linkedinurl text, email text, company text, "position" text, connectedon date, reviewdate timestamp with time zone,
                                                                                                                                                       reviewoutcomeid integer, created_at timestamp with time zone DEFAULT now(),
                                                                                                                                                                                                                            updated_at timestamp with time zone DEFAULT now(),
                                                                                                                                                                                                                                                                        name text NOT NULL, applicantid integer NOT NULL);

--
-- Name: organisation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organisation (orgid integer NOT NULL,
                                                name character varying(255) NOT NULL,
                                                                            talentcommunitydateadded date, sectorid integer, applicantid integer NOT NULL,
                                                                                                                                                 created_at timestamp with time zone DEFAULT now(),
                                                                                                                                                                                             updated_at timestamp with time zone DEFAULT now());

--
-- Name: referencedata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referencedata (refid integer NOT NULL,
                                                 refdataclass text NOT NULL,
                                                                   refvalue text NOT NULL);

--
-- Name: sector; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sector (sectorid integer NOT NULL,
                                             summary text NOT NULL,
                                                          description text);

--
-- Name: dim_contact; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.dim_contact AS
SELECT c.contactid,
       c.name AS contact_name,
       c.currentorgid,
       org.name AS current_org_name,
       org.sectorid AS current_org_sectorid,
       sec.summary AS current_org_sector_summary,
       c.currentrole,
       c.statusid,
       rs.refvalue AS contact_status_value,
       c.islinkedinconnected,
       c.roletypeid,
       rd.refvalue AS roletype_value,
       rd.refdataclass AS roletype_class,
       c.leadid,
       l.name AS lead_name,
       l.company AS lead_company,
       c.applicantid,
       ap.firstname AS owner_firstname,
       ap.lastname AS owner_lastname,
       c.created_at,
       c.updated_at
FROM ((((((public.contact c
          LEFT JOIN public.organisation org ON ((org.orgid = c.currentorgid)))
         LEFT JOIN public.sector sec ON ((sec.sectorid = org.sectorid)))
        LEFT JOIN public.referencedata rd ON ((rd.refid = c.roletypeid)))
       LEFT JOIN public.referencedata rs ON ((rs.refid = c.statusid)))
       LEFT JOIN public.lead l ON ((l.leadid = c.leadid)))
      LEFT JOIN public.applicantprofile ap ON ((ap.applicantid = c.applicantid)));

--
-- Name: VIEW dim_contact; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON VIEW public.dim_contact IS 'Dimension: contact with resolved organisation, sector, role type, lead and owner';

--
-- Name: document; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document (documentid integer NOT NULL,
                                                 documenttypeid integer, documentname text NOT NULL,
                                                                                           documentdescription text NOT NULL,
                                                                                                                    created_at timestamp with time zone DEFAULT now(),
                                                                                                                                                                applicantid integer NOT NULL,
                                                                                                                                                                                    documentcontenttype character varying(255),
                                                                                                                                                                                                                  documentcontent bytea);

--
-- Name: COLUMN document.documentdescription; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON COLUMN public.document.documentdescription IS 'User-provided file description or link (replaces legacy documenturi)';

--
-- Name: dim_document; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.dim_document AS
SELECT d.documentid,
       d.documenttypeid,
       rd.refvalue AS document_type_value,
       d.documentname,
       d.documentdescription,
       d.created_at,
       d.applicantid
FROM (public.document d
      LEFT JOIN public.referencedata rd ON ((rd.refid = d.documenttypeid)));

--
-- Name: VIEW dim_document; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON VIEW public.dim_document IS 'Dimension: document with resolved document type';

--
-- Name: engagementlog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engagementlog (engagementlogid integer NOT NULL,
                                                           contactid integer,
                                                                             contacttypeid integer,
                                                                             logdate date, logentry text, engagementtypeid integer, applicantid integer NOT NULL);

--
-- Name: dim_engagementlog; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.dim_engagementlog AS
SELECT el.engagementlogid,
       el.contactid,
       c.name AS contact_name,
       el.logdate,
       el.logentry,
       el.engagementtypeid,
       rt.refvalue AS engagement_type_value,
       el.applicantid
FROM ((public.engagementlog el
       LEFT JOIN public.contact c ON ((c.contactid = el.contactid)))
      LEFT JOIN public.referencedata rt ON ((rt.refid = el.engagementtypeid)));

--
-- Name: VIEW dim_engagementlog; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON VIEW public.dim_engagementlog IS 'Dimension: engagement log with resolved contact and engagement type';

--
-- Name: jobrole; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobrole (jobid integer NOT NULL,
                                           contactid integer, rolename character varying(255) NOT NULL,
                                                                                              companyorgid integer, applicationdate date, statusid integer NOT NULL,
                                                                                                                                                           sourcechannelid integer, introducedbycontactid integer, applicantid integer NOT NULL);

--
-- Name: COLUMN jobrole.statusid; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON COLUMN public.jobrole.statusid IS 'Application status reference ID (Yet to apply, Applied, Rejected)';

--
-- Name: COLUMN jobrole.sourcechannelid; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON COLUMN public.jobrole.sourcechannelid IS 'Source channel reference ID (LinkedIn, Indeed, Company Website, etc.)';

--
-- Name: COLUMN jobrole.introducedbycontactid; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON COLUMN public.jobrole.introducedbycontactid IS 'Contact who introduced this opportunity (if applicable)';

--
-- Name: dim_jobrole; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.dim_jobrole AS
SELECT jr.jobid,
       jr.contactid,
       c.name AS contact_name,
       jr.rolename,
       jr.companyorgid,
       o.name AS company_org_name,
       jr.applicationdate,
       jr.statusid,
       rs.refvalue AS application_status_value,
       jr.sourcechannelid,
       rsrc.refvalue AS sourcechannel_value,
       jr.introducedbycontactid,
       ic.name AS introduced_by_contact_name,
       jr.applicantid
FROM (((((public.jobrole jr
          LEFT JOIN public.contact c ON ((c.contactid = jr.contactid)))
         LEFT JOIN public.organisation o ON ((o.orgid = jr.companyorgid)))
        LEFT JOIN public.referencedata rs ON ((rs.refid = jr.statusid)))
       LEFT JOIN public.referencedata rsrc ON ((rsrc.refid = jr.sourcechannelid)))
      LEFT JOIN public.contact ic ON ((ic.contactid = jr.introducedbycontactid)));

--
-- Name: VIEW dim_jobrole; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON VIEW public.dim_jobrole IS 'Dimension: jobrole with resolved company, status, source channel and introducer';

CREATE VIEW public.dim_lead AS
SELECT l.leadid,
       l.name AS lead_name,
       l.company AS lead_company,
       l."position" AS lead_position,
       l.linkedinurl AS lead_linkedinurl,
       l.email AS lead_email,
       l.connectedon AS lead_connectedon,
       l.reviewdate AS lead_reviewdate,
       l.reviewoutcomeid,
       r.refvalue AS reviewoutcome_value,
       l.created_at,
       l.updated_at,
       l.applicantid
FROM (public.lead l
      LEFT JOIN public.referencedata r ON ((r.refid = l.reviewoutcomeid)));

--
-- Name: VIEW dim_lead; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON VIEW public.dim_lead IS 'Dimension: lead records with resolved review outcome';

--
-- Name: dim_organisation; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.dim_organisation AS
SELECT o.orgid,
       o.name AS organisation_name,
       o.talentcommunitydateadded,
       o.created_at AS organisation_created_at,
       o.updated_at AS organisation_updated_at,
       o.sectorid,
       s.summary AS sector_summary,
       s.description AS sector_description,
       o.applicantid AS owner_applicantid,
       ap.firstname AS owner_firstname,
       ap.lastname AS owner_lastname,
       ap.email AS owner_email
FROM ((public.organisation o
       LEFT JOIN public.sector s ON ((s.sectorid = o.sectorid)))
      LEFT JOIN public.applicantprofile ap ON ((ap.applicantid = o.applicantid)));

--
-- Name: VIEW dim_organisation; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON VIEW public.dim_organisation IS 'Dimension: organisation with resolved sector and owner metadata';

--
-- Name: dim_referencedata; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.dim_referencedata AS
SELECT refid,
       refdataclass,
       refvalue
FROM public.referencedata r;

--
-- Name: VIEW dim_referencedata; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON VIEW public.dim_referencedata IS 'Dimension: referenced data (generic lookup)';

--
-- Name: dim_sector; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.dim_sector AS
SELECT sectorid,
       summary AS sector_summary,
                  description AS sector_description
FROM public.sector s;

--
-- Name: VIEW dim_sector; Type: COMMENT; Schema: public; Owner: -
--
 COMMENT ON VIEW public.dim_sector IS 'Dimension: sector (sectors lookup)';

--
-- Name: document_documentid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.document_documentid_seq
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

--
-- Name: document_documentid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.document_documentid_seq OWNED BY public.document.documentid;

--
-- Name: engagementdocument; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engagementdocument (engagementdocumentid integer NOT NULL,
                                                                     engagementlogid integer NOT NULL,
                                                                                             documentid integer NOT NULL,
                                                                                                                created_at timestamp with time zone DEFAULT now(),
                                                                                                                                                            applicantid integer NOT NULL);

--
-- Name: engagement_document_engagement_document_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.engagement_document_engagement_document_id_seq
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

--
-- Name: engagement_document_engagement_document_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.engagement_document_engagement_document_id_seq OWNED BY public.engagementdocument.engagementdocumentid;

--
-- Name: engagementlog_engagementlogid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.engagementlog_engagementlogid_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

--
-- Name: engagementlog_engagementlogid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.engagementlog_engagementlogid_seq OWNED BY public.engagementlog.engagementlogid;

--
-- Name: jobapplication_jobid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.jobapplication_jobid_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

--
-- Name: jobapplication_jobid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.jobapplication_jobid_seq OWNED BY public.jobrole.jobid;

--
-- Name: lead_leadid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lead_leadid_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

--
-- Name: lead_leadid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lead_leadid_seq OWNED BY public.lead.leadid;

--
-- Name: navigatoraction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.navigatoraction (actionid integer NOT NULL,
                                                      actionname character varying(255) NOT NULL,
                                                                                        sortorderid integer DEFAULT 0 NOT NULL,
                                                                                                                      created_at timestamp with time zone DEFAULT now(),
                                                                                                                                                                  updated_at timestamp with time zone DEFAULT now());

--
-- Name: navigatoraction_actionid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.navigatoraction_actionid_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

--
-- Name: navigatoraction_actionid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.navigatoraction_actionid_seq OWNED BY public.navigatoraction.actionid;

--
-- Name: navigatoractioninput; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.navigatoractioninput (navigatoractioninputid integer NOT NULL,
                                                                         actionid integer NOT NULL,
                                                                                          inputtypeid integer, inputvalue text, created_at timestamp with time zone DEFAULT now(),
                                                                                                                                                                            updated_at timestamp with time zone DEFAULT now(),
                                                                                                                                                                                                                        sortorderid integer DEFAULT 0);

--
-- Name: navigatoractioninput_navigatoractioninputid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.navigatoractioninput_navigatoractioninputid_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

--
-- Name: navigatoractioninput_navigatoractioninputid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.navigatoractioninput_navigatoractioninputid_seq OWNED BY public.navigatoractioninput.navigatoractioninputid;

--
-- Name: navigatorapplicantbriefing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.navigatorapplicantbriefing (briefingid integer NOT NULL,
                                                                   applicantid integer NOT NULL,
                                                                                       batchcreationtimestamp timestamp with time zone NOT NULL,
                                                                                                                                       questionid integer NOT NULL,
                                                                                                                                                          questiontext text NOT NULL,
                                                                                                                                                                            questionanswer text, created_at timestamp with time zone DEFAULT now() NOT NULL,
                                                                                                                                                                                                                                                   updated_at timestamp with time zone DEFAULT now() NOT NULL);

--
-- Name: navigatorapplicantbriefing_briefingid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.navigatorapplicantbriefing_briefingid_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

--
-- Name: navigatorapplicantbriefing_briefingid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.navigatorapplicantbriefing_briefingid_seq OWNED BY public.navigatorapplicantbriefing.briefingid;

--
-- Name: navigatorbriefingquestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.navigatorbriefingquestions (questionid integer NOT NULL,
                                                                   questionorderindex integer DEFAULT 0 NOT NULL,
                                                                                                        questiontext text NOT NULL,
                                                                                                                          created_at timestamp with time zone DEFAULT now() NOT NULL,
                                                                                                                                                                            updated_at timestamp with time zone DEFAULT now() NOT NULL);

--
-- Name: navigatorbriefingquestions_questionid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.navigatorbriefingquestions_questionid_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

--
-- Name: navigatorbriefingquestions_questionid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.navigatorbriefingquestions_questionid_seq OWNED BY public.navigatorbriefingquestions.questionid;

--
-- Name: networking_event_eventid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.networking_event_eventid_seq
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

--
-- Name: networking_event_task_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.networking_event_task_id_seq
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

--
-- Name: networkingevent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.networkingevent (eventid integer DEFAULT nextval('public.networking_event_eventid_seq'::regclass) NOT NULL,
                                                                                                                      applicantid integer NOT NULL,
                                                                                                                                          eventname text NOT NULL,
                                                                                                                                                         eventdate date NOT NULL,
                                                                                                                                                                        notes text, eventtypeid integer NOT NULL,
                                                                                                                                                                                                        created_at timestamp with time zone DEFAULT now(),
                                                                                                                                                                                                                                                    updated_at timestamp with time zone DEFAULT now());

--
-- Name: networkingeventtask; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.networkingeventtask (id integer DEFAULT nextval('public.networking_event_task_id_seq'::regclass) NOT NULL,
                                                                                                                     applicantid integer NOT NULL,
                                                                                                                                         eventid integer NOT NULL,
                                                                                                                                                         taskid integer NOT NULL,
                                                                                                                                                                        created_at timestamp with time zone DEFAULT now());

--
-- Name: organisation_orgid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.organisation_orgid_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

--
-- Name: organisation_orgid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.organisation_orgid_seq OWNED BY public.organisation.orgid;

--
-- Name: referencedata_refid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.referencedata_refid_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

--
-- Name: referencedata_refid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.referencedata_refid_seq OWNED BY public.referencedata.refid;

--
-- Name: sector_sectorid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sector_sectorid_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

--
-- Name: sector_sectorid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sector_sectorid_seq OWNED BY public.sector.sectorid;

--
-- Name: task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task (taskid integer NOT NULL,
                                         applicantid integer, name text NOT NULL,
                                                                        duedate date, notes text, created_at timestamp with time zone DEFAULT now(),
                                                                                                                                              updated_at timestamp with time zone DEFAULT now());

--
-- Name: taskactionlog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.taskactionlog (id integer NOT NULL,
                                              taskid integer NOT NULL,
                                                             commentary text NOT NULL,
                                                                             logdate timestamp with time zone DEFAULT now(),
                                                                                                                      applicantid integer NOT NULL);

--
-- Name: task_action_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.task_action_log_id_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

--
-- Name: task_action_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.task_action_log_id_seq OWNED BY public.taskactionlog.id;

--
-- Name: tasktarget; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasktarget (id integer NOT NULL,
                                           taskid integer NOT NULL,
                                                          targettype integer NOT NULL,
                                                                             targetid integer NOT NULL,
                                                                                              created_at timestamp with time zone DEFAULT now(),
                                                                                                                                          applicantid integer NOT NULL);

--
-- Name: task_target_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.task_target_id_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

--
-- Name: task_target_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.task_target_id_seq OWNED BY public.tasktarget.id;

--
-- Name: task_taskid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.task_taskid_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

--
-- Name: task_taskid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.task_taskid_seq OWNED BY public.task.taskid;
 

--
-- Name: applicantprofile applicantid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applicantprofile
ALTER COLUMN applicantid
SET DEFAULT nextval('public.applicantprofile_applicantid_seq'::regclass);

--
-- Name: contact contactid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact
ALTER COLUMN contactid
SET DEFAULT nextval('public.contact_contactid_seq'::regclass);

--
-- Name: contacttargetorganisation id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacttargetorganisation
ALTER COLUMN id
SET DEFAULT nextval('public.contacttargetorganisation_id_seq'::regclass);

--
-- Name: document documentid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document
ALTER COLUMN documentid
SET DEFAULT nextval('public.document_documentid_seq'::regclass);

--
-- Name: engagementdocument engagementdocumentid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagementdocument
ALTER COLUMN engagementdocumentid
SET DEFAULT nextval('public.engagement_document_engagement_document_id_seq'::regclass);

--
-- Name: engagementlog engagementlogid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagementlog
ALTER COLUMN engagementlogid
SET DEFAULT nextval('public.engagementlog_engagementlogid_seq'::regclass);

--
-- Name: jobrole jobid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobrole
ALTER COLUMN jobid
SET DEFAULT nextval('public.jobapplication_jobid_seq'::regclass);

--
-- Name: lead leadid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead
ALTER COLUMN leadid
SET DEFAULT nextval('public.lead_leadid_seq'::regclass);

--
-- Name: navigatoraction actionid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.navigatoraction
ALTER COLUMN actionid
SET DEFAULT nextval('public.navigatoraction_actionid_seq'::regclass);

--
-- Name: navigatoractioninput navigatoractioninputid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.navigatoractioninput
ALTER COLUMN navigatoractioninputid
SET DEFAULT nextval('public.navigatoractioninput_navigatoractioninputid_seq'::regclass);

--
-- Name: navigatorapplicantbriefing briefingid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.navigatorapplicantbriefing
ALTER COLUMN briefingid
SET DEFAULT nextval('public.navigatorapplicantbriefing_briefingid_seq'::regclass);

--
-- Name: navigatorbriefingquestions questionid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.navigatorbriefingquestions
ALTER COLUMN questionid
SET DEFAULT nextval('public.navigatorbriefingquestions_questionid_seq'::regclass);

--
-- Name: organisation orgid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organisation
ALTER COLUMN orgid
SET DEFAULT nextval('public.organisation_orgid_seq'::regclass);

--
-- Name: referencedata refid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referencedata
ALTER COLUMN refid
SET DEFAULT nextval('public.referencedata_refid_seq'::regclass);

--
-- Name: sector sectorid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector
ALTER COLUMN sectorid
SET DEFAULT nextval('public.sector_sectorid_seq'::regclass);

--
-- Name: task taskid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task
ALTER COLUMN taskid
SET DEFAULT nextval('public.task_taskid_seq'::regclass);

--
-- Name: taskactionlog id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taskactionlog
ALTER COLUMN id
SET DEFAULT nextval('public.task_action_log_id_seq'::regclass);

--
-- Name: tasktarget id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasktarget
ALTER COLUMN id
SET DEFAULT nextval('public.task_target_id_seq'::regclass);

--
-- Name: applicantprofile applicantprofile_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applicantprofile ADD CONSTRAINT applicantprofile_email_key UNIQUE (email);

--
-- Name: applicantprofile applicantprofile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applicantprofile ADD CONSTRAINT applicantprofile_pkey PRIMARY KEY (applicantid);

--
-- Name: contact contact_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact ADD CONSTRAINT contact_pkey PRIMARY KEY (contactid);

--
-- Name: contacttargetorganisation contacttargetorganisation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacttargetorganisation ADD CONSTRAINT contacttargetorganisation_pkey PRIMARY KEY (id);

--
-- Name: contacttargetorganisation contacttargetorganisation_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacttargetorganisation ADD CONSTRAINT contacttargetorganisation_unique UNIQUE (contactid,
                                                                                                          targetid,
                                                                                                          applicantid);

--
-- Name: document document_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document ADD CONSTRAINT document_pkey PRIMARY KEY (documentid);

--
-- Name: engagementdocument engagement_document_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagementdocument ADD CONSTRAINT engagement_document_pkey PRIMARY KEY (engagementdocumentid);

--
-- Name: engagementlog engagementlog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagementlog ADD CONSTRAINT engagementlog_pkey PRIMARY KEY (engagementlogid);

--
-- Name: jobrole jobapplication_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobrole ADD CONSTRAINT jobapplication_pkey PRIMARY KEY (jobid);

-- Reinsert roledocument (after jobrole PK)
-- Sequence for roledocument primary key
CREATE SEQUENCE IF NOT EXISTS public.roledocument_roledocumentid_seq
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

-- Table: roledocument
-- Links a `jobrole` (job application) to a `document` (file) for an applicant.
CREATE TABLE IF NOT EXISTS public.roledocument (
      roledocumentid integer PRIMARY KEY DEFAULT nextval('public.roledocument_roledocumentid_seq'::regclass),
      applicantid integer NOT NULL,
      jobroleid integer NOT NULL,
      documentid integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
);

-- Sequence ownership
ALTER SEQUENCE public.roledocument_roledocumentid_seq OWNED BY public.roledocument.roledocumentid;

-- Foreign keys
ALTER TABLE public.roledocument ADD CONSTRAINT roledocument_jobrole_fkey FOREIGN KEY (jobroleid) REFERENCES public.jobrole(jobid) ON DELETE CASCADE;
ALTER TABLE public.roledocument ADD CONSTRAINT roledocument_document_fkey FOREIGN KEY (documentid) REFERENCES public.document(documentid) ON DELETE CASCADE;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS roledocument_unique_app_jobrole_document ON public.roledocument (applicantid, jobroleid, documentid);
CREATE INDEX IF NOT EXISTS roledocument_jobrole_idx ON public.roledocument (jobroleid);
CREATE INDEX IF NOT EXISTS roledocument_document_idx ON public.roledocument (documentid);
CREATE INDEX IF NOT EXISTS roledocument_applicant_idx ON public.roledocument (applicantid);

--
-- Name: lead leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead ADD CONSTRAINT leads_pkey PRIMARY KEY (leadid);

--
-- Name: navigatoraction navigatoraction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.navigatoraction ADD CONSTRAINT navigatoraction_pkey PRIMARY KEY (actionid);

--
-- Name: navigatoractioninput navigatoractioninput_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.navigatoractioninput ADD CONSTRAINT navigatoractioninput_pkey PRIMARY KEY (navigatoractioninputid);

--
-- Name: navigatorapplicantbriefing navigatorapplicantbriefing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.navigatorapplicantbriefing ADD CONSTRAINT navigatorapplicantbriefing_pkey PRIMARY KEY (briefingid);

--
-- Name: navigatorbriefingquestions navigatorbriefingquestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.navigatorbriefingquestions ADD CONSTRAINT navigatorbriefingquestions_pkey PRIMARY KEY (questionid);

--
-- Name: networkingevent networking_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.networkingevent ADD CONSTRAINT networking_event_pkey PRIMARY KEY (eventid);

--
-- Name: networkingeventtask networking_event_task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.networkingeventtask ADD CONSTRAINT networking_event_task_pkey PRIMARY KEY (id);

--
-- Name: organisation organisation_applicantid_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organisation ADD CONSTRAINT organisation_applicantid_name_key UNIQUE (applicantid, name);

--
-- Name: organisation organisation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organisation ADD CONSTRAINT organisation_pkey PRIMARY KEY (orgid);

--
-- Name: referencedata referencedata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referencedata ADD CONSTRAINT referencedata_pkey PRIMARY KEY (refid);

--
-- Name: sector sector_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector ADD CONSTRAINT sector_pkey PRIMARY KEY (sectorid);

--
-- Name: sector sector_summary_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector ADD CONSTRAINT sector_summary_key UNIQUE (summary);

--
-- Name: task task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task ADD CONSTRAINT task_pkey PRIMARY KEY (taskid);

--
-- Name: taskactionlog taskactionlog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taskactionlog ADD CONSTRAINT taskactionlog_pkey PRIMARY KEY (id);

--
-- Name: tasktarget tasktarget_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasktarget ADD CONSTRAINT tasktarget_pkey PRIMARY KEY (id);

--
-- Name: contact uq_contact_applicant_contactid; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact ADD CONSTRAINT uq_contact_applicant_contactid UNIQUE (applicantid,
                                                                                      contactid);

--
-- Name: contacttargetorganisation uq_cto; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacttargetorganisation ADD CONSTRAINT uq_cto UNIQUE (contactid,
                                                                                targetid);

--
-- Name: contacttargetorganisation uq_cto_applicant_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacttargetorganisation ADD CONSTRAINT uq_cto_applicant_id UNIQUE (applicantid,
                                                                                             id);

--
-- Name: document uq_document_applicant_documentid; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document ADD CONSTRAINT uq_document_applicant_documentid UNIQUE (applicantid,
                                                                                         documentid);

--
-- Name: engagementlog uq_engagementlog_applicant_engagementlogid; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagementlog ADD CONSTRAINT uq_engagementlog_applicant_engagementlogid UNIQUE (applicantid,
                                                                                                        engagementlogid);

--
-- Name: engagementdocument uq_engdoc_applicant_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagementdocument ADD CONSTRAINT uq_engdoc_applicant_id UNIQUE (applicantid,
                                                                                         engagementdocumentid);

--
-- Name: jobrole uq_jobrole_applicant_jobid; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobrole ADD CONSTRAINT uq_jobrole_applicant_jobid UNIQUE (applicantid,
                                                                                  jobid);

--
-- Name: lead uq_leads_applicant_leadid; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead ADD CONSTRAINT uq_leads_applicant_leadid UNIQUE (applicantid,
                                                                              leadid);

--
-- Name: organisation uq_organisation_applicant_orgid; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organisation ADD CONSTRAINT uq_organisation_applicant_orgid UNIQUE (applicantid,
                                                                                            orgid);

--
-- Name: referencedata uq_refdata_class_value; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referencedata ADD CONSTRAINT uq_refdata_class_value UNIQUE (refdataclass,
                                                                                    refvalue);

--
-- Name: taskactionlog uq_taskactionlog_applicant_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taskactionlog ADD CONSTRAINT uq_taskactionlog_applicant_id UNIQUE (applicantid,
                                                                                           id);

--
-- Name: tasktarget uq_tasktarget_applicant_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasktarget ADD CONSTRAINT uq_tasktarget_applicant_id UNIQUE (applicantid,
                                                                                     id);

--
-- Name: idx_applicantprofile_searchstatusid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applicantprofile_searchstatusid ON public.applicantprofile USING btree (searchstatusid);

--
-- Name: idx_contact_applicantid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_applicantid ON public.contact USING btree (applicantid);

--
-- Name: idx_contact_role_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_role_type ON public.contact USING btree (roletypeid);

--
-- Name: idx_document_documenttypeid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_documenttypeid ON public.document USING btree (documenttypeid);

--
-- Name: idx_engagement_document_documentid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_engagement_document_documentid ON public.engagementdocument USING btree (documentid);

--
-- Name: idx_engagement_document_engagementlogid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_engagement_document_engagementlogid ON public.engagementdocument USING btree (engagementlogid);

--
-- Name: idx_engagementlog_applicantid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_engagementlog_applicantid ON public.engagementlog USING btree (applicantid);
CREATE INDEX IF NOT EXISTS idx_engagementlog_contacttypeid ON public.engagementlog USING btree (contacttypeid);

--
-- Name: idx_jobrole_applicantid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobrole_applicantid ON public.jobrole USING btree (applicantid);

--
-- Name: idx_jobrole_introduced_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobrole_introduced_by ON public.jobrole USING btree (introducedbycontactid);

--
-- Name: idx_jobrole_source_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobrole_source_channel ON public.jobrole USING btree (sourcechannelid);

--
-- Name: idx_jobrole_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobrole_status ON public.jobrole USING btree (statusid);

--
-- Name: idx_leads_applicantid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_applicantid ON public.lead USING btree (applicantid);

--
-- Name: idx_navbrief_applicant_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_navbrief_applicant_batch ON public.navigatorapplicantbriefing USING btree (applicantid, batchcreationtimestamp);

--
-- Name: idx_navigatoraction_sortorder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_navigatoraction_sortorder ON public.navigatoraction USING btree (sortorderid);

--
-- Name: idx_navigatoractioninput_actionid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_navigatoractioninput_actionid ON public.navigatoractioninput USING btree (actionid);

--
-- Name: idx_networking_event_applicantid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_networking_event_applicantid ON public.networkingevent USING btree (applicantid);

--
-- Name: idx_networking_event_task_eventid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_networking_event_task_eventid ON public.networkingeventtask USING btree (eventid);

--
-- Name: idx_networking_event_task_taskid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_networking_event_task_taskid ON public.networkingeventtask USING btree (taskid);

--
-- Name: idx_task_applicantid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_applicantid ON public.task USING btree (applicantid);

--
-- Name: idx_taskactionlog_taskid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_taskactionlog_taskid ON public.taskactionlog USING btree (taskid);

--
-- Name: idx_tasktarget_taskid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasktarget_taskid ON public.tasktarget USING btree (taskid);

--
-- Name: idx_tasktarget_type_targetid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasktarget_type_targetid ON public.tasktarget USING btree (targettype, targetid);

--
-- Name: contact contact_applicantid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact ADD CONSTRAINT contact_applicantid_fkey
FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON
DELETE CASCADE;

--
-- Name: contact contact_currentorgid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact ADD CONSTRAINT contact_currentorgid_fkey
FOREIGN KEY (currentorgid) REFERENCES public.organisation(orgid);

--
-- Name: contact contact_leadid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact ADD CONSTRAINT contact_leadid_fkey
FOREIGN KEY (leadid) REFERENCES public.lead(leadid) ON
DELETE
SET NULL;

--
-- Name: contact contact_role_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact ADD CONSTRAINT contact_role_type_id_fkey
FOREIGN KEY (roletypeid) REFERENCES public.referencedata(refid);

-- Name: contact contact_statusid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.contact ADD CONSTRAINT contact_statusid_fkey
FOREIGN KEY (statusid) REFERENCES public.referencedata(refid) ON DELETE SET NULL;

--
-- Name: contacttargetorganisation cto_applicantid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacttargetorganisation ADD CONSTRAINT cto_applicantid_fkey
FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON
DELETE CASCADE;

--
-- Name: document document_applicantid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document ADD CONSTRAINT document_applicantid_fkey
FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON
DELETE CASCADE;

--
-- Name: document document_documenttypeid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document ADD CONSTRAINT document_documenttypeid_fkey
FOREIGN KEY (documenttypeid) REFERENCES public.referencedata(refid) ON
DELETE
SET NULL;

--
-- Name: engagementdocument engagement_document_applicantid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagementdocument ADD CONSTRAINT engagement_document_applicantid_fkey
FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON
DELETE CASCADE;

--
-- Name: engagementdocument engagement_document_documentid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagementdocument ADD CONSTRAINT engagement_document_documentid_fkey
FOREIGN KEY (documentid) REFERENCES public.document(documentid) ON
DELETE CASCADE;

--
-- Name: engagementdocument engagement_document_engagementlogid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagementdocument ADD CONSTRAINT engagement_document_engagementlogid_fkey
FOREIGN KEY (engagementlogid) REFERENCES public.engagementlog(engagementlogid) ON
DELETE CASCADE;

--
-- Name: engagementlog engagementlog_applicantid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagementlog ADD CONSTRAINT engagementlog_applicantid_fkey
FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON
DELETE CASCADE;

--
-- Name: engagementlog engagementlog_contactid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagementlog ADD CONSTRAINT engagementlog_contactid_fkey
FOREIGN KEY (contactid) REFERENCES public.contact(contactid) ON DELETE SET NULL;

-- Foreign key for contact type (referencedata.engagement_contact_type)
ALTER TABLE ONLY public.engagementlog ADD CONSTRAINT engagementlog_contacttypeid_fkey FOREIGN KEY (contacttypeid) REFERENCES public.referencedata(refid) ON DELETE RESTRICT;

--
-- Name: engagementlog engagementlog_engagementtype_refid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagementlog ADD CONSTRAINT engagementlog_engagementtype_refid_fkey
FOREIGN KEY (engagementtypeid) REFERENCES public.referencedata(refid);

--
-- Name: applicantprofile fk_applicantprofile_searchstatusid; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applicantprofile ADD CONSTRAINT fk_applicantprofile_searchstatusid
FOREIGN KEY (searchstatusid) REFERENCES public.referencedata(refid) ON
DELETE
SET NULL;

--
-- Name: contacttargetorganisation fk_cto_contact; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacttargetorganisation ADD CONSTRAINT fk_cto_contact
FOREIGN KEY (contactid) REFERENCES public.contact(contactid) ON
DELETE CASCADE;

--
-- Name: contacttargetorganisation fk_cto_org; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacttargetorganisation ADD CONSTRAINT fk_cto_org
FOREIGN KEY (targetid) REFERENCES public.organisation(orgid) ON
DELETE CASCADE;

--
-- Name: navigatorapplicantbriefing fk_question; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.navigatorapplicantbriefing ADD CONSTRAINT fk_question
FOREIGN KEY (questionid) REFERENCES public.navigatorbriefingquestions(questionid) ON
DELETE RESTRICT;

--
-- Name: jobrole jobapplication_companyorgid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobrole ADD CONSTRAINT jobapplication_companyorgid_fkey
FOREIGN KEY (companyorgid) REFERENCES public.organisation(orgid);

--
-- Name: jobrole jobrole_applicantid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobrole ADD CONSTRAINT jobrole_applicantid_fkey
FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON
DELETE CASCADE;

--
-- Name: jobrole jobrole_contactid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobrole ADD CONSTRAINT jobrole_contactid_fkey
FOREIGN KEY (contactid) REFERENCES public.contact(contactid) ON
DELETE
SET NULL;

--
-- Name: jobrole jobrole_introduced_by_contactid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobrole ADD CONSTRAINT jobrole_introduced_by_contactid_fkey
FOREIGN KEY (introducedbycontactid) REFERENCES public.contact(contactid);

--
-- Name: jobrole jobrole_source_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobrole ADD CONSTRAINT jobrole_source_channel_id_fkey
FOREIGN KEY (sourcechannelid) REFERENCES public.referencedata(refid);

--
-- Name: jobrole jobrole_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobrole ADD CONSTRAINT jobrole_status_id_fkey
FOREIGN KEY (statusid) REFERENCES public.referencedata(refid);

--
-- Name: lead leads_applicantid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead ADD CONSTRAINT leads_applicantid_fkey
FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON
DELETE CASCADE;

--
-- Name: lead leads_reviewoutcomeid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead ADD CONSTRAINT leads_reviewoutcomeid_fkey
FOREIGN KEY (reviewoutcomeid) REFERENCES public.referencedata(refid) ON
DELETE
SET NULL;

--
-- Name: navigatoractioninput navigatoractioninput_actionid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.navigatoractioninput ADD CONSTRAINT navigatoractioninput_actionid_fkey
FOREIGN KEY (actionid) REFERENCES public.navigatoraction(actionid) ON
DELETE CASCADE;

--
-- Name: navigatoractioninput navigatoractioninput_inputtypeid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.navigatoractioninput ADD CONSTRAINT navigatoractioninput_inputtypeid_fkey
FOREIGN KEY (inputtypeid) REFERENCES public.referencedata(refid) ON
DELETE
SET NULL;

--
-- Name: networkingevent networking_event_applicantid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.networkingevent ADD CONSTRAINT networking_event_applicantid_fkey
FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid);

--
-- Name: networkingevent networking_event_eventtypeid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.networkingevent ADD CONSTRAINT networking_event_eventtypeid_fkey
FOREIGN KEY (eventtypeid) REFERENCES public.referencedata(refid);

--
-- Name: networkingeventtask networking_event_task_applicantid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.networkingeventtask ADD CONSTRAINT networking_event_task_applicantid_fkey
FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid);

--
-- Name: networkingeventtask networking_event_task_eventid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.networkingeventtask ADD CONSTRAINT networking_event_task_eventid_fkey
FOREIGN KEY (eventid) REFERENCES public.networkingevent(eventid) ON
DELETE CASCADE;

--
-- Name: networkingeventtask networking_event_task_taskid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.networkingeventtask ADD CONSTRAINT networking_event_task_taskid_fkey
FOREIGN KEY (taskid) REFERENCES public.task(taskid) ON
DELETE CASCADE;

--
-- Name: organisation organisation_applicantid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organisation ADD CONSTRAINT organisation_applicantid_fkey
FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON
DELETE CASCADE;

--
-- Name: organisation organisation_sectorid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organisation ADD CONSTRAINT organisation_sectorid_fkey
FOREIGN KEY (sectorid) REFERENCES public.sector(sectorid) ON
DELETE
SET NULL;

--
-- Name: taskactionlog taskactionlog_applicantid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taskactionlog ADD CONSTRAINT taskactionlog_applicantid_fkey
FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON
DELETE CASCADE;

--
-- Name: taskactionlog taskactionlog_taskid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taskactionlog ADD CONSTRAINT taskactionlog_taskid_fkey
FOREIGN KEY (taskid) REFERENCES public.task(taskid) ON
DELETE CASCADE;

--
-- Name: tasktarget tasktarget_applicantid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasktarget ADD CONSTRAINT tasktarget_applicantid_fkey
FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON
DELETE CASCADE;

--
-- Name: tasktarget tasktarget_targettype_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasktarget ADD CONSTRAINT tasktarget_targettype_fkey
FOREIGN KEY (targettype) REFERENCES public.referencedata(refid);

--
-- Name: tasktarget tasktarget_taskid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasktarget ADD CONSTRAINT tasktarget_taskid_fkey
FOREIGN KEY (taskid) REFERENCES public.task(taskid) ON
DELETE CASCADE;

-- === Contact group tables ===
-- Sequence for contactgroup primary key
CREATE SEQUENCE IF NOT EXISTS public.contactgroup_contactgroupid_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE public.contactgroup (contactgroupid integer NOT NULL,
                                  name character varying(255) NOT NULL,
                                  applicantid integer NOT NULL,
                                  created_at timestamp with time zone DEFAULT now(),
                                  updated_at timestamp with time zone DEFAULT now());

ALTER SEQUENCE public.contactgroup_contactgroupid_seq OWNED BY public.contactgroup.contactgroupid;

ALTER TABLE ONLY public.contactgroup
ALTER COLUMN contactgroupid
SET DEFAULT nextval('public.contactgroup_contactgroupid_seq'::regclass);

-- Ensure contactgroupid is a primary key so FKs can reference it
ALTER TABLE ONLY public.contactgroup ADD CONSTRAINT contactgroup_pkey PRIMARY KEY (contactgroupid);

CREATE SEQUENCE IF NOT EXISTS public.contactgroupmembers_id_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE public.contactgroupmembers (id integer NOT NULL,
                                       contactgroupid integer NOT NULL,
                                       contactid integer NOT NULL,
                                       applicantid integer NOT NULL,
                                       created_at timestamp with time zone DEFAULT now(),
                                       updated_at timestamp with time zone DEFAULT now());

ALTER SEQUENCE public.contactgroupmembers_id_seq OWNED BY public.contactgroupmembers.id;

ALTER TABLE ONLY public.contactgroupmembers
ALTER COLUMN id
SET DEFAULT nextval('public.contactgroupmembers_id_seq'::regclass);

ALTER TABLE ONLY public.contactgroupmembers ADD CONSTRAINT contactgroupmembers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.contactgroupmembers ADD CONSTRAINT contactgroupmembers_unique_app_group_contact UNIQUE (applicantid, contactgroupid, contactid);

CREATE INDEX IF NOT EXISTS idx_contactgroup_applicantid ON public.contactgroup USING btree (applicantid);
CREATE INDEX IF NOT EXISTS idx_contactgroupmembers_contactgroupid ON public.contactgroupmembers USING btree (contactgroupid);
CREATE INDEX IF NOT EXISTS idx_contactgroupmembers_contactid ON public.contactgroupmembers USING btree (contactid);
CREATE INDEX IF NOT EXISTS idx_contactgroupmembers_applicantid ON public.contactgroupmembers USING btree (applicantid);

ALTER TABLE ONLY public.contactgroup ADD CONSTRAINT contactgroup_applicantid_fkey FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON DELETE CASCADE;

ALTER TABLE ONLY public.contactgroupmembers ADD CONSTRAINT contactgroupmembers_contactgroupid_fkey FOREIGN KEY (contactgroupid) REFERENCES public.contactgroup(contactgroupid) ON DELETE CASCADE;
ALTER TABLE ONLY public.contactgroupmembers ADD CONSTRAINT contactgroupmembers_contactid_fkey FOREIGN KEY (contactid) REFERENCES public.contact(contactid) ON DELETE CASCADE;
ALTER TABLE ONLY public.contactgroupmembers ADD CONSTRAINT contactgroupmembers_applicantid_fkey FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--
