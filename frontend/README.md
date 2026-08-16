# JobTrack Frontend

React + TypeScript SPA for the JobTrack UI, built with Vite.

Quick start (from the `frontend/` directory):

**Overview**

- **Purpose**: The frontend provides a React + TypeScript single-page app (Vite) for the JobTrack UI. It implements pages, reusable components, and a small API client to interact with the Flask backend.
- **Location**: project frontend lives under the `frontend/` directory.

**Architecture & Key Libraries**

- **Framework**: `Vite` + `React` + `TypeScript` — fast dev server and modern bundling.
- **UI**: `@mui/material` (MUI) for components and theming.
- **Server state**: `@tanstack/react-query` (Query Client) for data fetching, caching and background refresh.
- **Testing**: `Vitest` + `@testing-library/react` for unit and integration tests.
- **Styling**: Emotion or MUI `sx` (see component files for usage).

**Project Layout (important folders)**

- `src/components/` : reusable UI components, grouped by feature (e.g. `Hub`).
- `src/pages/` : top-level pages and route-mounted components.
- `src/api/` : typed API client (`client.ts`) and navigator-specific calls.
- `src/state/` : shared state helpers and small app-level caches.
- `src/utils/` : small pure helpers used across the app (pickers, parsers).
- `src/test-utils/` : test helpers, mock API responses and a fake client used by Vitest tests.

**Patterns & Conventions**

- **Thin pages, smart hooks**: Keep pages small — data fetching & business logic belong in hooks or `src/state/` services.
- **Query keys**: Use predictable react-query keys like `['contacts', params]` to allow selective invalidation.
- **Components**: Presentational components live in `components/`; page-specific small components can colocate with their page.
- **Accessibility-first tests**: Tests prefer queries by role/label (Testing Library) rather than implementation selectors.
- **Mocks & stubs**: Tests use `test-utils/testApiMocks` and mocked `AuthProvider` to avoid network dependencies.

**Date formatting convention**

- When displaying dates inside tables or compact UI elements, prefer a consistent approach across the app. Historically some tables render raw backend date strings while others format dates; to avoid regressions, follow this rule:
	- For now, display the raw date string as provided by the API in table cells (keep `Contacts` behaviour). If a table needs a localized human-friendly format, update all affected tables together and include a short note in this README explaining the change.
	- When changing date formatting, run the frontend build and the test suite to ensure consistency across pages.


**Testing (Detailed)**

This project uses `Vitest` + `@testing-library/react` for unit and integration tests. Tests are designed to run quickly in isolation using local mocks (no backend needed).

- **Where to run**: from the `frontend/` directory.

- **Core commands**:

```bash
# run all tests once
npx vitest run

# run tests in watch mode (interactive)
npx vitest

# run a single file
npx vitest run src/components/Hub/QuickCreateModal.layout.spec.tsx

# run a single test by title
npx vitest run src/components/Hub/QuickCreateModal.nestedOrg.spec.tsx -t "nested organisation flow"

# include a setup file (used in CI or when tests rely on global setup)
npx vitest run -r ./src/setupTests.ts
```

- **Discovery pattern**: Vitest defaults to files matching the glob `**/*.{test,spec}.?(c|m)[jt]s?(x)`. Keep these points in mind:
	- Filenames must end in `.test.tsx` / `.spec.tsx` (or .js variants) to be discovered.
	- Putting tests into `__tests__` folders is fine; ensure the individual files still match the pattern (e.g. `src/pages/__tests__/Analytics.spec.tsx`).
	- If Vitest reports "No test files found", check filenames and the `vitest.config.*` include/exclude globs.

- **Setup file**:
	- We use a project-level setup file for shared mocks and helpers (`src/setupTests.ts`).
	- When running tests that depend on that setup, include it with `-r ./src/setupTests.ts` or configure it in `vitest.config`.

- **Mocks & test utilities**:
	- `src/test-utils/testApiMocks.ts` (and related helpers) centralise mocked API responses used by tests.
	- Tests commonly mock `AuthProvider` to set a `currentApplicant` id and avoid real authentication flows.
	- Keep mocks in `src/test-utils/` so they can be reused across many tests.

