import { describe, it } from 'vitest'

describe('ImportOnly', () => {
    it('imports Settings module', async () => {
        // eslint-disable-next-line no-console
        console.log('IMPORTONLY: before dynamic import')
        const mod = await import('../Settings')
        // eslint-disable-next-line no-console
        console.log('IMPORTONLY: after dynamic import', Object.keys(mod))
    })
})
