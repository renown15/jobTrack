import '@testing-library/jest-dom'
import { vi } from 'vitest'
import React from 'react'
// Defer importing local modules that may log during import so we can
// install a console filter first. These will be required after the
// console override below.
let setApplicantId: any = undefined
let setupDefaultApiMocks: any = undefined

// DEBUG: setupTests module loaded — only print when explicitly requested.
const SETUP_DEBUG = !!process.env.VITEST_SETUP_DEBUG || !!process.env.VITEST_VERBOSE
// Capture original console methods so we can filter noisy logs when not verbose
const __origConsoleLog = console.log.bind(console)
if (!process.env.VITEST_VERBOSE) {
    const QUIET_PREFIXES = [
        'SETUPTESTS:',
        'MODULE:',
        'VITEST_ACTIVE_HANDLES',
        'VITEST_ACTIVE_HANDLES_POLL',
        '[currentApplicant]',
        'IMPORTONLY:',
        'NAVBRIEF_MODULE:',
        'SETUPTESTS:'
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.log = (...args: any[]) => {
        const first = typeof args[0] === 'string' ? args[0] : ''
        for (const p of QUIET_PREFIXES) if (first && first.indexOf(p) === 0) return
        __origConsoleLog(...args)
    }
}

if (SETUP_DEBUG) {
    // eslint-disable-next-line no-console
    console.log('SETUPTESTS: loaded')
    try {
        // @ts-ignore
        if ((process as any)._getActiveHandles) {
            // eslint-disable-next-line no-console
            console.log('SETUPTESTS: active handles at load', (process as any)._getActiveHandles().map((h: any) => h && h.constructor && h.constructor.name))
        }
    } catch (e) {
        // ignore
    }
}

// Capture a baseline snapshot of active Node handles at module load so we
// can attempt to detect and clean up any handles created by tests during
// execution. We keep the actual handle objects (not just names) so we can
// attempt best-effort close/destroy operations on newly created handles.
let __baselineHandles: any[] = []
try {
    // @ts-ignore - internal Node API for debugging
    __baselineHandles = (process as any)._getActiveHandles ? (process as any)._getActiveHandles().slice() : []
} catch (e) {
    __baselineHandles = []
}

// Import local helpers early so `getApplicantId`/`setApplicantId` are available
// before any modules that may call `requireApplicantId()` during import.
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ca = require('./auth/currentApplicant')
    setApplicantId = ca.setApplicantId
} catch (e) {
    // ignore missing helper in some environments
}

try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tm = require('./test-utils/testApiMocks')
    setupDefaultApiMocks = tm.setupDefaultApiMocks
} catch (e) {
    // ignore
}

// Ensure an applicant id is selected by default for tests so applicant-scoped
// API calls used during component render don't throw.
try {
    if (typeof setApplicantId === 'function') setApplicantId(1)
} catch (e) { /* ignore */ }

// Install baseline API spies synchronously so they are active before any tests
// or components mount.
try {
    if (typeof setupDefaultApiMocks === 'function') setupDefaultApiMocks(vi)
} catch (e) { /* ignore */ }

// Note: avoid pre-mocking the api client module here to prevent circular
// initialization issues. The helper `setupDefaultApiMocks` (imported below)
// will install spies on the real `api` exports during setup.

// Import the test helper and install baseline spies so queries return defined
// shapes by default. Use dynamic import to work reliably with Vite/TS module
// resolution in the test environment.
// NOTE: `setApplicantId` and `setupDefaultApiMocks` are assigned below via
// deferred `require()` so invoke them only after those requires have run.

// As a safety-net, stub global fetch and XMLHttpRequest so any stray network calls
// won't actually reach the network and instead resolve to harmless defaults.
// This keeps tests deterministic and removes jsdom CORS/XHR noise.
if (typeof globalThis.fetch === 'undefined') {
    // @ts-ignore - tests run in jsdom but we ensure a fetch exists
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
} else {
    // replace with a mock implementation
    // @ts-ignore
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
}

// Minimal fake XMLHttpRequest that avoids sending real network requests.
// It calls onload/onreadystatechange handlers asynchronously to mimic XHR behavior.
class FakeXMLHttpRequest {
    public onreadystatechange: ((this: XMLHttpRequest, ev: Event) => any) | null = null
    public onload: ((this: XMLHttpRequest, ev: Event) => any) | null = null
    public status = 200
    public readyState = 0
    public responseText = '{}'
    open(_method: string, _url: string) {
        // no-op
    }
    setRequestHeader(_name: string, _value: string) {
        // no-op
    }
    send(_body?: any) {
        this.readyState = 4
        // emulate async completion
        setTimeout(() => {
            try {
                if ((this as any).onreadystatechange) (this as any).onreadystatechange(new Event('readystatechange'))
                if ((this as any).onload) (this as any).onload(new Event('load'))
            } catch (err) {
                // swallow errors in test environment
            }
        }, 0)
    }
    abort() { }
}

