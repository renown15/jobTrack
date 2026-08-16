-- 052_migrate_contact_nextstep_to_tasks.sql
-- Migrate contact.next_step_refid values into action plan tasks and map contacts to those tasks.
-- For each distinct next_step_refid present on contacts, create a Task with the referencedata.refvalue as the task name (if not already present).
-- Then create tasktarget rows linking that task to each contact that had that next_step_refid.
-- Finally, clear contact.next_step_refid to avoid double-migration.
 BEGIN;

-- 1. Create tasks for each distinct next_step_refid (use the refvalue as the task name).
WITH distinct_steps AS
    (SELECT DISTINCT c.next_step_refid AS refid,
                     rd.refvalue
     FROM public.contact c
     JOIN public.referencedata rd ON c.next_step_refid = rd.refid
     WHERE c.next_step_refid IS NOT NULL )
INSERT INTO public.task (applicantid, name, duedate, notes)
SELECT NULL AS applicantid,
       ds.refvalue AS name,
       NULL AS duedate,
       NULL AS notes
FROM distinct_steps ds
WHERE NOT EXISTS
        (SELECT 1
         FROM public.task t
         WHERE t.name = ds.refvalue );

-- 2. Insert tasktarget mappings linking contacts to the new/existing tasks for their next_step_refid.
-- Determine the refid used for contact-type targets in the action plan refdata class.
DO $$
DECLARE
    contact_target_refid integer;
BEGIN
    SELECT refid INTO contact_target_refid FROM public.referencedata
    WHERE refdataclass = 'action_plan_target_type' AND lower(refvalue) LIKE 'contact%' LIMIT 1;

    IF contact_target_refid IS NULL THEN
        RAISE NOTICE 'No action_plan_target_type=Contact entry found in referencedata; aborting contact -> tasktarget migration.';
        RETURN;
    END IF;

    -- Insert mappings avoiding duplicates
    INSERT INTO public.tasktarget (taskid, targettype, targetid)
    SELECT t.taskid, contact_target_refid, c.contactid
    FROM public.contact c
    JOIN public.referencedata rd ON c.next_step_refid = rd.refid
    JOIN public.task t ON t.name = rd.refvalue
    LEFT JOIN public.tasktarget tt ON tt.taskid = t.taskid AND tt.targettype = contact_target_refid AND tt.targetid = c.contactid
    WHERE c.next_step_refid IS NOT NULL AND tt.id IS NULL;
END $$;

-- 3. Clear migrated next_step_refid values from contacts

UPDATE public.contact
SET next_step_refid = NULL
WHERE next_step_refid IS NOT NULL;


COMMIT;