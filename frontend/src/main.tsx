import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'
import { ThemeProvider, createTheme, useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { BRAND_PURPLE, BRAND_PURPLE_LIGHT } from './constants/colors'

// Early debug instrumentation: capture errors and console calls so we can
// inspect them when the app is served by gunicorn (helps diagnose blank page).
declare global {
  interface Window {
    __jobtrack_earlyErrors?: any[]
    __jobtrack_console?: any[]
  }
}

if (!window.__jobtrack_earlyErrors) window.__jobtrack_earlyErrors = []
if (!window.__jobtrack_console) window.__jobtrack_console = []

window.addEventListener('error', (e) => {
  try {
    window.__jobtrack_earlyErrors!.push({ type: 'error', message: e.message, filename: (e as any).filename, lineno: (e as any).lineno, colno: (e as any).colno, error: (e as any).error })
  } catch (err) {
    /* ignore */
  }
})

window.addEventListener('unhandledrejection', (ev) => {
  try {
    window.__jobtrack_earlyErrors!.push({ type: 'unhandledrejection', reason: (ev as any).reason })
  } catch (err) {
    /* ignore */
  }
})

// Wrap console methods to also capture them in a window array for remote inspection.
// Use runtime feature checks to avoid breaking in environments where console
// methods are non-standard or not functions (some embedded WebViews).
if (typeof console !== 'undefined' && typeof window !== 'undefined') {
  // Enable client logging only when the build-time Vite env var is set.
  // Default: logging is OFF. To enable, set `VITE_ENABLE_CLIENT_LOGS=true` at build.
  // This keeps verbose console output quiet in production by default.
  const __ENABLE_CLIENT_LOGS = Boolean((import.meta as any).env?.VITE_ENABLE_CLIENT_LOGS === 'true')
  try {
    const methods = ['log', 'debug', 'info', 'warn', 'error'] as const
    methods.forEach((m) => {
      try {
        const orig = (console as any)[m]
        if (typeof orig !== 'function') return
        (console as any)[m] = function (...args: any[]) {
          try {
            // Only capture logs when client logging is enabled.
            if (__ENABLE_CLIENT_LOGS) {
              if (!window.__jobtrack_console) window.__jobtrack_console = []
              window.__jobtrack_console.push({ level: m, args })
            }
          } catch (e) {
            // ignore capture failures
          }
          try {
            // Only call through to the original console when enabled.
            if (__ENABLE_CLIENT_LOGS) orig.apply(console, args)
          } catch (e) {
            // ignore original console failures
          }
        }
      } catch (e) {
        // ignore per-method wrapping failures
      }
    })
  } catch (e) {
    // ignore wrapper setup failures entirely
  }
}

const queryClient = new QueryClient()

// Print important Vite env flags at startup (only available inside modules).
// This helps debug which API base and client logging flags the app sees.
try {
  // eslint-disable-next-line no-console
  console.debug('[jobtrack env] VITE_API_BASE_URL=', (import.meta as any).env?.VITE_API_BASE_URL)
  // eslint-disable-next-line no-console
  console.debug('[jobtrack env] VITE_ENABLE_CLIENT_LOGS=', (import.meta as any).env?.VITE_ENABLE_CLIENT_LOGS)
} catch (e) {
  // ignore if unavailable in some environments
}

// Dev-only fetch wrapper: force credentials and log auth / navigator requests
// when client logs are enabled. This is safe to leave in dev as it only
// activates when the Vite env flag is set to true.
try {
  const enableLogs = Boolean((import.meta as any).env?.VITE_ENABLE_CLIENT_LOGS === 'true')
  if (enableLogs && typeof window !== 'undefined' && (window as any).fetch) {
    const originalFetch = window.fetch.bind(window)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ; (window as any).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        try {
          const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
          if (!init) init = {}
          // ensure credentials are included so cookie-based sessions work in dev
          if (!init.credentials) init.credentials = 'include'
          if (url.includes('/api/auth') || url.includes('/navigator_briefings')) {
            // eslint-disable-next-line no-console
            console.debug('[fetch>>]', url, init)
          }
          const res = await originalFetch(input, init)
          if (url.includes('/api/auth') || url.includes('/navigator_briefings')) {
            // clone and read body for debug output (be careful with large bodies)
            try {
              const clone = res.clone()
              const text = await clone.text()
              // eslint-disable-next-line no-console
              console.debug('[fetch<<]', url, res.status, text)
            } catch (err) {
              // eslint-disable-next-line no-console
              console.debug('[fetch<<] body-read-failed', url, err)
            }
          }
          return res
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[fetch!!]', err)
          throw err
        }
      }
  }
} catch (e) {
  // ignore wrapper setup errors
}

const theme = createTheme({
  palette: {
    primary: {
      main: BRAND_PURPLE,
      light: BRAND_PURPLE_LIGHT,
      dark: BRAND_PURPLE,
      contrastText: '#fff',
    },
  },
})

// Removed dev-only responsive debug overlay.

try {
  console.debug('[jobtrack] main: starting render')
  // Ensure the router basename does not end with a trailing slash.
  // Vite's `base` may include a trailing slash (e.g. '/app/'), but
  // React Router's `basename` should not end with a slash otherwise
  // route matching can fail when the request path lacks the trailing slash.
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/'
  createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <BrowserRouter basename={base}>
            <App />
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </React.StrictMode>
  )
  console.debug('[jobtrack] main: render completed')
} catch (e) {
  try {
    console.error('[jobtrack] main: render error', e)
    window.__jobtrack_earlyErrors!.push({ type: 'render-error', error: String(e) })
  } catch (ie) {
    // ignore
  }
  throw e
}

// Removed temporary always-on dev badge.
