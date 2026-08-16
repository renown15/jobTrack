import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Production builds are served under `/app/` in our deployment.
const devPort = Number(process.env.VITE_DEV_PORT || 5173)

// Allow overriding the base via `VITE_BASE`. When running locally (not
// production) default to `/` so visiting `http://localhost:5173/` works.
const defaultBase = process.env.NODE_ENV === 'production' ? '/app/' : '/'
const base = process.env.VITE_BASE ?? defaultBase

export default defineConfig({
    base,
    plugins: [react()],
    server: {
        port: devPort,
    },
    build: {
        // Disable minification in Docker/production builds for easier debugging.
        // This can be reverted once the issue is resolved.
        minify: false,
    },
})
