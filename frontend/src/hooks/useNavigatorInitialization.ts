import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { fetchNavigatorMetricHistory, fetchNavigatorMetricSnapshot } from '../api/client'
import { createLogger } from '../utils/logger'
import { getApplicantId } from '../auth/currentApplicant'

interface NavigatorInsights {
    metrics: any[]
    computed_at?: string
    computedAt?: string
    [key: string]: any
}

interface UseNavigatorInitializationOptions {
    applicantId: number | null
    applicant?: any
    queryClient: QueryClient
    navigatorState: any
    // runMetricAction should match navigatorState/runMetricAction signature
    // which accepts a metric key and optional autoRun flag and may accept an
    // optional forceSnapshotId to ensure results patch the intended snapshot.
    runMetricAction: (metricKey: string, autoRun?: boolean, forceSnapshotId?: number | null) => Promise<any>
    setDisplayedMetrics: (metrics: any[]) => void
    setSelectedSnapshotId: (id: number | 'latest' | null) => void
    refetchInsights: () => void
    setMetricHistory: (history: any[]) => void
    setRefreshing: (refreshing: boolean) => void
    onToast: (msg: string, sev: 'success' | 'info' | 'warning' | 'error') => void
}

const log = createLogger('useNavigatorInitialization')

/**
 * Custom hook to handle Navigator initialization logic.
 * 
 * This hook manages:
 * - Loading cached metrics from session storage or metric history on mount
 * - Running initial LLM refresh once per page load
 * - Handling applicant ID changes (including polling and storage events)
 * - Session flag management to avoid redundant refreshes
 */
