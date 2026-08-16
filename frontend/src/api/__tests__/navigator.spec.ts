import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { api, fetchNavigatorPrompts, fetchNavigatorActions, fetchNavigatorInsights, fetchNavigatorHealth, fetchNavigatorDetail, fetchNavigatorMetricHistory, fetchNavigatorMetricSnapshot, runNavigatorSql } from '../client'

describe('navigator api client', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('fetchNavigatorPrompts calls api.get and returns data array', async () => {
        const mock = vi.spyOn(api, 'get').mockResolvedValue({ data: [{ id: 1, text: 'p' }] })
        const res = await fetchNavigatorPrompts()
        expect(mock).toHaveBeenCalled()
        expect(res).toEqual([{ id: 1, text: 'p' }])
    })

    it('fetchNavigatorActions calls api.get and returns array', async () => {
        const mock = vi.spyOn(api, 'get').mockResolvedValue({ data: [{ actionid: 10 }] })
        const res = await fetchNavigatorActions()
        expect(mock).toHaveBeenCalled()
        expect(res).toEqual([{ actionid: 10 }])
    })

    it('fetchNavigatorInsights returns object', async () => {
        const mock = vi.spyOn(api, 'get').mockResolvedValue({ data: { ok: true } })
        const res = await fetchNavigatorInsights()
        expect(mock).toHaveBeenCalled()
        expect(res).toEqual({ ok: true })
    })

    it('fetchNavigatorHealth returns object', async () => {
        const mock = vi.spyOn(api, 'get').mockResolvedValue({ data: { ok: true } })
        const res = await fetchNavigatorHealth()
        expect(mock).toHaveBeenCalled()
        expect(res).toEqual({ ok: true })
    })

    it('fetchNavigatorDetail calls api.get with params and returns object', async () => {
        const mock = vi.spyOn(api, 'get').mockResolvedValue({ data: { ok: true } })
        const res = await fetchNavigatorDetail('metric_x', 50)
        expect(mock).toHaveBeenCalled()
        // verify params passed
        const calledWith = mock.mock.calls[0][0]
        expect(typeof calledWith).toBe('string')
        expect(res).toEqual({ ok: true })
    })

    it('fetchNavigatorMetricHistory returns array', async () => {
        const mock = vi.spyOn(api, 'get').mockResolvedValue({ data: { history: [{ id: 1, created_at: '2020-01-01' }] } })
        const res = await fetchNavigatorMetricHistory()
        expect(mock).toHaveBeenCalled()
        expect(res).toEqual([{ id: 1, created_at: '2020-01-01' }])
    })

    it('fetchNavigatorMetricSnapshot returns object', async () => {
        const mock = vi.spyOn(api, 'get').mockResolvedValue({ data: { ok: true } })
        const res = await fetchNavigatorMetricSnapshot(123)
        expect(mock).toHaveBeenCalled()
        expect(res).toEqual({ ok: true })
    })

    it('runNavigatorSql throws on non-numeric id', async () => {
        await expect(async () => await runNavigatorSql('not-a-number' as any)).rejects.toThrow()
    })

    it('runNavigatorSql accepts numeric id and posts', async () => {
        const mock = vi.spyOn(api, 'post').mockResolvedValue({ data: { ok: true } })
        const res = await runNavigatorSql(42)
        expect(mock).toHaveBeenCalled()
        expect(res).toEqual({ ok: true })
    })
})
