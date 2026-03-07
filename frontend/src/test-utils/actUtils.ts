import { act } from 'react-dom/test-utils'

export async function withAct(fn: () => Promise<void> | void) {
    await act(async () => {
        // allow fn to be sync or async
        await Promise.resolve(fn())
    })
}

// Attach to global so tests can call `globalThis.withAct(...)` without importing
// (useful for quick fixes in flaky tests). Suppress TS warning for global assignment.
// @ts-ignore
globalThis.withAct = withAct
