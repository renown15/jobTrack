**Progress Update (2026-01-02)**

- **Phase 1 started:** Safe replacements of silent `except` handlers with logging are in progress.
- **Patched files so far:** `tools/rename_jobapplication_to_jobrole.py`, `jobtrack_ai.py`, `tests/conftest.py`, `leads.py`.
- **Patched files so far:** `tools/rename_jobapplication_to_jobrole.py`, `jobtrack_ai.py`, `tests/conftest.py`, `leads.py`, `jobtrack_navigator_ai/__init__.py`.
- **Patched files so far:** `tools/rename_jobapplication_to_jobrole.py`, `jobtrack_ai.py`, `tests/conftest.py`, `leads.py`, `jobtrack_navigator_ai/__init__.py`, `jobtrack_navigator_ai/providers.py`.
- **Patched files so far:** `tools/rename_jobapplication_to_jobrole.py`, `jobtrack_ai.py`, `tests/conftest.py`, `leads.py`, `jobtrack_navigator_ai/__init__.py`, `jobtrack_navigator_ai/providers.py`.

- **2026-01-02 (batch):** Additional silent-except -> debug logging changes applied inside `jobtrack_navigator_ai/__init__.py` for trend computation, snapshot commit/logging, and insight debug logging.

- **2026-01-02 (batch 2):** Replaced several inner `except: pass` cases in `jobtrack_navigator_ai/__init__.py` fallbacks (usersalt lookup and key derivation) with `logger.debug(...)` to aid diagnostics.
- **2026-01-02 (batch 3):** Replaced two additional `except: pass` occurrences in `jobtrack_navigator_ai/__init__.py` with `logger.exception(...)` to surface unexpected failures during provider-health and linkedin debug logging.
- **Status:** Backend replacements underway; frontend notch-test stability fixes were applied earlier and are known-good locally.
- **Next steps:** Continue scanning low-risk Python files for `except:` / `except Exception:` that only `pass`, apply logging replacements in small batches, then run the Python test suite and iterate on failures. Each batch will be recorded here with date and files changed.
- **Next steps:** Continue scanning low-risk Python files for `except:` / `except Exception:` that only `pass`, apply logging replacements in small batches, then run the Python test suite and iterate on failures. Each batch will be recorded here with date and files changed.

**Status:** Paused until big-bang split completes
-------------------------------------------------
The high-level, consolidated refactor work described in this repository is paused until the big‑bang split (detailed in `docs/REFACTOR_BIG_BANG_PLAN.md`) is completed. The big‑bang plan contains the concrete extraction mapping and working-order for splitting very large modules (for example `app.py` and navigator AI modules). Minor fixes, style cleanups, and broad typing-only adjustments will be deferred until after the big‑bang split is finished and validated.

See `docs/REFACTOR_BIG_BANG_PLAN.md` for the detailed split mapping and extraction order.
- **Next steps:** Continue scanning low-risk Python files for `except:` / `except Exception:` that only `pass`, apply logging replacements in small batches, then run the Python test suite and iterate on failures. Each batch will be recorded here with date and files changed.

Policy update (2026-01-03): Defer minor fixes until refactor complete
------------------------------------------------------------------
- Per explicit project direction, minor code-style, lint, and cosmetic
  fixes (for example: one-off mypy/pyright cleanups, small non-structural
  behavior tweaks, or ad-hoc performance micro-optimizations) MUST be
  deferred until the refactor described in this document is fully
  completed and the core module boundaries (DB bridge, route blueprints,
  and normalization helpers) are in place. The only exceptions allowed
  during the refactor are:
  - safe, observable improvements that reduce risk (for example
    replacing silent `except: pass` with `logger.exception(...)`),
  - proof-of-concept changes required to validate new abstractions
    (for example a single script migrated to `jobtrack.db.query()`),
  - changes that unblock the refactor itself (for example extracting a
    route handler into a blueprint so it can be migrated to the DB
    bridge).

All other minor cleanups, stylistic changes, and non-essential typing
triage are to be postponed until the refactor is complete and the
project owner has reviewed the consolidated diff. This helps keep the
change window focused and reduces churn during the architecture move.

