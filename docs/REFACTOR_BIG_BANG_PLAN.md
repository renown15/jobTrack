````markdown
# Big-Bang Refactor Plan — Split Large Python Modules

**Overview**

This plan performs a big‑bang, non-backwards-compatible refactor that splits the largest Python modules into a tidy package layout under `jobtrack/`. The TypeScript UI is the sole client; runtime semantics must be preserved but we may change import paths and internal layout. Work will be done on the current branch.

**Goals**

- Reduce the size and complexity of `app.py` and other very large modules by splitting them into focused modules.
- Preserve runtime behavior and API surface exposed to the frontend (HTTP endpoints and JSON contracts) except where the UI is unaffected.
- Produce a final repository layout that is easier to maintain and type-check.

**Non-goals**

- Preserve import paths for convenience. We will change internal imports freely and update scripts/entrypoints.
- Maintain backward compatibility for external consumers other than the frontend.

**Risks & Mitigations**

- Risk: Large atomic changes cause long debugging cycles. Mitigation: run full typecheck and unit tests after the refactor branch is created; be prepared to fix type errors in a focused follow-up.
- Risk: Missing side-effects when moving top-level code. Mitigation: keep the original `app.py` until final verification; use an app factory entrypoint and run the test suite.
- Risk: CI / Docker scripts expecting old paths. Mitigation: update `scripts/*`, `Dockerfile`, and `fly.toml` as part of the refactor commit.

**Branching & Working Branch**

- Work on the current active branch (do NOT create a separate refactor branch).
- All refactor work should be performed on the current branch in grouped commits; do not create or switch to a new branch for this refactor.
- Avoid merging to main until tests and typechecks are green and manual sanity verified.

**High-level Steps**

1. Restore & baseline
   - Ensure `app.py` is restored from `HEAD` (done). Commit a clean baseline: `git commit -am "refactor(big-bang): start grouped split"`.
   - Run `pyright` and `pytest -m "not integration"` to capture current diagnostics.

2. Scaffold package layout
   - Create directory `jobtrack/` with subpackages:
     - `jobtrack/app/` — app factory + registration of blueprints
     - `jobtrack/routes/` — route group modules
     - `jobtrack/db/` — `db_core.py` and `db.py` (DB abstraction)
     - `jobtrack/utils/` — `safe_int`, normalizers, small helpers
     - `jobtrack/sql/` — long SQL strings and templates
     - `jobtrack/navigator_ai/` — refactored navigator ai modules and `providers/`
   - Add `__init__.py` files and minimal scaffolding that imports nothing or only names that will be filled in the move steps.

3. Implement app factory and entrypoint
   - Create `jobtrack/app/__init__.py` implementing a Flask app factory: `create_app(config_name=None)` that configures logging, registers blueprints, and returns the Flask app.
   - Replace top-level `app.py` to import and call `create_app()`; keep the same WSGI entrypoint name used by scripts (for example `app` variable at module level) so runtime entry continues to work.

4. Move DB core and helpers
   - Move connection management and `Database()` context manager into `jobtrack/db/db_core.py` (or adopt existing `db_core.py`).
   - Move higher-level helpers into `jobtrack/db/db.py`.
   - Update callsites across the repo to import from `jobtrack.db`.

5. Extract utils & SQL
   - Move pure helpers (`_normalize_obj`, JSON helpers, `safe_int`) into `jobtrack/utils/__init__.py` and smaller files.
   - Move large SQL strings into `jobtrack/sql/*.py` as constants or functions that return SQL.

6. Split `app.py` endpoints into blueprints

IMPORTANT: Defer micro-edit fixes (for example replacing isolated `int(...)` callsites or local lint tweaks) until the structural moves for the refactor are complete. Perform the work in grouped commits that move related files together so the import surface and runtime semantics remain predictable during the transition.
   - Group endpoints by feature (e.g., `admin`, `api`, `export`, `analytics`, `navigator`) and create `jobtrack/routes/<feature>.py` files that define a `blueprint` object and route handlers.
   - Register blueprints inside the app factory.

