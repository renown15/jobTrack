-- Migration: add Promoted To Contact refdata for lead review status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ReferenceData WHERE lower(refdataclass) = 'lead_review_status' AND lower(refvalue) = 'promoted to contact'
    ) THEN
        INSERT INTO ReferenceData (refdataclass, refvalue)
        VALUES ('lead_review_status', 'Promoted To Contact');
    END IF;
END$$;


select *
from ReferenceData
ROLLBACK