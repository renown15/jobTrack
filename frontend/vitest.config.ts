import { defineConfig } from 'vitest/config'
import { createRequire } from 'module'

// Explicit Vitest config to ensure a consistent jsdom environment and
// guarantee our test setup file runs before tests. Some Vitest versions
// can be inconsistent when reading package.json vitest keys, so an
// explicit config avoids environment mismatches (document undefined).
//
// Use the built-in `v8` coverage provider by default. The Node/v8
// provider is more robust when Vitest workers are spawned from
// different working directories (e.g. VS Code's Vitest extension)
// and avoids attempts to load a custom coverage module that may not
// be resolvable in the runner's cwd.
const coverageProvider = 'v8'

export default defineConfig({
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/setupTests.ts'],
        globals: true,
        exclude: ['**/node_modules/**', '**/tests/integration/**'],
        coverage: {
            provider: coverageProvider,
            reporter: ['text', 'html', 'lcov'],
            reportsDirectory: 'coverage',
            all: true,
            include: ['src/**/*.{ts,tsx,js,jsx}'],
            exclude: ['node_modules/**', 'tests/**', 'src/**/__tests__/**', 'vitest.config.*'],
        },
    },
})
