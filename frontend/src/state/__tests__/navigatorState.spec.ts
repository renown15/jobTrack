import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import makeNavigatorState from '../navigatorState'

vi.mock('../../api/client', () => ({
    fetchNavigatorInsightsForce: vi.fn(),
    fetchNavigatorMetricHistory: vi.fn()
}))

import { fetchNavigatorInsightsForce, fetchNavigatorMetricHistory } from '../../api/client'

describe('navigatorState.refresh', () => {
    let queryClient: QueryClient

    beforeEach(() => {
        queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        vi.resetAllMocks()
    })

    afterEach(() => {
        try { queryClient.clear() } catch (e) { }
    })

    it('replaces cache and calls callbacks and auto-runs actionable metrics', async () => {
        const ns = makeNavigatorState(queryClient)

            ; (fetchNavigatorInsightsForce as unknown as any).mockResolvedValue({
                metrics: [{ metric: 'cv_score', missing: false, value: 7 }],
                computed_at: 'now'
            })
            ; (fetchNavigatorMetricHistory as unknown as any).mockResolvedValue([{ id: 1 }])

        const callbacks = {
            setDisplayedMetrics: vi.fn(),
            setSelectedSnapshotId: vi.fn(),
            runMetricAction: vi.fn(),
            refetchInsights: vi.fn(),
            setMetricHistory: vi.fn(),
            setToast: vi.fn(),
            setRefreshing: vi.fn()
        }

        await ns.refresh(123, callbacks as any, { autoRun: true })

        expect(callbacks.setDisplayedMetrics).toHaveBeenCalledWith([{ metric: 'cv_score', missing: false, value: 7 }])
        expect(callbacks.setSelectedSnapshotId).toHaveBeenCalledWith('latest')
        // runMetricAction may be invoked with an optional forceSnapshotId (undefined here)
        expect(callbacks.runMetricAction).toHaveBeenCalledWith('cv_score', true, undefined)

        const data = queryClient.getQueryData(['navigator:insights', 123]) as any
        expect(data).toBeTruthy()
        expect(Array.isArray(data.metrics)).toBe(true)
        expect(data.metrics.length).toBe(1)

        expect(callbacks.setMetricHistory).toHaveBeenCalledWith([{ id: 1 }])
    })

    it('dedupes concurrent refreshes for the same applicant', async () => {
        const ns = makeNavigatorState(queryClient)

        let resolver: (v: any) => void = (() => { }) as any
        const slow = new Promise((res) => { resolver = res })
            ; (fetchNavigatorInsightsForce as unknown as any).mockReturnValue(slow)
            ; (fetchNavigatorMetricHistory as unknown as any).mockResolvedValue([])

        const callbacks = {
            setDisplayedMetrics: vi.fn(),
            setSelectedSnapshotId: vi.fn(),
            runMetricAction: vi.fn(),
            refetchInsights: vi.fn(),
            setMetricHistory: vi.fn(),
            setToast: vi.fn(),
            setRefreshing: vi.fn()
        }

        const p1 = ns.refresh(456, callbacks as any, { autoRun: false })
        const p2 = ns.refresh(456, callbacks as any, { autoRun: false })

        // Resolve the underlying fetch
        resolver && resolver({ metrics: [], computed_at: 'now' })

        await Promise.all([p1, p2])

        // Only one backend recompute should have been invoked for both callers
        expect((fetchNavigatorInsightsForce as unknown as any)).toHaveBeenCalledTimes(1)
    })
})
