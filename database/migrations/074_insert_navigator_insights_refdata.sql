-- Migration: 074_insert_navigator_insights_refdata.sql
-- Insert referencedata rows for Navigator Insights metrics and actions
 BEGIN;

-- Navigator Insights metrics (refdataclass = 'navigator_insight_metric')
-- Replace previous navigator_insight_metric rows with thresholds-only entries
-- Note: rows inserted use refdataclass = 'nav_insight_metric_thresholds'

INSERT INTO public.referencedata (refid, refdataclass, refvalue)
VALUES (nextval('public.referencedata_refid_seq'), 'nav_insight_metric_thresholds', '{"metric":"dormant_contacts","unit":"percent","red":5,"amber":2,"green":2}'),
       (nextval('public.referencedata_refid_seq'), 'nav_insight_metric_thresholds', '{"metric":"active_contacts_not_met","unit":"percent","red":10,"amber":5,"green":5}'),
       (nextval('public.referencedata_refid_seq'), 'nav_insight_metric_thresholds', '{"metric":"met_no_cv","unit":"percent","red":5,"amber":2,"green":2}'),
       (nextval('public.referencedata_refid_seq'), 'nav_insight_metric_thresholds', '{"metric":"not_checked_in_with","unit":"percent","red":50,"amber":25,"green":10}'),
       (nextval('public.referencedata_refid_seq'), 'nav_insight_metric_thresholds', '{"metric":"roles_not_followed_up","unit":"percent","red":10,"amber":5,"green":2}'),
       (nextval('public.referencedata_refid_seq'), 'nav_insight_metric_thresholds', '{"metric":"meetings_undocumented","unit":"count","red":10,"amber":5,"green":5}'),
       (nextval('public.referencedata_refid_seq'), 'nav_insight_metric_thresholds', '{"metric":"new_engagements_last_month","unit":"count","red":0,"amber":1,"green":5}'),
       (nextval('public.referencedata_refid_seq'), 'nav_insight_metric_thresholds', '{"metric":"new_contacts_last_month","unit":"count","red":0,"amber":1,"green":5}'),
       (nextval('public.referencedata_refid_seq'), 'nav_insight_metric_thresholds', '{"metric":"new_contacts_from_leads_last_month","unit":"count","red":0,"amber":1,"green":5}'),
       (nextval('public.referencedata_refid_seq'), 'nav_insight_metric_thresholds', '{"metric":"contacts_with_action_plans","unit":"percent","red":0,"amber":5,"green":10}'),
       (nextval('public.referencedata_refid_seq'), 'nav_insight_metric_thresholds', '{"metric":"organisations_with_action_plans","unit":"count"}'),
       (nextval('public.referencedata_refid_seq'), 'nav_insight_metric_thresholds', '{"metric":"leads_with_action_plans","unit":"count"}'),
       (nextval('public.referencedata_refid_seq'), 'nav_insight_metric_thresholds', '{"metric":"overdue_action_plans","unit":"count","green":0,"amber":1,"red":10}'),
       (nextval('public.referencedata_refid_seq'), 'nav_insight_metric_thresholds', '{"metric":"networking_events_last_3_months","unit":"count","green":2,"amber":1,"red":0}'),
       (nextval('public.referencedata_refid_seq'), 'nav_insight_metric_thresholds', '{"metric":"leads_to_be_reviewed","unit":"percent","red":50,"amber":25,"green":10}'),
       (nextval('public.referencedata_refid_seq'), 'nav_insight_metric_thresholds', '{"metric":"cv_score","unit":"score","red":3,"amber":3,"green":7}'),
       (nextval('public.referencedata_refid_seq'), 'nav_insight_metric_thresholds', '{"metric":"linkedin_profile_score","unit":"score","red":3,"amber":3,"green":7}'),
       (nextval('public.referencedata_refid_seq'), 'nav_insight_metric_thresholds', '{"metric":"navigator_briefing_score","unit":"score","red":3,"amber":3,"green":7}');

-- Navigator Actions (refdataclass = 'navigator_action')

INSERT INTO public.referencedata (refid, refdataclass, refvalue)
VALUES (nextval('public.referencedata_refid_seq'), 'navigator_action', '{"action":"REVIEW_APPLICANT_BRIEFING","label":"Review Applicant Briefing"}');


COMMIT;