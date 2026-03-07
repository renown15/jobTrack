-- Migration: create leads table and reference data for lead review statuses
-- Creates a new table `leads` and inserts ReferenceData entries for class 'lead_review_status'
 BEGIN;

-- Create leads table

CREATE TABLE IF NOT EXISTS leads
    (leadid SERIAL PRIMARY KEY,
                   firstname TEXT, lastname TEXT, linkedin_url TEXT, email TEXT, company TEXT, position TEXT, connected_on DATE, reviewdate TIMESTAMP WITH TIME ZONE,
                                                                                                                                                                reviewoutcomeid INTEGER REFERENCES referencedata(refid) ON DELETE
     SET NULL,
         created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
                                                     updated_at TIMESTAMP WITH TIME ZONE DEFAULT now());

-- Add reference data class and values for lead_review_status if ReferenceData exists
-- Be schema-aware: support both new (refdataclass/refvalue) and legacy (category/code) layouts
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referencedata') THEN
        -- New schema: refdataclass/refvalue
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'referencedata' AND column_name = 'refdataclass'
        ) THEN
            IF NOT EXISTS (SELECT 1 FROM referencedata WHERE refdataclass = 'lead_review_status' AND refvalue = 'Engage Urgently') THEN
                INSERT INTO referencedata (refdataclass, refvalue) VALUES ('lead_review_status', 'Engage Urgently');
            END IF;
            IF NOT EXISTS (SELECT 1 FROM referencedata WHERE refdataclass = 'lead_review_status' AND refvalue = 'Potentially Engage') THEN
                INSERT INTO referencedata (refdataclass, refvalue) VALUES ('lead_review_status', 'Potentially Engage');
            END IF;
            IF NOT EXISTS (SELECT 1 FROM referencedata WHERE refdataclass = 'lead_review_status' AND refvalue = 'Not Relevant at this Time') THEN
                INSERT INTO referencedata (refdataclass, refvalue) VALUES ('lead_review_status', 'Not Relevant at this Time');
            END IF;

        -- Legacy schema: category/code
        ELSIF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'referencedata' AND column_name = 'category'
        ) THEN
            IF NOT EXISTS (SELECT 1 FROM referencedata WHERE category = 'lead_review_status' AND code = 'Engage Urgently') THEN
                INSERT INTO referencedata (category, code) VALUES ('lead_review_status', 'Engage Urgently');
            END IF;
            IF NOT EXISTS (SELECT 1 FROM referencedata WHERE category = 'lead_review_status' AND code = 'Potentially Engage') THEN
                INSERT INTO referencedata (category, code) VALUES ('lead_review_status', 'Potentially Engage');
            END IF;
            IF NOT EXISTS (SELECT 1 FROM referencedata WHERE category = 'lead_review_status' AND code = 'Not Relevant at this Time') THEN
                INSERT INTO referencedata (category, code) VALUES ('lead_review_status', 'Not Relevant at this Time');
            END IF;

        ELSE
            -- Unrecognized schema for referencedata; do nothing to avoid breaking legacy or custom schemas.
        END IF;
    END IF;
END$$;


COMMIT;