// @ts-ignore
globalThis.XMLHttpRequest = FakeXMLHttpRequest

// Provide a minimal ResizeObserver mock for jsdom so libraries like Recharts
// that rely on it (ResponsiveContainer) don't throw during tests.
if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    // Minimal class matching the ResizeObserver API used by Recharts
    // Methods are no-ops; tests don't require actual resize signals.
    // @ts-ignore
    class ResizeObserver {
        callback: any
        constructor(cb: any) {
            this.callback = cb
        }
        observe() {
            // no-op
        }
        unobserve() {
            // no-op
        }
        disconnect() {
            // no-op
        }
    }
    // @ts-ignore
    globalThis.ResizeObserver = ResizeObserver
    // also ensure window.ResizeObserver exists in case some modules reference window
    try {
        // @ts-ignore
        if (typeof (globalThis as any).window === 'undefined') (globalThis as any).window = globalThis
            // @ts-ignore
            (globalThis as any).window.ResizeObserver = ResizeObserver
    } catch (e) {
        // ignore
    }
}



// Ensure each test cleans up DOM and restores mocks to avoid cross-test pollution
try {
    // Import cleanup from testing-library if available
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { cleanup } = require('@testing-library/react')
    // Vitest's global `afterEach` is available in the test environment
    // Use an async afterEach so we can await a microtask tick which helps
    // settle pending promises/handles that would otherwise leak between tests.
    // @ts-ignore
    afterEach(async () => {
        try {
            cleanup()
        } catch (e) {
            // ignore cleanup failures
        }

        try {
            // Use Vi's helpers to restore/reset mocks and timers
            // @ts-ignore
            if (typeof vi !== 'undefined' && vi) {
                if (typeof vi.restoreAllMocks === 'function') vi.restoreAllMocks()
                if (typeof vi.resetAllMocks === 'function') vi.resetAllMocks()
                // avoid resetting modules globally here; some tests rely on
                // module-level initialisation provided by test helpers
                if (typeof vi.clearAllTimers === 'function') vi.clearAllTimers()
                if (typeof vi.useRealTimers === 'function') vi.useRealTimers()
            }
        } catch (e) {
            // ignore vi teardown issues
        }

        try {
            // Reset common global mocks to their initial state where possible
            if (globalThis.fetch) {
                try {
                    if (typeof (globalThis.fetch as any).mockClear === 'function') (globalThis.fetch as any).mockClear()
                    else if (typeof (globalThis.fetch as any).mockReset === 'function') (globalThis.fetch as any).mockReset()
                } catch (err) { /* ignore */ }
            }
            if (globalThis.XMLHttpRequest) {
                try {
                    if (typeof (globalThis.XMLHttpRequest as any).mockClear === 'function') (globalThis.XMLHttpRequest as any).mockClear()
                    else if (typeof (globalThis.XMLHttpRequest as any).mockReset === 'function') (globalThis.XMLHttpRequest as any).mockReset()
                } catch (err) { /* ignore */ }
            }
        } catch (e) {
            // ignore
        }

        // Allow a microtask tick for any pending promise-based work to complete
        try {
            // eslint-disable-next-line no-await-in-loop
            await Promise.resolve()
        } catch (e) {
            // ignore
        }

        // Best-effort: detect and close/destroy any new handles created during
        // the test that were not present at module load. This helps catch
        // leaking sockets/intervals/streams that keep the event loop alive.
        if (process.env.VITEST_DEBUG_HANDLES) {
            try {
                // @ts-ignore - internal Node API used for debugging
                const handles = (process as any)._getActiveHandles ? (process as any)._getActiveHandles() : []
                // compute the delta (object identity)
                const newHandles = handles.filter((h: any) => __baselineHandles.indexOf(h) === -1)
                if (newHandles.length) {
                    // eslint-disable-next-line no-console
                    console.log('SETUPTESTS: detected new handles after test', newHandles.map((h: any) => h && h.constructor && h.constructor.name))
                    for (const h of newHandles) {
                        try {
                            // skip well-known safe handles
                            const name = (h && h.constructor && h.constructor.name) || ''
                            if (['Pipe', 'Socket', 'WriteStream', 'ReadStream'].includes(name)) {
                                // attempt safe destroy/close if available
                                if (typeof h.destroy === 'function') try { h.destroy() } catch (e) { /* ignore */ }
                                else if (typeof h.close === 'function') try { h.close() } catch (e) { /* ignore */ }
                                continue
                            }

                            if (typeof h.close === 'function') {
                                try { h.close() } catch (e) { /* ignore */ }
                            } else if (typeof h.destroy === 'function') {
                                try { h.destroy() } catch (e) { /* ignore */ }
                            } else if (typeof h.end === 'function') {
                                try { h.end() } catch (e) { /* ignore */ }
                            } else if (typeof h.unref === 'function') {
                                try { h.unref() } catch (e) { /* ignore */ }
                            }
                        } catch (e) {
                            // ignore per-handle cleanup errors
                        }
                    }
                    // update baseline with handles now considered known (best-effort)
                    try { __baselineHandles = (process as any)._getActiveHandles ? (process as any)._getActiveHandles().slice() : __baselineHandles } catch (e) { /* ignore */ }
                }
            } catch (e) {
                // ignore debug handle errors
            }
        }
    })
} catch (e) {
    // ignore if testing-library not available at runtime in this environment
}

