import { QueryClient } from '@tanstack/react-query'
import { fetchNavigatorInsightsForce, fetchNavigatorMetricHistory } from '../api/client'
import { createLogger } from '../utils/logger'

const log = createLogger('navigatorState')

type RefreshCallbacks = {
    // Allow callers to pass a forceSnapshotId so auto-runs can be associated
    // with a freshly-created numeric snapshot and PATCHed correctly.
    runMetricAction?: (metricKey: string, autoRun?: boolean, forceSnapshotId?: number | null) => Promise<any>
    setDisplayedMetrics?: (m: any[]) => void
    setSelectedSnapshotId?: (v: any) => void
    refetchInsights?: () => Promise<any>
    setMetricHistory?: (h: any[]) => void
    setToast?: (message: string, severity?: 'success' | 'info' | 'warning' | 'error') => void
    setRefreshing?: (b: boolean) => void
}

export function makeNavigatorState(queryClient: QueryClient) {
    // Map applicantId -> active refresh promise to dedupe concurrent refreshes
    const activeRefreshes: Map<number | string, Promise<void>> = new Map()

    async function refresh(applicantId: number | string | null | undefined, callbacks: RefreshCallbacks = {}, opts: { autoRun?: boolean } = { autoRun: true }) {
        const aid = applicantId ?? 'anonymous'
        // Deduplicate concurrent refreshes per-applicant
        if (activeRefreshes.has(aid)) {
            try { log.debug('refresh: returning existing promise', { applicantId: aid }) } catch (e) { }
            return activeRefreshes.get(aid)
        }

        const p = (async () => {
            try {
                try { log.debug('refresh:start', { applicantId: aid, opts }) } catch (e) { }
                try { if (callbacks.setRefreshing) callbacks.setRefreshing(true) } catch (e) { }

                // Ask server to recompute and return fresh computed metrics
                const res = await fetchNavigatorInsightsForce(true)

                if (res && res.metrics) {
                    try {
                        const replaced = Object.assign({}, res || {})
                        replaced.metrics = res.metrics || []
                        replaced.computed_at = res.computed_at || res.computedAt || new Date().toUTCString()

                        // Update UI via callbacks when provided
                        try {
                            if (callbacks.setDisplayedMetrics) callbacks.setDisplayedMetrics(replaced.metrics || [])
                            if (callbacks.setSelectedSnapshotId) callbacks.setSelectedSnapshotId('latest')
                        } catch (e) { }

                        try { await queryClient.cancelQueries(['navigator:insights', applicantId]) } catch (e) { }
                        try { queryClient.removeQueries(['navigator:insights', applicantId], { exact: true }) } catch (e) { }
                        queryClient.setQueryData(['navigator:insights', applicantId], replaced)
                        try { log.debug('refresh: cache replaced', { applicantId: aid, metricsCount: (replaced.metrics || []).length }) } catch (e) { }

                        // Auto-run actionable metrics when requested
                        if (opts.autoRun && callbacks.runMetricAction) {
                            try {
                                const actionable = (res.metrics || []).filter((mm: any) => mm && mm.metric && (new Set(['cv_score', 'linkedin_profile_score', 'navigator_briefing_score']).has(mm.metric)) && !mm.missing)
                                for (const m of actionable) {
                                    // fire-and-forget
                                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                                    // Pass the numeric snapshot id if available so the
                                    // action can PATCH the specific snapshot rather
                                    // than relying on a possibly-string "latest".
                                    const snapshotId = (replaced && ((replaced as any).snapshotid || (replaced as any).id)) ? ((replaced as any).snapshotid || (replaced as any).id) : undefined
                                    callbacks.runMetricAction!(m.metric, true, snapshotId)
                                }
                            } catch (e) {
                                console.error('Failed to auto-run actionable metrics after refresh', e)
                            }
                        }
                    } catch (e) {
                        // If replace fails, ensure query cache holds the raw response
                        try { queryClient.setQueryData(['navigator:insights', applicantId], res) } catch (err) { }
                    }
                }

                // Ask react-query to refetch so other consumers update
                try { if (callbacks.refetchInsights) await callbacks.refetchInsights() } catch (e) { }

                // Reload metric history and expose via callback
                try {
                    const h = await fetchNavigatorMetricHistory()
                    if (callbacks.setMetricHistory) callbacks.setMetricHistory(h || [])
                } catch (e) {
                    // ignore history reload failures
                }
            } catch (e: any) {
                log.error('refresh failed', e)
                try {
                    if (callbacks.setToast) callbacks.setToast('Refresh failed: ' + (e?.message || String(e)), 'error')
                } catch (toastErr) { }
            } finally {
                try { if (callbacks.setRefreshing) callbacks.setRefreshing(false) } catch (e) { }
            }
        })()

        activeRefreshes.set(aid, p)
        try {
            await p
        } finally {
            activeRefreshes.delete(aid)
        }
    }

    return { refresh }
}

export default makeNavigatorState
