# Linting & Typing Remediation Plan

Goal
- Bring `pyright` errors to an acceptable baseline and add a maintainable workflow so future typing issues are caught early.

Scope
- Primarily address the `pyright` errors shown in the earlier run (type mismatches, undefined names, Optional/None handling, incorrect list element types). Focus first on errors that cause runtime failures or obscure behavior (undefined names, wrong imports), then on typing hygiene.

High-level phases
1. Discover & classify
2. Fix high-impact runtime issues
3. Fix typing inconsistencies and add annotations
4. Test and iterate
5. CI + documentation

Detailed steps

- **Run & capture:**
  - Run `pyright --outputjson` (or plain `pyright`) in the repo root and save the full output to `build/pyright-report.json` or `build/pyright-report.txt`.
  - Command: `pyright --outputjson > build/pyright-report.json`

- **Aggregate errors:**
  - Parse the report and group errors by file and error class (e.g., `Undefined variable`, `Argument type mismatch`, `Optional access`).
  - Produce a short spreadsheet or markdown summary `build/pyright-summary.md` listing the top 10 files by error count.

- **Prioritise:**
  - Phase A (critical runtime): undefined names/import errors, route handler signature mismatches, places where `None` could lead to a crash.
  - Phase B (high-value typing fixes): list element type mismatches, Optional/None annotations, incorrect return types for public functions.
  - Phase C (cosmetic/strictness): tightening signatures, enabling stricter `pyright` settings per-package.

- **Fix Phase A (first pass):**
  - For each file annotated as Phase A (start with `app.py` and `jobtrack/routes/*.py`):
    - Add missing imports or guard uses with `if`/`assert` checks to avoid runtime NameError.
    - Replace suspicious list appends of mixed-type values with consistent typed lists (or convert values to the expected type).
    - For Flask handlers returning `tuple[Response, int] | Response`, ensure annotations and return shapes align; if necessary, normalize to always return `Response` using `jsonify()` and proper status codes.
    - Add minimal unit tests where behavior is unclear.

- **Fix Phase B (typing cleanup):**
  - Add `Optional[...]` and narrow union types where pyright complains about `None` being passed to functions expecting non-None.
  - Use `typing.cast()` sparingly when external APIs return `Any` and you can assert a concrete type.
  - Convert ambiguous `list`/`tuple` usages to explicit `List[T]` or `Tuple[T, ...]` where appropriate; ensure functions expecting `list` are passed `list` not `tuple`.
  - Replace `int()` calls on potentially None/Unknown values with explicit checks and safe conversion helpers (e.g., `def to_int(x: Any) -> int | None:`).

- **Fix Phase C (hardening):**
  - Add and run `mypy` or tighten `pyrightconfig.json` incrementally for stricter checking in critical folders.
  - Remove or refactor giant single-file modules (like `app.py`) into smaller modules with clearer types (this is optional but recommended long-term).

- **Testing & verification:**
  - After each group of edits, run:

```bash
# in repo root
pyright
./scripts/run-tests.sh python
```

  - Focus on keeping runtime tests green; prefer small commits that fix a coherent set of typing errors and leave behavior unchanged.

- **CI integration:**
  - Add a `pyright` check in CI (GitHub Actions or existing pipeline) as a non-blocking check initially, then make it blocking after the baseline is fixed.
  - Add a short `scripts/check-types.sh` wrapper that runs `pyright` and prints a human-friendly summary.

- **Docs & conventions:**
  - Create `docs/TYPING_GUIDELINES.md` with recommended patterns used in the codebase (use `Optional`, prefer explicit `List[T]` over bare `list`, use `cast()` only with comment justification, prefer guard checks for `None`).
  - Add a short PR checklist item: "Run `pyright` and confirm no new errors introduced".

- **Gradual strictness increment (optional):**
  - Once baseline is stable, tighten `pyright` for `jobtrack/` package only, enabling `reportOptionalMemberAccess`/`reportOptionalSubscript` and others.
  - Gradually enable stricter checks for additional packages in follow-up sprints.

Deliverables
- `build/pyright-report.json` — raw pyright output
- `build/pyright-summary.md` — grouped error summary
- `docs/LINTING_AND_TYPING_PLAN.md` — this plan (in `docs/`)
- `docs/TYPING_GUIDELINES.md` — team guidelines (created during work)
- `scripts/check-types.sh` — CI wrapper
- PRs with incremental fixes (small, focused) and tests

Timeline & checkpoints (suggested)
- Day 0: run & classify errors, produce summary
- Day 1–2: fix Phase A (undefined names / runtime risks), run tests
- Day 3–5: address Phase B typing issues and re-run tests
- Day 6: add CI step and docs, file follow-up tasks for Phase C

Notes & trade-offs
- Full strictness is valuable but time-consuming; prefer an incremental approach to avoid breaking runtime behavior.
- Large files like `app.py` generate many typing issues; splitting them will pay off but is higher effort — treat as separate refactor PRs.

If you want, I can: run `pyright` and generate the `build/pyright-report.json` and `build/pyright-summary.md` now, then start PHASE A fixes in small commits.  
