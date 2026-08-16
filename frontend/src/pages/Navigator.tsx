import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ACCORDION_TITLE_SX, ACCORDION_TITLE_VARIANT } from '../constants/ui'
import { BRAND_PURPLE, BRAND_PURPLE_LIGHT } from '../constants/colors'
import BouncingDots from '../components/Common/BouncingDots'
import { Box, Button, Typography, Paper, Grid, Stack, Chip, DialogTitle, DialogContent, DialogActions, IconButton, Avatar, CircularProgress, Accordion, AccordionSummary, AccordionDetails, Divider, Select, MenuItem, FormControl, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip } from '@mui/material'
import Dialog from '../components/Shared/WideDialog'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import MobileNavigatorMetricsList from '../components/Mobile/MobileNavigatorMetricsList'
import AppButton from '../components/Shared/AppButton'
import PersonIcon from '@mui/icons-material/Person'
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import AccountCircleIcon from '@mui/icons-material/AccountCircle'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import RemoveIcon from '@mui/icons-material/Remove'

import { fetchNavigatorInsights, fetchNavigatorInsightsForce, fetchNavigatorMetricHistory, fetchNavigatorMetricSnapshot, fetchNavigatorActions, fetchNavigatorPrompts, fetchNavigatorDocumentsText, fetchApplicantBriefingBatches, fetchApplicantBriefingBatch, fetchApplicantSettings, fetchReferenceData, runNavigatorSql, navigatorQuery, fetchNavigatorDetail, fetchTasks, fetchTaskTargets, fetchDocuments } from '../api/client'
import makeNavigatorState from '../state/navigatorState'
import { useNavigatorInitialization } from '../hooks/useNavigatorInitialization'
import { useNavigatorDocuments } from '../hooks/useNavigatorDocuments'
import { useNavigatorActions } from '../hooks/useNavigatorActions'
import { createLogger } from '../utils/logger'
import { getApplicantId } from '../auth/currentApplicant'
import extractModelResult from '../utils/navigatorParser'
import DataTable from '../components/DataTable'
import WideDialog from '../components/Shared/WideDialog'
import ContactsTable from '../components/Hub/ContactsTable'
import EngagementsTable from '../components/Hub/EngagementsTable'
import RolesTable from '../components/Hub/RolesTable'
import Toast from '../components/Shared/Toast'

// Small helper to convert metric keys like `cv_score` -> `Cv Score`
function formatMetricName(k: string | null | undefined) {
    if (!k) return ''
    return String(k).replace(/_/g, ' ').replace(/\b\w/g, (c) => String(c).toUpperCase())
}

// Format numbers with thousand separators. Accepts optional decimals to force
// a fixed number of fraction digits (useful for deltas).
function formatNumber(v: any, decimals?: number) {
    if (v === null || v === undefined || v === '') return ''
    const n = Number(v)
    if (Number.isNaN(n)) return String(v)
    if (decimals != null) {
        return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    }
    return n.toLocaleString()
}

// Label overrides to match spec renaming (keyed by metric)
const METRIC_LABEL_OVERRIDES: Record<string, string> = {
    'met_no_cv': "Contacts that you've met but not sent a CV",
    'not_checked_in_with': "Contacts that you haven't checked in with",
    'new_engagements_last_month': 'New Engagements in the Last Month',
    'new_contacts_last_month': 'New Contacts in the Last Month',
    'new_contacts_from_leads_last_month': 'New Contacts Promoted from Leads in the Last Month',
    'networking_events_last_3_months': 'Networking events in the last 3 months',
    'leads_to_be_reviewed': 'Leads to be reviewed',
    'number_of_action_plans': 'Number of Action Plans',
    'cv_score': 'CV Score',
    'linkedin_profile_score': 'LinkedIn Profile Score'
}

// Minimal local type for navigator insights returned by the backend.
// Keep this file-local to avoid adding global declarations.
type NavigatorInsights = {
    metrics?: any[]
    computed_at?: string
    computedAt?: string
    [k: string]: any
}

