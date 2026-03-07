-- 056_create_networking_tables.sql
-- Create networking events and mapping to action plan tasks
BEGIN;

-- Sequence for networking_event primary key

CREATE SEQUENCE IF NOT EXISTS public.networking_event_eventid_seq;


CREATE TABLE IF NOT EXISTS public.networking_event (eventid integer NOT NULL DEFAULT nextval('public.networking_event_eventid_seq'::regclass),
                                                                                     applicantid integer NOT NULL,
                                                                                                         eventname text NOT NULL,
                                                                                                                        eventdate date NOT NULL,
                                                                                                                                       notes text NULL,
                                                                                                                                                  eventtypeid integer NOT NULL,
                                                                                                                                                                      created_at timestamp with time zone DEFAULT now(),
                                                                                                                                                                                                                  updated_at timestamp with time zone DEFAULT now(),
                                                                                                                                                                                                                                                              CONSTRAINT networking_event_pkey PRIMARY KEY (eventid));


CREATE INDEX IF NOT EXISTS idx_networking_event_applicantid ON public.networking_event (applicantid);

-- Mapping table to link networking events to action plan tasks

CREATE SEQUENCE IF NOT EXISTS public.networking_event_task_id_seq;


CREATE TABLE IF NOT EXISTS public.networking_event_task (id integer NOT NULL DEFAULT nextval('public.networking_event_task_id_seq'::regclass),
                                                                                     applicantid integer NOT NULL,
                                                                                                         eventid integer NOT NULL,
                                                                                                                         taskid integer NOT NULL,
                                                                                                                                        created_at timestamp with time zone DEFAULT now(),
                                                                                                                                                                                    CONSTRAINT networking_event_task_pkey PRIMARY KEY (id));


CREATE INDEX IF NOT EXISTS idx_networking_event_task_eventid ON public.networking_event_task (eventid);


CREATE INDEX IF NOT EXISTS idx_networking_event_task_taskid ON public.networking_event_task (taskid);

-- Foreign keys

ALTER TABLE ONLY public.networking_event ADD CONSTRAINT networking_event_applicantid_fkey
FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid);


ALTER TABLE ONLY public.networking_event ADD CONSTRAINT networking_event_eventtypeid_fkey
FOREIGN KEY (eventtypeid) REFERENCES public.referencedata(refid);


ALTER TABLE ONLY public.networking_event_task ADD CONSTRAINT networking_event_task_applicantid_fkey
FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid);


ALTER TABLE ONLY public.networking_event_task ADD CONSTRAINT networking_event_task_eventid_fkey
FOREIGN KEY (eventid) REFERENCES public.networking_event(eventid) ON
DELETE CASCADE;


ALTER TABLE ONLY public.networking_event_task ADD CONSTRAINT networking_event_task_taskid_fkey
FOREIGN KEY (taskid) REFERENCES public.task(taskid) ON
DELETE CASCADE;

-- Seed some default network event types if they don't exist

INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT v.refdataclass, 
       v.refvalue
FROM (
      VALUES ('network_event_type',
              'Networking dinner'), ('network_event_type',
                                     'Conference')) AS v(refdataclass, refvalue)
WHERE NOT EXISTS
        (SELECT 1
         FROM public.referencedata r
         WHERE r.refdataclass = v.refdataclass
             AND r.refvalue = v.refvalue );


COMMIT;