- **Phase 2 (started 2026-01-03):** Introduce small DB helper module and begin migrating callers.
  - **Changes so far:** Added `jobtrack/db.py` providing `get_conn()`, `query()`, and `with_db()` (a lightweight wrapper around the canonical `Database()` in `jobtrack.db_core`). This provides a stable API for incremental migration.
  - **Proof-of-concept:** One low-risk script (`tools/rename_jobapplication_to_jobrole.py`) has been refactored to use `jobtrack.db.query()` where appropriate (or left unchanged if direct connection logic was preferable). All Python unit tests (with mypy) passed after adding the module.
  - **Plan:** Incrementally convert `Database()` call sites to `jobtrack.db` helpers in small batches (3–8 files per batch). After each batch run `./scripts/run-tests.sh --python --unit` to ensure type checks and tests remain green. Prioritize scripts and small utility modules first, then route handlers in `app.py` and navigator modules.

  - **Policy (updated):** Do NOT add temporary runtime fallbacks to production code (for example, checking `app.Database` at runtime). Instead, update tests and callers to import or patch the canonical `jobtrack.db_core.Database`. Runtime fallbacks mask real dependency/bootstrapping issues and will not be accepted going forward.

  - **Acceptance criteria for Phase 2:**
    - No behavioral changes in tests after each batch.
    - New `jobtrack/db.py` is well-typed and covered by mypy.
    - `docs/REFACTOR_PLAN.md` updated with each batch listing files changed.