export function useNavigatorInitialization(options: UseNavigatorInitializationOptions) {
    const {
        applicantId: effectiveApplicantId,
        applicant,
        queryClient,
        navigatorState,
        runMetricAction,
        setDisplayedMetrics,
        setSelectedSnapshotId,
        refetchInsights,
        setMetricHistory,
        setRefreshing,
        onToast
    } = options

    const initialRefreshDoneRef = useRef(false)

    useEffect(() => {
        let mounted = true
        const aidNow = getApplicantId() || (applicant && (applicant.applicantid || applicant.id || applicant.applicantId))

        const insightsKey = ['navigator:insights', effectiveApplicantId]

        const ensureInitForApplicant = async (aid: number) => {
            if (!mounted) return

            // If no cached insights present in the query cache, try loading the
            // latest persisted snapshot from the metric history so returning to
            // the Navigator shows previously-computed values immediately.
            try {
                const cacheBefore = queryClient.getQueryData<NavigatorInsights>(insightsKey)
                if (!cacheBefore) {
                    try {
                        log.debug('[Navigator.mount] no cache; attempting load from metric history', { applicantId: aid })
                    } catch (e) { }

                    try {
                        const h = await fetchNavigatorMetricHistory()
                        if (h && h.length > 0) {
                            const latest = h[0]
                            if (latest && ((latest as any).snapshotid || latest.id)) {
                                const sid = (latest as any).snapshotid || latest.id
                                try {
                                    log.debug('[Navigator.mount] fetching snapshot', { snapshotId: sid })
                                } catch (e) { }

                                const snap = await fetchNavigatorMetricSnapshot(sid)
                                if (snap) {
                                    try {
                                        const replaced = Object.assign({}, snap || {})
                                        replaced.metrics = (snap && snap.metrics) || []
                                        replaced.computed_at = snap.computed_at || snap.computedAt || new Date().toUTCString()

                                        try { await queryClient.cancelQueries(insightsKey) } catch (e) { }
                                        try { queryClient.removeQueries(insightsKey, { exact: true }) } catch (e) { }
                                        queryClient.setQueryData(insightsKey, replaced)

                                        try {
                                            log.debug('[Navigator.mount] replaced cache with persisted snapshot (cleared previous queries)', {
                                                applicantId: aid,
                                                snapshotId: sid,
                                                metricsCount: (replaced.metrics || []).length
                                            })
                                        } catch (e) { }

                                        try { setDisplayedMetrics(replaced.metrics || []) } catch (e) { }
                                    } catch (e) {
                                        try {
                                            log.debug('[Navigator.mount] failed to apply persisted snapshot', e)
                                        } catch (err) { }
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        try {
                            log.debug('[Navigator.mount] failed to load metric history/snapshot', e)
                        } catch (err) { }
                    }
                }
            } catch (e) { /* ignore */ }

            // If we haven't performed the initial refresh during this page load,
            // do it now unconditionally. This ensures the LLM compute is kicked
            // off the first time the Navigator is selected in this page load.
            if (!initialRefreshDoneRef.current) {
                initialRefreshDoneRef.current = true
                try {
                    await navigatorState.refresh(aid, {
                        runMetricAction,
                        setDisplayedMetrics,
                        setSelectedSnapshotId,
                        refetchInsights,
                        setMetricHistory,
                        setToast: onToast,
                        setRefreshing
                    }, { autoRun: true })

                    try {
                        const cacheAfter = queryClient.getQueryData<NavigatorInsights>(insightsKey)
                        if (cacheAfter && typeof window !== 'undefined' && window.sessionStorage) {
                            const sessionKey = `nav_force_refresh_done_${aid}`
                            window.sessionStorage.setItem(sessionKey, '1')
                            try {
                                log.debug('[Navigator.mount] set sessionKey after initial refresh', {
                                    applicantId: aid,
                                    sessionKey
                                })
                            } catch (e) { }
                        }
                    } catch (e) { /* ignore */ }
                } catch (e) {
                    console.error('[Navigator.mount] initial doRefresh failed', e)
                }
                // we've performed the initial refresh; no further logic needed here
                return
            }

            // Decide whether to run a fresh compute. Only skip if session flag
            // present AND cache exists.
            const sessionKey = `nav_force_refresh_done_${aid}`
            try {
                let skip = false
                try {
                    if (typeof window !== 'undefined' && window.sessionStorage) {
                        const val = window.sessionStorage.getItem(sessionKey)
                        try {
                            log.debug('[Navigator.mount] sessionKey value', {
                                applicantId: aid,
                                sessionKey,
                                val
                            })
                        } catch (e) { }

                        const cacheNow = queryClient.getQueryData<NavigatorInsights>(insightsKey)
                        if (val === '1' && cacheNow) {
                            skip = true
                            try {
                                log.debug('[Navigator.mount] skipping initial doRefresh since session flag set and cache present', {
                                    applicantId: aid
                                })
                            } catch (e) { }
                        }
                    }
                } catch (e) { /* ignore */ }

                if (!skip) {
                    try {
                        await navigatorState.refresh(aid, {
                            runMetricAction,
                            setDisplayedMetrics,
                            setSelectedSnapshotId,
                            refetchInsights,
                            setMetricHistory,
                            setToast: onToast,
                            setRefreshing
                        }, { autoRun: true })

                        try {
                            const cacheAfter = queryClient.getQueryData<NavigatorInsights>(insightsKey)
                            if (cacheAfter && typeof window !== 'undefined' && window.sessionStorage) {
                                window.sessionStorage.setItem(sessionKey, '1')
                                try {
                                    log.debug('[Navigator.mount] set sessionKey after refresh', {
                                        applicantId: aid,
                                        sessionKey
                                    })
                                } catch (e) { }
                            }
                        } catch (e) { /* ignore */ }
                    } catch (e) {
                        console.error('[Navigator.mount] initial doRefresh failed', e)
                    }
                }
            } catch (e) { /* ignore outer errors */ }
        }

        // If we already have an applicant id, run init immediately.
        if (aidNow) {
            void ensureInitForApplicant(Number(aidNow))
        } else {
            // Poll briefly for applicant id to become available (same-window
            // selection may not trigger a React re-render that this hook sees).
            let attempts = 0
            const maxAttempts = 20 // ~6 seconds at 300ms interval
            const interval = setInterval(() => {
                attempts += 1
                const aid = getApplicantId()
                if (aid) {
                    clearInterval(interval)
                    void ensureInitForApplicant(Number(aid))
                } else if (attempts >= maxAttempts) {
                    clearInterval(interval)
                }
            }, 300)

            // Also listen to storage events (other tabs) and trigger on change
            const onStorage = (ev: StorageEvent) => {
                try {
                    if (ev.key === 'jobtrack.applicantId' && ev.newValue) {
                        const aid = Number(ev.newValue)
                        if (aid) {
                            try { clearInterval(interval) } catch (e) { }
                            void ensureInitForApplicant(aid)
                        }
                    }
                } catch (e) { }
            }
            window.addEventListener('storage', onStorage)

            // cleanup
            return () => {
                mounted = false
                try { clearInterval(interval) } catch (e) { }
                try { window.removeEventListener('storage', onStorage) } catch (e) { }
            }
        }

        return () => { mounted = false }
    }, [effectiveApplicantId])
}
