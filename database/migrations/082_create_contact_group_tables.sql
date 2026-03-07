p-- Migration: 082_create_contact_group_tables.sql
-- Create contactgroup and contactgrouptarget tables

CREATE SEQUENCE IF NOT EXISTS public.contactgroup_contactgroupid_seq AS integer
    START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE public.contactgroup (
    contactgroupid integer NOT NULL,
    name character varying(255) NOT NULL,
    applicantid integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER SEQUENCE public.contactgroup_contactgroupid_seq OWNED BY public.contactgroup.contactgroupid;

ALTER TABLE ONLY public.contactgroup
    ALTER COLUMN contactgroupid SET DEFAULT nextval('public.contactgroup_contactgroupid_seq'::regclass);

ALTER TABLE ONLY public.contactgroup ADD CONSTRAINT contactgroup_pkey PRIMARY KEY (contactgroupid);
ALTER TABLE ONLY public.contactgroup ADD CONSTRAINT contactgroup_applicantid_name_key UNIQUE (applicantid, name);

-- Mapping table: contactgroupmembers (members of a contact group)
CREATE SEQUENCE IF NOT EXISTS public.contactgroupmembers_id_seq AS integer
    START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE public.contactgroupmembers (
    id integer NOT NULL,
    contactgroupid integer NOT NULL,
    contactid integer NOT NULL,
    applicantid integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER SEQUENCE public.contactgroupmembers_id_seq OWNED BY public.contactgroupmembers.id;

ALTER TABLE ONLY public.contactgroupmembers
    ALTER COLUMN id SET DEFAULT nextval('public.contactgroupmembers_id_seq'::regclass);

ALTER TABLE ONLY public.contactgroupmembers ADD CONSTRAINT contactgroupmembers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.contactgroupmembers ADD CONSTRAINT contactgroupmembers_unique_app_group_contact UNIQUE (applicantid, contactgroupid, contactid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contactgroup_applicantid ON public.contactgroup USING btree (applicantid);
CREATE INDEX IF NOT EXISTS idx_contactgroupmembers_contactgroupid ON public.contactgroupmembers USING btree (contactgroupid);
CREATE INDEX IF NOT EXISTS idx_contactgroupmembers_contactid ON public.contactgroupmembers USING btree (contactid);
CREATE INDEX IF NOT EXISTS idx_contactgroupmembers_applicantid ON public.contactgroupmembers USING btree (applicantid);

-- Foreign keys
ALTER TABLE ONLY public.contactgroup ADD CONSTRAINT contactgroup_applicantid_fkey FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON DELETE CASCADE;

ALTER TABLE ONLY public.contactgroupmembers ADD CONSTRAINT contactgroupmembers_contactgroupid_fkey FOREIGN KEY (contactgroupid) REFERENCES public.contactgroup(contactgroupid) ON DELETE CASCADE;
ALTER TABLE ONLY public.contactgroupmembers ADD CONSTRAINT contactgroupmembers_contactid_fkey FOREIGN KEY (contactid) REFERENCES public.contact(contactid) ON DELETE CASCADE;
ALTER TABLE ONLY public.contactgroupmembers ADD CONSTRAINT contactgroupmembers_applicantid_fkey FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON DELETE CASCADE;

-- Comment: A table that stores contacts as members of named contact groups.
-- The `referencedata` class for `membertype_refid` should be 'contact_group_target_type'.