- **Test organisation & conventions**:
	
	**Preferred structure (use this for new tests):**
	
	```
	frontend/
	├── src/
	│   ├── pages/
	│   │   └── __tests__/              # Page component tests
	│   ├── components/
	│   │   └── Feature/
	│   │       └── __tests__/          # Component tests (colocated)
	│   ├── utils/
	│   │   └── __tests__/              # Utility function tests
	│   └── api/
	│       └── __tests__/              # API client tests
	└── tests/                          # Specialized test categories
	    ├── mobile/                     # Mobile-specific component tests
	    ├── hooks/                      # Custom hook tests
	    ├── integration/                # Integration tests
	    └── pages/                      # Page integration/smoke tests
	```
	
	**Rules:**
	1. **Component tests** → `src/components/FeatureName/__tests__/ComponentName.test.tsx` (colocated with source)
	2. **Page unit tests** → `src/pages/__tests__/PageName.test.tsx`
	3. **Page integration/smoke tests** → `tests/pages/PageName.integration.test.tsx` or `tests/pages/PageName.smoke.test.tsx`
	4. **Mobile component tests** → `tests/mobile/ComponentName.test.tsx` (cross-cutting concern)
	5. **Hook tests** → `tests/hooks/useHookName.test.tsx`
	6. **API integration tests** → `tests/integration/api/feature.integration.test.ts`
	7. **Utility tests** → `src/utils/__tests__/utilName.test.ts`
	
	**❌ Avoid:**
	- Tests directly in `tests/` root (e.g., `tests/SomeComponent.test.tsx`) - use subdirectories
	- Tests directly in `src/pages/` (e.g., `src/pages/Settings.test.tsx`) - use `src/pages/__tests__/`
	- Mixing concerns (don't put component tests in `tests/integration/`)
	
	**Why this structure:**
	- Colocated tests (`__tests__/`) are easy to find and maintain with their components
	- `tests/` directory for cross-cutting concerns (mobile, hooks, integration) that don't belong to a specific component
	- Clear separation between unit tests (fast) and integration tests (slower)
	
	Prefer small focused tests that assert behavior (DOM) via Testing Library queries (role, label, text) rather than internal implementation details.

- **Writing tests: best practices**
	- Prefer async queries (`findBy*`) when the UI updates after an async action.
	- Use `userEvent` for user interactions rather than `fireEvent` for better realism.
	- Wrap explicit updates in React `act()` if you're performing multiple state updates programmatically.
	- Keep tests atomic and avoid network calls — use `testApiMocks` and the fake client.

- **Common failure modes & troubleshooting**
	- "Transform failed" errors: usually caused by malformed test files (for example, `import` inside a function). Ensure imports are at the top-level of the module.
	- "No test files found": verify filenames match the discovery glob and that `vitest.config.*` hasn't been modified to exclude the path.
	- React `act()` warnings: MUI components sometimes schedule updates asynchronously. Use `await findBy*` and, where needed, wrap the change in `await act(async () => { ... })`.
	- Skipped placeholders: while reorganising tests we keep lightweight `test.skip()` placeholders in original locations to avoid surprising CI changes. Remove these once the team has settled on the new layout.

- **Debugging a single test**:
	1. Run the file directly: `npx vitest run path/to/file.spec.tsx`.
	2. Add `-t "test name"` to narrow the run to a single test case.
	3. Use `--run --reporter verbose` or run Vitest in watch mode and press `p` to filter files interactively.

- **CI considerations**:
	- Ensure the runner installs dependencies in `frontend/` and runs `npx vitest run -r ./src/setupTests.ts` (or configure the setup in `vitest.config`).
	- Keep mocked data and fixtures up-to-date in `src/test-utils/` so CI runs remain deterministic.

**Common developer commands**

Run from the `frontend/` directory.

```bash
# install deps
npm install

# dev server
npm run dev

# run Vitest once
npx vitest run

# run a single spec file
npx vitest run src/components/Hub/QuickCreateModal.nestedOrg.spec.tsx -t "nested organisation flow"

# start with watch mode
npx vitest
```

**Environment & API client**

- The typed API client is at `src/api/client.ts` and expects a backend URL configured in your environment (see `frontend/package.json` scripts or the app's runtime config). Tests use mocked client responses and do not require a running backend.
- The small auth shim `src/auth/AuthProvider.tsx` is used in tests and pages; real auth/token handling is intentionally separated from components.

**Troubleshooting & Notes**

- **Test discovery**: Vitest discovers files matching `**/*.{test,spec}.?(c|m)[jt]s?(x)` — moving tests into `__tests__` subfolders is fine as long as filenames still match the pattern (e.g. `*.spec.tsx`).
- **Placeholder tests**: While reorganising tests we keep lightweight skipped placeholders in original locations to avoid surprises; you can safely remove them once CI is adjusted.
- **React act() warnings**: These are warnings only. If you want to silence them, wrap side-effectful updates in `act()` or await the resulting UI changes with Testing Library's async queries.
- **Large-scale changes**: When renaming or moving many tests, re-run `npx vitest run` and check `vitest.config.*` to confirm include/exclude globs.

**Next steps & maintenance**

- Add or update `src/test-utils/` helpers when new API routes are added so tests can mock responses centrally.
- Consider adopting `msw` (Mock Service Worker) for network-level test mocks if you need closer-to-network behavior.
- Clean up placeholder/skipped tests after the team accepts the new `__tests__` layout.

**Contact / ownership**

- See the root `README.md` for project-wide conventions and `make help` for available dev commands.
