begin -- Migration: 084_create_contact_group_and_engagement_contacttype.sql
-- Combined migration: create contact group tables and update engagementlog contact type
 -- === Contact group tables ===

CREATE SEQUENCE IF NOT EXISTS public.contactgroup_contactgroupid_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE TABLE public.contactgroup (contactgroupid integer NOT NULL, name character varying(255) NOT NULL, applicantid integer NOT NULL, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now());
ALTER SEQUENCE public.contactgroup_contactgroupid_seq OWNED BY public.contactgroup.contactgroupid;
ALTER TABLE ONLY public.contactgroup
ALTER COLUMN contactgroupid
SET DEFAULT nextval('public.contactgroup_contactgroupid_seq'::regclass);
ALTER TABLE ONLY public.contactgroup ADD CONSTRAINT contactgroup_pkey PRIMARY KEY (contactgroupid);
ALTER TABLE ONLY public.contactgroup ADD CONSTRAINT contactgroup_applicantid_name_key UNIQUE (applicantid,
                                                                                              name); -- Mapping table: contactgroupmembers (members of a contact group)

CREATE SEQUENCE IF NOT EXISTS public.contactgroupmembers_id_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE TABLE public.contactgroupmembers (id integer NOT NULL, contactgroupid integer NOT NULL, contactid integer NOT NULL, applicantid integer NOT NULL, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now());
ALTER SEQUENCE public.contactgroupmembers_id_seq OWNED BY public.contactgroupmembers.id;
ALTER TABLE ONLY public.contactgroupmembers
ALTER COLUMN id
SET DEFAULT nextval('public.contactgroupmembers_id_seq'::regclass);
ALTER TABLE ONLY public.contactgroupmembers ADD CONSTRAINT contactgroupmembers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.contactgroupmembers ADD CONSTRAINT contactgroupmembers_unique_app_group_contact UNIQUE (applicantid,
                                                                                                                contactgroupid,
                                                                                                                contactid); -- Indexes

CREATE INDEX IF NOT EXISTS idx_contactgroup_applicantid ON public.contactgroup USING btree (applicantid);
CREATE INDEX IF NOT EXISTS idx_contactgroupmembers_contactgroupid ON public.contactgroupmembers USING btree (contactgroupid);
CREATE INDEX IF NOT EXISTS idx_contactgroupmembers_contactid ON public.contactgroupmembers USING btree (contactid);
CREATE INDEX IF NOT EXISTS idx_contactgroupmembers_applicantid ON public.contactgroupmembers USING btree (applicantid); -- Foreign keys: add only if referenced tables exist to avoid migration-time ordering issues
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'applicantprofile') THEN
    ALTER TABLE ONLY public.contactgroup ADD CONSTRAINT contactgroup_applicantid_fkey FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON DELETE CASCADE;
  END IF;
END$$;
ALTER TABLE ONLY public.contactgroupmembers ADD CONSTRAINT contactgroupmembers_contactgroupid_fkey
FOREIGN KEY (contactgroupid) REFERENCES public.contactgroup(contactgroupid) ON
DELETE CASCADE; DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contact') THEN
    ALTER TABLE ONLY public.contactgroupmembers ADD CONSTRAINT contactgroupmembers_contactid_fkey
    FOREIGN KEY (contactid) REFERENCES public.contact(contactid) ON DELETE CASCADE;
  END IF;
END$$; DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'applicantprofile') THEN
    ALTER TABLE ONLY public.contactgroupmembers ADD CONSTRAINT contactgroupmembers_applicantid_fkey FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON DELETE CASCADE;
  END IF;
END$$; -- Comment: A table that stores contacts as members of named contact groups.
 -- === Engagement log updates ===
-- Add column for contact type (we will reuse contactid for both individual and group types)

ALTER TABLE public.engagementlog ADD COLUMN IF NOT EXISTS contacttypeid integer; -- Seed referencedata entries for engagement_contact_type if not present

INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'engagement_contact_type',
       'Individual Contact'
WHERE NOT EXISTS
        (SELECT 1
         FROM public.referencedata
         WHERE refdataclass = 'engagement_contact_type'
             AND lower(refvalue) = lower('Individual Contact') );
    INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'engagement_contact_type',
       'Contact Group'
WHERE NOT EXISTS
        (SELECT 1
         FROM public.referencedata
         WHERE refdataclass = 'engagement_contact_type'
             AND lower(refvalue) = lower('Contact Group') ); -- Populate contacttypeid for existing rows as Individual Contact
DO $$
DECLARE
  indiv_refid integer;
BEGIN
  SELECT refid INTO indiv_refid FROM public.referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower('Individual Contact') LIMIT 1;
  IF indiv_refid IS NOT NULL THEN
    UPDATE public.engagementlog SET contacttypeid = indiv_refid WHERE contactid IS NOT NULL;
  END IF;
END$$; -- Drop strict contact FK (we reuse `contactid` to reference either a contact or a contact group;
-- application logic must interpret `contacttypeid` to know which it refers to).

    ALTER TABLE public.engagementlog
    DROP CONSTRAINT IF EXISTS engagementlog_contactid_fkey;
    ALTER TABLE ONLY public.engagementlog ADD CONSTRAINT engagementlog_contacttypeid_fkey
    FOREIGN KEY (contacttypeid) REFERENCES public.referencedata(refid) ON
    DELETE RESTRICT; -- Indexes

    CREATE INDEX IF NOT EXISTS idx_engagementlog_contacttypeid ON public.engagementlog USING btree (contacttypeid); -- Add a CHECK constraint to enforce that contacttypeid corresponds to which id is set.
DO $$
DECLARE
  indiv_refid integer;
  group_refid integer;
BEGIN
  SELECT refid INTO indiv_refid FROM public.referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower('Individual Contact') LIMIT 1;
  SELECT refid INTO group_refid FROM public.referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower('Contact Group') LIMIT 1;
  IF indiv_refid IS NOT NULL AND group_refid IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'engagementlog_contacttype_cons') THEN
      ALTER TABLE public.engagementlog DROP CONSTRAINT engagementlog_contacttype_cons;
    END IF;
    -- Enforce that contacttypeid must be set to one of the known refids (contactid is reused for both types)
    EXECUTE format('ALTER TABLE public.engagementlog ADD CONSTRAINT engagementlog_contacttype_cons CHECK (contacttypeid IN (%s, %s) AND contactid IS NOT NULL)', indiv_refid, group_refid);
  ELSE
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'engagementlog_contacttype_cons') THEN
      ALTER TABLE public.engagementlog DROP CONSTRAINT engagementlog_contacttype_cons;
    END IF;
    ALTER TABLE public.engagementlog ADD CONSTRAINT engagementlog_contacttype_cons CHECK (contactid IS NOT NULL);
  END IF;
END$$; -- Note: Application logic must interpret (contacttypeid) to decide whether to use (contactid) or (contactgroupid).


commit 