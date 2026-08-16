-- Migration: 076_add_update_snapshot_endpoint.sql
-- Add comment documenting the PUT endpoint for updating snapshots
-- Note: This is a documentation-only migration. The actual endpoint
-- implementation is in jobtrack_navigator_ai/__init__.py

BEGIN;

COMMENT ON TABLE public.applicantmetrichistory IS 
'Stores historic snapshots of navigator metrics. 
Supports GET /api/<applicantid>/navigator/metricshistory (list),
GET /api/<applicantid>/navigator/metricshistory/<id> (read),
and PUT /api/<applicantid>/navigator/metricshistory/<id> (update).
Updates are used to merge LLM results into snapshots after initial creation.';

COMMIT;
