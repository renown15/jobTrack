import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// Integration test configuration
// Runs tests in frontend/tests/integration/ against a running backend

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'node', // Use node for API integration tests (no DOM needed)
        setupFiles: ['./tests/integration/setup.ts'],
        include: ['./tests/integration/**/*.test.ts', './tests/integration/**/*.test.tsx'],
        testTimeout: 30000, // Integration tests may need more time
        hookTimeout: 30000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['tests/integration/**'],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
})
