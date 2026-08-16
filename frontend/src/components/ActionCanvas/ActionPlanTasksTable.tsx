import React, { useEffect, useState } from 'react'
import IconButton from '@mui/material/IconButton'
import Checkbox from '@mui/material/Checkbox'
import Box from '@mui/material/Box'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import AppButton from '../Shared/AppButton'
import { fetchTaskTargets, fetchReferenceData } from '../../api/client'
import { BRAND_PURPLE } from '../../constants/colors'
import DataTable from '../DataTable'

type Props = {
    tasks: any[]
    // optional map of taskId -> targets array (each target { targettype, targetid })
    targetsByTask?: Record<number, any[]>
    // reference target types (refid/refvalue) to allow detection of contact/lead/org/sector
    targetTypes?: { refid: number; refvalue: string }[]
    logsByTask?: Record<number, any[]>
    onEdit?: (task: any) => void
    onDelete?: (task: any) => void
    onOpenTargets?: (taskId: number, targetTypeRefId: number | null) => void
    onOpenLogs?: (taskId: number) => void
}

function findRefId(targetTypes: any[] | undefined, needle: string) {
    if (!targetTypes) return null
    const found = (targetTypes || []).find((tt: any) => (tt.refvalue || '').toLowerCase().includes(needle))
    return found ? Number(found.refid) : null
}