// Provide a minimal canvas getContext stub for jsdom environments where the
// `canvas` package isn't installed. Many components (DataTable text-measure)
// call `canvas.getContext('2d').measureText()`; jsdom throws "Not implemented"
// without a stub. Keep the implementation intentionally tiny — it only
// implements `measureText` used in tests.
try {
    // Force-override jsdom's canvas getContext to avoid its "Not implemented"
    // exception. Some jsdom builds provide a throwing stub; replace it with a
    // lightweight implementation used only for text measurement in tests.
    // @ts-ignore
    if (typeof HTMLCanvasElement !== 'undefined') {
        // @ts-ignore
        HTMLCanvasElement.prototype.getContext = function () {
            return {
                measureText: (txt: string) => ({ width: String(txt).length * 8 }),
                // Provide additional no-op methods in case other code calls them
                fillText: () => { },
                beginPath: () => { },
                arc: () => { },
                stroke: () => { },
                closePath: () => { },
            }
        }
    }
} catch (e) {
    // ignore - test environment may restrict globals
}

// Global mocks to reduce noisy warnings in tests
// Mock Recharts to provide a stable container with non-zero size so
// ResponsiveContainer and chart components do not emit zero-dimension warnings.
vi.mock('recharts', () => {
    const React = require('react')

    // Helper: render a container that does not forward arbitrary props to the DOM
    const Container = (_props: any) => React.createElement('div', {}, _props.children)
    const Primitive = () => React.createElement('div')

    return {
        // Keep ResponsiveContainer with a fixed non-zero size to satisfy components
        ResponsiveContainer: ({ children }: any) => React.createElement('div', { style: { width: 400, height: 240 } }, children),
        // Chart containers should render children but not forward props (avoids React warnings)
        LineChart: Container,
        ScatterChart: Container,
        BarChart: Container,
        PieChart: Container,
        AreaChart: Container,
        // Chart primitives rendered as empty elements (ignore props)
        Line: Primitive,
        Scatter: Primitive,
        Bar: Primitive,
        Pie: Primitive,
        Area: Primitive,
        // Axes and helpers as primitives
        XAxis: Primitive,
        YAxis: Primitive,
        ZAxis: Primitive,
        Tooltip: Primitive,
        Legend: Primitive,
        CartesianGrid: Primitive,
    }
})

// Mock MUI Autocomplete to avoid PopperProps being forwarded to DOM and
// to reduce Popper/Portal/act warning noise. This mock renders the
// provided input via `renderInput` (so tests still interact with inputs)
// and also renders a simple always-visible list of `props.options` so
// tests can find and click option items (e.g. "Org A" or sector names).
vi.mock('@mui/material/Autocomplete', () => {
    const React = require('react')
    return {
        __esModule: true,
        default: (props: any) => {
            const { renderInput, inputValue: controlledInputValue, value, options, getOptionLabel } = props

            // derive a display value for the input
            const displayValue = controlledInputValue ?? (value && (getOptionLabel ? getOptionLabel(value) : value.name || value.label)) ?? ''

            const opts = Array.isArray(options) ? options : []
            const firstLabel = opts.length ? (getOptionLabel ? getOptionLabel(opts[0]) : (opts[0] && (opts[0].name || opts[0].label) ? (opts[0].name || opts[0].label) : String(opts[0]))) : ''
            const params = {
                InputProps: { endAdornment: null },
                // prefer explicit displayValue, otherwise fall back to the first option's label
                inputProps: { value: displayValue || firstLabel, 'aria-label': props.label || props['aria-label'] }
            }

            const inputEl = (typeof renderInput === 'function') ? renderInput(params) : React.createElement('input', { value: displayValue, 'aria-label': props.label || props['aria-label'] })

            // render a simple static listbox that exposes each option's label/text
            const list = React.createElement('ul', { role: 'listbox' }, opts.map((opt: any, i: number) => {
                const label = getOptionLabel ? getOptionLabel(opt) : (opt && (opt.name || opt.label) ? (opt.name || opt.label) : String(opt))
                return React.createElement('li', {
                    key: i,
                    role: 'option',
                    onClick: () => { if (typeof props.onChange === 'function') props.onChange(null, opt) }
                }, label)
            }))

            return React.createElement('div', {}, inputEl, list)
        }
    }
})

