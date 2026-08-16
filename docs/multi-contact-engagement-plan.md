# Multi-Contact Engagements — Implementation Plan

This document describes the design and implementation plan to support engagements linked to multiple contacts.

## Goals

- Allow a single engagement record to be associated with more than one contact.
- Keep existing behavior for single-contact engagements.
- Minimize disruption to existing analytics and UI; make counting semantics explicit.
- Provide clear migration, API and UI changes with tests and roll-out steps.

## Summary of database changes

- New objects (already added in migrations):
  - `contactgroup` — named contact groups (columns: `contactgroupid`, `name`, `applicantid`, timestamps).
  - `contactgroupmembers` — mapping table linking `contactgroupid` → `contactid` (+ `applicantid`).
- `engagementlog` schema change (migration 084):
  - Add `contacttypeid` (FK into `referencedata.refid`, class `engagement_contact_type`) to indicate whether `contactid` refers to an individual contact or a contact group.
  - Reuse the existing `contactid` column for both types (polymorphic semantics driven by `contacttypeid`).
  - Make `contactid` nullable in schema where appropriate; add index `idx_engagementlog_contacttypeid` and a CHECK constraint to ensure `contacttypeid` is present when `contactid` is set.

Notes: the repository currently contains migration `084_create_contact_group_and_engagement_contacttype.sql` implementing the above. Ensure this is the canonical migration applied in deployment pipelines.

## API contract (create / update engagement)

Request (POST /api/<applicantid>/engagements):

{
  "contact_ids": [123, 456],       // optional - array for multi-contact
  "contactid": 123,                // optional - existing single-contact payload (backcompat)
  "contacttypeid": 42,             // optional - we will derive if omitted (see rules)
  "log_date": "2026-01-06",
  "log_entry": "Spoke to hiring team",
  "engagementtypeid": 7
}

Behavior & validation rules:
- If `contact_ids` is supplied with length > 1:
  - Create a new `contactgroup` (or re-use existing group if we add dedupe rules later). Insert `contactgroupmembers` rows for each contact.
  - Set `engagementlog.contactid` to the created `contactgroup.contactgroupid` and set `contacttypeid` to the `referencedata.refid` for `Contact Group`.
- If `contact_ids` length == 1 or `contactid` supplied:
  - Set `engagementlog.contactid` to the contact id and set `contacttypeid` to `Individual Contact` refid.
- If `contacttypeid` is supplied it must correspond to one of the seeded `engagement_contact_type` rows; otherwise return 400.

Auto-delete groups policy (NEW: apply by default):
- When a `contactgroup`'s membership is reduced to 1 or 0 members (for example, via an engagement update, explicit member removal, or contact deletion), the system will automatically delete the `contactgroup` row.
- If a group is deleted because it has exactly 1 remaining member, all `engagementlog` rows that referenced that group will be updated to reference the remaining individual contact and their `contacttypeid` will be set to the `Individual Contact` refid (in a single transaction to preserve consistency).
- If a group is deleted because it has 0 members, all `engagementlog` rows that referenced that group will have `contactid` set to NULL and `contacttypeid` set to NULL. API consumers must handle engagements with no linked contacts (these are effectively unassigned engagement records).
- The auto-delete operation is performed inside a transaction and preserves an audit/log entry describing the change (recommended — see "Audit & migration notes" below).

Response (201 on create):

{
  "engagementlogid": 999,
  "contacts": [ { "contactid": 123, "name": "Alice" }, { "contactid": 456, "name": "Bob" } ],
  "contacttypeid": 43
}

GET /api/.../engagements should return `contacts` array for each engagement.

## Backend implementation (high level)

Files to change: `app.py` (helpers `_engagement_create_impl`, `_engagement_update_impl`, and engagement GET/list handlers). Update or add helper functions in a small block near the engagement helpers.

Implementation steps:

