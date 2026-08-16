-- Generated seed SQL for referencedata and sector
-- Run in production with:
--   psql -d yourdb -f database/seed_referencedata_and_sector.sql

-- referencedata
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('engagement_type', 'Discussion') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('engagement_type', 'Interview') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('source_channel', 'LinkedIn') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('source_channel', 'Referral') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('source_channel', 'Direct') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('source_channel', 'Agency') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('engagement_type', 'Email / WhatsApp / LinkedIn Message') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('application_status', 'Yet to apply') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('application_status', 'Applied') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('application_status', 'Rejected') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('contact_role_type', 'Recruiter') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('contact_role_type', 'Friend/Colleague') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('contact_role_type', 'Contact') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('contact_role_type', 'Interviewer') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('source_channel', 'Other') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('application_status', 'Interview') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('document_type', 'CV') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('document_type', 'Covering Letter') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('next_step', 'Await response') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('next_step', 'Send CV') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('next_step', 'Meeting to be scheduled') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('next_step', 'Chase on LI') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('next_step', 'Send LI Message') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('next_step', 'Send update') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('next_step', 'Meeting Scheduled') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('next_step', 'Arrange meeting') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('next_step', 'Chase on WA') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('next_step', 'Arrange call') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('next_step', 'Chase on email') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('lead_review_status', 'Potentially Engage') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('lead_review_status', 'Not Relevant at this Time') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('lead_review_status', 'Promoted To Contact') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('application_status', 'Interviewed - No offer') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('application_status', 'Never heard back') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('application_status', 'Not actively pursuing') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('heat_threshold', 'cold:60') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('heat_threshold', 'warm:30') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('jobrole_status', 'Imported') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('engagement_type', 'Note or Commentary') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('action_plan_target_type', 'Contact') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('action_plan_target_type', 'Organisation') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('action_plan_target_type', 'Lead') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('network_event_type', 'Networking dinner') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('network_event_type', 'Conference') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('action_plan_target_type', 'Sector') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('lead_review_status', 'Added To Action Plan') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('document_type', 'LinkedIn Profile') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('search_status', 'Working but looking for a role') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('search_status', 'Not currently working') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('document_type', 'Excel Download') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('NAVIGATOR_INPUT_TYPE', 'PROMPT_BUILD') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('NAVIGATOR_INPUT_TYPE', 'DOCUMENT_GET') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('NAVIGATOR_INPUT_TYPE', 'DB_QUERY') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('NAVIGATOR_INPUT_TYPE', 'APPLICANT_PROFILE') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('nav_insight_metric_thresholds', '{"metric":"dormant_contacts","unit":"percent","red":5,"amber":2,"green":2}') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('nav_insight_metric_thresholds', '{"metric":"active_contacts_not_met","unit":"percent","red":10,"amber":5,"green":5}') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('nav_insight_metric_thresholds', '{"metric":"met_no_cv","unit":"percent","red":5,"amber":2,"green":2}') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('nav_insight_metric_thresholds', '{"metric":"not_checked_in_with","unit":"percent","red":50,"amber":25,"green":10}') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('nav_insight_metric_thresholds', '{"metric":"roles_not_followed_up","unit":"percent","red":10,"amber":5,"green":2}') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('nav_insight_metric_thresholds', '{"metric":"meetings_undocumented","unit":"count","red":10,"amber":5,"green":5}') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('nav_insight_metric_thresholds', '{"metric":"new_engagements_last_month","unit":"count","red":0,"amber":1,"green":5}') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('nav_insight_metric_thresholds', '{"metric":"new_contacts_last_month","unit":"count","red":0,"amber":1,"green":5}') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('nav_insight_metric_thresholds', '{"metric":"new_contacts_from_leads_last_month","unit":"count","red":0,"amber":1,"green":5}') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('nav_insight_metric_thresholds', '{"metric":"contacts_with_action_plans","unit":"percent","red":0,"amber":5,"green":10}') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('nav_insight_metric_thresholds', '{"metric":"organisations_with_action_plans","unit":"count"}') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('nav_insight_metric_thresholds', '{"metric":"leads_with_action_plans","unit":"count"}') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('nav_insight_metric_thresholds', '{"metric":"overdue_action_plans","unit":"count","green":0,"amber":1,"red":10}') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('nav_insight_metric_thresholds', '{"metric":"networking_events_last_3_months","unit":"count","green":2,"amber":1,"red":0}') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('nav_insight_metric_thresholds', '{"metric":"leads_to_be_reviewed","unit":"percent","red":50,"amber":25,"green":10}') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('nav_insight_metric_thresholds', '{"metric":"cv_score","unit":"score","red":3,"amber":3,"green":7}') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('nav_insight_metric_thresholds', '{"metric":"linkedin_profile_score","unit":"score","red":3,"amber":3,"green":7}') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('nav_insight_metric_thresholds', '{"metric":"navigator_briefing_score","unit":"score","red":3,"amber":3,"green":7}') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('nav_insight_metric_thresholds', '{"metric":"number_of_action_plans","unit":"count","red":0,"amber":5,"green":10,"description":"Number of action plans (tasks) that have at least one target. 0=red, >=5=amber, >=10=green."}') ON CONFLICT (refdataclass, refvalue) DO NOTHING;