// Mock Popper to avoid forwarding complex props into DOM attributes
vi.mock('@mui/material/Popper', () => {
    const React = require('react')
    return {
        __esModule: true,
        default: (props: any) => React.createElement('div', { style: { position: 'relative' } }, props.children)
    }
})

// Stub common MUI primitives used across the app to lightweight DOM elements
// This prevents heavy @mui/material imports from running during unit tests
vi.mock('@mui/material/Box', () => {
    const React = require('react')
    return { __esModule: true, default: (props: any) => React.createElement('div', props, props.children) }
})
vi.mock('@mui/material/Paper', () => {
    const React = require('react')
    return { __esModule: true, default: (props: any) => React.createElement('div', props, props.children) }
})
vi.mock('@mui/material/Button', () => {
    const React = require('react')
    return { __esModule: true, default: (props: any) => React.createElement('button', props, props.children) }
})
// NOTE: Do NOT mock TextField globally. Tests must exercise the real MUI
// TextField + InputLabel behavior so they detect missing visible labels and
// notched outline issues in client components. Previously this module mocked
// TextField and converted `label` into an `aria-label`, which masked real UI
// regressions. Keep other lightweight MUI mocks, but allow the real TextField
// implementation to run during tests so InputLabel DOM nodes are rendered.
vi.mock('@mui/material/Typography', () => {
    const React = require('react')
    return { __esModule: true, default: (props: any) => React.createElement('div', props, props.children) }
})
vi.mock('@mui/material/Divider', () => {
    const React = require('react')
    return { __esModule: true, default: (props: any) => React.createElement('div', props, null) }
})
vi.mock('@mui/material/Menu', () => {
    const React = require('react')
    return { __esModule: true, default: (props: any) => React.createElement('div', props, props.children) }
})
vi.mock('@mui/material/MenuItem', () => {
    const React = require('react')
    return { __esModule: true, default: (props: any) => React.createElement('div', props, props.children) }
})

// Stub common MUI transition components to render children synchronously
// This reduces `act(...)` warnings caused by animated transitions in jsdom tests.
vi.mock('@mui/material/Grow', () => {
    const React = require('react')
    return { __esModule: true, default: (props: any) => React.createElement(React.Fragment, {}, props.children) }
})
vi.mock('@mui/material/Fade', () => {
    const React = require('react')
    return { __esModule: true, default: (props: any) => React.createElement(React.Fragment, {}, props.children) }
})
vi.mock('@mui/material/Slide', () => {
    const React = require('react')
    return { __esModule: true, default: (props: any) => React.createElement(React.Fragment, {}, props.children) }
})
vi.mock('@mui/material/Collapse', () => {
    const React = require('react')
    return { __esModule: true, default: (props: any) => React.createElement(React.Fragment, {}, props.children) }
})

// Diagnostic: when debugging hangs, set VITEST_DEBUG_HANDLES=1 to print active
// Node handles after each test. This uses internal Node API for debugging only.
if (process.env.VITEST_DEBUG_HANDLES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    afterEach(() => {
        try {
            // @ts-ignore - internal Node API used for debugging
            const handles = (process as any)._getActiveHandles ? (process as any)._getActiveHandles() : []
            const names = (handles || []).map((h: any) => (h && h.constructor && h.constructor.name) || String(h))
            // Print a concise summary — Vitest will capture this in stdout
            // eslint-disable-next-line no-console
            console.log('VITEST_ACTIVE_HANDLES:', names)
        } catch (e) {
            // ignore
        }
    })
    // Also log active handles periodically so we can observe what keeps the
    // event loop busy while a test appears hung. This is useful for debugging
    // but should be harmless when not enabled.
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const intervalId = setInterval(() => {
            try {
                // @ts-ignore
                const handles = (process as any)._getActiveHandles ? (process as any)._getActiveHandles() : []
                const names = (handles || []).map((h: any) => (h && h.constructor && h.constructor.name) || String(h))
                // eslint-disable-next-line no-console
                console.log('VITEST_ACTIVE_HANDLES_POLL:', names)
            } catch (e) {
                // ignore
            }
        }, 200)
        // Best-effort: clear interval on process exit
        // @ts-ignore
        if (typeof process !== 'undefined' && process && process.on) process.on('exit', () => clearInterval(intervalId))
    } catch (e) {
        // ignore
    }
}