1. Parse `contact_ids` (array) from the request body. Accept legacy `contactid` for single-contact payloads.
2. Validate each contact id exists and belongs to the requesting `applicantid`.
3. If multiple contact ids:
   - Create a `contactgroup` row with `applicantid` and a generated name (e.g., `Group: <engagementlogid>`; or `Generated group <timestamp>`), returning its `contactgroupid`.
   - Insert rows into `contactgroupmembers` for each contact (set `applicantid`).
   - Insert `engagementlog` with `contactid = contactgroupid` and `contacttypeid = refid('Contact Group')`.
4. If single contact:
   - Insert `engagementlog` with `contactid = <contactid>` and `contacttypeid = refid('Individual Contact')`.
5. For updates, reconcile the group and apply auto-delete policy:
  - If changing linked contacts to multiple when previously single: create a generated `contactgroup` and `contactgroupmembers`, update `engagementlog.contactid` and `contacttypeid` to point to the group.
  - If updating a group so that its membership count becomes 1 or 0, automatically delete the `contactgroup` and `contactgroupmembers` rows. When deleting a group with exactly 1 remaining member, update all `engagementlog` rows that referenced that group to point to the remaining contact (set `contacttypeid` to Individual). When deleting a group with 0 members, set `engagementlog.contactid = NULL` and `contacttypeid = NULL` for engagements that referenced that group.
  - All of the above must occur in a transaction to avoid races; if any update fails the transaction should roll back.
6. Update GET/list endpoints to return `contacts` array:
   - If `contacttypeid` == Individual → join `contact` to return single-contact list.
   - If `Contact Group` → join `contactgroupmembers` → `contact` to produce the member list.

Edge cases & choices required (updated):
- Naming/deduplication: whether to create ephemeral groups per engagement or attempt to detect and reuse existing groups. (Default: create new generated group; document for future improvement.)
- Deletion policy: we now apply an automatic deletion policy when membership falls to 1 or 0. This simplifies housekeeping and avoids orphan groups, but requires careful handling of other engagements referencing the group (they will be remapped or unassigned as described above).
- Audit trail: because groups will be auto-deleted, keep an audit log entry recording the membership change and the remapping performed (recommended: write a small `engagement_audit` row or use existing audit mechanisms).
- Concurrency: operations that modify group membership must lock the group (SELECT ... FOR UPDATE) and run in the same transaction that updates `engagementlog` rows, to avoid races where two concurrent edits temporarily leave inconsistent member counts.
- Backcompat & UI: clients may fetch engagements and expect a `contacts` list; after auto-delete the engagement should present the remapped single `contacts` list (or an empty list if unassigned). Document this in the API changelog.

## Backend SQL / queries to update

- Any query that computes per-contact `last_contact_date` or heat must treat engagements that point to a `Contact Group` as touching each member. Options:
  - Eager approach: modify the queries that aggregate engagements to `UNION` engagements that reference a group expanded by `contactgroupmembers`.
  - Precompute approach: maintain a materialized view mapping engagementlogid → contactid(s) (expanded) and use that in heat queries. (Recommend small changes first: expand in SQL where needed.)

Files to inspect & change: existing views and endpoints that back `contactsAllForHeat`, `dim_engagementlog`, and any analytics SQL that joins `engagementlog.contactid = contact.contactid`.

## Engagement → Contact alignment (UI calculation)

Purpose
- Define how backend SQL should expose engagements aligned to contacts for the UI (heat, last-contact, counts, lists) so that both single-contact and group-linked engagements are attributed correctly.

Counting semantics (recommended)
- Count-per-contact: each engagement associated to N contacts should count once for each of those N contacts. This makes heat and last-contact intuitive (a group meeting touches every member).

Chosen approach — On-the-fly SQL expansion (Option A)

- Decision: implement Option A (on-the-fly SQL expansion) for the initial rollout. Option B (materialized mapping view) is deferred for future scaling work.

- What we'll implement now:
  - Modify the backend queries that feed the UI (heat, last-contact, contact metrics endpoints) to expand group-linked engagements at query time. This uses `UNION ALL` or a `JOIN` against `contactgroupmembers` to produce one row per (engagementlogid, member_contactid).
  - Keep `engagement_contact_map` (materialized view) as a documented future improvement only — do not create it in the initial migration.