export default function Navigator({ applicant, docs = [] }: any) {
    // Resolve a stable applicant id to use as the document-fetch dependency.
    // Prefer the global selection but fall back to the `applicant` prop when present.
    const effectiveApplicantId = getApplicantId() || (applicant && (applicant.applicantid || applicant.id || applicant.applicantId))

    // Documents are managed by a dedicated hook which will fetch when
    // `docs` prop is not supplied and expose a helper to resolve the
    // latest document by type.
    const { documents: effectiveDocs, loading: docsLoading, error: docsError, getLatestDocByType } = useNavigatorDocuments(effectiveApplicantId, docs)

    // Documents are handled by `useNavigatorDocuments`; no local fetch required.

    // latest doc helpers are available via DOCUMENT_GET inputs; do not render readiness UI

    // Navigator briefing batches
    const { data: briefingBatches = [] } = useQuery(['navbrief:batches'], fetchApplicantBriefingBatches)
    const latestBriefing: any = (briefingBatches && briefingBatches.length > 0) ? briefingBatches[0] : null
    const hasBriefing = !!latestBriefing
    const [briefingModalOpen, setBriefingModalOpen] = useState(false)
    const [briefingLoading, setBriefingLoading] = useState(false)
    const [briefingRows, setBriefingRows] = useState<Array<any>>([])

    // Applicant settings (to detect superuser flag)
    const { data: applicantSettings = {} } = useQuery(['settings', 'applicant'], fetchApplicantSettings)

    // Navigator insights (metrics) fetched from the backend
    const queryClient = useQueryClient()

    const insightsKey = ['navigator:insights', effectiveApplicantId]

    const log = createLogger('Navigator')

    // Diagnostic: show cache state and applicant id at render/mount time
    try {
        log.debug('[Navigator] mount check', { effectiveApplicantId, insightsKey, cacheBefore: queryClient.getQueryData<NavigatorInsights>(insightsKey) })
    } catch (e) { }

    // Navigator state helper that centralises refresh/cache orchestration
    const navigatorState = makeNavigatorState(queryClient)

    const { data: insightsResp = { metrics: [] }, isLoading: insightsLoading, refetch: refetchInsights } = useQuery<NavigatorInsights>(
        insightsKey,
        fetchNavigatorInsights,
        {
            // Keep the computed metrics fresh for the session — avoid automatic
            // refetches when the component remounts or the window regains focus.
            staleTime: Infinity,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            refetchOnReconnect: false,
            // If a previous refresh stored results in the cache, use them immediately
            // so remounting the component shows computed LLM metrics without a network call.
            initialData: () => {
                try {
                    const v = queryClient.getQueryData<NavigatorInsights>(insightsKey)
                    log.debug('[Navigator.useQuery] initialData read', { effectiveApplicantId, hasData: !!v, snapshotKeys: v && v.metrics ? v.metrics.map((m: any) => m.metric) : null })
                    return v
                } catch (e) {
                    return undefined
                }
            }
        }
    )

    // Initialization is handled by the `useNavigatorInitialization` hook below
    // which delegates to `navigatorState.refresh` and coordinates snapshot
    // loading. The hook is invoked after action-related hooks are initialized.

    // Metric history dropdown state
    const [metricHistory, setMetricHistory] = React.useState<Array<any>>([])
    const [historyLoading, setHistoryLoading] = React.useState(false)
    const [selectedSnapshotId, setSelectedSnapshotId] = React.useState<number | 'latest' | null>('latest')
    const [displayedMetrics, setDisplayedMetrics] = React.useState<any[]>(insightsResp.metrics || [])
    const [refreshing, setRefreshing] = React.useState(false)


    // Debug: log the raw metrics payload to help diagnose UI detail issues.
    // Avoid noisy repeated logs when the metrics array is empty by only
    // emitting debug output when we have non-empty metrics or when the
    // computed_at timestamp changes (meaningful update).
    React.useEffect(() => {
        try {
            const metrics = insightsResp && insightsResp.metrics ? insightsResp.metrics : []
            const computedAt = insightsResp && (insightsResp.computed_at || insightsResp.computedAt)
            // Only log when there are metrics to inspect or when a computed_at
            // timestamp is present (indicates a cached snapshot).
            if ((!metrics || metrics.length === 0) && !computedAt) return
            log.debug('[Navigator] insights payload', metrics.length ? metrics : insightsResp)
        } catch (e) { }
    }, [insightsResp])

    // Keep displayed metrics in sync with latest insights when 'latest' is selected
    React.useEffect(() => {
        if (selectedSnapshotId === 'latest' || selectedSnapshotId == null) {
            try {
                const before = displayedMetrics && displayedMetrics.length
                const incoming = insightsResp && insightsResp.metrics ? insightsResp.metrics.length : 0
                try { log.debug('[Navigator] syncing displayedMetrics', { selectedSnapshotId, before, incoming }) } catch (e) { }
            } catch (e) { }
            setDisplayedMetrics(insightsResp.metrics || [])
        }
    }, [insightsResp, selectedSnapshotId])

    // Load metric history on mount
    React.useEffect(() => {
        let mounted = true
        const load = async () => {
            setHistoryLoading(true)
            try {
                const h = await fetchNavigatorMetricHistory()
                if (!mounted) return
                setMetricHistory(h || [])
            } catch (e) {
                console.error('Failed to load metric history', e)
                try {
                    setToastMessage('Failed to load metric history')
                    setToastSeverity('warning')
                    setToastOpen(true)
                } catch (toastErr) { /* ignore */ }
                if (!mounted) return
                setMetricHistory([])
            } finally {
                if (mounted) setHistoryLoading(false)
            }
        }
        load()
        return () => { mounted = false }
    }, [])

    // UI state used across the Navigator component
    const [generating, setGenerating] = useState<boolean>(false)
    const [status, setStatus] = useState<string | null>(null)
    const [fullPrompt, setFullPrompt] = useState<string | null>(null)
    const [tokenCounts, setTokenCounts] = useState<Record<string, any> | null>(null)
    const [actionPlan, setActionPlan] = useState<string | null>(null)
    const [rawResponse, setRawResponse] = useState<string | null>(null)
    // Toast state for surfaced errors/info
    const [toastOpen, setToastOpen] = React.useState(false)
    const [toastMessage, setToastMessage] = React.useState('')
    const [toastSeverity, setToastSeverity] = React.useState<'success' | 'info' | 'warning' | 'error'>('info')

    // Navigator actions and input type reference data
    const { data: navActions = [] } = useQuery(['nav:actions'], fetchNavigatorActions)
    const { data: inputTypes = [] } = useQuery(['refdata', 'NAVIGATOR_INPUT_TYPE'], () => fetchReferenceData('NAVIGATOR_INPUT_TYPE'))
    const { data: navPrompts = [] } = useQuery(['nav:prompts'], fetchNavigatorPrompts)

    const handleAction = async (action: any, metricKey?: string) => {
        if (!action || !(action.inputs || []).length) return
        setGenerating(true)
        setStatus(`Executing ${action.actionname}…`)
        try {
            const inputs = (action.inputs || []).slice().sort((a: any, b: any) => (Number(a.sortorderid || 0) - Number(b.sortorderid || 0)))
            const promptParts: string[] = []
            const documentIds: number[] = []

            for (const inp of inputs) {
                const it = (inputTypes || []).find((t: any) => (t.refid ?? t.id ?? t.value) === inp.inputtypeid)
                const label = (it && (it.refvalue || it.label || it.name)) ? String(it.refvalue || it.label || it.name).toUpperCase() : ''
                const val = inp.inputvalue || ''
                if (label === 'PROMPT_BUILD') {
                    const found = (navPrompts || []).find((p: any) => String((p.promptname || '')).toUpperCase() === String(val).toUpperCase())
                    if (found && found.promptvalue) promptParts.push(found.promptvalue)
                    else promptParts.push(`(missing prompt ${val})`)
                } else if (label === 'DOCUMENT_GET') {
                    const doc = getLatestDocByType(val)
                    if (doc && doc.documentid) {
                        // Log which document was selected for this DOCUMENT_GET input.
                        // Use console.info so it's visible even when debug is filtered,
                        // and push to a global array so logs persist for inspection.
                        try {
                            log.info('Navigator.DOCUMENT_GET selected document', { requestedType: val, document: doc })
                            try {
                                log.debug('nav_debug:selected_document', { ts: Date.now(), requestedType: val, document: doc })
                            } catch (e) { /* ignore logging errors */ }
                        } catch (e) { }
                        documentIds.push(doc.documentid)
                        // Try to fetch extracted text for the document so it can be included inline
                        try {
                            const texts = await fetchNavigatorDocumentsText([doc.documentid])
                            const first = (texts && texts.length > 0) ? texts[0] : null
                            const docText = first && first.text ? String(first.text).trim() : ''
                            // Log whether we received extracted text using info-level output
                            try {
                                log.info('Navigator.DOCUMENT_GET fetched extracted text', { documentid: doc.documentid, text_present: !!docText, snippet: docText ? docText.slice(0, 200) : null, rawResponse: first })
                                try {
                                    log.debug('nav_debug:fetched_text', { ts: Date.now(), documentid: doc.documentid, text_present: !!docText, snippet: docText ? docText.slice(0, 200) : null, raw: first })
                                } catch (e) { /* ignore logging errors */ }
                            } catch (e) { }
                            if (docText && docText.length > 0) {
                                // limit size to 10000 chars to avoid huge prompts
                                const snippet = docText.length > 10000 ? docText.slice(0, 10000) + '\n... (truncated)' : docText
                                promptParts.push(`Document: ${val}\n\n${snippet}`)
                            } else {
                                // For certain metric actions, missing extracted text should fail the whole action
                                const strictMetrics = new Set(['cv_score', 'linkedin_profile_score'])
                                if (metricKey && strictMetrics.has(metricKey)) {
                                    throw new Error(`Required document text not available for ${metricKey}`)
                                }
                                promptParts.push(`Document: ${val} (attached; no extracted text)`)
                            }
                        } catch (e) {
                            // If extraction failed and this is a strict metric, surface an error
                            const strictMetrics = new Set(['cv_score', 'linkedin_profile_score'])
                            if (metricKey && strictMetrics.has(metricKey)) {
                                log.error('Document extraction failed for strict metric', { documentid: doc.documentid, err: e })
                                throw e
                            }
                            // Log the error to help diagnose why document extraction failed (network/CORS/auth/etc.)
                            log.error('Failed to fetch extracted document text for navigator', { documentid: doc.documentid, err: e })
                            promptParts.push(`Document: ${val} (attached; text fetch failed)`)
                        }
                    } else {
                        // Missing document entirely should fail for strict metrics
                        try { log.info('Navigator.DOCUMENT_GET no document found for requested type', { requestedType: val, docsPropCount: (docs || []).length }) } catch (e) { }
                        try { log.debug('nav_debug:no_document', { ts: Date.now(), requestedType: val, docsCount: (docs || []).length }) } catch (e) { }
                        const strictMetrics = new Set(['cv_score', 'linkedin_profile_score'])
                        if (metricKey && strictMetrics.has(metricKey)) {
                            throw new Error(`Required document not found for ${metricKey}`)
                        }
                        promptParts.push(`(no document found: ${val})`)
                    }
                } else if (label === 'DB_QUERY') {
                    // The backend now expects a numeric stored query id (navigatorinput.inputid)
                    // rather than raw SQL. If the configured `val` is not numeric, surface
                    // a helpful message so the administrator can update the action input.
                    const maybeNum = (val || '').toString().trim()
                    const qid = Number(maybeNum)
                    if (!Number.isFinite(qid) || qid <= 0) {
                        promptParts.push('(db query not executed: navigator input must reference a stored query id (navigatorinput.inputid) with inputtype DB_QUERY)')
                    } else {
                        try {
                            const res = await runNavigatorSql(qid)
                            if (res && Array.isArray(res.serialized)) {
                                promptParts.push(res.serialized.join('\n'))
                            } else if (res && res.rows) {
                                const s = (res.rows || []).map((r: any) => Object.entries(r).map(([k, v]) => `${k}=${v}`).join(',')).join('\n')
                                promptParts.push(s)
                            } else {
                                promptParts.push('(db query returned no rows)')
                            }
                        } catch (e: any) {
                            promptParts.push(`(db query failed: ${e?.message || String(e)})`)
                        }
                    }
                } else {
                    promptParts.push(val)
                }
                // Special input label: include serialized applicant briefing/profile
                if (label === 'APPLICANT_PROFILE') {
                    try {
                        // Determine latest briefing batch timestamp (if any)
                        let batchTs: string | undefined = undefined
                        if (latestBriefing) batchTs = typeof latestBriefing === 'string' ? latestBriefing : (latestBriefing.batchcreationtimestamp || latestBriefing.batch)
                        let briefingRowsForPrompt: any[] = []
                        if (batchTs) {
                            try {
                                briefingRowsForPrompt = await fetchApplicantBriefingBatch(batchTs)
                            } catch (e) {
                                console.debug('Failed to fetch briefing rows for APPLICANT_PROFILE input', e)
                                briefingRowsForPrompt = []
                            }
                        }
                        const serialized = (briefingRowsForPrompt || []).map((r: any, i: number) => {
                            const q = r.questiontext || r.question || `Question ${i + 1}`
                            const a = r.questionanswer || r.answer || ''
                            return `${i + 1}. ${q}\nAnswer: ${a}`
                        }).join('\n\n')
                        if (serialized && serialized.length > 0) promptParts.push(`Applicant briefing profile:\n\n${serialized}`)
                        else promptParts.push('(no applicant briefing available)')
                    } catch (e) {
                        console.error('Failed to serialize APPLICANT_PROFILE', e)
                        promptParts.push('(applicant briefing serialization failed)')
                    }
                }
            }

            const promptText = promptParts.join('\n\n')
            // expose the composed prompt in the Full Prompt box so superusers can review it
            setFullPrompt(promptText)
            const extra: any = {}
            if (documentIds.length) extra.document_ids = documentIds

            setStatus('Calling navigator LLM...')
            const res = await navigatorQuery(promptText, undefined, { first_name: ((applicant as any)?.firstName || applicant?.firstname || '') }, extra)
            log.debug('Action response', res)
            try {
                setRawResponse(JSON.stringify(res && (res.response || res), null, 2))
            } catch { setRawResponse(null) }
            // Capture token counts when returned by the server (superusers only)
            try {
                setTokenCounts(res && res.token_counts ? res.token_counts : (res && typeof res === 'object' && res.response && res.response.token_counts ? res.response.token_counts : null))
            } catch (e) {
                setTokenCounts(null)
            }
            // Helper: format string responses from LLM — try to parse JSON and
            // pretty-print it; otherwise unescape common escaped newlines for readability.
            const formatLLMString = (s: any) => {
                if (s == null) return ''
                if (typeof s !== 'string') return typeof s === 'object' ? JSON.stringify(s, null, 2) : String(s)
                const str = s
                // Try direct JSON parse
                try {
                    const j = JSON.parse(str)
                    return JSON.stringify(j, null, 2)
                } catch (e) {
                    // Try unescaping literal \n and parse again
                    try {
                        const unescaped = str.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
                        const j2 = JSON.parse(unescaped)
                        return JSON.stringify(j2, null, 2)
                    } catch (e2) {
                        // Try to extract JSON substring
                        const m = str.match(/(\{[\s\S]*\})/)
                        if (m && m[1]) {
                            try {
                                const j3 = JSON.parse(m[1])
                                return JSON.stringify(j3, null, 2)
                            } catch (e3) { /* fallthrough */ }
                        }
                        // Fallback: replace escaped newlines so the string displays nicely
                        return str.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
                    }
                }
            }

            // We no longer store action plan HTML/text in the UI. Keep token counts and prompt for debugging.
            setStatus('Done')
            return res
        } catch (e: any) {
            console.error('Action execution failed', e)
            setStatus('Action failed')
            setActionPlan('Action failed: ' + (e?.message || String(e)))
            try {
                setToastMessage('Action failed: ' + (e?.message || String(e)))
                setToastSeverity('error')
                setToastOpen(true)
            } catch (toastErr) { /* ignore */ }
            return null
        } finally {
            setGenerating(false)
            setTimeout(() => setStatus(null), 2500)
        }
    }

    // State for navigator insight modal
    const [insightModalOpen, setInsightModalOpen] = React.useState(false)
    const [insightModalContent, setInsightModalContent] = React.useState<string | null>(null)
    const [insightModalScore, setInsightModalScore] = React.useState<number | null>(null)

    const ACTIONABLE_METRICS = new Set(['cv_score', 'linkedin_profile_score', 'navigator_briefing_score'])

    // Metrics that should not present a detail action/button per spec
    const NO_DETAIL_METRICS = new Set(['networking_events_last_3_months', 'leads_to_be_reviewed'])

    // Per-metric cached results and running flags
    const [metricModelScores, setMetricModelScores] = React.useState<Record<string, number | null>>({})
    const [metricModelCommentary, setMetricModelCommentary] = React.useState<Record<string, string | null>>({})
    const runningMetricsRef = React.useRef<Record<string, boolean>>({})
    const [runningMetrics, setRunningMetrics] = React.useState<Record<string, boolean>>({})

    const runMetricAction = async (metricKey: string, autoRun: boolean = false) => {
        const displayName = formatMetricName(metricKey)
        const match = (navActions || []).find((a: any) => String(a.actionname || '').trim().toLowerCase() === String(displayName).trim().toLowerCase())
        if (!match) {
            // Do not open UI here; caller will present any messages.
            if (!autoRun) return { error: `No Navigator action configured for "${displayName}"` }
            return null
        }
        // prevent duplicate concurrent runs (use ref for immediate checks, state for render)
        if (runningMetricsRef.current[metricKey]) return
        runningMetricsRef.current[metricKey] = true
        setRunningMetrics((s) => ({ ...(s || {}), [metricKey]: true }))
        try {
            const res = await handleAction(match, metricKey)
            // Prefer to parse the raw response text when present (it often contains fenced JSON)
            const rawText = res && res.response && (res.response.text || res.response.answer) ? (res.response.text || res.response.answer) : null
            const parsed = extractModelResult(rawText ?? res)
            // Dev-only debug to help diagnose parsing problems
            if (process.env.NODE_ENV === 'development') {
                try {
                    log.debug('[Navigator] extractModelResult parsed', { metricKey, parsed, rawText, rawResponse: res })
                } catch (e) { /* ignore logging errors */ }
            }
            // Cache results for UI; don't open modals here (auto-run must be silent)
            setMetricModelScores((s) => ({ ...(s || {}), [metricKey]: parsed.score }))
            setMetricModelCommentary((s) => ({ ...(s || {}), [metricKey]: parsed.commentary }))
            return res
        } catch (e) {
            // show toast for manual runs; remain silent for auto-run failures
            if (!autoRun) {
                try {
                    setToastMessage(`Action failed: ${String(e)}`)
                    setToastSeverity('error')
                    setToastOpen(true)
                } catch (toastErr) { /* ignore */ }
                return { error: `Action failed: ${String(e)}` }
            }
            return null
        } finally {
            runningMetricsRef.current[metricKey] = false
            setRunningMetrics((s) => ({ ...(s || {}), [metricKey]: false }))
        }
    }

    // When the user presses the info button: show cached commentary if present,
    // otherwise run the action and then present the results in the modal.
    const handleInfoClick = async (metricKey: string) => {
        if (runningMetricsRef.current[metricKey]) return

        const cachedScore = metricModelScores && metricModelScores[metricKey]
        const cachedCommentary = metricModelCommentary && metricModelCommentary[metricKey]
        if (cachedScore != null || cachedCommentary) {
            setInsightModalScore(cachedScore != null ? Number(cachedScore) : null)
            setInsightModalContent(cachedCommentary ? String(cachedCommentary) : 'No commentary available')
            setInsightModalOpen(true)
            return
        }

        const res = await runMetricAction(metricKey, false)
        if (res && res.error) {
            setInsightModalContent(String(res.error))
            setInsightModalScore(null)
            setInsightModalOpen(true)
            return
        }
        // Extract from returned response (or fall back to cache)
        const parsed = extractModelResult(res || (metricModelCommentary ? metricModelCommentary[metricKey] : null))
        const finalScore = parsed.score != null ? parsed.score : (metricModelScores ? metricModelScores[metricKey] : null)
        const finalCommentary = parsed.commentary != null ? parsed.commentary : (metricModelCommentary ? metricModelCommentary[metricKey] : null)
        setInsightModalScore(finalScore != null ? Number(finalScore) : null)
        setInsightModalContent(finalCommentary ? String(finalCommentary) : (res ? JSON.stringify(res, null, 2) : 'No commentary returned'))
        setInsightModalOpen(true)
    }

    // Use the shared initialization hook to handle initial snapshot loading
    // and to trigger the per-session refresh behaviour. This delegates to
    // `navigatorState.refresh` and keeps the mount logic consistent.
    useNavigatorInitialization({
        applicantId: effectiveApplicantId ?? null,
        applicant,
        queryClient,
        navigatorState,
        runMetricAction,
        setDisplayedMetrics,
        setSelectedSnapshotId,
        refetchInsights,
        setMetricHistory,
        setRefreshing,
        onToast: (msg: string, sev: any = 'error') => { try { setToastMessage(msg); setToastSeverity(sev); setToastOpen(true) } catch (e) { } }
    })

    // Open a simple detail modal for a metric (counts or other detail view)
    const openMetricDetail = async (m: any) => {
        try {
            // Open a domain-specific detail modal by fetching rows from the backend
            const metricKey = m && m.metric ? m.metric : (typeof m === 'string' ? m : null)
            setInsightModalScore(m && typeof m.value === 'number' ? Number(m.value) : null)
            // clear any previous detail rows
            setDetailRows([])
            setDetailMetric(metricKey)
            const aid = getApplicantId() || (applicant && (applicant.applicantid || applicant.id || applicant.applicantId))
            if (!aid || !metricKey) {
                setInsightModalContent('No applicant or metric specified')
                return
            }
            // Special-case behaviour for Action Plan metrics: open a filtered
            // Action Plan modal instead of the generic navigator detail endpoint.
            if (metricKey === 'number_of_action_plans' || metricKey === 'overdue_action_plans') {
                const isOverdue = metricKey === 'overdue_action_plans'
                setActionModalTitle(isOverdue ? 'Overdue Action Plans' : 'Action Plans')
                setActionModalOpen(true)
                setActionModalLoading(true)
                try {
                    const tasks = await fetchTasks()
                    let filtered = tasks || []
                    if (isOverdue) {
                        const today = new Date()
                        filtered = filtered.filter((t: any) => t.duedate && (new Date(t.duedate) < today))
                    }

                    // Attach targets for each filtered task so the modal can show target counts.
                    const mapping = await Promise.all((filtered || []).map(async (t: any) => {
                        try {
                            const targets = await fetchTaskTargets(t.taskid)
                            return { task: t, targets }
                        } catch (e) {
                            return { task: t, targets: [] }
                        }
                    }))

                    if (!isOverdue) {
                        // number_of_action_plans: only include tasks that have targets
                        filtered = mapping.filter((m2: any) => (m2.targets || []).length > 0).map((m2: any) => ({ ...m2.task, targets: m2.targets }))
                    } else {
                        filtered = mapping.map((m2: any) => ({ ...m2.task, targets: m2.targets }))
                    }

                    setActionModalTasks(filtered || [])
                } catch (e) {
                    console.error('Failed to load tasks for action-plan modal', e)
                    setActionModalTasks([])
                } finally {
                    setActionModalLoading(false)
                }
                return
            }
            setDetailModalOpen(true)
            try {
                const j = await fetchNavigatorDetail(metricKey)
                if (j && j.ok && Array.isArray(j.rows)) {
                    setDetailRows(j.rows || [])
                    setInsightModalContent(`Showing ${j.rows.length} rows for ${metricKey}`)
                } else if (j && j.rows) {
                    setDetailRows(j.rows || [])
                    setInsightModalContent(`Showing ${j.rows.length} rows for ${metricKey}`)
                } else if (j && j.error) {
                    setInsightModalContent(String(j.error))
                } else {
                    setInsightModalContent('No rows returned')
                }
            } catch (e) {
                setInsightModalContent('Failed to load detail rows')
                setDetailRows([])
            }
        } catch (e) {
            setInsightModalContent(String(m))
            setInsightModalOpen(true)
        }
    }

    // Detail modal state
    const [detailModalOpen, setDetailModalOpen] = React.useState(false)
    const [detailRows, setDetailRows] = React.useState<Array<any>>([])
    const [detailMetric, setDetailMetric] = React.useState<string | null>(null)

    // Action Plan modal state (opened when user clicks the Action Plans metrics)
    const [actionModalOpen, setActionModalOpen] = React.useState(false)
    const [actionModalLoading, setActionModalLoading] = React.useState(false)
    const [actionModalTasks, setActionModalTasks] = React.useState<any[]>([])
    const [actionModalTitle, setActionModalTitle] = React.useState<string>('')

    // Auto-run actionable metric actions when insights load (once) and prerequisites exist
    // Wait until document fetch has completed and at least one document is available
    // before attempting strict metric runs (cv/linkedin) to avoid race conditions
    // where the initial refresh fires before documents are loaded.
    React.useEffect(() => {
        // Only auto-run actionable metrics when viewing the 'latest' computed set
        if (selectedSnapshotId && selectedSnapshotId !== 'latest') return
        if (!insightsResp || !(insightsResp.metrics || []).length) return
        if (!navActions || !navActions.length) return

        // If documents are still loading or none are available, skip auto-run now.
        // Only run when we have at least one document available via `effectiveDocs`
        // to avoid premature failures.
        if (!effectiveDocs || effectiveDocs.length === 0) return

        // Persist a per-applicant session flag so we only auto-run once per
        // browsing session. This prevents repeated LLM calls when the
        // component unmounts/remounts as the user navigates the sidebar.
        const aid = getApplicantId() || (applicant && (applicant.applicantid || applicant.id || applicant.applicantId))
        const sessionKey = aid ? `nav_auto_run_done_${aid}` : 'nav_auto_run_done'
        try {
            if (typeof window !== 'undefined' && window.sessionStorage && window.sessionStorage.getItem(sessionKey) === '1') {
                return
            }
        } catch (e) { /* ignore sessionStorage errors */ }

        for (const m of (insightsResp.metrics || [])) {
            if (!ACTIONABLE_METRICS.has(m.metric)) continue
            if (m.missing) continue
            if (metricModelScores && metricModelScores[m.metric] != null) continue
            // fire and forget
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            runMetricAction(m.metric, true)
        }

        try {
            if (typeof window !== 'undefined' && window.sessionStorage) window.sessionStorage.setItem(sessionKey, '1')
        } catch (e) { /* ignore */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [insightsResp, navActions, selectedSnapshotId, effectiveDocs])

    // Populate metricModelScores/commentary from any model data embedded in the
    // metrics themselves (e.g. when loading a persisted snapshot that already
    // contains computed LLM results). This prevents re-running the model when
    // the data is already available.
    React.useEffect(() => {
        if (!displayedMetrics || !displayedMetrics.length) return
        const scoresUpdate: Record<string, number | null> = {}
        const commentaryUpdate: Record<string, string | null> = {}
        let found = false
        for (const m of displayedMetrics) {
            if (!m || !m.metric) continue
            if (!ACTIONABLE_METRICS.has(m.metric)) continue

            // Heuristics to detect embedded model results in different shapes
            // - m.model && m.model.score
            // - m.model_score | m.modelScore | m.llm_score
            // - m.score (but ensure it's not the metric value)
            const modelObj = m.model || m.model_result || m.llm_result || null
            let score: number | null = null
            let comm: string | null = null
            if (modelObj && typeof modelObj === 'object') {
                if (modelObj.score != null && !Number.isNaN(Number(modelObj.score))) score = Number(modelObj.score)
                if (modelObj.commentary != null) comm = String(modelObj.commentary)
                if (!comm && modelObj.comment) comm = String(modelObj.comment)
                if (!comm && modelObj.raw_response) comm = String(modelObj.raw_response)
            }
            if (score == null) {
                if (m.model_score != null && !Number.isNaN(Number(m.model_score))) score = Number(m.model_score)
                else if (m.modelScore != null && !Number.isNaN(Number(m.modelScore))) score = Number(m.modelScore)
                else if (m.llm_score != null && !Number.isNaN(Number(m.llm_score))) score = Number(m.llm_score)
                else if (m.score != null && !Number.isNaN(Number(m.score)) && Number(m.score) !== Number(m.value)) score = Number(m.score)
            }
            if (comm == null) {
                if (m.commentary != null) comm = String(m.commentary)
                else if (m.model_commentary != null) comm = String(m.model_commentary)
                else if (m.modelCommentary != null) comm = String(m.modelCommentary)
                else if (m.raw_response != null) comm = String(m.raw_response)
            }

            if (score != null || comm != null) {
                found = true
                if (score != null) scoresUpdate[m.metric] = Number(score)
                if (comm != null) commentaryUpdate[m.metric] = comm
            }
        }
        if (found) {
            setMetricModelScores((s) => ({ ...(s || {}), ...(scoresUpdate || {}) }))
            setMetricModelCommentary((s) => ({ ...(s || {}), ...(commentaryUpdate || {}) }))
        }
    }, [displayedMetrics])

    const openBriefing = async (batchTs?: string) => {
        // batchTs optional, default to latest
        const batch = batchTs || (typeof latestBriefing === 'string' ? latestBriefing : (latestBriefing && (latestBriefing.batchcreationtimestamp || latestBriefing.batch)))
        if (!batch) return
        setBriefingModalOpen(true)
        setBriefingLoading(true)
        try {
            const rows = await fetchApplicantBriefingBatch(batch)
            setBriefingRows(rows || [])
        } catch (e) {
            console.error('Failed to load briefing batch', e)
            setBriefingRows([])
        } finally {
            setBriefingLoading(false)
        }
    }

    const decodeHtmlEntities = (encoded: string) => {
        try {
            const txt = document.createElement('textarea')
            txt.innerHTML = encoded
            return txt.value
        } catch { return encoded }
    }

    const stripCodeFences = (s: string) => s ? s.replace(/^```[\s\S]*?\n/, '').replace(/\n```\s*$/, '') : s

    // Action plan generation removed from UI; generation handled server-side previously.

    const hasCV = docs.some((d: any) => (d.document_type || '').toLowerCase().includes('cv') || (d.documentname || '').toLowerCase().includes('cv'))
    const hasLinkedIn = docs.some((d: any) => (d.document_type || '').toLowerCase().includes('linkedin') || (d.documentname || '').toLowerCase().includes('linkedin'))

    // Explicit mapping of metric keys to icon categories to match spec
    const METRIC_ICON_MAP: Record<string, 'contacts' | 'roles' | 'actions' | 'applicant' | 'other'> = {
        'dormant_contacts': 'contacts',
        'active_contacts_not_met': 'contacts',
        'met_no_cv': 'contacts',
        'not_checked_in_with': 'contacts',
        'roles_not_followed_up': 'roles',
        'meetings_undocumented': 'contacts',
        'new_engagements_last_month': 'contacts',
        'new_contacts_last_month': 'contacts',
        'new_contacts_from_leads_last_month': 'contacts',
        'number_of_action_plans': 'actions',
        'overdue_action_plans': 'actions',
        'networking_events_last_3_months': 'contacts',
        'leads_to_be_reviewed': 'contacts',
        'cv_score': 'applicant',
        'linkedin_profile_score': 'applicant',
        'navigator_briefing_score': 'applicant'
    }

    const metricIcon = (metricKey: string) => {
        const k = (metricKey || '').toLowerCase()
        if (METRIC_ICON_MAP[k]) return METRIC_ICON_MAP[k]
        // fallback heuristics
        if (k.includes('contact') || k.includes('contacts') || k.includes('dormant') || k.includes('engagement') || k.includes('meet') || k.includes('network')) return 'contacts'
        if (k.includes('role') || k.includes('roles')) return 'roles'
        if (k.includes('action') || k.includes('action_plans') || k.includes('number_of_action_plans') || k.includes('overdue')) return 'actions'
        if (k.includes('cv') || k.includes('linkedin') || k.includes('briefing') || k.includes('navigator_briefing')) return 'applicant'
        return 'other'
    }

    // Enforce spec ordering client-side so the Key Metrics paper displays in the prescribed order
    const SPEC_METRIC_ORDER: string[] = [
        'dormant_contacts',
        'active_contacts_not_met',
        'met_no_cv',
        'not_checked_in_with',
        'roles_not_followed_up',
        'meetings_undocumented',
        'new_engagements_last_month',
        'new_contacts_last_month',
        'new_contacts_from_leads_last_month',
        'networking_events_last_3_months',
        'leads_to_be_reviewed',
        'number_of_action_plans',
        'overdue_action_plans',
        'cv_score',
        'linkedin_profile_score',
        'navigator_briefing_score'
    ]

    const sortedMetrics = React.useMemo(() => {
        const arr = (displayedMetrics || []).slice()
        const idx = (k: string) => {
            const i = SPEC_METRIC_ORDER.indexOf(k)
            return i === -1 ? SPEC_METRIC_ORDER.length + 100 : i
        }
        arr.sort((a: any, b: any) => idx(a.metric) - idx(b.metric))
        return arr
    }, [displayedMetrics])

    // Detect mobile breakpoint (MUI md breakpoint)
    const themeLocal = useTheme()
    const isMobile = useMediaQuery(themeLocal.breakpoints.down('md'))

    // Prepare metrics for mobile list component
    const mobileMetrics = (sortedMetrics || []).map((m: any) => ({
        metric: m.metric,
        label: METRIC_LABEL_OVERRIDES[m.metric] ?? formatMetricName(m.metric),
        value: m.value != null ? m.value : (m.count != null ? m.count : null),
        // Cast to the narrow union expected by MobileNavigatorMetricsList
        trend: (m.trend === 'up' ? 'up' : (m.trend === 'down' ? 'down' : (m.trend === 'flat' || m.trend === 'stable' ? 'stable' : null))) as ('stable' | 'up' | 'down' | null),
        delta: m.trend_delta != null ? m.trend_delta : null,
        missing: !!m.missing,
        icon: metricIcon(m.metric) as any
    }))

    // Per-spec behavior: percent metrics should show the raw count in Detail; count metrics should show an ellipsis.
    // Actionable metrics (LLM-driven) remain ellipsis.
    const DETAIL_ELLIPSIS_OVERRIDES = new Set([
        // metrics that are count-type but per spec should show ellipsis
        'meetings_undocumented', 'overdue_action_plans'
    ])

    return (
        <Box>
            <h2 style={{ margin: 0, marginBottom: '0.5rem' }}>Navigator Insights</h2>
            <Paper sx={{ p: 2, mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant={ACCORDION_TITLE_VARIANT as any} sx={ACCORDION_TITLE_SX}>Key metrics</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FormControl size="small" sx={{ minWidth: 260 }}>
                            <Select
                                size="small"
                                value={selectedSnapshotId ?? 'latest'}
                                onChange={async (e) => {
                                    const v = e.target.value
                                    if (v === 'latest') {
                                        setSelectedSnapshotId('latest')
                                        setDisplayedMetrics(insightsResp.metrics || [])
                                        return
                                    }
                                    const id = Number(v)
                                    if (!id) return
                                    setSelectedSnapshotId(id)
                                    try {
                                        const snap = await fetchNavigatorMetricSnapshot(id)
                                        if (snap && snap.ok) {
                                            setDisplayedMetrics(snap.metrics || [])
                                        }
                                    } catch (err) {
                                        console.error('Failed to load metric snapshot', err)
                                    }
                                }}
                                disabled={historyLoading}
                            >
                                <MenuItem value={'latest'}>Latest</MenuItem>
                                {metricHistory.length === 0 && <MenuItem value={'none'} disabled>No history</MenuItem>}
                                {metricHistory.map((h: any) => (
                                    <MenuItem key={String(h.id)} value={h.id}>{new Date(h.created_at).toLocaleString()}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <Button size="small" onClick={async () => { void navigatorState.refresh(effectiveApplicantId, { runMetricAction, setDisplayedMetrics, setSelectedSnapshotId, refetchInsights, setMetricHistory, setToast: (msg: string, sev: 'success' | 'info' | 'warning' | 'error' = 'error') => { try { setToastMessage(msg); setToastSeverity(sev); setToastOpen(true) } catch (e) { } }, setRefreshing }, { autoRun: true }) }} disabled={insightsLoading || refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</Button>
                    </Box>
                </Stack>
                {isMobile ? (
                    <MobileNavigatorMetricsList metrics={mobileMetrics} loading={insightsLoading} onDetailClick={(metric) => openMetricDetail(metric)} />
                ) : (
                    <TableContainer sx={{ mt: 2 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ bgcolor: BRAND_PURPLE, color: '#fff', fontWeight: 700 }}>Type</TableCell>
                                    <TableCell sx={{ bgcolor: BRAND_PURPLE, color: '#fff', fontWeight: 700 }}>Metric</TableCell>
                                    <TableCell sx={{ bgcolor: BRAND_PURPLE, color: '#fff', fontWeight: 700 }}>Value</TableCell>
                                    <TableCell sx={{ bgcolor: BRAND_PURPLE, color: '#fff', fontWeight: 700 }}>Detail</TableCell>
                                    <TableCell sx={{ bgcolor: BRAND_PURPLE, color: '#fff', fontWeight: 700 }}>Monthly Trend</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {insightsLoading && (
                                    <TableRow>
                                        <TableCell colSpan={5}><CircularProgress size={20} /></TableCell>
                                    </TableRow>
                                )}
                                {!insightsLoading && (sortedMetrics || []).map((m: any, idx: number) => (
                                    <TableRow key={m.metric} sx={{ backgroundColor: idx % 2 === 0 ? '#fbf8ff' : 'transparent', '&:hover': { backgroundColor: '#f3e8ff' } }}>
                                        <TableCell sx={{ fontWeight: 700, width: 72 }}>{/* Type column: icon only */}
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {(() => {
                                                    const ic = metricIcon(m.metric)
                                                    const sx = { width: 36, height: 36, bgcolor: BRAND_PURPLE, color: '#fff' }
                                                    if (ic === 'contacts') return (<Avatar sx={sx}><PersonIcon fontSize="small" sx={{ color: '#fff' }} /></Avatar>)
                                                    if (ic === 'roles') return (<Avatar sx={sx}><BusinessCenterIcon fontSize="small" sx={{ color: '#fff' }} /></Avatar>)
                                                    if (ic === 'actions') return (<Avatar sx={sx}><TaskAltIcon fontSize="small" sx={{ color: '#fff' }} /></Avatar>)
                                                    if (ic === 'applicant') return (<Avatar sx={sx}><AccountCircleIcon fontSize="small" sx={{ color: '#fff' }} /></Avatar>)
                                                    return (<Avatar sx={sx}><HelpOutlineIcon fontSize="small" sx={{ color: '#fff' }} /></Avatar>)
                                                })()}
                                            </Box>
                                        </TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>{METRIC_LABEL_OVERRIDES[m.metric] ?? formatMetricName(m.metric)}</TableCell>
                                        <TableCell sx={{ textAlign: 'right' }}>
                                            {/* Value column: show chips or counts */}
                                            {m && m.missing ? (
                                                m.metric === 'navigator_briefing_score' ? (
                                                    <Chip label="Review Briefing Questions" size="small" sx={{ bgcolor: 'grey.500', color: '#fff' }} />
                                                ) : (
                                                    <Chip label="Upload document" size="small" sx={{ bgcolor: 'grey.500', color: '#fff' }} />
                                                )
                                            ) : (
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    {(() => {
                                                        if (ACTIONABLE_METRICS.has(m.metric)) {
                                                            const llmDisabled = (insightsResp && insightsResp.llm && insightsResp.llm.ok === false) || (m && m.ai_enabled === false)
                                                            if (llmDisabled) {
                                                                return <Chip label="AI not enabled" size="small" variant="filled" sx={{ bgcolor: 'grey.500', color: '#fff', fontWeight: 700 }} />
                                                            }
                                                            const hasCached = metricModelScores && Object.prototype.hasOwnProperty.call(metricModelScores, m.metric) && metricModelScores[m.metric] != null
                                                            if (runningMetrics && runningMetrics[m.metric]) {
                                                                return (
                                                                    <Chip size="small" variant="filled" sx={{ bgcolor: 'grey.500', color: '#fff', fontWeight: 700 }} label={<BouncingDots size={12} color="#fff" />} />
                                                                )
                                                            }
                                                            if (hasCached) {
                                                                const scoreVal = Number(metricModelScores[m.metric])
                                                                const label = `${Math.round(scoreVal)} / 10`
                                                                // Prefer the freshly computed client-side score when available
                                                                // instead of blindly trusting a potentially stale backend `m.rag` value.
                                                                const ragFromScore = (scoreVal != null && !Number.isNaN(scoreVal)) ? (scoreVal >= 7 ? 'green' : (scoreVal >= 4 ? 'amber' : 'red')) : null
                                                                const rag = ragFromScore || (m && m.rag ? String(m.rag).toLowerCase() : null) || BRAND_PURPLE
                                                                const bg = rag === 'green' ? '#4caf50' : (rag === 'amber' ? '#ffb300' : (rag === 'red' ? '#e53935' : BRAND_PURPLE))
                                                                return <Chip label={label} size="small" variant="filled" sx={{ bgcolor: bg, color: '#fff', fontWeight: 700 }} />
                                                            }
                                                            return <span />
                                                        }
                                                        const label = m && m.unit === 'percent' ? `${Math.round(Number(m.value ?? 0))}%` : (m && m.unit === 'score' ? `${Math.round(Number(m.value ?? 0))} / 10` : m && m.value != null ? formatNumber(m.value) : '')
                                                        const rag = m && m.rag ? String(m.rag).toLowerCase() : null
                                                        const bg = rag === 'green' ? '#4caf50' : (rag === 'amber' ? '#ffb300' : (rag === 'red' ? '#e53935' : undefined))
                                                        if (bg) {
                                                            return <Chip label={label} size="small" sx={{ bgcolor: bg, color: '#fff' }} />
                                                        }
                                                        return <span>{label}{(m.unit && m.unit !== 'count' && m.unit !== 'percent' && m.unit !== 'score') ? ` ${m.unit}` : ''}</span>
                                                    })()}
                                                </Box>
                                            )}
                                        </TableCell>
                                        <TableCell sx={{
                                            // Ensure all text in the Detail column is purple, bold and
                                            // a consistent size regardless of which child component
                                            // renders it (Typography, Button, Chip, plain span).
                                            '& .MuiTypography-root, & .detailText, & span.detailText': { color: BRAND_PURPLE, fontWeight: 700, fontSize: '0.95rem' },
                                            '& .MuiButton-root': { color: BRAND_PURPLE, fontWeight: 700, textTransform: 'none', fontSize: '0.95rem' },
                                            // Chip label needs a nested selector
                                            '& .MuiChip-root': { bgcolor: 'transparent', color: BRAND_PURPLE, fontWeight: 700 },
                                            '& .MuiChip-label': { color: BRAND_PURPLE, fontWeight: 700, fontSize: '0.95rem' }
                                        }}>
                                            {/* Detail column: implement per-spec behavior.
                                                - Actionable metrics: ellipsis -> AI insight
                                                - Explicit ellipsis metrics: ellipsis -> detail modal
                                                - Explicit count metrics: numeric button (use m.count when provided)
                                                - Fallback: if backend provided m.count show it, otherwise show ellipsis */}
                                            {NO_DETAIL_METRICS.has(m.metric) ? (
                                                // These metrics explicitly must not expose a detail action.
                                                // If the backend provided a count, show it as left-aligned,
                                                // bold text; otherwise show a muted dash.
                                                (m.count != null) ? (
                                                    <Typography sx={{ fontWeight: 700, textAlign: 'left' }}>{formatNumber(m.count)}</Typography>
                                                ) : (
                                                    <Typography sx={{ color: '#777' }}>-</Typography>
                                                )
                                            ) : ACTIONABLE_METRICS.has(m.metric) ? (
                                                // LLM-driven metrics: if LLM unavailable show disabled chip, otherwise ellipsis -> AI insight
                                                ((insightsResp && insightsResp.llm && insightsResp.llm.ok === false) || (m && m.ai_enabled === false)) ? (
                                                    <Chip size="small" label="AI not enabled" sx={{ bgcolor: 'grey.500', color: '#fff', fontWeight: 700 }} />
                                                ) : (
                                                    <IconButton size="small" onClick={() => handleInfoClick(m.metric)} title="Details">
                                                        <MoreHorizIcon fontSize="small" />
                                                    </IconButton>
                                                )
                                            ) : (m.unit === 'percent') ? (
                                                // Per spec: percent metrics must show the raw count in Detail (backend provides `count`)
                                                (m.count != null) ? (
                                                    <AppButton size="small" colorScheme="white" sx={{ fontWeight: 700, justifyContent: 'center', textTransform: 'none', pl: 0 }} onClick={() => openMetricDetail(m)}>{formatNumber(m.count)}</AppButton>
                                                ) : (
                                                    // If count missing unexpectedly, show ellipsis to inspect
                                                    <IconButton size="small" onClick={() => openMetricDetail(m)} title="Details">
                                                        <MoreHorizIcon fontSize="small" />
                                                    </IconButton>
                                                )
                                            ) : (m.unit === 'count') ? (
                                                // Per spec: count metrics show ellipsis (open filtered table)
                                                // Allow explicit overrides to force ellipsis (meetings_undocumented, overdue_action_plans already count-type)
                                                <IconButton size="small" onClick={() => openMetricDetail(m)} title="Details">
                                                    <MoreHorizIcon fontSize="small" />
                                                </IconButton>
                                            ) : (m.count != null) ? (
                                                // Fallback: if backend provided count for an otherwise-unknown unit, show it
                                                <AppButton size="small" colorScheme="white" sx={{ fontWeight: 700, justifyContent: 'center', textTransform: 'none', pl: 0 }} onClick={() => openMetricDetail(m)}>{formatNumber(m.count)}</AppButton>
                                            ) : (
                                                // Final fallback: ellipsis so user can inspect
                                                <IconButton size="small" onClick={() => openMetricDetail(m)} title="Details">
                                                    <MoreHorizIcon fontSize="small" />
                                                </IconButton>
                                            )}
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'center', width: 120 }}>
                                            {m && m.trend ? (
                                                (() => {
                                                    const rag = m && m.rag ? String(m.rag).toLowerCase() : null
                                                    // If the trend is flat, always show a neutral grey icon regardless of RAG.
                                                    const color = (m && m.trend === 'flat') ? '#9e9e9e' : (rag === 'green' ? '#4caf50' : (rag === 'amber' ? '#ffb300' : (rag === 'red' ? '#e53935' : '#9e9e9e')))
                                                    const delta = (m && Object.prototype.hasOwnProperty.call(m, 'trend_delta')) ? m.trend_delta : null
                                                    const formatDelta = (d: any) => {
                                                        if (d == null || d === undefined) return ''
                                                        if (typeof d === 'number') {
                                                            if (Number.isInteger(d)) return formatNumber(d)
                                                            return formatNumber(Number(d.toFixed(2)), 2)
                                                        }
                                                        return String(d)
                                                    }
                                                    const suffix = m && m.unit === 'percent' ? '%' : (m && m.unit === 'score' ? ' /10' : '')
                                                    const deltaLabel = (delta != null) ? (`Δ ${delta > 0 ? '+' : ''}${formatDelta(delta)}${suffix}`) : 'No baseline'
                                                    if (m.trend === 'up') return (
                                                        <Tooltip title={deltaLabel} arrow>
                                                            <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20 }} aria-label="up">
                                                                <ArrowUpwardIcon sx={{ color, width: 18, height: 18 }} />
                                                            </Box>
                                                        </Tooltip>
                                                    )
                                                    if (m.trend === 'down') return (
                                                        <Tooltip title={deltaLabel} arrow>
                                                            <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20 }} aria-label="down">
                                                                <ArrowDownwardIcon sx={{ color, width: 18, height: 18 }} />
                                                            </Box>
                                                        </Tooltip>
                                                    )
                                                    return (
                                                        <Tooltip title={deltaLabel} arrow>
                                                            <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20 }} aria-label="flat">
                                                                <RemoveIcon sx={{ color, width: 18, height: 18 }} />
                                                            </Box>
                                                        </Tooltip>
                                                    )
                                                })()
                                            ) : (
                                                <span style={{ color: '#777' }}>-</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>
            {/* Navigator readiness UI removed per design update */}

            {/* Briefing modal */}
            <Dialog open={briefingModalOpen} onClose={() => setBriefingModalOpen(false)} fullWidth maxWidth="md">
                <DialogTitle>Navigator Briefing</DialogTitle>
                <DialogContent dividers>
                    {briefingLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress /></Box>
                    ) : (
                        <Box sx={{ display: 'grid', gap: 2 }}>
                            {(briefingRows || []).map((r: any) => (
                                <Box key={r.briefingid}>
                                    <Typography sx={{ fontWeight: 700 }}>{r.questiontext}</Typography>
                                    <Typography sx={{ whiteSpace: 'pre-wrap' }}>{r.questionanswer}</Typography>
                                    <Divider sx={{ my: 1 }} />
                                </Box>
                            ))}
                            {(!briefingRows || briefingRows.length === 0) && <Typography>No briefing data</Typography>}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setBriefingModalOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={insightModalOpen} onClose={() => setInsightModalOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>Navigator AI Insight</DialogTitle>
                <DialogContent dividers>
                    {insightModalScore != null && (
                        <Box sx={{ mb: 1 }}>
                            <Typography sx={{ fontWeight: 700 }}>Model score: {insightModalScore} / 10</Typography>
                        </Box>
                    )}
                    <Typography sx={{ whiteSpace: 'pre-wrap' }}>{insightModalContent}</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setInsightModalOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            <WideDialog open={detailModalOpen} onClose={() => setDetailModalOpen(false)} fullWidth maxWidthPx={1100} fitToContent>
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6" sx={{ mb: 1 }}>Metric detail — {formatMetricName(detailMetric || '')}</Typography>
                    {detailRows && detailRows.length > 0 ? (
                        (() => {
                            const first = detailRows[0] || {}
                            // Map metric keys to domain entity types
                            const metricToEntity: Record<string, string> = {
                                'dormant_contacts': 'contacts',
                                'active_contacts_not_met': 'contacts',
                                'met_no_cv': 'contacts',
                                'contacts_you_ve_met_but_not_sent_a_cv': 'contacts',
                                'not_checked_in_with': 'contacts',
                                'new_contacts_last_month': 'contacts',
                                'new_contacts_from_leads_last_month': 'contacts',
                                'roles_not_followed_up': 'roles',
                                'new_engagements_last_month': 'engagements',
                                'meetings_undocumented': 'engagements',
                                'networking_events_last_3_months': 'engagements',
                                'number_of_action_plans': 'tasks',
                                'overdue_action_plans': 'tasks',
                                'leads_to_be_reviewed': 'leads'
                            }
                            const entity = metricToEntity[detailMetric || ''] || null

                            const preferredColsByEntity: Record<string, string[]> = {
                                contacts: ['contactid', 'name', 'firstname', 'lastname', 'jobtitle', 'email', 'telephone', 'created_at'],
                                engagements: ['engagementlogid', 'contactid', 'logdate', 'engagementtypeid', 'logentry'],
                                roles: ['jobid', 'title', 'companyorgid', 'statusid', 'created_at'],
                                tasks: ['taskid', 'description', 'duedate', 'completed', 'applicantid'],
                                leads: ['leadid', 'name', 'created_at', 'reviewdate', 'reviewoutcomeid']
                            }

                            let cols: string[] = []
                            if (entity && preferredColsByEntity[entity]) {
                                cols = preferredColsByEntity[entity].filter((c) => Object.prototype.hasOwnProperty.call(first, c))
                            }
                            if (!cols || cols.length === 0) {
                                cols = Object.keys(first).slice(0, 12)
                            }

                            const columns = cols.map((k) => ({ key: k, label: String(k) }))

                            // Reuse existing Hub components where possible so modals and actions are consistent.
                            if (entity === 'contacts') {
                                const ids = detailRows.map((r: any) => Number(r.contactid || r.id || r.contact_id || 0)).filter((n: number) => n > 0)
                                return <ContactsTable search={''} onlyIds={ids} inModal={true} />
                            }
                            if (entity === 'engagements') {
                                const ids = detailRows.map((r: any) => Number(r.engagementlogid || r.engagementid || r.id || 0)).filter((n: number) => n > 0)
                                return <EngagementsTable search={''} onlyIds={ids} inModal={true} />
                            }
                            if (entity === 'roles') {
                                const ids = detailRows.map((r: any) => Number(r.jobid || r.jobID || r.id || 0)).filter((n: number) => n > 0)
                                return <RolesTable search={''} onlyIds={ids} inModal={true} />
                            }

                            return (
                                <DataTable
                                    columns={columns}
                                    rows={detailRows}
                                    total={detailRows.length}
                                    page={0}
                                    pageSize={Math.max(10, Math.min(50, detailRows.length))}
                                    onPageChange={() => { }}
                                    onPageSizeChange={() => { }}
                                />
                            )
                        })()
                    ) : (
                        <Typography>No detail rows available</Typography>
                    )}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button onClick={() => setDetailModalOpen(false)}>Close</Button>
                    </Box>
                </Box>
            </WideDialog>

            <WideDialog open={actionModalOpen} onClose={() => setActionModalOpen(false)} fullWidth maxWidthPx={1100} fitToContent>
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6" sx={{ mb: 1 }}>{actionModalTitle}</Typography>
                    {actionModalLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress /></Box>
                    ) : (
                        (() => {
                            const cols = ['taskid', 'name', 'duedate', 'targets_count', 'notes']
                            return (
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell><strong>Task</strong></TableCell>
                                            <TableCell><strong>Due date</strong></TableCell>
                                            <TableCell><strong>Targets</strong></TableCell>
                                            <TableCell><strong>Notes</strong></TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {(actionModalTasks || []).map((t: any) => (
                                            <TableRow key={t.taskid} hover>
                                                <TableCell sx={{ fontWeight: 700 }}>{t.name || t.description || ''}</TableCell>
                                                <TableCell>{t.duedate ? new Date(t.duedate).toLocaleDateString() : ''}</TableCell>
                                                <TableCell>{Array.isArray(t.targets) ? t.targets.length : (t.targets_count != null ? t.targets_count : '')}</TableCell>
                                                <TableCell sx={{ whiteSpace: 'pre-wrap' }}>{t.notes || ''}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )
                        })()
                    )}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button onClick={() => setActionModalOpen(false)}>Close</Button>
                    </Box>
                </Box>
            </WideDialog>

            <Box sx={{ p: 0 }}>
                <Grid container spacing={2}>
                    {/* Full Prompt (superusers only) - shown in an accordion per spec */}
                    {applicantSettings?.isSuperuser === true && (
                        <Grid item xs={12}>
                            <Accordion>
                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    <Typography variant={ACCORDION_TITLE_VARIANT as any} sx={ACCORDION_TITLE_SX}>Full Prompt</Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                                        <FormControl size="small">
                                            <Button size="small" startIcon={<ContentCopyIcon />} onClick={async () => {
                                                const txt = fullPrompt || ''
                                                try { await navigator.clipboard.writeText(txt); setStatus('Prompt copied to clipboard') } catch (e) {
                                                    const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); setStatus('Prompt copied to clipboard') } catch { setStatus('Copy failed') } document.body.removeChild(ta)
                                                }
                                            }}>Copy prompt</Button>
                                        </FormControl>
                                        {tokenCounts ? (
                                            <Typography sx={{ fontSize: 12, color: 'text.secondary', ml: 1 }}>
                                                Tokens — input: {tokenCounts.input ?? tokenCounts?.input_tokens ?? 'N/A'} • output: {tokenCounts.output ?? tokenCounts?.output_tokens ?? 'N/A'}
                                            </Typography>
                                        ) : null}
                                    </Stack>
                                    <Paper sx={{ p: 2, fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap', background: '#f5f5f5', maxHeight: 240, overflow: 'auto' }}>{fullPrompt}</Paper>
                                    <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1, mb: 1, fontWeight: 700 }}>Raw response</Typography>
                                    <Paper sx={{ p: 2, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', background: '#fafafa', maxHeight: 240, overflow: 'auto' }}>{rawResponse || 'No raw response captured'}</Paper>
                                </AccordionDetails>
                            </Accordion>
                        </Grid>
                    )}
                </Grid>
            </Box>
            {/* Global toast for surfaced errors/info */}
            <Toast open={toastOpen} message={toastMessage} severity={toastSeverity} onClose={() => setToastOpen(false)} />
        </Box>
    )
}

// Recursive renderer that maps JSON structures to simple UI controls for readability.
function JsonControlsRenderer({ data }: { data: any }) {
    if (data == null) return <Typography>No data</Typography>
    if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
        return <Typography sx={{ whiteSpace: 'pre-wrap' }}>{String(data)}</Typography>
    }
    if (Array.isArray(data)) {
        return (
            <Box>
                {data.map((item, idx) => (
                    <Paper key={idx} sx={{ p: 1, mb: 1 }} variant="outlined">
                        <Typography sx={{ fontWeight: 700, mb: 1 }}>Item {idx + 1}</Typography>
                        <JsonControlsRenderer data={item} />
                    </Paper>
                ))}
            </Box>
        )
    }
    // object
    return (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1 }}>
            {Object.entries(data).map(([k, v]) => (
                <Box key={k} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <Typography sx={{ fontWeight: 700, minWidth: 160 }}>{k}:</Typography>
                    <Box sx={{ flex: 1 }}>
                        {typeof v === 'object' ? <JsonControlsRenderer data={v} /> : <Typography sx={{ whiteSpace: 'pre-wrap' }}>{String(v)}</Typography>}
                    </Box>
                </Box>
            ))}
        </Box>
    )
}