7. Refactor navigator AI and providers
   - Move large `jobtrack_navigator_ai/__init__.py` logic into `jobtrack/navigator_ai/core.py`, `jobtrack/navigator_ai/api.py`, `jobtrack/navigator_ai/crypto.py`.
   - Split `providers.py` into `jobtrack/navigator_ai/providers/*.py` per provider and provide a small `providers/__init__.py` facade to preserve consumer calls.

8. Update scripts, Docker, CI
   - Update `scripts/*`, `Dockerfile`, `fly.toml`, and any packaging metadata to import the new app factory path.

9. Run static/type checks and tests
   - Run `pyright`. Fix typing issues introduced by new module imports (prefer minimal type adjustments; do not change semantics).
   - Run `./scripts/run-tests.sh --unit --python` and fix test failures.
   - Run integration suite if CI requires it.

10. Finalize and cleanup
   - Remove legacy code from `app.py` and other large files only after tests pass.
   - Update `README.md` and developer docs to explain the new layout.

**Commit strategy**

- Make a small number of large commits grouped by step (scaffold, DB move, utils move, routes move, providers move, scripts update, final cleanup).
- Each commit must include: a brief summary, files changed, and a smoke-test note (what was run locally).

**Testing & Verification**

- Local verification steps to run after the refactor branch is created:

```bash
# run typecheck
source venv-m4/bin/activate
pyright

# run unit tests
./scripts/run-tests.sh --unit --python
```

- Smoke manual verification: start the Flask app and curl a handful of endpoints used by the frontend (health, list contacts, export endpoints).

**Rollback plan**

- If the big-bang refactor introduces unresolvable regressions, revert the branch and return to `HEAD`:

```bash
# from main branch
git checkout main
git reset --hard HEAD
```

**Notes & next action**

- The repository already contains `jobtrack/db.py` and `jobtrack/db_core.py`. The next action is to scaffold the package layout and begin grouped extraction batches.
- I can perform the scaffolding and first extraction now; confirm and I will proceed.

Route-to-module mapping (proposed)
---------------------------------

Below is a concrete mapping of existing `app.py` routes into target blueprint modules and service modules under `jobtrack/`. The mapping is intentionally granular so the extraction can be done in small, reviewable commits.

- `jobtrack/routes/static.py` (and `jobtrack/services/static.py`)
  - `/assets/<path:filename>`, `/app/assets/<path:filename>`, `/videos/<path:filename>`, `/app/videos/<path:filename>`
  - `/app/`, `/app`, `/app/<path:filename>` (SPA entry)
  - `/test/<path:filename>`, `/tests`, local dev/test endpoints

- `jobtrack/routes/navigator.py` (and `jobtrack/services/navigator.py`)
  - `/api/<applicantid>/navigator/documents_text` (OPTIONS, POST)
  - `/api/<applicantid>/navigator/insights` (OPTIONS)
  - navigator-related helper endpoints under `/api/settings/navigator_actions*` once moved from settings grouping

- `jobtrack/routes/auth.py` (and `jobtrack/services/auth.py`)
  - `/api/auth/login`, `/api/auth/logout`, `/api/auth/setup-password`, `/api/auth/reset-password`, `/api/auth/me`, `/api/auth/signup`

- `jobtrack/routes/admin.py` (and `jobtrack/services/admin.py`)
  - `/api/admin/applicants` and admin subroutes: `/summary`, `/<target_applicantid>/status`, `/superuser`, `/password`, `/<target_applicantid>` (DELETE), `/import`, `/export`

- `jobtrack/routes/settings.py` (and `jobtrack/services/settings.py`)
  - `/api/<applicantid>/settings/run_sql`
  - `/api/<applicantid>/settings/briefings`
  - `/api/<applicantid>/settings/applicant`, `/avatar`, `/ui-preferences`, `/settings/refdata` and refdata CRUD
  - `/api/settings/navigator_actions*` inputs and actions (if better grouped here)

- `jobtrack/routes/tasks.py` (and `jobtrack/services/tasks.py`)
  - `/api/tasks/<taskid>/logs`, `/api/<applicantid>/tasks/<taskid>/logs` (GET/POST), `/api/tasks/logs/<logid>` (PUT/DELETE)
  - `/api/<applicantid>/tasks/<taskid>/targets` and `/api/<applicantid>/tasks/targets/<ttid>`

