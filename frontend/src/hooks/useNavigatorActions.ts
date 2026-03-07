import { useState, useRef } from 'react'
import { fetchNavigatorDocumentsText, runNavigatorSql, navigatorQuery, fetchApplicantBriefingBatch, patchNavigatorMetricSnapshot } from '../api/client'
import extractModelResult from '../utils/navigatorParser'
import { createLogger } from '../utils/logger'

const log = createLogger('useNavigatorActions')

// Small helper to convert metric keys like `cv_score` -> `Cv Score`
function formatMetricName(k: string | null | undefined) {
    if (!k) return ''
    return String(k).replace(/_/g, ' ').replace(/\b\w/g, (c) => String(c).toUpperCase())
}

export interface UseNavigatorActionsOptions {
    navActions: any[]
    inputTypes: any[]
    navPrompts: any[]
    getLatestDocByType: (type: string) => any
    latestBriefing: any
    applicant: any
    selectedSnapshotId: number | null
    displayedMetrics: any[]
    setDisplayedMetrics: React.Dispatch<React.SetStateAction<any[]>>
    onToast: (msg: string, sev: 'success' | 'info' | 'warning' | 'error') => void
}

export function useNavigatorActions(options: UseNavigatorActionsOptions) {
    const {
        navActions,
        inputTypes,
        navPrompts,
        getLatestDocByType,
        latestBriefing,
        applicant,
        selectedSnapshotId,
        displayedMetrics,
        setDisplayedMetrics,
        onToast
    } = options

    // Action execution state
    const [generating, setGenerating] = useState<boolean>(false)
    const [status, setStatus] = useState<string | null>(null)
    const [fullPrompt, setFullPrompt] = useState<string | null>(null)
    const [tokenCounts, setTokenCounts] = useState<Record<string, any> | null>(null)
    const [actionPlan, setActionPlan] = useState<string | null>(null)
    const [rawResponse, setRawResponse] = useState<string | null>(null)

    // Track errors per metric
    const [metricErrors, setMetricErrors] = useState<Record<string, string | null>>({})

    // Insight modal state
    const [insightModalOpen, setInsightModalOpen] = useState(false)
    const [insightModalContent, setInsightModalContent] = useState<string | null>(null)
    const [insightModalScore, setInsightModalScore] = useState<number | null>(null)

    // Per-metric cached results and running flags
    const [metricModelScores, setMetricModelScores] = useState<Record<string, number | null>>({})
    const [metricModelCommentary, setMetricModelCommentary] = useState<Record<string, string | null>>({})
    const runningMetricsRef = useRef<Record<string, boolean>>({})
    const [runningMetrics, setRunningMetrics] = useState<Record<string, boolean>>({})

    const ACTIONABLE_METRICS = new Set(['cv_score', 'linkedin_profile_score', 'navigator_briefing_score'])

    const handleAction = async (action: any, metricKey?: string, suppressToast?: boolean) => {
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
                            log.error('Failed to fetch extracted document text for navigator', { documentid: doc.documentid, err: e })
                            promptParts.push(`Document: ${val} (attached; text fetch failed)`)
                        }
                    } else {
                        // Missing document entirely should fail for strict metrics
                        try { log.info('Navigator.DOCUMENT_GET no document found for requested type', { requestedType: val }) } catch (e) { }
                        try { log.debug('nav_debug:no_document', { ts: Date.now(), requestedType: val }) } catch (e) { }
                        const strictMetrics = new Set(['cv_score', 'linkedin_profile_score'])
                        if (metricKey && strictMetrics.has(metricKey)) {
                            throw new Error(`Required document not found for ${metricKey}`)
                        }
                        promptParts.push(`(no document found: ${val})`)
                    }
                } else if (label === 'DB_QUERY') {
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
            setFullPrompt(promptText)
            const extra: any = {}
            if (documentIds.length) extra.document_ids = documentIds

            setStatus('Calling navigator LLM...')
            const res = await navigatorQuery(promptText, undefined, { first_name: ((applicant as any)?.firstName || applicant?.firstname || '') }, extra)
            log.debug('Action response', res)
            try {
                setRawResponse(JSON.stringify(res && (res.response || res), null, 2))
            } catch { setRawResponse(null) }
            try {
                setTokenCounts(res && res.token_counts ? res.token_counts : (res && typeof res === 'object' && res.response && res.response.token_counts ? res.response.token_counts : null))
            } catch (e) {
                setTokenCounts(null)
            }

            setStatus('Done')
            return res
        } catch (e: any) {
            console.error('Action execution failed', e)
            setStatus('Action failed')
            setActionPlan('Action failed: ' + (e?.message || String(e)))
            if (!suppressToast) {
                onToast('Action failed: ' + (e?.message || String(e)), 'error')
            }
            return null
        } finally {
            setGenerating(false)
            setTimeout(() => setStatus(null), 2500)
        }
    }

    const runMetricAction = async (metricKey: string, autoRun: boolean = false, forceSnapshotId?: number | null) => {
        const displayName = formatMetricName(metricKey)
        const match = (navActions || []).find((a: any) => String(a.actionname || '').trim().toLowerCase() === String(displayName).trim().toLowerCase())
        if (!match) {
            if (!autoRun) return { error: `No Navigator action configured for "${displayName}"` }
            return null
        }
        // prevent duplicate concurrent runs
        if (runningMetricsRef.current[metricKey]) return
        runningMetricsRef.current[metricKey] = true
        setRunningMetrics((s) => ({ ...(s || {}), [metricKey]: true }))

        // Use forceSnapshotId if provided, otherwise capture from state
        // This allows caller to specify which snapshot to save to, avoiding stale state issues
        const snapshotIdWhenStarted = forceSnapshotId !== undefined ? forceSnapshotId : selectedSnapshotId

        try {
            log.debug('[Navigator] starting LLM call', { metricKey, snapshotIdWhenStarted, autoRun })
            const res = await handleAction(match, metricKey, autoRun)
            const rawText = res && res.response && (res.response.text || res.response.answer) ? (res.response.text || res.response.answer) : null
            const parsed = extractModelResult(rawText ?? res)
            if (process.env.NODE_ENV === 'development') {
                try {
                    log.debug('[Navigator] extractModelResult parsed', { metricKey, parsed, rawText, rawResponse: res })
                } catch (e) { /* ignore logging errors */ }
            }

            // Only apply results if we're still viewing the snapshot these results belong to
            // If forceSnapshotId was provided explicitly, trust it (auto-run from refresh)
            // Otherwise, check if user switched to a different snapshot and discard if so
            const shouldApply = forceSnapshotId !== undefined
                ? true  // Trust explicit snapshot ID from auto-run
                : selectedSnapshotId === snapshotIdWhenStarted  // Check if user switched snapshots

            console.log('[Navigator] LLM result check', {
                metricKey,
                snapshotIdWhenStarted,
                currentSnapshotId: selectedSnapshotId,
                forceSnapshotId,
                shouldApply
            })
            if (shouldApply) {
                log.debug('[Navigator] LLM result arrived', {
                    metricKey,
                    snapshotIdWhenStarted,
                    currentSnapshotId: selectedSnapshotId,
                    score: parsed.score
                })
                setMetricModelScores((s) => ({ ...(s || {}), [metricKey]: parsed.score }))
                setMetricModelCommentary((s) => ({ ...(s || {}), [metricKey]: parsed.commentary }))

                // Update displayedMetrics using functional form to get latest state
                setDisplayedMetrics((prevMetrics) => {
                    const updated = prevMetrics.map((m) => {
                        if (m.metric === metricKey) {
                            console.log('[Navigator] updating displayedMetrics', {
                                metricKey,
                                before: { model_score: m.model_score, model_commentary: m.model_commentary },
                                after: { model_score: parsed.score, model_commentary: parsed.commentary }
                            })
                            return {
                                ...m,
                                model_score: parsed.score,
                                model_commentary: parsed.commentary
                            }
                        }
                        return m
                    })
                    return updated
                })

                // If viewing a numbered snapshot, PATCH the individual metric update
                // Use snapshotIdWhenStarted (not selectedSnapshotId) to avoid closure issues
                // PATCH merges this one metric into the backend snapshot, avoiding race conditions
                if (typeof snapshotIdWhenStarted === 'number') {
                    try {
                        console.log('[Navigator] CALLING PATCH for snapshot', {
                            snapshotId: snapshotIdWhenStarted,
                            metricKey,
                            score: parsed.score,
                            commentary: parsed.commentary?.substring(0, 50)
                        })
                        // Fire and forget
                        patchNavigatorMetricSnapshot(snapshotIdWhenStarted, metricKey, parsed.score, parsed.commentary)
                            .then(() => {
                                console.log('[Navigator] PATCH succeeded', { snapshotId: snapshotIdWhenStarted, metricKey })
                            })
                            .catch((err) => {
                                console.error('[Navigator] PATCH failed', { snapshotId: snapshotIdWhenStarted, metricKey, error: err })
                            })
                    } catch (e) {
                        console.error('[Navigator] error calling patchNavigatorMetricSnapshot', e)
                    }
                } else {
                    console.log('[Navigator] NOT patching - snapshotId is not a number', {
                        selectedSnapshotId,
                        type: typeof selectedSnapshotId
                    })
                }
            } else {
                try {
                    log.debug('[Navigator] discarding LLM result - snapshot changed', {
                        metricKey,
                        snapshotIdWhenStarted,
                        currentSnapshotId: selectedSnapshotId
                    })
                } catch (e) { /* ignore */ }
            }
            return res
        } catch (e) {
            const errorMsg = String(e).includes('timeout') || String(e).includes('timed out')
                ? 'LLM request timed out'
                : `Action failed: ${String(e)}`

            // Track error for this metric
            setMetricErrors((prev) => ({ ...prev, [metricKey]: errorMsg }))

            // Also update displayedMetrics with error marker if we should apply
            const shouldApplyError = forceSnapshotId !== undefined
                ? true
                : selectedSnapshotId === snapshotIdWhenStarted

            if (shouldApplyError) {
                setDisplayedMetrics((prevMetrics) => {
                    return prevMetrics.map((m) => {
                        if (m.metric === metricKey) {
                            return {
                                ...m,
                                model_error: errorMsg
                            }
                        }
                        return m
                    })
                })
            }

            if (!autoRun) {
                onToast(errorMsg, 'error')
                return { error: errorMsg }
            }
            // Silent failure for auto-run
            return null
        } finally {
            runningMetricsRef.current[metricKey] = false
            setRunningMetrics((s) => ({ ...(s || {}), [metricKey]: false }))
        }
    }

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
        const parsed = extractModelResult(res || (metricModelCommentary ? metricModelCommentary[metricKey] : null))
        const finalScore = parsed.score != null ? parsed.score : (metricModelScores ? metricModelScores[metricKey] : null)
        const finalCommentary = parsed.commentary != null ? parsed.commentary : (metricModelCommentary ? metricModelCommentary[metricKey] : null)
        setInsightModalScore(finalScore != null ? Number(finalScore) : null)
        setInsightModalContent(finalCommentary ? String(finalCommentary) : (res ? JSON.stringify(res, null, 2) : 'No commentary returned'))
        setInsightModalOpen(true)
    }

    return {
        // Action execution state
        generating,
        status,
        fullPrompt,
        tokenCounts,
        actionPlan,
        rawResponse,

        // Insight modal state
        insightModalOpen,
        setInsightModalOpen,
        insightModalContent,
        setInsightModalContent,
        insightModalScore,
        setInsightModalScore,

        // Metric caching
        metricModelScores,
        setMetricModelScores,
        metricModelCommentary,
        setMetricModelCommentary,
        runningMetrics,
        metricErrors,

        // Actions
        handleAction,
        runMetricAction,
        handleInfoClick,

        // Constants
        ACTIONABLE_METRICS
    }
}
