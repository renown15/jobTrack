-- 062_add_tasktarget_unique_constraint.sql
-- Ensure a task cannot have the same target (type+id) added more than once for the same applicant.
-- Adds a defensive unique index on (taskid, targettype, targetid, applicantid).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'uniq_tasktarget_task_target_applicant' AND n.nspname = 'public'
    ) THEN
        CREATE UNIQUE INDEX uniq_tasktarget_task_target_applicant ON public.tasktarget (taskid, targettype, targetid, applicantid);
    END IF;
END
$$;
