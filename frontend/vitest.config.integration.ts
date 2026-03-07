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
        testTimeout: 60000,
        hookTimeout: 60000,
        // Explicitly forward VITE_API_URL so Vitest picks it up regardless of
        // how the test runner is invoked (shell export vs .env file).
        env: {
            VITE_API_URL: process.env.VITE_API_URL ?? 'http://localhost:5001',
        },
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