- Example: per-contact engagement counts (heat) — implement this SQL in the contact metrics endpoint.

```sql
SELECT
  c.contactid,
  COUNT(*) AS engagement_count
FROM (
  -- direct engagements to individual contacts
  SELECT engagementlogid, contactid AS member_contactid
  FROM engagementlog
  WHERE contacttypeid = (SELECT refid FROM referencedata WHERE refdataclass='engagement_contact_type' AND refvalue='Individual')

  UNION ALL

  -- engagements that reference a contact group expanded to members
  SELECT e.engagementlogid, gm.contactid AS member_contactid
  FROM engagementlog e
  JOIN contactgroupmembers gm ON e.contactid = gm.contactgroupid
  WHERE e.contacttypeid = (SELECT refid FROM referencedata WHERE refdataclass='engagement_contact_type' AND refvalue='Contact Group')
) AS expanded
JOIN contact c ON c.contactid = expanded.member_contactid
GROUP BY c.contactid;
```

- Notes on operational impact:
  - Pros: fastest to ship; no extra objects to maintain; immediate correctness for per-contact attribution.
  - Cons: may increase query cost for endpoints that compute metrics across large result sets; monitor performance and add pagination/limits to metric endpoints.

Deferred — Materialized mapping view (Option B)

- Keep the materialized view approach documented as a performance/scale follow-up. If we later need it, implement `engagement_contact_map` and backfill via a migration, then switch the metric endpoints to read from it.

Consistency & updates
- If using a materialized view, update strategy options:
  - Synchronous maintenance via triggers on `engagementlog`, `contactgroupmembers` and `contactgroup` (keeps `engagement_contact_map` current but adds write overhead).
  - Periodic refresh (e.g., nightly or every few minutes) for analytics where slight staleness is acceptable.
- Because we auto-delete groups when membership drops to 1/0, the remapping logic (group → individual or unassigned) must update the `engagement_contact_map` as part of the same transaction that deletes the group. If using triggers, ensure triggers run in the same transaction or the view is refreshed afterwards.

API expectations for the UI
- `GET /api/<applicantid>/engagements` must continue to return the `contacts` array on each engagement (expand group memberships server-side for the response).
- The contacts/heat endpoints used by the UI should use `engagement_contact_map` (or on-the-fly expansion) so heat and last-contact reflect group expansions.
- Provide a targeted endpoint for batch contact metrics so the frontend can request heat/last-contact for only the page of contacts being displayed:

  - `GET /api/<applicantid>/contacts/metrics?contact_ids=1,2,3` → returns count/last_contact for the specified contacts using expanded mapping.

Frontend usage
- When rendering the Hub/Contacts table, call the contact metrics endpoint for the currently visible rows (page/viewport) to avoid full-table computation on the backend per request.
- For visual consistency, perform client-side merges only on the server-provided `contacts` array and metrics; do not attempt to infer member lists client-side from `engagementlog.contactid`.

Performance & index guidance
- Index `engagement_contact_map(member_contactid)` and `engagement_contact_map(engagementlogid)` for fast joins.
- For on-the-fly SQL, index `contactgroupmembers(contactgroupid)` and `engagementlog(contacttypeid, contactid)`.

Handling unassigned engagements
- When a group is auto-deleted and an engagement becomes unassigned (`contactid=NULL`), ensure the UI treats that engagement as present but not attributed to any contact. The contact metrics queries must ignore such engagements unless an admin chooses to reassign them.

Backward compatibility notes
- Existing APIs that return `engagementlog.contactid` should be updated gradually to include `contacts` arrays to avoid breaking clients. Keep `contactid` as a legacy field (may be NULL for unassigned) while `contacts` becomes the canonical membership representation.

Monitoring and validation
- Add QA scripts that compare counts from the expanded-query approach and the materialized view to detect drift after deployment.

## Actionable Plan

