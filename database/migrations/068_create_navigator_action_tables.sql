-- Migration: 068_create_navigator_action_tables.sql
-- Purpose: Add navigatoraction and navigatoractioninput tables to support configurable Navigator actions

BEGIN;

-- Navigator actions (configurable buttons/actions shown in Navigator UI)
CREATE TABLE IF NOT EXISTS public.navigatoraction (
    actionid SERIAL PRIMARY KEY,
    actionname character varying(255) NOT NULL,
    sortorderid integer DEFAULT 0 NOT NULL
);

-- Inputs for navigator actions. `inputtypeid` refers to an entry in `referencedata` (class NAVIGATOR_INPUT_TYPE)
CREATE TABLE IF NOT EXISTS public.navigatoractioninput (
    navigatoractioninputid SERIAL PRIMARY KEY,
    actionid integer NOT NULL REFERENCES public.navigatoraction(actionid) ON DELETE CASCADE,
    inputtypeid integer REFERENCES public.referencedata(refid) ON DELETE SET NULL,
    inputvalue text
);

CREATE INDEX IF NOT EXISTS idx_navigatoraction_sortorder ON public.navigatoraction(sortorderid);
CREATE INDEX IF NOT EXISTS idx_navigatoractioninput_actionid ON public.navigatoractioninput(actionid);

COMMIT;
