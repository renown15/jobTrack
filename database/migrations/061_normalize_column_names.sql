-- 061_normalize_column_names.sql
-- Rename columns to remove underscores and follow the project's singular/no-underscore convention.
-- Operations use IF EXISTS to be safe on dev/staging DBs.
BEGIN;

-- applicantprofile: use guarded EXECUTE since PostgreSQL does not support
-- `RENAME COLUMN IF EXISTS` syntax directly
DO $$
BEGIN
	IF EXISTS(
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'applicantprofile' AND column_name = 'is_active'
	) THEN
		EXECUTE 'ALTER TABLE public.applicantprofile RENAME COLUMN is_active TO isactive';
	END IF;
	IF EXISTS(
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'applicantprofile' AND column_name = 'last_login'
	) THEN
		EXECUTE 'ALTER TABLE public.applicantprofile RENAME COLUMN last_login TO lastlogin';
	END IF;
	IF EXISTS(
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'applicantprofile' AND column_name = 'password_hash'
	) THEN
		EXECUTE 'ALTER TABLE public.applicantprofile RENAME COLUMN password_hash TO passwordhash';
	END IF;
	IF EXISTS(
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'applicantprofile' AND column_name = 'ui_preferences'
	) THEN
		EXECUTE 'ALTER TABLE public.applicantprofile RENAME COLUMN ui_preferences TO uipreferences';
	END IF;
END$$;

-- contact
DO $$
BEGIN
	IF EXISTS(
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'contact' AND column_name = 'role_type_id'
	) THEN
		EXECUTE 'ALTER TABLE public.contact RENAME COLUMN role_type_id TO roletypeid';
	END IF;
END$$;

-- contact target (support both legacy and renamed table names)
DO $$
BEGIN
	IF EXISTS(
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'contacttargetorganisation' AND column_name = 'target_orgid'
	) THEN
		EXECUTE 'ALTER TABLE public.contacttargetorganisation RENAME COLUMN target_orgid TO targetid';
	END IF;
	IF EXISTS(
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'contacttarget' AND column_name = 'target_orgid'
	) THEN
		EXECUTE 'ALTER TABLE public.contacttarget RENAME COLUMN target_orgid TO targetid';
	END IF;
END$$;

-- engagement document
DO $$
BEGIN
	IF EXISTS(
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'engagement_document' AND column_name = 'engagement_document_id'
	) THEN
		EXECUTE 'ALTER TABLE public.engagement_document RENAME COLUMN engagement_document_id TO engagementdocumentid';
	END IF;
	IF EXISTS(
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'engagementdocument' AND column_name = 'engagement_document_id'
	) THEN
		EXECUTE 'ALTER TABLE public.engagementdocument RENAME COLUMN engagement_document_id TO engagementdocumentid';
	END IF;
END$$;

-- engagement log
DO $$
BEGIN
	IF EXISTS(
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'engagementlog' AND column_name = 'engagementtype_refid'
	) THEN
		EXECUTE 'ALTER TABLE public.engagementlog RENAME COLUMN engagementtype_refid TO engagementtypeid';
	END IF;
END$$;

-- jobrole (jobapplication/jobrole historical naming)
DO $$
BEGIN
	IF EXISTS(
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'jobrole' AND column_name = 'introduced_by_contactid'
	) THEN
		EXECUTE 'ALTER TABLE public.jobrole RENAME COLUMN introduced_by_contactid TO introducedbycontactid';
	END IF;
	IF EXISTS(
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'jobrole' AND column_name = 'source_channel_id'
	) THEN
		EXECUTE 'ALTER TABLE public.jobrole RENAME COLUMN source_channel_id TO sourcechannelid';
	END IF;
	IF EXISTS(
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'jobrole' AND column_name = 'status_id'
	) THEN
		EXECUTE 'ALTER TABLE public.jobrole RENAME COLUMN status_id TO statusid';
	END IF;
END$$;

-- leads/lead
DO $$
BEGIN
	IF EXISTS(
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'connected_on'
	) THEN
		EXECUTE 'ALTER TABLE public.leads RENAME COLUMN connected_on TO connectedon';
	END IF;
	IF EXISTS(
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'linkedin_url'
	) THEN
		EXECUTE 'ALTER TABLE public.leads RENAME COLUMN linkedin_url TO linkedinurl';
	END IF;
	IF EXISTS(
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'lead' AND column_name = 'connected_on'
	) THEN
		EXECUTE 'ALTER TABLE public.lead RENAME COLUMN connected_on TO connectedon';
	END IF;
	IF EXISTS(
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'lead' AND column_name = 'linkedin_url'
	) THEN
		EXECUTE 'ALTER TABLE public.lead RENAME COLUMN linkedin_url TO linkedinurl';
	END IF;
END$$;


COMMIT;