Below is an ordered, actionable checklist to implement multi-contact engagements using the chosen on-the-fly SQL expansion approach.

IMPORTANT PREREQUISITE: Steps 1 and 2 (database migration and backfill) MUST be executed and validated in staging before any backend implementation work begins. Do not start backend create/update implementation until the migration and backfill are complete and verified.

Execute the remaining steps in sequence and validate in staging before promoting to production.

1. Apply migration 084
  - Run and verify `database/migrations/084_create_contact_group_and_engagement_contacttype.sql` in staging.
  - Validation: confirm `contactgroup`, `contactgroupmembers`, and the `engagement_contact_type` referencedata rows exist; confirm `engagementlog.contacttypeid` column is present.

2. Backfill single-member groups (one-off)
  - Create `scripts/remap_single_member_groups.sql` to detect `contactgroup` rows with exactly 1 member and remap their engagements to the single contact (or delete empty groups).
  - Run in staging and validate results before proceeding.

3. Implement engagement create (backend)
  - Edit `app.py` `_engagement_create_impl` to accept `contact_ids` or `contactid`, validate contacts belong to `applicantid`, create `contactgroup` + `contactgroupmembers` when `contact_ids.length > 1`, set `engagementlog.contactid` to group id and `contacttypeid` to Group refid, and return `contacts` array in the response.

4. Implement engagement update & reconcile (backend)
  - Edit `app.py` `_engagement_update_impl` to support changing linked contacts single↔multiple. When changing membership, create groups when moving to multiple and invoke group cleanup when membership falls to 1 or 0. Ensure transactional behavior and appropriate locks.

5. Group cleanup & remap helper (backend)
  - Add a helper that, inside a transaction, checks `contactgroupmembers` count and when <=1:
    - If exactly 1 member: update all `engagementlog` rows referencing the group to point to the remaining contact and set `contacttypeid` to Individual; delete the group and its members.
    - If 0 members: update `engagementlog.contactid = NULL` and `contacttypeid = NULL` for referencing engagements; delete the group.
  - Record an audit/log entry for remaps.

6. Expand engagements in GET/list endpoints
  - Update engagement GET/list handlers in `app.py` to include a `contacts` array per engagement (expand group members server-side). Keep `contactid` for backcompat (may be NULL for unassigned).

7. Implement on-the-fly metrics SQL (heat/last-contact)
  - Replace metrics queries used by `contactsAllForHeat` and related endpoints with `UNION ALL` expansion SQL so group-linked engagements attribute to members. Add indexes: `contactgroupmembers(contactgroupid)`, `engagementlog(contacttypeid, contactid)`.

8. API: add batch metrics endpoint
  - Add `GET /api/<applicantid>/contacts/metrics?contact_ids=...` to compute engagement counts and last-contact for specified contacts using on-the-fly expansion. Used by the frontend for visible rows.

9. Frontend API client changes
  - Update `frontend/src/api/client.ts` `createEngagement` and `updateEngagement` to accept `contact_ids` and parse `contacts` in responses, keeping backward compatibility for legacy callers.

10. Frontend UI: QuickCreate / QuickEdit multi-select
   - Replace the single-contact picker in `frontend/src/components/Hub/QuickCreateModal.tsx` (and other edit forms) with an MUI `Autocomplete multiple`. Validate selection and submit `contact_ids`.

11. Frontend UI: engagements list/detail rendering
   - Update `frontend/src/components/EngagementsTable.tsx` and engagement detail views to render multiple contacts as chips or links. Handle unassigned engagements gracefully.

12. Backend tests
   - Add integration tests in `tests/` covering: create engagement with multiple contacts (assert group+members created), update engagement to reduce membership to 1 (assert remap and group deletion), and create single-contact engagement (backcompat).

13. Frontend tests
   - Add unit/RTL tests for `QuickCreateModal` multi-select and engagements list rendering multiple contacts. Verify that `createEngagement` sends `contact_ids` and parses `contacts`.

14. Performance monitoring & QA
   - Add monitoring queries, log group-cleanup actions, and add a QA script comparing on-the-fly counts with historical counts. Deploy to staging and monitor query latency and correctness.