```
# JobTrack Backend Refactor Plan

Goal
- Reduce broad fallbacks and duplicated logic in the Python backend.
- Centralize error handling, DB helpers, and normalization utilities.
- Keep changes low-risk with tests and iterative steps.

Branch
- Work will continue on `feature/architecture-improvements-next`.

Overview
- Phase 0: Discovery (baseline tests, grep results).
- Phase 1: Safe automated replacements (logging + narrow exceptions for obvious cases).
- Phase 2: Extract DB helpers and centralize transaction/error handling.
- Phase 3: Add Flask global error handlers.
- Phase 4: Centralize normalization/parsing utilities and remove duplication.
- Phase 5: Add/adjust tests and run full CI.

File-by-file proposals (initial, prioritized pass)

1) `app.py`
- Change: Reduce ad-hoc try/except blocks. Replace silent `except` that only `pass` with `log.exception(...)` and either re-raise or return a documented error value. Extract route logic into smaller service helper functions (contacts, leads, jobroles).
- Rationale: `app.py` contains the majority of broad excepts; centralizing reduces duplication and improves observability.
- Risk: medium. Mitigation: implement small changes first (logging only), run full tests, then refactor route internals.
- Tests: run tests/integration and unit suite after each change.
- Est. time: discovery + safe change: 1–2 hours. Extraction: 4–8 hours.

2) `jobtrack/db.py` (new file) + update `Database`
- Change: Add a `jobtrack.db` module with:
  - connection factory (`get_conn()`),
  - simple `query()` helper that returns RealDictCursor results,
  - decorator/helper `with_db(cursor_factory=RealDictCursor)` to pass a cursor into functions.
- Update the existing `Database` class to delegate to these helpers or mark as thin wrapper.
- Rationale: Centralized DB error handling and cursor management reduces repeated try/excepts around DB connections and commits.
- Risk: medium. Mitigation: keep `Database` wrapper in place and change call sites incrementally.
- Tests: run integration DB tests after migration.
- Est. time: 3–6 hours.

3) `utils/encryption.py`, `utils/export_utils.py`
- Change: Replace bare `except` with specific exception handling and `log.exception(...)`. Extract any repeated fallback logic (e.g., default return values) to shared helpers.
- Rationale: Low-risk spots where silent failures hide runtime issues.
- Risk: low. Tests: unit tests covering encryption and export utilities.
- Est. time: 1–2 hours.

4) `leads.py` and `jobtrack_navigator_ai/providers.py`
- Change: Replace broad excepts with specific exceptions; ensure returned structures are consistent. Remove duplicated normalization code and import helpers from `jobtrack.utils`.
- Rationale: These modules are used by both backend and navigator; consistent behavior is important.
- Risk: medium-low. Tests: `tests/test_lead_contact_integration.py`, navigator tests.
- Est. time: 2–4 hours.

5) `ai/providers.py`, `jobtrack_ai.py`
- Change: Audit broad excepts; log exceptions and avoid swallowing errors silently. Consider moving heavy logic into smaller functions that can be unit-tested.
- Rationale: External integrations should fail loudly with meaningful logs.
- Risk: low.
- Est. time: 1–3 hours.

6) `scripts/*.py` (migrate, export_reference_data, etc.)
- Change: Replace `except Exception` in CLI/scripts with specific exceptions or `log.exception(...)` and exit with non-zero codes. Add a small CLI helper that standardizes error handling for scripts.
- Rationale: Make script failures visible in CI and local runs.
- Risk: low.
- Est. time: 1–2 hours.

7) Add `jobtrack/errors.py` or extend `jobtrack/api/errors.py`
- Change: Define a small set of custom exceptions (e.g., `BadRequestError`, `NotFoundError`, `DBError`) and map them to HTTP responses.
- Rationale: Encourage raising semantic exceptions and handling them in one place.
- Risk: low.
- Est. time: 1–2 hours.

8) Add Flask global error handlers (in `app.py` or small `errors` module)
- Change: Implement `@app.errorhandler(Exception)` that maps known exceptions to JSON responses and logs unexpected exceptions.
- Rationale: Remove repetitive per-route error response code.
- Risk: medium. Tests: API integration tests.
- Est. time: 2–4 hours.

9) Centralize normalization utilities (e.g., extend `_normalize_obj`)
- Change: Move common parsing/normalization into `jobtrack/utils.py` and import from there across the codebase.
- Rationale: Reduce duplicate logic and ensure consistent output shape.
- Risk: low.
- Est. time: 2–4 hours.

10) Tests and CI
- Add/adjust unit tests where behavior changed (especially DB helpers and error handling).
- Run entire `./scripts/run-tests.sh` after each major step.
- Maintain a changelog entry for behavior changes.

Implementation strategy
- Iterative: make small, safe changes and run the test suite between steps.
- Prefer logging + re-raise initially instead of changing behavior.
- After safety pass, progressively refactor to central helpers and remove duplicates.

Revision to implementation strategy (2026-01-03):
- Continue to make only the minimal safe changes necessary to complete
  the refactor (see "Policy update" above). Avoid introducing broad
  typing or lint cleanups during the refactor unless they are required
  to make a refactor step compile/run. Once the refactor is finished,
  run a single focused cleanup pass that addresses remaining mypy/pyright
  issues, style inconsistencies, and minor behavior fixes.

Tracking and progress
- I'll update the branch `feature/architecture-improvements-next` with each change and use small commits per file/concern.
- We will keep `docs/REFACTOR_PLAN.md` as the single source of truth for planned changes and status notes.

Next action (recommended)
  - Continue Phase 2 migration work (DB helper rollout and route
    extraction). Perform only the safe replacements and PoCs required to
    complete the structural refactor. After the refactor is complete,
    perform a single consolidated pass to address remaining minor fixes,
    run `pyright`, then run the full test suite and CI checks.

## Note: Frontend test stability fixes (2026-01-02)

- Recent work stabilized brittle frontend tests caused by ordering/timing when Vitest runs tests in parallel. Changes made:
  - Hardened global teardown and added handle-debugging hooks in `frontend/src/setupTests.ts`.
  - Replaced flaky `userEvent.clear()`/`userEvent.type()` sequences with deterministic `fireEvent.change(...)` where appropriate.
  - Ensured mocks are installed before dynamic imports in a few tests.
  - Added targeted `waitFor` timeouts for slow, measurement-heavy tests (MUI notched outline, dynamic imports).

- Recommended follow-ups:
  1. Migrate network stubs to MSW to fully isolate tests from global fetch/XHR mocks.
  2. Add explicit disposal helpers (unsubscribe/cleanup) for components that open sockets or intervals.
  3. Audit long-running modules for real resource leaks and add test-level disposers where necessary.

These changes were applied and the frontend test suite passes locally after the fixes. Consider running the full repo test runner in CI to validate end-to-end.

If you approve, reply "Proceed with Phase 1" and I will start the automated safe replacements and run tests. If you want changes to the plan file, tell me what to adjust.
