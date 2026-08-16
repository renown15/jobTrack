-- Migration 007: Make legacy columns nullable for backward compatibility transition
-- 
-- This migration makes the old columns nullable so that we can use the new reference
-- data columns without hitting NOT NULL constraints during the transition period.

-- Make old Contact.isrecruiter nullable (if not already)
ALTER TABLE contact 
ALTER COLUMN isrecruiter DROP NOT NULL;

-- Make old JobRole.status nullable to allow transition to status_id
ALTER TABLE jobrole 
ALTER COLUMN status DROP NOT NULL;

-- Make old JobRole.sourcechannel nullable (was already nullable but making explicit)
ALTER TABLE jobrole 
ALTER COLUMN sourcechannel DROP NOT NULL;

-- Add comments documenting the deprecation
COMMENT ON COLUMN contact.isrecruiter IS 'DEPRECATED: Use role_type_id instead. Kept for backward compatibility during transition.';
COMMENT ON COLUMN jobrole.status IS 'DEPRECATED: Use status_id instead. Kept for backward compatibility during transition.';
COMMENT ON COLUMN jobrole.sourcechannel IS 'DEPRECATED: Use source_channel_id instead. Kept for backward compatibility during transition.';
