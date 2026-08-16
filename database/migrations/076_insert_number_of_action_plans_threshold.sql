-- Insert threshold config for the consolidated number_of_action_plans metric
-- This row populates referencedata(refdataclass='nav_insight_metric_thresholds') with JSON describing thresholds

INSERT INTO public.referencedata (refid, refdataclass, refvalue)
VALUES (nextval('public.referencedata_refid_seq'), 'nav_insight_metric_thresholds', '{"metric":"number_of_action_plans","unit":"count","red":0,"amber":5,"green":10,"description":"Number of action plans (tasks) that have at least one target. 0=red, >=5=amber, >=10=green."}');

-- Optionally, delete legacy per-target action plan thresholds if you want to fully replace them.
-- For safety we do not delete existing rows here.
