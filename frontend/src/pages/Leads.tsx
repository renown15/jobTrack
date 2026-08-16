import React, { useEffect, useState } from 'react'
import { BRAND_PURPLE, BRAND_PURPLE_LIGHT } from '../constants/colors'
import JSZip from 'jszip'
import DataTable from '../components/DataTable'
import Toast from '../components/Shared/Toast'
import QuickCreateModal from '../components/Hub/QuickCreateModal'
import { fetchLeads, fetchLeadsAll, importLeadsZip, fetchReferenceData, fetchLeadsSummary, updateLead, deleteLead, prefillLead, createTask, addTaskTarget, fetchTasks, fetchTaskTargets, setLeadReviewOutcome } from '../api/client'
import { Box, Button, TextField, InputAdornment, IconButton, Checkbox, Stack, DialogTitle, DialogContent, DialogActions, MenuItem, Select, FormControl, InputLabel, Accordion, AccordionSummary, AccordionDetails } from '@mui/material'
import Dialog from '../components/Shared/WideDialog'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ClearIcon from '@mui/icons-material/Clear'
import AppButton from '../components/Shared/AppButton'

export default function LinkedInLeads() {
    const [rows, setRows] = useState<any[]>([])
    const [page, setPage] = useState(0)
    const [pageSize, setPageSize] = useState(20)
    const [total, setTotal] = useState(0)
    const [sortKey, setSortKey] = useState<string | null>(null)
    const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null)
    const [loading, setLoading] = useState(false)
    const [refStatuses, setRefStatuses] = useState<any[]>([])
    const [refStatusesLoaded, setRefStatusesLoaded] = useState<boolean>(false)
    const [toastOpen, setToastOpen] = useState(false)
    const [toastMessage, setToastMessage] = useState('')
    const [toastSeverity, setToastSeverity] = useState<'success' | 'info' | 'warning' | 'error'>('info')
    const [search, setSearch] = useState('')
    const fileInputRef = React.useRef<HTMLInputElement | null>(null)
    const [quickOpen, setQuickOpen] = useState(false)
    const [quickEditing, setQuickEditing] = useState<any | null>(null)
    const [promoteLeadId, setPromoteLeadId] = useState<number | null>(null)
    const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
    const promoteQueueRef = React.useRef<number[] | null>(null)
    // hideReviewed state removed; filtering is driven by selectedReviewOutcomeId (Unset card)
    const [summary, setSummary] = useState<any>({})
    const [taskPickerOpen, setTaskPickerOpen] = useState<boolean>(false)
    const [tasksList, setTasksList] = useState<any[]>([])
    const [selectedTaskIdForLink, setSelectedTaskIdForLink] = useState<number | null>(null)
    // Default to showing Unset Review Status when the page opens
    const [selectedReviewOutcomeId, setSelectedReviewOutcomeId] = useState<number | undefined>(0)

    // Live search: debounce input and trigger loadPage
    React.useEffect(() => {
        const id = setTimeout(() => {
            setPage(0)
            // use the latest search value
            void loadPage(0, search)
        }, 300)
        return () => clearTimeout(id)
    }, [search])

    // Small presentational card used by the Hub; mirror its behaviour here so keyboard focus
    // and active outline match the Hub UX.
    function PanelCard({ title, count, active, onClick, disabled }: { title: string; count: any; active: boolean; onClick: () => void; disabled?: boolean }) {
        return (
            <div
                role="button"
                tabIndex={0}
                onClick={(e) => { if (!disabled) onClick() }}
                onKeyDown={(e) => { if (!disabled && e.key === 'Enter') onClick() }}
                style={{ padding: 12, cursor: disabled ? 'not-allowed' : 'pointer', outline: active ? `2px solid ${BRAND_PURPLE_LIGHT}` : undefined, borderRadius: 6, minWidth: 160, border: '1px solid #e0e0e0', opacity: disabled ? 0.6 : 1 }}
            >
                <div style={{ fontSize: 12, color: '#666' }}>{title}</div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>{count}</div>
            </div>
        )
    }

    useEffect(() => {
        loadRefData()
        loadPage()
        loadSummary()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])



    function openProfileWindow(lead: any) {
        const url = lead?.linkedin_url
        if (!url) return
        try {
            // Size the popup to be 25% smaller than the current window (i.e. 75% of its size)
            // and center it relative to the current window position when possible.
            const parentW = window.outerWidth || window.innerWidth || 1200
            const parentH = window.outerHeight || window.innerHeight || 800
            const w = Math.max(320, Math.floor(parentW * 0.75))
            const h = Math.max(240, Math.floor(parentH * 0.75))

            // Screen-relative offset of the current window (may be 0 in some browsers)
            const baseLeft = (typeof window.screenX === 'number') ? window.screenX : (typeof window.screenLeft === 'number' ? window.screenLeft : 0)
            const baseTop = (typeof window.screenY === 'number') ? window.screenY : (typeof window.screenTop === 'number' ? window.screenTop : 0)

            const left = baseLeft + Math.max(0, Math.floor((parentW - w) / 2))
            const top = baseTop + Math.max(0, Math.floor((parentH - h) / 2))

            const features = `noopener,noreferrer,toolbar=0,location=0,menubar=0,width=${w},height=${h},left=${left},top=${top}`
            const newWin = window.open(url, '_blank', features)
            if (newWin && typeof newWin.focus === 'function') newWin.focus()
        } catch (e) {
            // fallback to simple open
            window.open(url, '_blank')
        }
    }

    async function loadSummary() {
        try {
            const res = await fetchLeadsSummary()
            setSummary(res || {})
        } catch (e) {
            setSummary({})
        }
    }

    async function loadRefData() {
        try {
            const data = await fetchReferenceData('lead_review_status')
            // store initial result
            setRefStatuses(data)
            // debug: log what the backend returned (helps diagnose missing refvalues)
            // eslint-disable-next-line no-console
            console.debug('[Leads] refStatuses (lead_review_status):', data)

            // If the expected entries are not present, try fetching all refdata as a fallback
            const _norm = (v: any) => String(v || '').trim().toLowerCase()
            const hasPromoted = (data || []).some((s: any) => _norm(s.refvalue) === 'promoted to contact')
            const hasEngage = (data || []).some((s: any) => _norm(s.refvalue) === 'engage urgently')
            if (!hasPromoted || !hasEngage) {
                // eslint-disable-next-line no-console
                console.debug('[Leads] missing expected statuses in lead_review_status, fetching all refdata as fallback')
                const all = await fetchReferenceData()
                // eslint-disable-next-line no-console
                console.debug('[Leads] refStatuses (all):', all)
                // merge unique entries (prefer class-filtered first)
                const merged = [...(data || [])]
                for (const s of (all || [])) {
                    if (!merged.find((m: any) => String(m.refid) === String(s.refid))) merged.push(s)
                }
                setRefStatuses(merged)
            }
        } catch (e) {
            setRefStatuses([])
        } finally {
            setRefStatusesLoaded(true)
        }
    }

    async function loadPage(p = page, q = search, reviewOutcomeId?: number | undefined, excludeReviewed?: boolean) {
        setLoading(true)
        try {
            // If the caller omitted the reviewOutcomeId argument, use the current state value.
            // If the caller explicitly passed `undefined`, treat that as "clear the filter".
            const rid = arguments.length >= 3 ? reviewOutcomeId : selectedReviewOutcomeId
            // allow caller to explicitly override the hideReviewed flag via the 4th arg
            // default to false (no hide) because the Unset Review Status panel controls that filter
            const exclude = arguments.length >= 4 ? excludeReviewed : false
            // pass exclude_reviewed flag and selected review outcome when provided
            const res = await fetchLeads(p + 1, pageSize, q, rid ?? undefined, exclude)
            setRows(res.items)
            setTotal(res.total)
        } catch (e) {
            setRows([])
            setTotal(0)
        }
        setLoading(false)
    }

    // When a sort is requested, fetch the full dataset sorted server-side
    // (falls back to page fetch on error). Server-side sort avoids client
    // memory/sorting costs and ensures ordering is deterministic across pages.
    async function loadAndSortAll(pageIndex = 0) {
        setLoading(true)
        try {
            // Map UI sort key/dir into server params
            const orderBy = sortKey || undefined
            const dir = sortDir || undefined
            const all = await fetchLeadsAll(search, selectedReviewOutcomeId, undefined, undefined, undefined, orderBy, dir)
            // If no sort key specified, just page the results
            if (!orderBy) {
                const totalAll = all.length
                const start = pageIndex * pageSize
                setRows(all.slice(start, start + pageSize))
                setTotal(totalAll)
                return
            }
            const totalAll = all.length
            const start = pageIndex * pageSize
            setRows(all.slice(start, start + pageSize))
            setTotal(totalAll)
        } catch (e) {
            // On failure, fall back to original page load so UI remains usable
            // eslint-disable-next-line no-console
            console.error('[Leads] server-sorted load failed, falling back to page load', e)
            try {
                await loadPage(pageIndex, search)
            } catch (e2) {
                // eslint-disable-next-line no-console
                console.error('[Leads] fallback loadPage also failed', e2)
                setRows([])
                setTotal(0)
            }
        } finally {
            setLoading(false)
        }
    }

    async function handleUpload(file: File | null) {
        if (!file) return
        setLoading(true)

        // First, parse the ZIP locally to identify CSV and count rows
        try {
            const zip = await JSZip.loadAsync(file)
            let csvName: string | null = null
            for (const name of Object.keys(zip.files)) {
                if (name.toLowerCase().endsWith('.csv')) {
                    csvName = name
                    if (name.toLowerCase().endsWith('connections.csv')) break
                }
            }

            if (!csvName) {
                setToastMessage('No CSV file found in the ZIP')
                setToastSeverity('warning')
                setToastOpen(true)
                setLoading(false)
                return
            }

            const content = await zip.file(csvName)!.async('string')
            const lines = content.split(/\r?\n/)
            // Count non-empty data rows (exclude header)
            let identified = 0
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim() !== '') identified++
            }

            setToastMessage(`${identified} contacts identified in ${csvName}`)
            setToastSeverity('info')
            setToastOpen(true)
        } catch (err: any) {
            setToastMessage('Failed to read ZIP file')
            setToastSeverity('error')
            setToastOpen(true)
            setLoading(false)
            return
        }

        // Now perform the upload to backend
        setToastMessage('Uploading and unpacking contacts...')
        setToastSeverity('info')
        setToastOpen(true)
        try {
            const res = await importLeadsZip(file)
            // backend returns { ok: true, imported: N, discarded: M, last_refreshed: 'YYYY-MM-DD' }
            const imported = (res && res.imported) || 0
            const discarded = (res && res.discarded) || 0
            const lastRef = (res && res.last_refreshed) || null
            let msg = `Imported ${imported} contacts`
            if (discarded) msg += ` — ${discarded} duplicates discarded`
            setToastMessage(msg)
            setToastSeverity('success')
            setToastOpen(true)
            // Refresh summary and current page to reflect server-side dedup
            await loadSummary()
            await loadPage(0)
            // If server provided a last_refreshed date, incorporate it into local summary
            if (lastRef) setSummary((s: any) => ({ ...(s || {}), last_refreshed: lastRef }))
        } catch (e: any) {
            setToastMessage(e?.message || 'Failed to import leads')
            setToastSeverity('error')
            setToastOpen(true)
        } finally {
            setLoading(false)
        }
    }

    // Selection helpers moved below so they can reference resolved refids

    async function handleMarkSelectedNotRelevant() {
        if (selectedIds.size === 0) {
            setToastMessage('No leads selected')
            setToastSeverity('info')
            setToastOpen(true)
            return
        }
        // Find the reference-data id for "Not Relevant at this Time"
        const notRelevant = (refStatuses || []).find((s: any) => _norm(s.refvalue) === 'not relevant at this time')
        const rid = notRelevant ? Number(notRelevant.refid) : undefined
        if (!rid) {
            setToastMessage('Reference status "Not Relevant at this Time" not found')
            setToastSeverity('warning')
            setToastOpen(true)
            return
        }
        if (!confirm(`Mark ${selectedIds.size} selected lead(s) as Not Relevant at this Time?`)) return
        setLoading(true)
        try {
            for (const id of Array.from(selectedIds)) {
                try { await updateLead(id, { reviewoutcomeid: rid }) } catch (e) { /* ignore individual failures */ }
            }
            setToastMessage(`Marked ${selectedIds.size} leads as Not Relevant`)
            setToastSeverity('success')
            setToastOpen(true)
            setSelectedIds(new Set())
            await loadPage(0)
            await loadSummary()
            // refresh current page so the rows reflect the latest server state
            try { await loadPage(page, search) } catch (e) { /* ignore */ }
        } catch (e: any) {
            setToastMessage(e?.message || 'Failed to mark selected leads')
            setToastSeverity('error')
            setToastOpen(true)
        } finally {
            setLoading(false)
        }
    }

    async function handlePromoteSelected() {
        if (selectedIds.size === 0) {
            setToastMessage('No leads selected')
            setToastSeverity('info')
            setToastOpen(true)
            return
        }
        // Prevent opening multiple promote dialogs concurrently
        if (quickOpen) {
            setToastMessage('Promote dialog already open')
            setToastSeverity('info')
            setToastOpen(true)
            return
        }

        // Build a deterministic queue of IDs to promote (preserve selection)
        const queue = Array.from(selectedIds)
        if (!queue.length) return
        promoteQueueRef.current = queue

        const firstId = promoteQueueRef.current.shift() as number
        try {
            const pre = await prefillLead(firstId)
            setQuickEditing(pre)
            setPromoteLeadId(firstId)
            setQuickOpen(true)
        } catch (e: any) {
            promoteQueueRef.current = null
            setToastMessage('Failed to fetch lead data for promote')
            setToastSeverity('error')
            setToastOpen(true)
        }
    }

    async function handleAddSelectedToActionPlan() {
        if (selectedIds.size === 0) {
            setToastMessage('No leads selected')
            setToastSeverity('info')
            setToastOpen(true)
            return
        }
        // Open task picker modal: preload tasks before showing so the Select is populated
        try {
            await _openTaskPicker()
        } catch (e) {
            // _openTaskPicker handles errors and sets tasksList to [] on failure
        }
        setTaskPickerOpen(true)
    }

    async function _openTaskPicker() {
        setLoading(true)
        try {
            const tasks = await fetchTasks()
            let list = tasks || []

            // If we have selected leads, filter out any tasks where ALL selected
            // leads are already linked to that task (no-op). This keeps the picker
            // focused on tasks that will actually add mappings.
            if (selectedIds && selectedIds.size > 0 && list.length > 0) {
                try {
                    // Resolve the 'lead' targettype refid to identify targets that are leads
                    let targetTypes = await fetchReferenceData('action_plan_target_type')
                    if (!targetTypes || !targetTypes.length) {
                        const all = await fetchReferenceData()
                        targetTypes = (all || []).filter((r: any) => String(r.refdataclass || r.category || '').toLowerCase().includes('target'))
                    }
                    const leadTarget = (targetTypes || []).find((t: any) => String(t.refvalue || '').toLowerCase().includes('lead'))
                    const leadRefId = leadTarget ? Number(leadTarget.refid) : null

                    if (leadRefId) {
                        // For each task, fetch its targets and determine if all selectedIds are present
                        const taskChecks = await Promise.all(list.map(async (t: any) => {
                            try {
                                const targets = await fetchTaskTargets(t.taskid)
                                // build a set of targetids for lead targettype
                                const linked = new Set<number>()
                                for (const tg of targets || []) {
                                    if (Number(tg.targettype) === Number(leadRefId) && tg.targetid != null) linked.add(Number(tg.targetid))
                                }
                                // Are ALL selectedIds already in linked?
                                let allLinked = true
                                for (const sid of Array.from(selectedIds)) {
                                    if (!linked.has(Number(sid))) { allLinked = false; break }
                                }
                                return { task: t, allLinked }
                            } catch (e) {
                                // On any error fetching targets, be conservative and include the task
                                return { task: t, allLinked: false }
                            }
                        }))

                        // Keep tasks where not all selected leads are already linked
                        list = taskChecks.filter((c: any) => !c.allLinked).map((c: any) => c.task)
                    }
                } catch (e) {
                    // ignore and fall back to showing all tasks
                }
            }

            setTasksList(list)
            // auto-select the first task so the picker isn't empty
            if (list.length) setSelectedTaskIdForLink(list[0].taskid ?? null)
        } catch (e) {
            setTasksList([])
        } finally {
            setLoading(false)
        }
    }

    // When modal opens, fetch tasks
    React.useEffect(() => {
        if (taskPickerOpen) void _openTaskPicker()
    }, [taskPickerOpen])

    async function handleConfirmLinkToTask() {
        // Only allow linking to an existing task selected in the picker
        setLoading(true)
        try {
            const taskId = selectedTaskIdForLink
            if (!taskId) {
                setToastMessage('Please select an existing task to link to')
                setToastSeverity('warning')
                setToastOpen(true)
                setLoading(false)
                return
            }

            // determine the targettype refid for leads
            let targetTypes = await fetchReferenceData('action_plan_target_type')
            if (!targetTypes || !targetTypes.length) {
                const all = await fetchReferenceData()
                targetTypes = (all || []).filter((r: any) => String(r.refdataclass || r.category || '').toLowerCase().includes('target'))
            }
            const leadTarget = (targetTypes || []).find((t: any) => String(t.refvalue || '').toLowerCase().includes('lead'))
            const leadRefId = leadTarget ? Number(leadTarget.refid) : null
            if (!leadRefId) {
                setToastMessage('Could not determine task target type for leads')
                setToastSeverity('warning')
                setToastOpen(true)
                setLoading(false)
                return
            }

            // Determine the review outcome refid for 'Added To Action Plan' and fail fast if missing.
            const addedToAction = (refStatuses || []).find((s: any) => String(s.refvalue || '').toLowerCase().includes('added to action plan'))
            const addedToActionRefId = addedToAction ? Number(addedToAction.refid) : null
            if (!addedToActionRefId) {
                setToastMessage('Reference data value "Added To Action Plan" is missing. Cannot proceed.')
                setToastSeverity('error')
                setToastOpen(true)
                setLoading(false)
                return
            }

            let added = 0
            for (const id of Array.from(selectedIds)) {
                let mappingPresent = false
                try {
                    await addTaskTarget(Number(taskId), { targettype: leadRefId, targetid: Number(id) })
                    mappingPresent = true
                } catch (err: any) {
                    const status = err?.response?.status
                    if (status === 409) {
                        // Already linked — treat as success for the purposes of setting review outcome
                        mappingPresent = true
                    } else {
                        // Unexpected error for this id: log and continue to next
                        // eslint-disable-next-line no-console
                        console.error('Failed to add task target for lead', id, err)
                        continue
                    }
                }

                if (mappingPresent) {
                    try {
                        await setLeadReviewOutcome(Number(id), addedToActionRefId)
                        // reflect change locally so the table updates immediately
                        setRows((prev) => (prev || []).map((r: any) => (Number(r.leadid) === Number(id) ? { ...r, reviewoutcomeid: addedToActionRefId, reviewdate: (new Date()).toISOString().slice(0, 10) } : r)))
                    } catch (e: any) {
                        // Log but continue with other leads. If setting review outcome fails
                        // we'll surface overall count but individual failures are non-fatal.
                        // eslint-disable-next-line no-console
                        console.error('Failed to set review outcome for lead', id, e)
                    }
                    added++
                }
            }
            setToastMessage(`Linked ${added} leads to task`)
            setToastSeverity('success')
            setToastOpen(true)
            setSelectedIds(new Set())
            setTaskPickerOpen(false)
            setSelectedTaskIdForLink(null)
            await loadSummary()
        } catch (e: any) {
            setToastMessage(e?.message || 'Failed to link leads to task')
            setToastSeverity('error')
            setToastOpen(true)
        } finally {
            setLoading(false)
        }
    }

    // resolve common review status refids for panel clicks
    const _norm = (v: any) => String(v || '').trim().toLowerCase()
    const engageMatch = (refStatuses || []).find((s: any) => _norm(s.refvalue) === 'engage urgently')
    const engageRid = engageMatch ? Number(engageMatch.refid) : undefined

    // tolerant lookup: match refvalues that include the key tokens (e.g. 'promoted' + 'contact')
    const findByTokens = (tokens: string[]) => {
        try {
            const wantTokens = tokens.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean)
            if (wantTokens.length === 0) return undefined
            for (const s of (refStatuses || [])) {
                const v = String(s.refvalue || '').toLowerCase()
                let ok = true
                for (const t of wantTokens) {
                    if (!v.includes(t)) { ok = false; break }
                }
                if (ok) return s
            }
        } catch (e) {
            // ignore
        }
        return undefined
    }

    const promotedMatch = findByTokens(['promoted', 'contact'])
    const promotedRid = promotedMatch ? Number(promotedMatch.refid) : undefined
    const addedMatch = findByTokens(['added', 'action', 'plan'])
    const addedRid = addedMatch ? Number(addedMatch.refid) : undefined

    const reviewStatusOptions = (() => {
        const byClass = (refStatuses || []).filter((s: any) => _norm(s.refdataclass) === 'lead_review_status')
        if ((byClass || []).length > 0) return byClass
        const wanted = ['promoted to contact', 'engage urgently']
        return (refStatuses || []).filter((s: any) => wanted.includes(_norm(s.refvalue)))
    })()

    // Helper: get count for a given refid or refvalue (case-insensitive)
    const getCountFor = (rid: number | undefined, refvalueName?: string) => {
        try {
            const byRefId = summary?.by_refid || {}
            const byRefValue = summary?.by_refvalue || {}
            if (rid != null) {
                // try string and numeric keys
                const maybe = byRefId[String(rid)] ?? byRefId[rid]
                if (maybe != null) return Number(maybe)
            }
            if (refvalueName) {
                // case-insensitive search through keys of by_refvalue for exact match
                const want = String(refvalueName || '').trim().toLowerCase()
                for (const k of Object.keys(byRefValue || {})) {
                    if (String(k || '').trim().toLowerCase() === want) return Number(byRefValue[k])
                }
                // try looser matching: token inclusion (all tokens must be present)
                const wantTokens = want.split(/\s+/).filter(Boolean)
                if (wantTokens.length > 0) {
                    for (const k of Object.keys(byRefValue || {})) {
                        const keyNorm = String(k || '').trim().toLowerCase()
                        let all = true
                        for (const t of wantTokens) { if (!keyNorm.includes(t)) { all = false; break } }
                        if (all) return Number(byRefValue[k])
                    }
                }
                // final fallback: try to find matching refid from loaded refStatuses
                try {
                    const found = (refStatuses || []).find((s: any) => String(s.refvalue || '').trim().toLowerCase() === want)
                    if (found) {
                        const fid = Number(found.refid)
                        const maybe2 = byRefId[String(fid)] ?? byRefId[fid]
                        if (maybe2 != null) return Number(maybe2)
                    }
                } catch (e) {
                    // ignore
                }
            }
            return 0
        } catch (e) {
            return 0
        }
    }

    const columns = [
        {
            key: '__select',
            label: (
                // Select-all should only affect selectable rows (i.e. not already promoted)
                <Checkbox
                    checked={(() => {
                        const selectable = rows.filter((r: any) => !(promotedRid !== undefined && Number(r.reviewoutcomeid) === Number(promotedRid)))
                        return selectable.length > 0 && selectable.every((r: any) => selectedIds.has(r.leadid))
                    })()}
                    onChange={() => {
                        const selectable = rows.filter((r: any) => !(promotedRid !== undefined && Number(r.reviewoutcomeid) === Number(promotedRid)))
                        const isAll = selectable.length > 0 && selectable.every((r: any) => selectedIds.has(r.leadid))
                        if (isAll) setSelectedIds(new Set())
                        else setSelectedIds(new Set(selectable.map((r: any) => r.leadid)))
                    }}
                    inputProps={{ 'aria-label': 'select all leads' }}
                />
            ),
            render: (r: any) => (
                // Disable selection for leads already promoted to contact
                (() => {
                    const disabled = promotedRid !== undefined && Number(r.reviewoutcomeid) === Number(promotedRid)
                    return (
                        <Checkbox
                            checked={selectedIds.has(r.leadid)}
                            onChange={() => {
                                if (!disabled) {
                                    setSelectedIds((prev) => {
                                        const next = new Set(prev)
                                        if (next.has(r.leadid)) next.delete(r.leadid)
                                        else next.add(r.leadid)
                                        return next
                                    })
                                }
                            }}
                            disabled={disabled}
                            inputProps={{ 'aria-label': `select lead ${r.leadid}` }}
                        />
                    )
                })()
            ),
        },
        {
            key: 'name',
            label: 'Name',
            render: (r: any) => {
                const display = r.name || `${r.firstname || ''} ${r.lastname || ''}`
                return (
                    <span
                        onClick={() => { if (r.linkedin_url) openProfileWindow(r) }}
                        onKeyDown={(e) => { if ((e as any).key === 'Enter' && r.linkedin_url) openProfileWindow(r) }}
                        role={r.linkedin_url ? 'link' : undefined}
                        tabIndex={0}
                        style={{ cursor: r.linkedin_url ? 'pointer' : 'default', textDecoration: r.linkedin_url ? 'underline' : 'none' }}
                    >
                        {display}
                    </span>
                )
            },
        },
        { key: 'company', label: 'Company' },
        { key: 'position', label: 'Position' },
        { key: 'connected_on', label: 'Connected On' },
        {
            key: 'reviewoutcomeid',
            label: 'Review Outcome',
            render: (r: any) => {
                // Display the human-friendly review outcome text. Prefer the
                // loaded `refStatuses` (merged) list; fall back to the raw id
                // or '(unset)' when no mapping is available.
                try {
                    const rid = r.reviewoutcomeid || null
                    if (!rid) return ''
                    const found = (refStatuses || []).find((s: any) => Number(s.refid) === Number(rid))
                    if (found) return found.refvalue
                    // As a fallback, try reviewStatusOptions which may be scoped
                    const found2 = (reviewStatusOptions || []).find((s: any) => Number(s.refid) === Number(rid))
                    if (found2) return found2.refvalue
                    return String(rid)
                } catch (e) {
                    return ''
                }
            },
        },
        {
            key: 'reviewdate',
            label: 'Review Date',
            render: (r: any) => {
                try {
                    const d = r.reviewdate
                    if (!d) return ''
                    // If already a YYYY-MM-DD string, return as-is
                    if (typeof d === 'string') {
                        const isoDateMatch = d.match(/^(\d{4}-\d{2}-\d{2})/)
                        if (isoDateMatch) return isoDateMatch[1]
                        // try parsing other string formats
                        const parsed = new Date(d)
                        if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
                        return ''
                    }
                    // If it's a Date-like object, convert to ISO date
                    const dt = new Date(d)
                    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10)
                    return ''
                } catch (e) {
                    return ''
                }
            },
        },
        // actions moved to top controls
    ]

    return (
        <div>

            {/* Title */}
            <div style={{ width: '100%', paddingBottom: 8 }}>
                <h2 style={{ margin: 0 }}>LinkedIn Leads</h2>
            </div>

            {/* Panels showing counts (collapsed by default into an Accordion) */}
            <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Overview</h3>
                        </div>
                    </div>
                </AccordionSummary>
                <AccordionDetails>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'stretch' }}>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flex: 1 }}>
                            {/* Total leads */}
                            <PanelCard
                                title="Total"
                                count={Number(summary?.total || 0)}
                                active={selectedReviewOutcomeId === undefined}
                                disabled={!refStatusesLoaded}
                                onClick={async () => {
                                    if (!refStatusesLoaded) {
                                        setToastMessage('Status values still loading')
                                        setToastSeverity('info')
                                        setToastOpen(true)
                                        return
                                    }
                                    // clear filter
                                    setSelectedReviewOutcomeId(undefined)
                                    setPage(0)
                                    await loadPage(0, search, undefined)
                                }}
                            />

                            {/* Unset review outcome */}
                            <PanelCard
                                title="Unset Review Status"
                                count={(() => {
                                    try {
                                        const byRef = summary?.by_refvalue || {}
                                        let unset = 0
                                        for (const k in byRef) {
                                            if (String(k || '').trim().toLowerCase() === 'none') {
                                                unset = byRef[k]
                                                break
                                            }
                                        }
                                        if (!unset && summary?.by_refid) {
                                            unset = summary.by_refid['0'] || summary.by_refid[0] || 0
                                        }
                                        return Number(unset || 0)
                                    } catch (e) {
                                        return 0
                                    }
                                })()}
                                active={selectedReviewOutcomeId === 0}
                                disabled={!refStatusesLoaded}
                                onClick={async () => {
                                    if (!refStatusesLoaded) {
                                        setToastMessage('Status values still loading')
                                        setToastSeverity('info')
                                        setToastOpen(true)
                                        return
                                    }
                                    // Set filter to unset (reviewoutcomeid == NULL) by using reviewOutcomeId=0
                                    setSelectedReviewOutcomeId(0)
                                    setPage(0)
                                    await loadPage(0, search, 0)
                                }}
                            />

                            {/* Leads last refreshed card moved to end of row */}

                            <PanelCard
                                title="Added To Action Plan"
                                count={getCountFor(addedRid, 'Added To Action Plan')}
                                active={addedRid !== undefined && selectedReviewOutcomeId === addedRid}
                                disabled={!refStatusesLoaded}
                                onClick={async () => {
                                    if (!refStatusesLoaded) {
                                        setToastMessage('Status values still loading')
                                        setToastSeverity('info')
                                        setToastOpen(true)
                                        return
                                    }
                                    if (addedRid === undefined) {
                                        setToastMessage('Review status "Added To Action Plan" not configured')
                                        setToastSeverity('warning')
                                        setToastOpen(true)
                                        return
                                    }
                                    setSelectedReviewOutcomeId(addedRid)
                                    setPage(0)
                                    await loadPage(0, search, addedRid)
                                }}
                            />

                            <PanelCard
                                title="Promoted To Contact"
                                count={getCountFor(promotedRid, 'Promoted To Contact')}
                                active={promotedRid !== undefined && selectedReviewOutcomeId === promotedRid}
                                disabled={!refStatusesLoaded}
                                onClick={async () => {
                                    if (!refStatusesLoaded) {
                                        setToastMessage('Status values still loading')
                                        setToastSeverity('info')
                                        setToastOpen(true)
                                        return
                                    }
                                    if (promotedRid === undefined) {
                                        setToastMessage('Review status "Promoted To Contact" not configured')
                                        setToastSeverity('warning')
                                        setToastOpen(true)
                                        return
                                    }
                                    setSelectedReviewOutcomeId(promotedRid)
                                    setPage(0)
                                    await loadPage(0, search, promotedRid)
                                }}
                            />
                            <PanelCard
                                title="Leads last refreshed"
                                count={
                                    (summary && summary.last_refreshed)
                                        ? (function () {
                                            try {
                                                const d = new Date(String(summary.last_refreshed))
                                                if (!isNaN(d.getTime())) return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                                            } catch (e) { }
                                            return String(summary.last_refreshed)
                                        })()
                                        : '—'
                                }
                                active={false}
                                disabled={true}
                                onClick={() => { /* read-only */ }}
                            />
                        </div>

                        {/* Right-side upload button (aligned with cards) */}
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept=".zip" onChange={(e) => handleUpload(e.target.files ? e.target.files[0] : null)} />
                            <AppButton colorScheme="purple" onClick={() => fileInputRef.current && fileInputRef.current.click()} sx={{ minHeight: 64, px: 3 }}>
                                Upload LinkedIn Archive
                            </AppButton>
                        </div>
                    </div>
                </AccordionDetails>
            </Accordion>

            <Toast open={toastOpen} message={toastMessage} severity={toastSeverity} onClose={() => setToastOpen(false)} />

            {/* Search row (spans window) */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                <TextField
                    placeholder="Search leads"
                    variant="outlined"
                    size="small"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    fullWidth
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            // Use the current input value from the event to avoid stale state when Enter is pressed
                            const q = (e.target as HTMLInputElement).value
                            setPage(0)
                            // call loadPage with the explicit query value
                            void loadPage(0, q)
                        }
                    }}
                    InputProps={{
                        endAdornment: (
                            <InputAdornment position="end">
                                {search ? (
                                    <IconButton size="small" onClick={() => { setSearch(''); setPage(0); loadPage(0, '') }} aria-label="clear search">
                                        <ClearIcon fontSize="small" />
                                    </IconButton>
                                ) : null}
                            </InputAdornment>
                        ),
                    }}
                />
                {/* spacer removed so search stretches to full width */}
            </div>

            <div style={{ marginTop: 12 }}>
                <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                    <Button
                        variant="outlined"
                        onClick={handleMarkSelectedNotRelevant}
                        disabled={selectedIds.size === 0}
                        sx={{ borderColor: BRAND_PURPLE, color: BRAND_PURPLE, fontWeight: 'normal' }}
                    >
                        MARK SELECTED NOT RELEVANT
                    </Button>
                    <AppButton colorScheme="purple" onClick={handlePromoteSelected} disabled={selectedIds.size === 0 || quickOpen}>
                        Promote selected
                    </AppButton>
                    <AppButton colorScheme="purple" onClick={handleAddSelectedToActionPlan} disabled={selectedIds.size === 0}>
                        ADD SELECTED TO ACTION PLAN
                    </AppButton>
                </Stack>
                <DataTable
                    columns={columns}
                    rows={rows}
                    page={page}
                    pageSize={pageSize}
                    total={total}
                    sortKey={sortKey ?? undefined}
                    sortDirection={sortDir ?? undefined}
                    onSortChange={(key, direction) => {
                        // ignore checkbox column
                        if (String(key) === '__select') return
                        const dir = direction as 'asc' | 'desc' | null
                        setSortKey(key)
                        setSortDir(dir)
                        // load and sort full dataset, landing on page 0
                        loadAndSortAll(0)
                        setPage(0)
                    }}
                    onPageChange={(p) => {
                        setPage(p)
                        // if we have an active sort, ensure paging uses sorted dataset
                        if (sortKey) loadAndSortAll(p)
                        else loadPage(p, search)
                    }}
                    onPageSizeChange={(s) => {
                        setPageSize(s)
                        setPage(0)
                        if (sortKey) loadAndSortAll(0)
                        else loadPage(0, search)
                    }}
                />
            </div>



            <QuickCreateModal
                open={quickOpen}
                onClose={() => { setQuickOpen(false); setQuickEditing(null); setPromoteLeadId(null) }}
                mode="contact"
                editing={quickEditing}
                onSuccess={async (created: any) => {
                    // After a contact is created from the Quick Editor, mark the originating lead as Not Relevant
                    try {
                        if (promoteLeadId) {
                            // Prefer to mark the originating lead as 'Promoted To Contact'.
                            // Use the strict endpoint via `setLeadReviewOutcome` so the
                            // reference value lookup is validated by the server.
                            const _norm = (v: any) => String(v || '').trim().toLowerCase()
                            const promoted = (refStatuses || []).find((s: any) => _norm(s.refvalue) === 'promoted to contact')
                            const prid = promoted ? Number(promoted.refid) : null
                            if (!prid) {
                                setToastMessage('Reference status "Promoted To Contact" not configured; lead not updated')
                                setToastSeverity('warning')
                                setToastOpen(true)
                            } else {
                                try {
                                    await setLeadReviewOutcome(promoteLeadId, prid)
                                    // update local rows immediately so the UI reflects the change
                                    setRows((prev) => (prev || []).map((r: any) => (Number(r.leadid) === Number(promoteLeadId) ? { ...r, reviewoutcomeid: prid, reviewdate: (new Date()).toISOString().slice(0, 10) } : r)))
                                } catch (err: any) {
                                    // Log and surface a warning but do not fail the promote flow
                                    // eslint-disable-next-line no-console
                                    console.error('Failed to set lead review outcome to Promoted To Contact', err)
                                    setToastMessage('Failed to mark originating lead as promoted')
                                    setToastSeverity('warning')
                                    setToastOpen(true)
                                }
                            }
                        }
                    } catch (e) {
                        // ignore other errors but log for debugging
                        // eslint-disable-next-line no-console
                        console.error('Failed to mark lead after promote', e)
                    }
                    // Remove the processed lead from selection and refresh summary
                    const processedId = promoteLeadId
                    if (processedId != null) {
                        setSelectedIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(processedId)) next.delete(processedId)
                            return next
                        })
                    }

                    await loadSummary()

                    const q = promoteQueueRef.current
                    if (q && q.length > 0) {
                        // Pull next id from queue and update modal in-place (no close/open)
                        const nextId = q.shift() as number
                        try {
                            const pre = await prefillLead(nextId)
                            setQuickEditing(pre)
                            setPromoteLeadId(nextId)
                            // leave quickOpen true to avoid flashing
                            return true
                        } catch (e) {
                            // On failure, stop the queue and close modal
                            promoteQueueRef.current = null
                            setQuickOpen(false)
                            setQuickEditing(null)
                            setPromoteLeadId(null)
                            setToastMessage('Failed to fetch next lead for promote')
                            setToastSeverity('warning')
                            setToastOpen(true)
                            await loadPage(0, search)
                            return false
                        }
                    } else {
                        // Queue exhausted — finish flow
                        promoteQueueRef.current = null
                        setQuickOpen(false)
                        setQuickEditing(null)
                        setPromoteLeadId(null)
                        setSelectedIds(new Set())
                        await loadPage(0, search)
                        return false
                    }
                }}
            />

            {/* Task picker dialog for linking leads to an existing or new task */}
            <Dialog open={taskPickerOpen} onClose={() => setTaskPickerOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Link selected leads to Action Plan task</DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 1 }}>
                        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                            <InputLabel id="select-task-label">Select existing task</InputLabel>
                            <Select
                                labelId="select-task-label"
                                value={selectedTaskIdForLink ?? ''}
                                label="Select existing task"
                                onChange={(e) => setSelectedTaskIdForLink(e.target.value ? Number(e.target.value) : null)}
                            >
                                <MenuItem value="">(none)</MenuItem>
                                {tasksList.map((t: any) => (
                                    <MenuItem key={t.taskid} value={t.taskid}>{t.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        {/* Only selecting existing tasks is allowed in this modal. */}
                    </Box>
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                    <Button onClick={() => { setTaskPickerOpen(false); setSelectedTaskIdForLink(null); }} variant="outlined" sx={{ borderColor: BRAND_PURPLE, color: BRAND_PURPLE, fontWeight: 'normal' }}>
                        Cancel
                    </Button>
                    <AppButton colorScheme="purple" onClick={handleConfirmLinkToTask} disabled={loading}>
                        Link leads
                    </AppButton>
                </DialogActions>
            </Dialog>
        </div>
    )
}