- `jobtrack/routes/reference_data.py` (and `jobtrack/services/reference_data.py`)
  - `/api/<applicantid>/reference-data`, `/api/reference-data`

- `jobtrack/routes/engagements.py` (and `jobtrack/services/engagements.py`)
  - `/api/<applicantid>/engagements/count`, `/api/<applicantid>/engagements` (GET/POST/PUT/DELETE variations)

- `jobtrack/routes/organisations.py` (and `jobtrack/services/organisations.py`)
  - `/api/<applicantid>/organisations/count`, `/api/<applicantid>/organisations` (GET/POST)
  - `/api/<applicantid>/organisations/<orgid>` (GET/PUT/DELETE)
  - `/api/<applicantid>/organisations/<orgid>/contacts`

- `jobtrack/routes/jobroles.py` (and `jobtrack/services/jobroles.py`)
  - `/api/<applicantid>/jobroles/count`, `/api/<applicantid>/jobroles` (GET/POST)
  - `/api/<applicantid>/jobroles/<jobid>` (GET/PUT/DELETE)
  - jobrole documents endpoints: `/api/<applicantid>/jobroles/<jobroleid>/documents` (GET/POST) and `/.../<documentid>` (DELETE)

- `jobtrack/routes/contacts.py` (and `jobtrack/services/contacts.py`)
  - `/api/<applicantid>/contacts` (POST, PUT for individual contacts)
  - `/api/<applicantid>/contacts/<contact_id>` (PUT/DELETE)
  - `/api/<applicantid>/contacts/<contact_id>/targets` (GET) — move contact-target list + helper
  - contact-target POST/DELETE endpoints that currently exist on `app.py` (also mirrored non-scoped variants) should be consolidated here
  - `/api/contacts/<contact_id>/targets` (POST) and `/api/contacts/<contact_id>/targets/<targetid>` (DELETE)
  - `/api/<applicantid>/contacts/tasks` and `/api/contacts/tasks/counts`

- `jobtrack/routes/documents.py` (and `jobtrack/services/documents.py`)
  - `/api/<applicantid>/documents` (GET/POST)
  - `/api/<applicantid>/documents/<documentid>` (PUT/DELETE)
  - `/api/documents/<documentid>/download`

- `jobtrack/routes/analytics.py` (and `jobtrack/services/analytics.py`)
  - `/api/<applicantid>/analytics/summary`, `/api/<applicantid>/analytics/engagements_by_month`, and other analytics endpoints

- `jobtrack/routes/networking.py` (and `jobtrack/services/networking.py`)
  - `/api/<applicantid>/networking` (GET/POST/PUT/DELETE), `/api/<applicantid>/networking/<eventid>/tasks`, and related networking tasks

- `jobtrack/routes/export.py` (and `jobtrack/services/export.py`)
  - `/api/<applicantid>/export` (POST), `/api/<applicantid>/export/spreadsheet.xlsx` (GET)

- `jobtrack/routes/tests.py` (dev-only)
  - dev/test routes such as `/tests` that are not part of production API; mark as dev-only and gate removal later.

Notes on mapping
- For each blueprint module, extract only the route handlers and tiny helpers required to make the handler self-contained; move SQL and DB-access logic into the corresponding `jobtrack/services/<feature>.py` file so the route modules remain small.
- Keep blueprints minimal: import `jobtrack.services.<feature>` functions for DB access, and import small parsing helpers from `jobtrack.utils`.
- Maintain existing route URL patterns unchanged during the extraction; do not change JSON response shapes.

Extraction order (practical)
- Start with `static` (lowest risk), then `auth`+`admin`, then `organisations`+`contacts`, then `jobroles`+`engagements`, then `documents`, then `analytics`+`settings`+`navigator`, then `networking`+`export`. Finish with navigator AI/provider refactor.

When each extraction batch is applied:
- Run `pyright` and unit tests; fix only blocking issues required to compile and run tests.
- Commit the moved files and leave a small shim in `app.py` that imports and registers the new blueprint until final cleanup.

```