// Lightweight logger wrapper used by UI components.
// Keeps logging calls local (no globals) and respects Vite env flag
// `VITE_ENABLE_CLIENT_LOGS`. In development, debug/info are enabled by default.
type LogFn = (...args: any[]) => void

export function createLogger(component?: string) {
    const prefix = component ? `[${component}]` : '[app]'
    const env = (import.meta as any).env || {}
    const enabled = env.VITE_ENABLE_CLIENT_LOGS === '1' || env.VITE_ENABLE_CLIENT_LOGS === 'true' || process.env.NODE_ENV === 'development'

    const makeArgs = (...args: any[]) => {
        const ts = new Date().toISOString()
        return [prefix, ts, ...args]
    }

    const debug: LogFn = (...args) => { if (enabled) console.debug(...makeArgs(...args)) }
    const info: LogFn = (...args) => { if (enabled) console.info(...makeArgs(...args)) }
    const warn: LogFn = (...args) => { console.warn(...makeArgs(...args)) }
    const error: LogFn = (...args) => { console.error(...makeArgs(...args)) }

    return { debug, info, warn, error }
}
