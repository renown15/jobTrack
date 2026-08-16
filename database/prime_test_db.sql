-- SQL to prime the test database after loading `database/schema.sql`.
-- Keep test-only or non-DDL inserts here so `schema.sql` remains a pure schema dump.

-- Ensure an applicant with applicantid=1 exists for integration tests
-- Password is: testpassword123
INSERT INTO public.applicantprofile (applicantid, firstname, lastname, email, passwordhash, isactive)
VALUES (1, 'Test', 'User', 'test@example.com', 'scrypt:32768:8:1$Rw8lvKYhegbaQN2o$f14dd3f42ee37924a79c7c26da567d74354aa96ab09928396a1ed1adf6646a3fecdc941995ef21d868603a779eca8cc642623dced7b6d214acd7e77de31d2e91', true)
ON CONFLICT (applicantid) DO NOTHING;

-- Add any other seeds required by integration tests below.
-- For example, small referencedata rows or default organisation entries can be
-- added here rather than baked into the schema dump.

-- Minimal referencedata entries required by endpoints (id lookup by class/value).
-- Minimal referencedata entries required by endpoints (id lookup by class/value).
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'application_status','Applied'
WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='application_status' AND refvalue='Applied');

INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'application_status','Interview'
WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='application_status' AND refvalue='Interview');

-- Additional minimal application statuses used by tests
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'application_status','Offer'
WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='application_status' AND refvalue='Offer');

INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'application_status','Rejected'
WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='application_status' AND refvalue='Rejected');

INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'application_status','Accepted'
WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='application_status' AND refvalue='Accepted');

-- JobStatus reference data required by export/import tests
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'JobStatus','Applied' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='JobStatus' AND refvalue='Applied');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'JobStatus','Interview Scheduled' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='JobStatus' AND refvalue='Interview Scheduled');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'JobStatus','Offer Received' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='JobStatus' AND refvalue='Offer Received');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'JobStatus','Rejected' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='JobStatus' AND refvalue='Rejected');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'JobStatus','Withdrawn' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='JobStatus' AND refvalue='Withdrawn');

-- Additional reference-data rows commonly used by the application and tests
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'application_status','Yet to apply' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='application_status' AND refvalue='Yet to apply');

INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'contact_role_type','Recruiter' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='contact_role_type' AND refvalue='Recruiter');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'contact_role_type','Friend/Colleague' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='contact_role_type' AND refvalue='Friend/Colleague');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'contact_role_type','Contact' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='contact_role_type' AND refvalue='Contact');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'contact_role_type','Interviewer' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='contact_role_type' AND refvalue='Interviewer');

-- RoleType entries required by export/import integration tests
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'RoleType','Recruiter' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='RoleType' AND refvalue='Recruiter');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'RoleType','Hiring Manager' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='RoleType' AND refvalue='Hiring Manager');

-- Engagement contact type values for multi-contact handling
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'engagement_contact_type','Individual Contact' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='engagement_contact_type' AND refvalue='Individual Contact');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'engagement_contact_type','Contact Group' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='engagement_contact_type' AND refvalue='Contact Group');

INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'source_channel','LinkedIn' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='source_channel' AND refvalue='LinkedIn');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'source_channel','Indeed' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='source_channel' AND refvalue='Indeed');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'source_channel','Company Website' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='source_channel' AND refvalue='Company Website');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'source_channel','Recruitment Agency' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='source_channel' AND refvalue='Recruitment Agency');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'source_channel','Referral' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='source_channel' AND refvalue='Referral');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'source_channel','Job Board' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='source_channel' AND refvalue='Job Board');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'source_channel','Networking Event' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='source_channel' AND refvalue='Networking Event');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'source_channel','Direct Contact' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='source_channel' AND refvalue='Direct Contact');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'source_channel','Other' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='source_channel' AND refvalue='Other');

-- Lead review statuses used by leads features/tests
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'lead_review_status','Engage Urgently' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='lead_review_status' AND refvalue='Engage Urgently');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'lead_review_status','Potentially Engage' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='lead_review_status' AND refvalue='Potentially Engage');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'lead_review_status','Not Relevant at this Time' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='lead_review_status' AND refvalue='Not Relevant at this Time');

-- Action plan / task target types
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'action_plan_target_type','Contact' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='action_plan_target_type' AND refvalue='Contact');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'action_plan_target_type','Organisation' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='action_plan_target_type' AND refvalue='Organisation');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'action_plan_target_type','Lead' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='action_plan_target_type' AND refvalue='Lead');

-- Contact target types (polymorphic targets)
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'contact_target_type','Organisation' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='contact_target_type' AND refvalue='Organisation');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'contact_target_type','Sector' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='contact_target_type' AND refvalue='Sector');

-- Network event types
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'network_event_type','Networking dinner' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='network_event_type' AND refvalue='Networking dinner');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'network_event_type','Conference' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='network_event_type' AND refvalue='Conference');

