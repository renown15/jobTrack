# Backend Reorganization Plan

Date: 2026-01-11

## Purpose

Document a canonical reorganization that moves the Python backend into `backend/` and renames the current `jobtrack` package to `jobtrack_core`. This plan lists assumptions, concrete steps, verification, rollback, and CI notes.

## Assumptions
- The repository currently has a top-level `jobtrack/` package and a top-level `tests/` folder.
- No shim layers will be left at the repository root — this is a canonical move.
- The test-runner and other scripts can be updated to set `PYTHONPATH` or invoke `python` from `backend/`.
- You approved the rename `jobtrack` → `jobtrack_core` and the canonical move.

## High-level Steps

1. Create `backend/` at the repository root.
2. Move `jobtrack/` → `backend/jobtrack_core/`.
3. Move top-level Python entrypoints and utility modules into `backend/` (for example `app.py`, `leads.py`, `jobtrack_ai.py`, `ai/`, etc.).
4. Move `tests/` → `backend/tests/`.
5. Update imports throughout the codebase from `jobtrack.*` to `jobtrack_core.*` where needed.
6. Update scripts and CI to reference `backend/` layout or set `PYTHONPATH=backend` before running.
7. Run full test matrix, fix import/path regressions, iterate until green.
8. Commit changes on a dedicated branch and open a PR with a short migration note.

## Detailed Steps and Commands

1) Create branch and directory

```bash
git checkout -b feat/backend-reorg
mkdir backend
```

2) Move files (example set — adjust as needed)

```bash
git mv jobtrack backend/jobtrack_core
git mv app.py backend/
git mv leads.py backend/
git mv jobtrack_ai.py backend/
git mv ai backend/ai
git mv tests backend/tests
```

3) Update runtime/test pathing

- Option A (preferred): Update `./scripts/run-tests.sh` and CI job definitions to set `PYTHONPATH` before running tests:

```bash
export PYTHONPATH="$PWD/backend:$PYTHONPATH"
pytest backend/tests ...
```

- Option B: Update test imports to reference `backend.tests` and launch the Flask app with `python3 backend/app.py`.

4) Mass-import update

Use a fast, safe rename tool, for example `ruff`/`sed`/`git grep` with manual review. Example using `git grep` + `sed` (run from repo root):

```bash
git grep -l "from jobtrack\|import jobtrack" | xargs sed -i '' 's/from jobtrack/from jobtrack_core/g; s/import jobtrack/import jobtrack_core/g'
```

Review changes with `git add -p` and run the test suite.

5) Run tests and iterate

```bash
export PYTHONPATH="$PWD/backend:$PYTHONPATH"
./scripts/run-tests.sh --integration --python
pytest -q backend/tests
```

Fix import errors as they appear (usually straightforward `ModuleNotFoundError` → update import paths). Re-run until green.

## Verification Checklist

- [ ] Repo builds without import errors.
- [ ] All unit and integration tests pass.
- [ ] `./scripts/run-tests.sh` updated and runner still provisions Docker DB and runs tests.
- [ ] CI pipeline updated and passing.

## Rollback Plan

If issues are severe, revert the branch and restore the original layout:

```bash
git checkout main
git reset --hard origin/main
```

Or revert the reorg commit on the branch.

## Commit & PR Guidance

- Create a single, focused commit (or small logical commits) that contains only the file moves and import fixes.
- Branch name suggestion: `feat/backend-reorg/jobtrack-core`.
- PR description: include this `docs/backend_reorg_plan.md`, explain the `PYTHONPATH` change, and list any CI file updates.

## CI / Ops Notes

- Update any CI workflow steps that reference `app.py` or `tests/` paths to point at `backend/` or set `PYTHONPATH=backend` prior to running tests.
- If any external tooling expects the package `jobtrack` (e.g., deployment scripts), update them to use `jobtrack_core` or set `PYTHONPATH` accordingly.

## Open Questions

- Are there any other top-level Python scripts that must remain at repo root for operational reasons? If so, we should discuss adding small launcher wrappers that set `PYTHONPATH` and forward to `backend/`.

## Checklist (mapped to TODO list)

- [ ] Create backend/ directory and move files
- [ ] Rename `jobtrack` → `jobtrack_core` and move into `backend/`
- [ ] Update imports across repo to `jobtrack_core.*`
- [ ] Move `tests/` → `backend/tests/` and update test imports
- [ ] Update scripts and CI configs to use `backend/` layout
- [ ] Run full test suite and iterate
- [ ] Commit changes on a branch and present diff

---
If you'd like, I can proceed now to perform the moves and update imports, run the tests, and push a branch. Confirm and I'll start the first move.
