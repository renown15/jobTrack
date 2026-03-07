import React, { useState, useMemo, useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import AppButton from '../components/Shared/AppButton'
import QuickCreateModal from '../components/Hub/QuickCreateModal'
import EngagementsTable from '../components/Hub/EngagementsTable'
import TaskFormModal from '../components/ActionCanvas/TaskFormModal'
import ActionPlanTasksTable from '../components/ActionCanvas/ActionPlanTasksTable'
import ResponsiveDataView from '../components/ResponsiveDataView'
import MobileTasksList from '../components/ActionCanvas/MobileTasksList'
import { fetchTasks, fetchTaskTargets, fetchReferenceData, addTaskTarget, fetchAllContacts, fetchTaskLogs } from '../api/client'
// Autocomplete removed; actions are created via the Add Action button in the header
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { ACCORDION_TITLE_SX, ACCORDION_TITLE_VARIANT } from '../constants/ui'
import { BRAND_PURPLE } from '../constants/colors'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import TableBody from '@mui/material/TableBody'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import WideDialog from '../components/Shared/WideDialog'
import Checkbox from '@mui/material/Checkbox'
import { useQueryClient, useQuery } from '@tanstack/react-query'

export default function Coaching() {
    const qc = useQueryClient()
    const contactsQ = useQuery(['contactsList'], () => fetchAllContacts(), { staleTime: 60000 })
    const roleTypesQ = useQuery(['refdata', 'contact_role_type'], () => fetchReferenceData('contact_role_type'), { staleTime: 60000 })

    // (task loading implemented later in file; ensure state is declared before use)
    const coachRefId = useMemo(() => {
        const list: any[] = roleTypesQ.data ?? []
        const found = list.find((r: any) => String(r.refvalue || r.label || r.code || '').toLowerCase().includes('coach'))
        return found ? Number(found.refid) : null
    }, [roleTypesQ.data])

    const coaches = useMemo(() => {
        const list: any[] = contactsQ.data ?? []
        if (!Array.isArray(list)) return []
        if (coachRefId != null) return list.filter((c: any) => Number(c.role_type_id ?? c.roleid ?? 0) === Number(coachRefId))
        return list.filter((c: any) => String(c.currentrole || c.role || '').toLowerCase().includes('coach'))
    }, [contactsQ.data, coachRefId])

    const [selectedCoach, setSelectedCoach] = useState<number | null>(null)

    // If there's exactly one coach available, auto-select them.
    useEffect(() => {
        try {
            const contactsList: any[] = contactsQ.data ?? []
            // recompute coachRefId locally to avoid relying on memoization timing
            const rtList: any[] = roleTypesQ.data ?? []
            const found = rtList.find((r: any) => String(r.refvalue || r.label || r.code || '').toLowerCase().includes('coach'))
            const localCoachRefId = found ? Number(found.refid) : null
            let localCoaches: any[] = []
            if (localCoachRefId != null) localCoaches = contactsList.filter((c: any) => Number(c.role_type_id ?? c.roleid ?? 0) === Number(localCoachRefId))
            else localCoaches = contactsList.filter((c: any) => String(c.currentrole || c.role || '').toLowerCase().includes('coach'))

            if ((localCoaches || []).length === 1 && (selectedCoach === null || selectedCoach === undefined)) {
                const single = localCoaches[0]
                if (single && (single.contactid || single.contactId)) setSelectedCoach(Number(single.contactid ?? single.contactId))
            }
        } catch (e) {
            // ignore
        }
    }, [contactsQ.data, roleTypesQ.data, selectedCoach])
    const [openQuickCreate, setOpenQuickCreate] = useState<boolean>(false)
    const [openCreateSession, setOpenCreateSession] = useState<boolean>(false)

    // Actions / Coaching Tasks
    const [tasksList, setTasksList] = useState<any[]>([])
    const [openTaskModal, setOpenTaskModal] = useState<boolean>(false)
    const [editingTask, setEditingTask] = useState<any | null>(null)
    // Targets/logs modal state (mirror of ActionPlan minimal behaviour)
    const [removeModalOpen, setRemoveModalOpen] = useState(false)
    const [removeModalTaskId, setRemoveModalTaskId] = useState<number | null>(null)
    const [removeModalTypeRefid, setRemoveModalTypeRefid] = useState<number | null>(null)
    const [removeModalTargets, setRemoveModalTargets] = useState<any[] | null>(null)
    const [removeModalTypes, setRemoveModalTypes] = useState<any[] | null>(null)

    const [logsModalOpen, setLogsModalOpen] = useState(false)
    const [logsModalTaskId, setLogsModalTaskId] = useState<number | null>(null)
    const [logsForTask, setLogsForTask] = useState<any[] | null>(null)

    // Load tasks and mark those that have a 'Coaching' target linked
    async function loadCoachingTasks() {
        try {
            const tasks = await fetchTasks()
            // resolve target types for action plan (fallback to all refdata)
            let targetTypes = await fetchReferenceData('action_plan_target_type')
            if (!targetTypes || !targetTypes.length) {
                const all = await fetchReferenceData()
                targetTypes = (all || []).filter((r: any) => String(r.refdataclass || r.category || '').toLowerCase().includes('target'))
            }
            const coachingTarget = (targetTypes || []).find((t: any) => String(t.refvalue || '').toLowerCase().includes('coach'))
            const coachingRefId = coachingTarget ? Number(coachingTarget.refid) : null

            if (coachingRefId) {
                const checks = await Promise.all((tasks || []).map(async (t: any) => {
                    try {
                        const tg = await fetchTaskTargets(t.taskid)
                        // If a specific coach is selected, only mark tasks that target that coach id.
                        // Otherwise, mark any task that has a coaching target type.
                        const has = (tg || []).some((x: any) => {
                            try {
                                const isType = Number(x.targettype) === Number(coachingRefId)
                                if (!isType) return false
                                if (selectedCoach == null) return true
                                return Number(x.targetid) === Number(selectedCoach)
                            } catch (e) {
                                return false
                            }
                        })
                        return { ...t, _hasCoachingTarget: Boolean(has) }
                    } catch (e) {
                        return { ...t, _hasCoachingTarget: false }
                    }
                }))
                setTasksList(checks)
            } else {
                setTasksList((tasks || []).map((t: any) => ({ ...t, _hasCoachingTarget: false })))
            }
        } catch (e) {
            setTasksList([])
        }
    }

    useEffect(() => { void loadCoachingTasks() }, [selectedCoach, contactsQ.data])

    const coachingActions = useMemo(() => {
        if (selectedCoach == null) return []
        return (tasksList || []).filter((t: any) => Boolean(t._hasCoachingTarget))
    }, [tasksList, selectedCoach])

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Typography variant="h5" sx={{ fontWeight: 'bold' }}>Coaching</Typography>
            </Box>

            <Box sx={{ mb: 3 }}>
                <Box sx={{ p: 2, border: '1px solid #e0e0e0', borderRadius: 1, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                    <FormControl size="small" sx={{ minWidth: 260 }}>
                        <InputLabel id="select-coach-label">Select Coach</InputLabel>
                        <Select
                            labelId="select-coach-label"
                            value={selectedCoach ?? ''}
                            label="Select Coach"
                            onChange={(e) => setSelectedCoach(e.target.value === '' ? null : Number(e.target.value))}
                        >
                            <MenuItem value="">-- none --</MenuItem>
                            {coaches.map((c: any) => (
                                <MenuItem key={c.contactid} value={Number(c.contactid)}>{c.name || c.firstname || c.contactname || `${c.firstname || ''} ${c.lastname || ''}`}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <AppButton variant="outlined" size="small" onClick={() => setOpenQuickCreate(true)} colorScheme="purple">+ ADD COACH</AppButton>
                </Box>
            </Box>

            <Accordion defaultExpanded sx={{ mb: 2 }} elevation={1}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <Typography variant={ACCORDION_TITLE_VARIANT as any} sx={ACCORDION_TITLE_SX}>Coaching Sessions</Typography>
                        <AppButton size="small" variant="outlined" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpenCreateSession(true); }} colorScheme="purple">+ ADD COACHING SESSION</AppButton>
                    </Box>
                </AccordionSummary>
                <AccordionDetails>
                    <EngagementsTable
                        contactId={selectedCoach ?? undefined}
                        requireContact={true}
                        typeFilter={['Coaching Session']}
                        onCreate={() => setOpenCreateSession(true)}
                        createEditing={selectedCoach ? { contactid: selectedCoach, kind: 'Coaching Session' } : { kind: 'Coaching Session' }}
                        showCreate={false}
                        noWrapper={true}
                    />
                </AccordionDetails>
            </Accordion>

            <Accordion defaultExpanded sx={{ mt: 3 }} elevation={1}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <Typography variant={ACCORDION_TITLE_VARIANT as any} sx={ACCORDION_TITLE_SX}>Coaching Actions</Typography>
                        <AppButton size="small" variant="outlined" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpenTaskModal(true); }} colorScheme="purple">+ Add Action</AppButton>
                    </Box>
                </AccordionSummary>
                <AccordionDetails>
                    {/* Actions are created via the header button; list below shows coaching-targeted tasks */}

                    <ResponsiveDataView
                        desktopView={<ActionPlanTasksTable
                            tasks={coachingActions}
                            onEdit={(t) => { setEditingTask(t); setOpenTaskModal(true) }}
                            onOpenTargets={async (taskId?: number, typeRefId?: number | null) => {
                                if (!taskId) return
                                try {
                                    const types = await fetchReferenceData('action_plan_target_type')
                                    const targets = await fetchTaskTargets(taskId)
                                    setRemoveModalTypes(types || [])
                                    setRemoveModalTargets(targets || [])
                                } catch (e) {
                                    setRemoveModalTypes([])
                                    setRemoveModalTargets([])
                                }
                                setRemoveModalTaskId(taskId)
                                setRemoveModalTypeRefid(typeRefId ?? null)
                                setRemoveModalOpen(true)
                            }}
                            onOpenLogs={async (taskId?: number) => {
                                if (!taskId) return
                                try {
                                    const logs = await fetchTaskLogs(taskId)
                                    setLogsForTask(logs || [])
                                } catch (e) {
                                    setLogsForTask([])
                                }
                                setLogsModalTaskId(taskId)
                                setLogsModalOpen(true)
                            }}
                        />}
                        mobileView={<MobileTasksList tasks={coachingActions} onEdit={(t) => { setEditingTask(t); setOpenTaskModal(true) }} />}
                        breakpoint="md"
                    />

                    <TaskFormModal open={openTaskModal} initialTask={editingTask ?? undefined} onClose={() => { setOpenTaskModal(false); setEditingTask(null) }} onSaved={async (created: any) => {
                        try {
                            const allTargets = await fetchReferenceData('action_plan_target_type')
                            let targetTypes = allTargets && allTargets.length ? allTargets : await fetchReferenceData()
                            if (!targetTypes || !targetTypes.length) targetTypes = []
                            const coachingTarget = (targetTypes || []).find((r: any) => String(r.refvalue || '').toLowerCase().includes('coach'))
                            const coachingRefId = coachingTarget ? Number(coachingTarget.refid) : null
                            if (coachingRefId && created && (created.taskid || created.taskId)) {
                                const tid = Number(created.taskid ?? created.taskId)
                                try {
                                    if (selectedCoach) await addTaskTarget(tid, { targettype: coachingRefId, targetid: Number(selectedCoach) })
                                } catch (err) {
                                    // ignore
                                }
                            }
                        } finally {
                            setOpenTaskModal(false)
                            setEditingTask(null)
                            void loadCoachingTasks()
                        }
                    }} />

                    {/* Targets modal (manage targets for a task) */}
                    <WideDialog open={removeModalOpen} onClose={() => setRemoveModalOpen(false)} fullWidth maxWidth="md" fitToContent maxWidthPx={Math.floor(typeof window !== 'undefined' ? window.innerWidth * 1.5 : 1600)}>
                        <DialogTitle><span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>Manage targets</span></DialogTitle>
                        <DialogContent>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell><strong>Name</strong></TableCell>
                                        <TableCell><strong>Date added</strong></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {(removeModalTargets || []).map((m: any) => {
                                        const tt = (removeModalTypes || []).find((x: any) => Number(x.refid) === Number(m.targettype))
                                        const typeLabel = tt ? tt.refvalue : String(m.targettype)
                                        const primary = `${typeLabel} #${m.targetid}`
                                        const dateOnly = m.created_at ? (() => { try { const d = new Date(m.created_at); return isNaN(d.getTime()) ? String(m.created_at) : d.toISOString().slice(0, 10) } catch (e) { return String(m.created_at) } })() : '—'
                                        return (
                                            <TableRow key={m.id ?? `${m.targettype}-${m.targetid}`}>
                                                <TableCell>{primary}</TableCell>
                                                <TableCell>{dateOnly}</TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </DialogContent>
                        <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                            <AppButton colorScheme="white" onClick={() => setRemoveModalOpen(false)}>Close</AppButton>
                        </DialogActions>
                    </WideDialog>

                    {/* Logs modal: list logs for a task */}
                    <WideDialog open={logsModalOpen} onClose={() => setLogsModalOpen(false)} fullWidth maxWidth="md" fitToContent maxWidthPx={Math.floor(typeof window !== 'undefined' ? window.innerWidth * 1.5 : 1600)}>
                        <DialogTitle><span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>{(() => {
                            const t = (tasksList || []).find((x: any) => Number(x?.taskid) === Number(logsModalTaskId))
                            const label = t?.name || (logsModalTaskId != null ? `#${logsModalTaskId}` : '')
                            return `Activity logs for ${label}`
                        })()}</span></DialogTitle>
                        <DialogContent>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell><strong>Update</strong></TableCell>
                                        <TableCell><strong>Date</strong></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {(logsForTask || []).map((l: any) => (
                                        <TableRow key={l.id}>
                                            <TableCell>{l.commentary}</TableCell>
                                            <TableCell>{l.logdate ? (() => { try { const d = new Date(l.logdate); return isNaN(d.getTime()) ? l.logdate : d.toISOString().slice(0, 10) } catch (e) { return l.logdate } })() : '—'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </DialogContent>
                        <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                            <AppButton colorScheme="white" onClick={() => setLogsModalOpen(false)}>Close</AppButton>
                        </DialogActions>
                    </WideDialog>
                </AccordionDetails>
            </Accordion>

            <QuickCreateModal
                open={openQuickCreate}
                onClose={() => { setOpenQuickCreate(false); qc.invalidateQueries(['contactsList']) }}
                mode="contact"
                initialRoleTypeId={coachRefId}
                lockRoleType={true}
                hideCreateAndAddEngagement={true}
                hideAddToActionPlan={true}
                onSuccess={(created: any) => {
                    if (created && (created.contactid || created.contactId)) {
                        const id = Number(created.contactid ?? created.contactId)
                        setSelectedCoach(id)
                    }
                    qc.invalidateQueries(['contactsList'])
                }}
            />

            <QuickCreateModal
                open={openCreateSession}
                onClose={() => { setOpenCreateSession(false); }}
                mode="engagement"
                editing={selectedCoach ? { contactid: selectedCoach, kind: 'Coaching Session' } : { kind: 'Coaching Session' }}
            />
        </Box >
    )
}
