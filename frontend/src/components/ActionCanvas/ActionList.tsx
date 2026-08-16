import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchTasks } from '../../api/client'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Typography from '@mui/material/Typography'
import AppButton from '../Shared/AppButton'
import LinkOffIcon from '@mui/icons-material/LinkOff'
import IconButton from '@mui/material/IconButton'
import { ACCORDION_TITLE_SX, ACCORDION_TITLE_VARIANT } from '../../constants/ui'
import ActionPlanTasksTable from './ActionPlanTasksTable'
import { fetchTaskTargets, fetchTaskLogs, fetchReferenceData, deleteTask, deleteTaskTarget, addTaskLog, updateTaskLog, deleteTaskLog, fetchAllContacts, fetchLeadsAll, fetchOrganisations, fetchSectors } from '../../api/client'
import AddUpdateModal from './AddUpdateModal'
import ConfirmDialog from '../Shared/ConfirmDialog'
import ContactsTable from '../Hub/ContactsTable'
import OrganisationsTable from '../Hub/OrganisationsTable'
import TaskFormModal from './TaskFormModal'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import WideDialog from '../Shared/WideDialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import { useQueryClient } from '@tanstack/react-query'
import type { Task, TaskLog, TaskTarget } from '../../api/types'

type Props = {
    tasks?: Task[]
    targetsByTask?: Record<number, TaskTarget[]>
    targetTypes?: { refid: number; refvalue: string }[]
    logsByTask?: Record<number, TaskLog[]>
    onEdit: (t: any) => void
    onDelete: (t: any) => void
    onOpenTargets: (taskId: number, typeRefId: number | null) => Promise<void>
    onOpenLogs: (taskId: number) => Promise<void>
    onAdd: () => void
}