15. Staged rollout & rollback plan
   - Deploy backend changes (accept `contact_ids`) behind a feature flag; enable the frontend after backend is live.
   - Run migration/backfill in staging first. Rollback: redeploy previous backend and restore DB from backup if migration causes critical failures. Document steps in `docs/deploy/multi-contact-rollout.md`.

Each step should be implemented and validated in staging before proceeding to the next.


## Frontend changes

Files to change:
- `frontend/src/api/client.ts` — update `createEngagement` and `updateEngagement` to accept `contact_ids` and parse `contacts` in responses.
- `frontend/src/components/Hub/QuickCreateModal.tsx` (and any other create/edit engagement modals) — replace single-contact picker with MUI `Autocomplete` in `multiple` mode or allow toggling between single and multiple.
- `frontend/src/components/EngagementsTable.tsx` / engagement list components — render multiple contacts as chip list or comma-separated links. Use `contacts` array from the API.
- `frontend/src/pages/Hub.tsx` / `ContactsTable.tsx` — update any client-side filters if they assumed `engagementlog.contactid` unique.

UI details for QuickCreateModal:

- Replace contact dropdown with `Autocomplete` + `multiple` set to true. Show selected contacts as chips with avatars.
- Validate that at least one contact is selected before submitting.
- On submit, construct `contact_ids` from selected options and call `createEngagement({contact_ids, log_date, log_entry, ...})`.
- Provide a small help text: "Select one or more contacts. When multiple are selected a contact group will be created and linked to this engagement."

Accessibility and UX:
- For lists/tables, display up to N names then a `+X more` link that opens a small popover listing the remaining contacts.

## Tests

Backend tests:
- Create integration tests exercising create/update with `contact_ids` (2+ contacts) and assert `contactgroup` + `contactgroupmembers` rows exist and engagement GET returns contact list.
- Test single-contact behavior remains unchanged.

Frontend tests:
- Unit/RTL test for `QuickCreateModal` multi-select behavior.
- Test that `createEngagement` sends `contact_ids` and parses response `contacts`.
- Engagements list test to assert multiple-contact rendering.

## Migration / rollout

1. Ensure migration `084` is applied to all environments before deploying backend changes.
2. Deploy backend changes that accept `contact_ids` but keep UI unchanged (API backwards compatible). Run backend tests.
3. Deploy frontend changes to support multi-select. Use feature-flag if desired.
4. Because groups will be auto-deleted when membership falls to 1 or 0, include a small migration-time verification script to ensure no pre-existing groups in staging/production violate assumptions (for example, groups with 1 member that should already be remapped). Consider running a one-off migration to remap existing single-member groups before enabling the backend behavior in production.
4. Monitor logs and analytics for any unexpected metrics changes.

## Acceptance criteria

- Creating an engagement with multiple contacts results in a `contactgroup` and `contactgroupmembers` rows and the engagement appears in UI with all contacts shown.
- Single-contact engagements behave as before.
- Heat / last-contact computations count group-linked engagements for each group member (or documented alternative if chosen).

## Rollback plan

- If schema migration caused issues, revert by restoring DB backup and redeploy previous code. Keep `082`/`083` files available if you prefer separate migration history.

## Open questions

- Counting semantics: should an engagement linked to N contacts count as N engagements in per-contact metrics (recommended: count-per-contact)?
- Group reuse: should we attempt to find/re-use existing contact groups with identical member sets (deferred).

## Implementation tasks (short checklist)

- [ ] Add backend create/update implementation and GET changes (`app.py`).
- [ ] Update `frontend/src/api/client.ts` types and functions.
- [ ] Update `QuickCreateModal.tsx` and engagement forms (multi-select).
- [ ] Update engagement list/detail UI to render multiple contacts.
- [ ] Add backend and frontend tests.
- [ ] Run integration tests and QA.

If you approve this plan I'll start by implementing the backend create/update handlers in `app.py` and add unit tests. 