-- New reference data for engagement contact type (Individual vs Group)
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('engagement_contact_type', 'Individual Contact') ON CONFLICT (refdataclass, refvalue) DO NOTHING;
INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('engagement_contact_type', 'Contact Group') ON CONFLICT (refdataclass, refvalue) DO NOTHING;

-- sector
INSERT INTO public.sector (summary, description) VALUES ('Consulting & Professional Services', 'Audit, tax, consulting, and advisory services globally') ON CONFLICT (summary) DO NOTHING;
INSERT INTO public.sector (summary, description) VALUES ('Legal Services', 'Law firm offering legal advisory and litigation services') ON CONFLICT (summary) DO NOTHING;
INSERT INTO public.sector (summary, description) VALUES ('Financial Infrastructure', 'London Stock Exchange Group – capital markets, data, and analytics') ON CONFLICT (summary) DO NOTHING;
INSERT INTO public.sector (summary, description) VALUES ('Private Equity', 'Investment firm focused on acquiring and growing software companies') ON CONFLICT (summary) DO NOTHING;
INSERT INTO public.sector (summary, description) VALUES ('Government', 'UK government department or agency') ON CONFLICT (summary) DO NOTHING;
INSERT INTO public.sector (summary, description) VALUES ('Insurance', 'Global insurance solutions for individuals and businesses') ON CONFLICT (summary) DO NOTHING;
INSERT INTO public.sector (summary, description) VALUES ('Test/Development', 'Test and development organizations') ON CONFLICT (summary) DO NOTHING;
INSERT INTO public.sector (summary, description) VALUES ('Under NDA', 'Organizations under non-disclosure agreement') ON CONFLICT (summary) DO NOTHING;
INSERT INTO public.sector (summary, description) VALUES ('Recruitment & Executive Search', 'Consolidated sector - recruitment and executive search services') ON CONFLICT (summary) DO NOTHING;
INSERT INTO public.sector (summary, description) VALUES ('Banking & Financial Services', 'Consolidated sector - banking and financial services') ON CONFLICT (summary) DO NOTHING;
INSERT INTO public.sector (summary, description) VALUES ('Investment & Asset Management', 'Consolidated sector - investment and asset management') ON CONFLICT (summary) DO NOTHING;
INSERT INTO public.sector (summary, description) VALUES ('Technology & Software', 'Consolidated sector - technology, software, and fintech') ON CONFLICT (summary) DO NOTHING;
INSERT INTO public.sector (summary, description) VALUES ('Information & Media Services', 'Consolidated sector - information and media services') ON CONFLICT (summary) DO NOTHING;
INSERT INTO public.sector (summary, description) VALUES ('Healthcare & Pharmaceuticals', 'Healthcare and pharmaceutical industry') ON CONFLICT (summary) DO NOTHING;
INSERT INTO public.sector (summary, description) VALUES ('Consumer Goods & Retail', 'Consolidated sector - consumer goods, retail, and entertainment') ON CONFLICT (summary) DO NOTHING;
INSERT INTO public.sector (summary, description) VALUES ('Other', 'Other/uncategorized sectors') ON CONFLICT (summary) DO NOTHING;
INSERT INTO public.sector (summary, description) VALUES ('Telecoms', 'Jobs related to telecoms services.') ON CONFLICT (summary) DO NOTHING;
INSERT INTO public.sector (summary, description) VALUES ('Personal Connections', 'Contacts that aren''t aligned to Organisations') ON CONFLICT (summary) DO NOTHING;