function ActionPlanTasksTable({ tasks = [], targetsByTask, targetTypes, logsByTask, onEdit, onDelete, onOpenTargets, onOpenLogs }: Props) {
    const [targetsExpanded, setTargetsExpanded] = React.useState<boolean>(false)
    const [localTargetsByTask, setLocalTargetsByTask] = useState<Record<number, any[]> | null>(null)
    const [localTargetTypes, setLocalTargetTypes] = useState<{ refid: number; refvalue: string }[] | null>(null)

    // If parent didn't provide targetsByTask, fetch targets for visible tasks so counts render
    useEffect(() => {
        let mounted = true
        async function loadTargets() {
            try {
                if (!targetsByTask) {
                    const tids = (tasks || []).map(t => Number(t.taskid ?? t.id ?? 0)).filter(n => n > 0)
                    if (tids.length === 0) {
                        if (mounted) setLocalTargetsByTask({})
                    } else {
                        const entries = await Promise.all(tids.map(async (tid) => {
                            try {
                                const tg = await fetchTaskTargets(tid)
                                return [tid, tg || []] as [number, any[]]
                            } catch (e) {
                                return [tid, []] as [number, any[]]
                            }
                        }))
                        if (mounted) setLocalTargetsByTask(Object.fromEntries(entries))
                    }
                }
                if (!targetTypes) {
                    const tt = await fetchReferenceData('action_plan_target_type')
                    if (mounted) setLocalTargetTypes(tt || [])
                }
            } catch (e) {
                if (mounted) {
                    if (!targetsByTask) setLocalTargetsByTask({})
                    if (!targetTypes) setLocalTargetTypes([])
                }
            }
        }
        void loadTargets()
        return () => { mounted = false }
    }, [tasks, targetsByTask, targetTypes])

    const resolvedTargetsByTask = targetsByTask ?? (localTargetsByTask ?? {})
    const resolvedTargetTypes = targetTypes ?? (localTargetTypes ?? [])

    function makeCounts(t: any) {
        const tid = Number(t.taskid ?? t.id ?? 0)
        const tTargets = (resolvedTargetsByTask && resolvedTargetsByTask[tid]) || []
        const getRefId = (needle: string) => findRefId(resolvedTargetTypes || [], needle)
        const contactRefId = getRefId('contact')
        const orgRefId = getRefId('organ') || getRefId('org') || getRefId('organisation')
        const leadRefId = getRefId('lead')
        const sectorRefId = getRefId('sector')
        const countFor = (refId: number | null, hint: string) => {
            if (!tTargets) return null
            if (refId) return tTargets.filter((x: any) => Number(x.targettype) === Number(refId)).length
            return tTargets.filter((x: any) => String(x.targettype).toLowerCase().includes(hint)).length
        }
        const contactsCount = countFor(contactRefId, 'contact')
        const orgsCount = countFor(orgRefId, 'org')
        const leadsCount = countFor(leadRefId, 'lead')
        const sectorsCount = countFor(sectorRefId, 'sector')
        const totalTargets = (Number(contactsCount || 0) + Number(orgsCount || 0) + Number(leadsCount || 0) + Number(sectorsCount || 0))
        return { contactsCount, orgsCount, leadsCount, sectorsCount, totalTargets }
    }

    const columns: any[] = []
    columns.push({ key: 'name', label: 'Name', render: (row: any) => (row.name || row.taskname || '') })
    columns.push({
        key: 'coaching',
        label: 'Coaching Action',
        render: (row: any) => {
            const coachingRefId = findRefId(resolvedTargetTypes || [], 'coach')
            const tTargets = (resolvedTargetsByTask && (resolvedTargetsByTask[Number(row.taskid ?? row.id ?? 0)] || []))
            const hasCoaching = coachingRefId ? tTargets.some((x: any) => Number(x.targettype) === Number(coachingRefId)) : Boolean(row._hasCoachingTarget)
            return (
                <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                    <Checkbox disabled checked={Boolean(hasCoaching)} sx={{ color: BRAND_PURPLE, '&.Mui-checked': { color: BRAND_PURPLE } }} />
                </div>
            )
        }
    })
    columns.push({ key: 'due', label: 'Due', render: (row: any) => { const d = row.duedate; if (!d) return ''; try { const D = new Date(d); if (isNaN(D.getTime())) return ''; return D.toISOString().slice(0, 10) } catch (e) { return '' } } })
    // Render collapsed or expanded targets columns to match historic behaviour
    if (!targetsExpanded) {
        columns.push({
            key: 'targets',
            label: (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <strong>Targets</strong>
                </Box>
            ),
            render: (row: any) => {
                const counts = makeCounts(row)
                if (counts.totalTargets == null) return (<span>—</span>)
                return (
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                        <AppButton size="small" colorScheme="white" onClick={() => onOpenTargets && onOpenTargets(Number(row.taskid ?? row.id ?? 0), null)}>{counts.totalTargets}</AppButton>
                    </div>
                )
            }
        })
    } else {
        columns.push({ key: 'contacts', label: (<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><strong>Contacts</strong></Box>), render: (row: any) => { const counts = makeCounts(row); const ref = findRefId(resolvedTargetTypes || [], 'contact'); return counts.contactsCount != null ? (<div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}><AppButton size="small" colorScheme="white" onClick={() => onOpenTargets && onOpenTargets(Number(row.taskid ?? row.id ?? 0), ref)}>{counts.contactsCount}</AppButton></div>) : (<span>—</span>) } })
        columns.push({ key: 'organisations', label: (<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><strong>Organisations</strong></Box>), render: (row: any) => { const counts = makeCounts(row); const ref = findRefId(resolvedTargetTypes || [], 'organ'); return counts.orgsCount != null ? (<div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}><AppButton size="small" colorScheme="white" onClick={() => onOpenTargets && onOpenTargets(Number(row.taskid ?? row.id ?? 0), ref)}>{counts.orgsCount}</AppButton></div>) : (<span>—</span>) } })
        columns.push({ key: 'leads', label: (<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><strong>Leads</strong></Box>), render: (row: any) => { const counts = makeCounts(row); const ref = findRefId(resolvedTargetTypes || [], 'lead'); return counts.leadsCount != null ? (<div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}><AppButton size="small" colorScheme="white" onClick={() => onOpenTargets && onOpenTargets(Number(row.taskid ?? row.id ?? 0), ref)}>{counts.leadsCount}</AppButton></div>) : (<span>—</span>) } })
        columns.push({ key: 'sectors', label: (<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><strong>Sectors</strong></Box>), render: (row: any) => { const counts = makeCounts(row); const ref = findRefId(resolvedTargetTypes || [], 'sector'); return counts.sectorsCount != null ? (<div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}><AppButton size="small" colorScheme="white" onClick={() => onOpenTargets && onOpenTargets(Number(row.taskid ?? row.id ?? 0), ref)}>{counts.sectorsCount}</AppButton></div>) : (<span>—</span>) } })
    }

    // Logs and actions are always present (both collapsed and expanded)
    columns.push({ key: 'logs', label: (<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><strong>Logs</strong></Box>), render: (row: any) => { const tid = Number(row.taskid ?? row.id ?? 0); const logsCount = (logsByTask && logsByTask[tid]) ? (logsByTask[tid] || []).length : 0; return (<div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}><AppButton size="small" colorScheme="white" onClick={() => onOpenLogs && onOpenLogs(tid)}>{logsCount}</AppButton></div>) } })
    columns.push({
        key: 'actions',
        label: 'Actions',
        render: (row: any) => (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', paddingLeft: 20 }}>
                {onEdit ? (
                    <IconButton size="small" aria-label={`Edit task ${row.taskid ?? row.id}`} onClick={() => onEdit(row)}>
                        <EditIcon fontSize="small" />
                    </IconButton>
                ) : null}
                {onDelete ? (
                    <IconButton size="small" aria-label={`Delete task ${row.taskid ?? row.id}`} onClick={() => onDelete(row)}>
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                ) : null}
            </div>
        ),
        shrinkToHeader: true,
        width: 200,
    })

    // build labels for targets/sector headers that include the expand/collapse button
    if (!targetsExpanded) {
        // attach the expand button to the Targets column label (collapsed state)
        const idx = columns.findIndex(c => c.key === 'targets')
        if (idx >= 0) {
            columns[idx].label = (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
                    <strong>Targets</strong>
                    <IconButton size="small" aria-label="Expand targets" onClick={() => setTargetsExpanded(true)} sx={{ bgcolor: BRAND_PURPLE, color: '#fff', '&:hover': { bgcolor: BRAND_PURPLE } }}>
                        <ExpandMoreIcon fontSize="small" />
                    </IconButton>
                </Box>
            )
        }
    } else {
        // when expanded, attach the collapse button to the Sectors column label (last of the expanded group)
        const idx = columns.findIndex(c => c.key === 'sectors')
        if (idx >= 0) {
            columns[idx].label = (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
                    <strong>Sectors</strong>
                    <IconButton size="small" aria-label="Collapse targets" onClick={() => setTargetsExpanded(false)} sx={{ bgcolor: BRAND_PURPLE, color: '#fff', '&:hover': { bgcolor: BRAND_PURPLE } }}>
                        <ExpandLessIcon fontSize="small" />
                    </IconButton>
                </Box>
            )
        }
    }

    return (
        <div>
            <DataTable rows={tasks || []} columns={columns} page={0} pageSize={20} onPageChange={() => { }} onPageSizeChange={() => { }} />
        </div>
    )
}

export default React.memo(ActionPlanTasksTable)