-- Common document types used by Navigator heuristics
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'document_type','LinkedIn Profile' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='document_type' AND refvalue='LinkedIn Profile');
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'document_type','CV' WHERE NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refdataclass='document_type' AND refvalue='CV');

-- Ensure a stable refid for core application statuses so tests can reference them by id.
DO $$
BEGIN
	-- If refid=1 is not the 'Applied' application_status, replace it.
	IF NOT EXISTS (SELECT 1 FROM public.referencedata WHERE refid = 1 AND refdataclass='application_status' AND refvalue='Applied') THEN
		DELETE FROM public.referencedata WHERE refid = 1;
		INSERT INTO public.referencedata (refid, refdataclass, refvalue) VALUES (1, 'application_status', 'Applied');
		-- Ensure sequence is advanced to avoid duplicate key on next inserts
		IF EXISTS (SELECT 1 FROM pg_class WHERE relkind='S' AND relname='referencedata_refid_seq') THEN
			PERFORM setval('public.referencedata_refid_seq', (SELECT GREATEST(MAX(refid), 1) FROM public.referencedata));
		END IF;
	END IF;
END$$;

-- Sectors for organisation foreign key
-- Sectors for organisation foreign key
INSERT INTO public.sector (sectorid, summary, description)
SELECT 1,'Technology','Technology and software companies'
WHERE NOT EXISTS (SELECT 1 FROM public.sector WHERE sectorid=1);
INSERT INTO public.sector (sectorid, summary, description)
SELECT 2,'Finance','Financial services and banking'
WHERE NOT EXISTS (SELECT 1 FROM public.sector WHERE sectorid=2);
INSERT INTO public.sector (sectorid, summary, description)
SELECT 3,'Healthcare','Healthcare and medical services'
WHERE NOT EXISTS (SELECT 1 FROM public.sector WHERE sectorid=3);
INSERT INTO public.sector (sectorid, summary, description)
SELECT 4,'Consulting','Consulting and professional services'
WHERE NOT EXISTS (SELECT 1 FROM public.sector WHERE sectorid=4);
INSERT INTO public.sector (sectorid, summary, description)
SELECT 5,'Retail','Retail and e-commerce'
WHERE NOT EXISTS (SELECT 1 FROM public.sector WHERE sectorid=5);

-- Sync sequence to prevent duplicate key errors when creating new sectors
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_class WHERE relkind='S' AND relname='sector_sectorid_seq') THEN
		PERFORM setval('public.sector_sectorid_seq', (SELECT COALESCE(MAX(sectorid), 0) + 1 FROM public.sector), false);
	END IF;
END$$;


INSERT INTO public.organisation (orgid, name, sectorid, applicantid)
VALUES (537, 'Test Organisation 537', 2, 1)
ON CONFLICT (orgid) DO NOTHING;

-- Insert a seed contact assigned to org 537 for applicant 1 if not already present
-- Compatibility columns: some tests expect contact.firstname/lastname/email
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contact' AND column_name='firstname') THEN
		ALTER TABLE public.contact ADD COLUMN firstname character varying(100);
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contact' AND column_name='lastname') THEN
		ALTER TABLE public.contact ADD COLUMN lastname character varying(100);
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contact' AND column_name='email') THEN
		ALTER TABLE public.contact ADD COLUMN email character varying(255);
	END IF;
END$$;

-- Ensure `name` is populated from firstname/lastname when tests insert using firstname/lastname
CREATE OR REPLACE FUNCTION public.contact_ensure_name() RETURNS trigger AS $fn$
BEGIN
	IF NEW.name IS NULL THEN
		NEW.name := COALESCE(NEW.firstname, '') ||
			CASE WHEN NEW.firstname IS NOT NULL AND NEW.lastname IS NOT NULL THEN ' ' ELSE '' END ||
			COALESCE(NEW.lastname, '');
	END IF;
	RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contact_ensure_name_trigger ON public.contact;
CREATE TRIGGER contact_ensure_name_trigger
BEFORE INSERT OR UPDATE ON public.contact
FOR EACH ROW
EXECUTE FUNCTION public.contact_ensure_name();

INSERT INTO public.contact (name, currentorgid, roletypeid, applicantid)
SELECT 'Seed Contact for Org 537', 537,
	   (SELECT refid FROM public.referencedata WHERE refdataclass='contact_role_type' AND refvalue='Contact' LIMIT 1),
	   1
WHERE NOT EXISTS (
	SELECT 1 FROM public.contact c WHERE c.name = 'Seed Contact for Org 537' AND c.applicantid = 1
);

-- Advance sequences to avoid duplicate-key issues
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_class WHERE relkind='S' AND relname='organisation_orgid_seq') THEN
		PERFORM setval('public.organisation_orgid_seq', (SELECT COALESCE(MAX(orgid), 537) FROM public.organisation), true);
	END IF;
	IF EXISTS (SELECT 1 FROM pg_class WHERE relkind='S' AND relname='contact_contactid_seq') THEN
		PERFORM setval('public.contact_contactid_seq', (SELECT COALESCE(MAX(contactid), 1) FROM public.contact), true);
	END IF;
END$$;