export default function ActionList({ tasks, targetsByTask, targetTypes, logsByTask, onEdit, onDelete, onOpenTargets, onOpenLogs, onAdd }: Props) {
    // Component encapsulates its own data fetching when `tasks` prop is not provided
    const tasksQ = useQuery(['tasks'], () => fetchTasks(), { staleTime: 60000 })
    const tasksData = (tasks && tasks.length) ? tasks : (tasksQ.data ?? [])

    const [localTargetsByTask, setLocalTargetsByTask] = React.useState<Record<number, any> | null>(null)
    const [localLogsByTask, setLocalLogsByTask] = React.useState<Record<number, any> | null>(null)
    const [localTargetTypes, setLocalTargetTypes] = React.useState<{ refid: number; refvalue: string }[] | null>(null)
    const [localContacts, setLocalContacts] = React.useState<any[] | null>(null)
    const [localLeads, setLocalLeads] = React.useState<any[] | null>(null)
    const [localOrgs, setLocalOrgs] = React.useState<any[] | null>(null)
    const [localSectors, setLocalSectors] = React.useState<any[] | null>(null)

    React.useEffect(() => {
        let mounted = true
        async function loadJoined() {
            try {
                const tids = (tasksData || []).map(t => Number(t.taskid ?? t.id ?? 0)).filter(n => n > 0)
                if (tids.length > 0) {
                    const targetEntries = await Promise.all(tids.map(async (tid) => {
                        try { const tg = await fetchTaskTargets(tid); return [tid, tg || []] as [number, any[]] } catch (e) { return [tid, []] as [number, any[]] }
                    }))
                    if (mounted) setLocalTargetsByTask(Object.fromEntries(targetEntries))

                    const logsEntries = await Promise.all(tids.map(async (tid) => {
                        try { const lg = await fetchTaskLogs(tid); return [tid, lg || []] as [number, any[]] } catch (e) { return [tid, []] as [number, any[]] }
                    }))
                    if (mounted) setLocalLogsByTask(Object.fromEntries(logsEntries))
                    try {
                        const [cs, ls, os, ss] = await Promise.all([
                            fetchAllContacts(),
                            fetchLeadsAll(),
                            fetchOrganisations(),
                            fetchSectors(),
                        ])
                        if (mounted) {
                            setLocalContacts(cs || [])
                            setLocalLeads(ls || [])
                            setLocalOrgs(os || [])
                            setLocalSectors(ss || [])
                        }
                    } catch (e) {
                        // ignore fetch failures for optional lookups
                    }
                } else {
                    if (mounted) { setLocalTargetsByTask({}); setLocalLogsByTask({}) }
                }
                if (!targetTypes) {
                    try {
                        const tt = await fetchReferenceData('action_plan_target_type')
                        if (mounted) setLocalTargetTypes(tt || [])
                    } catch (e) {
                        if (mounted) setLocalTargetTypes([])
                    }
                }
            } catch (e) {
                if (mounted) {
                    if (!localTargetsByTask) setLocalTargetsByTask({})
                    if (!localLogsByTask) setLocalLogsByTask({})
                    if (!localTargetTypes) setLocalTargetTypes([])
                }
            }
        }
        void loadJoined()
        return () => { mounted = false }
    }, [tasksData, targetTypes])

    const qc = useQueryClient()

    // Task create/edit modal
    const [taskModalOpen, setTaskModalOpen] = React.useState(false)
    const [editingTask, setEditingTask] = React.useState<any | null>(null)

    function handleAddClick() {
        setEditingTask(null)
        setTaskModalOpen(true)
    }

    function handleEditClick(t: any) {
        setEditingTask(t)
        setTaskModalOpen(true)
    }

    async function handleDeleteClick(t: any) {
        try {
            await deleteTask(Number(t.taskid ?? t.id ?? 0))
            qc.invalidateQueries(['tasks'])
        } catch (e) {
            console.error('Failed to delete task', e)
        }
    }

    // Targets modal
    const [targetsModalOpen, setTargetsModalOpen] = React.useState(false)
    const [targetsModalTaskId, setTargetsModalTaskId] = React.useState<number | null>(null)
    const [targetsForModal, setTargetsForModal] = React.useState<any[] | null>(null)

    const [targetsModalTypeRefId, setTargetsModalTypeRefId] = React.useState<number | null>(null)
    const [subModalOpen, setSubModalOpen] = React.useState(false)
    const [subModalEntity, setSubModalEntity] = React.useState<'engagements' | 'roles' | null>(null)
    const [subModalContactId, setSubModalContactId] = React.useState<number | null>(null)

    async function handleOpenTargets(taskId: number, typeRefId: number | null) {
        try {
            const tg = await fetchTaskTargets(taskId)
            setTargetsForModal(tg || [])
            setTargetsModalTaskId(taskId)
            setTargetsModalTypeRefId(typeRefId ?? null)
            setTargetsModalOpen(true)
        } catch (e) {
            console.error(e)
        }
    }

    // Logs modal
    const [logsModalOpen, setLogsModalOpen] = React.useState(false)
    const [logsModalTaskId, setLogsModalTaskId] = React.useState<number | null>(null)
    const [logsForModal, setLogsForModal] = React.useState<any[] | null>(null)

    async function handleOpenLogs(taskId: number) {
        try {
            const lg = await fetchTaskLogs(taskId)
            setLogsForModal(lg || [])
            setLogsModalTaskId(taskId)
            setLogsModalOpen(true)
        } catch (e) {
            console.error(e)
        }
    }

    // Remove mapping confirm
    const [removeConfirmOpenLocal, setRemoveConfirmOpenLocal] = React.useState(false)
    const [removeConfirmPayload, setRemoveConfirmPayload] = React.useState<{ mappingId?: number; targetName?: string } | null>(null)
    function openConfirmRemove(mappingId: number, targetName?: string) {
        setRemoveConfirmPayload({ mappingId, targetName })
        setRemoveConfirmOpenLocal(true)
    }

    async function handleRemoveMapping(mappingId: number | undefined, taskId?: number | null) {
        if (!mappingId || !taskId) return
        try {
            await deleteTaskTarget(mappingId)
            const t = await fetchTaskTargets(taskId)
            setTargetsForModal(t || [])
            qc.invalidateQueries(['tasks'])
        } catch (e) {
            console.error('Failed to remove mapping', e)
        }
    }

    // Logs add/edit/delete
    const [addUpdateOpen, setAddUpdateOpen] = React.useState(false)
    const [addUpdatePayload, setAddUpdatePayload] = React.useState<{ commentary: string; logdate?: string | null }>({ commentary: '', logdate: undefined })
    const [logBeingEdited, setLogBeingEdited] = React.useState<any | null>(null)
    const [confirmDeleteLogTaskId, setConfirmDeleteLogTaskId] = React.useState<number | null>(null)
    const [confirmDeleteLogId, setConfirmDeleteLogId] = React.useState<number | null>(null)

    function openAddUpdateModal(initial?: { commentary?: string; logdate?: string | null }, editing?: any) {
        setLogBeingEdited(editing || null)
        setAddUpdatePayload({ commentary: initial?.commentary || '', logdate: initial?.logdate ?? undefined })
        setAddUpdateOpen(true)
    }

    function closeAddUpdateModal() {
        setAddUpdateOpen(false)
        setLogBeingEdited(null)
        setAddUpdatePayload({ commentary: '', logdate: undefined })
    }

    async function handleSaveAddUpdate(payload: { commentary: string; logdate?: string | null }) {
        const taskId = logsModalTaskId
        if (!taskId) return
        try {
            if (logBeingEdited && logBeingEdited.id) {
                await updateTaskLog(logBeingEdited.id, { commentary: payload.commentary, logdate: payload.logdate ?? null })
            } else {
                const txt = (payload.commentary || '').trim()
                const tempId = -Date.now()
                const tempLog = { id: tempId, taskid: taskId, commentary: txt, logdate: payload.logdate ?? new Date().toISOString() }
                setLogsForModal((s) => ([...((s && s) || []), tempLog]))
                await addTaskLog(taskId, { commentary: payload.commentary, logdate: payload.logdate ?? null })
            }
            const logs = await fetchTaskLogs(taskId)
            setLogsForModal(logs || [])
            qc.invalidateQueries(['tasks'])
            closeAddUpdateModal()
        } catch (e) {
            console.error('Failed to save log', e)
        }
    }

    async function handleDeleteLogFromModal(logId?: number) {
        const taskId = logsModalTaskId
        if (!taskId || !logId) return
        const prev = (logsForModal && logsForModal) ? logsForModal : []
        setLogsForModal((s) => (s ? s.filter((l: any) => l.id !== logId) : []))
        try {
            if (logId > 0) {
                await deleteTaskLog(logId)
                const logs = await fetchTaskLogs(taskId)
                setLogsForModal(logs || [])
            }
            qc.invalidateQueries(['tasks'])
        } catch (e) {
            console.error('Failed to delete log', e)
            setLogsForModal(prev)
        }
    }
    return (
        <>
            <Accordion defaultExpanded sx={{ mt: 3, mb: 2 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <Typography variant={ACCORDION_TITLE_VARIANT as any} sx={ACCORDION_TITLE_SX}>Actions</Typography>
                        <div>
                            <AppButton
                                variant="contained"
                                onClick={(e) => { e.stopPropagation(); handleAddClick() }}
                                onFocus={(e) => e.stopPropagation()}
                                colorScheme="purple"
                            >
                                + ADD ACTION
                            </AppButton>
                        </div>
                    </div>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0 }}>
                    <div>
                        <ActionPlanTasksTable
                            tasks={tasksData}
                            targetsByTask={targetsByTask ?? (localTargetsByTask ?? {})}
                            targetTypes={targetTypes ?? (localTargetTypes ?? [])}
                            logsByTask={logsByTask ?? (localLogsByTask ?? {})}
                            onEdit={(t) => { handleEditClick(t) }}
                            onDelete={(t) => { handleDeleteClick(t) }}
                            onOpenTargets={(taskId, refId) => { void handleOpenTargets(Number(taskId), refId) }}
                            onOpenLogs={(taskId) => { void handleOpenLogs(Number(taskId)) }}
                        />
                    </div>
                </AccordionDetails>
            </Accordion>

            <TaskFormModal open={taskModalOpen} initialTask={editingTask ?? undefined} onClose={() => { setTaskModalOpen(false); setEditingTask(null) }} onSaved={(t) => { qc.invalidateQueries(['tasks']); setTaskModalOpen(false); setEditingTask(null) }} />

            <WideDialog open={targetsModalOpen} onClose={() => { setTargetsModalOpen(false); setTargetsModalTaskId(null); setTargetsForModal(null); setTargetsModalTypeRefId(null) }} fullWidth maxWidth="lg" maxWidthPx={Math.floor(typeof window !== 'undefined' ? window.innerWidth * 1.5 : 1600)} fitToContent>
                {
                    (() => {
                        const t = (tasksData || []).find((x: any) => Number(x.taskid ?? x.id ?? 0) === Number(targetsModalTaskId))
                        const label = t ? (t.taskname || t.name || `#${targetsModalTaskId}`) : (targetsModalTaskId ? `#${targetsModalTaskId}` : '')
                        return <DialogTitle><span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>Manage targets for {label}</span></DialogTitle>
                    })()
                }
                <DialogContent>
                    <div>
                        {(() => {
                            if (!targetsModalTaskId) return null
                            const contactRefId = (targetTypes ?? localTargetTypes ?? []).find((tt: any) => (tt.refvalue || '').toLowerCase().includes('contact'))?.refid ?? null
                            const orgRefId = (targetTypes ?? localTargetTypes ?? []).find((tt: any) => (tt.refvalue || '').toLowerCase().includes('organ') || (tt.refvalue || '').toLowerCase().includes('org'))?.refid ?? null
                            const filteredTargets = (targetsForModal || []).filter((x) => !targetsModalTypeRefId || x.targettype === targetsModalTypeRefId)

                            if (targetsModalTypeRefId && Number(targetsModalTypeRefId) === Number(contactRefId)) {
                                const ids = filteredTargets.map((t: any) => Number(t.targetid))
                                return (
                                    <div>
                                        <ContactsTable inModal onlyIds={ids} hideCreateButton />
                                    </div>
                                )
                            }

                            if (targetsModalTypeRefId && Number(targetsModalTypeRefId) === Number(orgRefId)) {
                                const ids = filteredTargets.map((t: any) => Number(t.targetid))
                                return (
                                    <div>
                                        <OrganisationsTable inModal onlyIds={ids} hideCreateButton />
                                    </div>
                                )
                            }

                            return (
                                <div style={{ padding: 12, display: 'inline-block' }}>
                                    {(targetsForModal || []).length === 0 ? (
                                        <Typography variant="body2">No targets mapped to this task.</Typography>
                                    ) : (
                                        (targetsForModal || []).map((tg: any, idx: number) => {
                                            const typeName = (localTargetTypes || []).find((tt: any) => Number(tt.refid) === Number(tg.targettype))?.refvalue || String(tg.targettype)
                                            // Prefer any pre-populated name fields on the mapping, then fall back to lookups
                                            let displayName: string = String((tg.targetname || tg.name || tg.displayname || tg.target_label || tg.label || tg.targetid || tg.target) || '')
                                            try {
                                                const tType = Number(tg.targettype)
                                                if ((localContacts || []).length && tType === Number((localTargetTypes || []).find((tt: any) => (tt.refvalue || '').toLowerCase().includes('contact'))?.refid)) {
                                                    const c = (localContacts || []).find((x: any) => String(x.contactid) === String(tg.targetid) || Object.values(x || {}).some((v) => String(v) === String(tg.targetid)))
                                                    displayName = c ? (c.displayname || c.name || `${c.firstname || ''} ${c.lastname || ''}`.trim() || `Contact #${tg.targetid}`) : `Contact #${tg.targetid}`
                                                } else if ((localLeads || []).length && tType === Number((localTargetTypes || []).find((tt: any) => (tt.refvalue || '').toLowerCase().includes('lead'))?.refid)) {
                                                    const l = (localLeads || []).find((x: any) => String(x.leadid) === String(tg.targetid) || Object.values(x || {}).some((v) => String(v) === String(tg.targetid)))
                                                    displayName = l ? (l.name || `Lead #${tg.targetid}`) : `Lead #${tg.targetid}`
                                                } else if ((localOrgs || []).length && tType === Number((localTargetTypes || []).find((tt: any) => (tt.refvalue || '').toLowerCase().includes('organ') || (tt.refvalue || '').toLowerCase().includes('org'))?.refid)) {
                                                    const o = (localOrgs || []).find((x: any) => String(x.orgid) === String(tg.targetid) || Object.values(x || {}).some((v) => String(v) === String(tg.targetid)))
                                                    displayName = o ? (o.name || o.orgname || `Org #${tg.targetid}`) : `Org #${tg.targetid}`
                                                } else if ((localSectors || []).length && tType === Number((localTargetTypes || []).find((tt: any) => (tt.refvalue || '').toLowerCase().includes('sector'))?.refid)) {
                                                    const s = (localSectors || []).find((x: any) => String(x.id ?? x.sectorid ?? x.sector_id) === String(tg.targetid))
                                                    displayName = s ? (s.name || s.sector || `Sector #${tg.targetid}`) : `Sector #${tg.targetid}`
                                                }
                                            } catch (e) {
                                                // ignore
                                            }
                                            return (
                                                <div key={idx} style={{ padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
                                                        <div style={{ flex: 1, minWidth: 0, paddingRight: 120 }}>
                                                            <Typography variant="body2" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                <strong>{typeName}</strong>: {displayName}
                                                            </Typography>
                                                        </div>
                                                        <div style={{ flex: '0 0 auto', marginLeft: 24 }}>
                                                            <IconButton size="small" onClick={() => openConfirmRemove(Number(tg.id), String(displayName))} title="Unlink" aria-label={`Unlink ${displayName}`}>
                                                                <LinkOffIcon fontSize="small" />
                                                            </IconButton>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            )
                        })()}
                    </div>
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                    <AppButton colorScheme="white" onClick={() => { setTargetsModalOpen(false); setTargetsModalTaskId(null); setTargetsForModal(null); setTargetsModalTypeRefId(null) }}>Close</AppButton>
                </DialogActions>
            </WideDialog>

            <WideDialog open={logsModalOpen} onClose={() => { setLogsModalOpen(false); setLogsModalTaskId(null); setLogsForModal(null) }} fullWidth maxWidth="lg" maxWidthPx={Math.floor(typeof window !== 'undefined' ? window.innerWidth * 1.5 : 1600)} fitToContent>
                {
                    (() => {
                        const t = (tasksData || []).find((x: any) => Number(x.taskid ?? x.id ?? 0) === Number(logsModalTaskId))
                        const label = t ? (t.taskname || t.name || `#${logsModalTaskId}`) : (logsModalTaskId ? `#${logsModalTaskId}` : '')
                        return <DialogTitle><span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>Activity logs for {label}</span></DialogTitle>
                    })()
                }
                <DialogContent>
                    <div style={{ padding: 12, display: 'inline-block' }}>
                        <Table size="small" style={{ tableLayout: 'auto', width: '100%' }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell><strong>Update</strong></TableCell>
                                    <TableCell style={{ width: 120 }}><strong>Date</strong></TableCell>
                                    <TableCell align="right" style={{ width: 140 }}></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {(logsForModal || []).map((l: any) => (
                                    <TableRow key={l.id}>
                                        <TableCell style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.commentary}</TableCell>
                                        <TableCell style={{ width: 120 }}>{l.logdate ? (() => { try { const d = new Date(l.logdate); return isNaN(d.getTime()) ? l.logdate : d.toISOString().slice(0, 10) } catch (e) { return l.logdate } })() : '—'}</TableCell>
                                        <TableCell align="right" style={{ width: 140 }}>
                                            <AppButton variant="text" size="small" onClick={() => openAddUpdateModal({ commentary: l.commentary, logdate: l.logdate }, l)}>Edit</AppButton>
                                            <AppButton variant="text" size="small" onClick={() => { setConfirmDeleteLogTaskId(logsModalTaskId); setConfirmDeleteLogId(l.id) }}>Delete</AppButton>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                    <AppButton colorScheme="purple" onClick={() => { openAddUpdateModal(); }}>Add Update</AppButton>
                    <AppButton colorScheme="white" onClick={() => { setLogsModalOpen(false); setLogsModalTaskId(null); setLogsForModal(null) }}>Close</AppButton>
                </DialogActions>
            </WideDialog>

            <AddUpdateModal open={addUpdateOpen} initial={addUpdatePayload} editing={logBeingEdited} onClose={() => closeAddUpdateModal()} onSave={handleSaveAddUpdate} />
            <ConfirmDialog
                open={removeConfirmOpenLocal}
                title="Remove Target"
                description={(() => {
                    const mappingId = removeConfirmPayload?.mappingId
                    const targetName = removeConfirmPayload?.targetName || ''
                    const taskLabel = targetsModalTaskId ? `#${targetsModalTaskId}` : ''
                    return `Remove ${targetName || 'this target'} from task ${taskLabel}?`
                })()}
                onConfirm={async () => {
                    try {
                        const id = removeConfirmPayload?.mappingId
                        if (id) await handleRemoveMapping(id, targetsModalTaskId)
                    } catch (e) {
                        // ignore
                    } finally {
                        setRemoveConfirmOpenLocal(false)
                        setRemoveConfirmPayload(null)
                    }
                }}
                onClose={() => { setRemoveConfirmOpenLocal(false); setRemoveConfirmPayload(null) }}
            />

            <ConfirmDialog
                open={!!confirmDeleteLogId}
                title="Delete log"
                description={(() => {
                    try {
                        if (!confirmDeleteLogId) return 'Delete this log?'
                        return `Delete this log?`
                    } catch (e) { return 'Delete this log?' }
                })()}
                onConfirm={async () => {
                    try {
                        if (confirmDeleteLogId) await handleDeleteLogFromModal(confirmDeleteLogId)
                    } catch (e) {
                        // ignore
                    } finally {
                        setConfirmDeleteLogId(null)
                        setConfirmDeleteLogTaskId(null)
                    }
                }}
                onClose={() => { setConfirmDeleteLogId(null); setConfirmDeleteLogTaskId(null) }}
            />
        </>
    )
}
