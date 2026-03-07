-- Migration: create navigator briefing tables
-- Adds navigatorbriefingquestions and navigatorapplicantbriefing
 DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'navigatorbriefingquestions'
    ) THEN
        CREATE TABLE public.navigatorbriefingquestions (
            questionid serial PRIMARY KEY,
            questionorderindex integer NOT NULL DEFAULT 0,
            questiontext text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'navigatorapplicantbriefing'
    ) THEN
        CREATE TABLE public.navigatorapplicantbriefing (
            briefingid serial PRIMARY KEY,
            applicantid integer NOT NULL,
            batchcreationtimestamp timestamptz NOT NULL,
            questionid integer NOT NULL,
            questiontext text NOT NULL,
            questionanswer text,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT fk_question FOREIGN KEY (questionid) REFERENCES public.navigatorbriefingquestions(questionid) ON DELETE RESTRICT
        );

        CREATE INDEX IF NOT EXISTS idx_navbrief_applicant_batch ON public.navigatorapplicantbriefing(applicantid, batchcreationtimestamp);
    END IF;
END$$;


COMMIT