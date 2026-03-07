-- 050_create_action_plan_tables.sql
-- Migration: create Action Plan tables (task, taskactionlog, tasktarget)

ROLLBACK;

BEGIN;

-- Sequences (explicit for clarity)

CREATE SEQUENCE IF NOT EXISTS public.task_taskid_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;


CREATE SEQUENCE IF NOT EXISTS public.task_action_log_id_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;


CREATE SEQUENCE IF NOT EXISTS public.task_target_id_seq AS integer
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

-- Main `task` table

CREATE TABLE IF NOT EXISTS public.task (taskid integer NOT NULL,
                                                       applicantid integer NULL,
                                                                           name text NOT NULL,
                                                                                     duedate date NULL,
                                                                                                  notes text NULL,
                                                                                                             created_at timestamptz DEFAULT now(),
                                                                                                                                            updated_at timestamptz DEFAULT now(),
                                                                                                                                                                           CONSTRAINT task_pkey PRIMARY KEY (taskid));


ALTER SEQUENCE public.task_taskid_seq OWNED BY public.task.taskid;


ALTER TABLE ONLY public.task
ALTER COLUMN taskid
SET DEFAULT nextval('public.task_taskid_seq'::regclass);


CREATE INDEX IF NOT EXISTS idx_task_applicantid ON public.task (applicantid);

-- `taskactionlog` table: logs for tasks

CREATE TABLE IF NOT EXISTS public.taskactionlog (id integer NOT NULL,
                                                            taskid integer NOT NULL,
                                                                           commentary text NOT NULL,
                                                                                           logdate timestamptz DEFAULT now(),
                                                                                                                       CONSTRAINT taskactionlog_pkey PRIMARY KEY (id));


ALTER SEQUENCE public.task_action_log_id_seq OWNED BY public.taskactionlog.id;


ALTER TABLE ONLY public.taskactionlog
ALTER COLUMN id
SET DEFAULT nextval('public.task_action_log_id_seq'::regclass);


CREATE INDEX IF NOT EXISTS idx_taskactionlog_taskid ON public.taskactionlog (taskid);

-- `tasktarget` table: links a task to a target (contact/organisation/lead)

CREATE TABLE IF NOT EXISTS public.tasktarget (id integer NOT NULL,
                                                         taskid integer NOT NULL,
                                                                        targettype integer NOT NULL,
                                                                                           targetid integer NOT NULL,
                                                                                                            created_at timestamptz DEFAULT now(),
                                                                                                                                           CONSTRAINT tasktarget_pkey PRIMARY KEY (id));


ALTER SEQUENCE public.task_target_id_seq OWNED BY public.tasktarget.id;


ALTER TABLE ONLY public.tasktarget
ALTER COLUMN id
SET DEFAULT nextval('public.task_target_id_seq'::regclass);


CREATE INDEX IF NOT EXISTS idx_tasktarget_taskid ON public.tasktarget (taskid);


CREATE INDEX IF NOT EXISTS idx_tasktarget_type_targetid ON public.tasktarget (targettype, targetid);

-- Foreign keys

ALTER TABLE ONLY public.taskactionlog ADD CONSTRAINT taskactionlog_taskid_fkey
FOREIGN KEY (taskid) REFERENCES public.task(taskid) ON
DELETE CASCADE;


ALTER TABLE ONLY public.tasktarget ADD CONSTRAINT tasktarget_taskid_fkey
FOREIGN KEY (taskid) REFERENCES public.task(taskid) ON
DELETE CASCADE;


ALTER TABLE ONLY public.tasktarget ADD CONSTRAINT tasktarget_targettype_fkey
FOREIGN KEY (targettype) REFERENCES public.referencedata(refid);

-- Seed reference rows for target types

INSERT INTO public.referencedata (refdataclass, refvalue)
VALUES ('target_type', 'Contact'),
       ('target_type', 'Organisation'),
       ('target_type', 'Lead') ON CONFLICT (refdataclass, refvalue) DO NOTHING;


COMMIT;


COMMIT;