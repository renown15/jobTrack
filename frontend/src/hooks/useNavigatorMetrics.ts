import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    fetchNavigatorInsights,
    fetchNavigatorMetricHistory,
    fetchNavigatorMetricSnapshot
} from '../api/client'
import { createLogger } from '../utils/logger'

const log = createLogger('useNavigatorMetrics')

export interface NavigatorInsights {
    metrics?: any[]
    computed_at?: string
    computedAt?: string
    [k: string]: any
}

export interface UseNavigatorMetricsOptions {
    applicantId: number | null
    onError?: (message: string, severity: 'success' | 'info' | 'warning' | 'error') => void
}

export interface UseNavigatorMetricsResult {
    // Core metrics data
    insights: NavigatorInsights
    insightsLoading: boolean
    refetchInsights: () => void

    // Displayed metrics (may differ from insights if viewing history)
    displayedMetrics: any[]
    setDisplayedMetrics: (metrics: any[]) => void

    // Metric history
    metricHistory: any[]
    setMetricHistory: (history: any[]) => void
    historyLoading: boolean
    selectedSnapshotId: number | null
    setSelectedSnapshotId: (id: number | null) => void

    // Refresh state
    refreshing: boolean
    setRefreshing: (refreshing: boolean) => void

    // Helper: load a specific snapshot and update displayed metrics
    loadSnapshot: (snapshotId: number) => Promise<void>
}

export function useNavigatorMetrics(options: UseNavigatorMetricsOptions): UseNavigatorMetricsResult {
    const { applicantId, onError } = options
    const queryClient = useQueryClient()

    // Build query key for insights
    const insightsKey = ['navigator:insights', applicantId]

    // State for metric history and selection
    const [metricHistory, setMetricHistory] = useState<any[]>([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [selectedSnapshotId, setSelectedSnapshotId] = useState<number | null>(null)
    const [refreshing, setRefreshing] = useState(false)

    // Debug logging for selectedSnapshotId changes
    useEffect(() => {
        console.log('[useNavigatorMetrics] selectedSnapshotId changed:', selectedSnapshotId)
    }, [selectedSnapshotId])

    // Fetch insights from the backend
    const {
        data: insightsResp = { metrics: [] },
        isLoading: insightsLoading,
        refetch: refetchInsights
    } = useQuery<NavigatorInsights>(
        insightsKey,
        fetchNavigatorInsights,
        {
            // Keep computed metrics fresh for the session
            staleTime: Infinity,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            refetchOnReconnect: false,
            enabled: !!applicantId,
            // Use cached data if available (from previous refresh)
            initialData: () => {
                try {
                    const v = queryClient.getQueryData<NavigatorInsights>(insightsKey)
                    if (v) {
                        log.debug('[useNavigatorMetrics] initialData read', {
                            applicantId,
                            hasData: !!v,
                            metricsCount: v.metrics?.length || 0
                        })
                    }
                    return v
                } catch (e) {
                    return undefined
                }
            }
        }
    )

    // Displayed metrics (may differ from insights when viewing history)
    const [displayedMetrics, setDisplayedMetrics] = useState<any[]>(insightsResp.metrics || [])

    // Debug: log insights payload when it changes
    useEffect(() => {
        try {
            const metrics = insightsResp?.metrics || []
            const computedAt = insightsResp?.computed_at || insightsResp?.computedAt
            // Only log when there are metrics or a timestamp (meaningful update)
            if (metrics.length === 0 && !computedAt) return
            log.debug('[useNavigatorMetrics] insights payload', metrics.length ? metrics : insightsResp)
        } catch (e) { /* ignore */ }
    }, [insightsResp])

    // Initialize displayed metrics from insights on mount or when insights first arrive
    // Don't continuously sync to avoid wiping LLM results that are added after initial load
    useEffect(() => {
        if (!displayedMetrics || displayedMetrics.length === 0) {
            const newMetrics = insightsResp.metrics || []
            if (newMetrics.length > 0) {
                setDisplayedMetrics(newMetrics)
            }
        }
    }, [insightsResp]) // Don't include displayedMetrics in deps to avoid wiping updates

    // Reset displayed metrics when applicant ID changes
    useEffect(() => {
        if (applicantId) {
            setDisplayedMetrics(insightsResp.metrics || [])
            setSelectedSnapshotId(null)
        }
    }, [applicantId])

    // Load metric history on mount
    useEffect(() => {
        if (!applicantId) return

        let mounted = true
        const load = async () => {
            setHistoryLoading(true)
            try {
                const h = await fetchNavigatorMetricHistory()
                if (!mounted) return
                setMetricHistory(h || [])
            } catch (e) {
                console.error('[useNavigatorMetrics] Failed to load metric history', e)
                if (onError) {
                    onError('Failed to load metric history', 'warning')
                }
                if (!mounted) return
                setMetricHistory([])
            } finally {
                if (mounted) setHistoryLoading(false)
            }
        }
        load()
        return () => { mounted = false }
    }, [applicantId]) // onError is a callback, doesn't need to trigger reload

    // Helper function to load a specific snapshot
    const loadSnapshot = async (snapshotId: number): Promise<void> => {
        try {
            log.debug('[useNavigatorMetrics] loading snapshot', { snapshotId })
            const snap = await fetchNavigatorMetricSnapshot(snapshotId)
            if (snap) {
                const replaced = Object.assign({}, snap || {})
                replaced.metrics = snap?.metrics || []
                replaced.computed_at = snap.computed_at || snap.computedAt || new Date().toUTCString()

                setDisplayedMetrics(replaced.metrics || [])
                setSelectedSnapshotId(snapshotId)

                log.debug('[useNavigatorMetrics] snapshot loaded', {
                    snapshotId,
                    metricsCount: replaced.metrics.length
                })
            }
        } catch (e) {
            console.error('[useNavigatorMetrics] Failed to load snapshot', e)
            if (onError) {
                onError('Failed to load metric snapshot', 'error')
            }
            throw e
        }
    }

    return {
        insights: insightsResp,
        insightsLoading,
        refetchInsights,
        displayedMetrics,
        setDisplayedMetrics,
        metricHistory,
        setMetricHistory,
        historyLoading,
        selectedSnapshotId,
        setSelectedSnapshotId,
        refreshing,
        setRefreshing,
        loadSnapshot
    }
}
