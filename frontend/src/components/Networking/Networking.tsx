import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import AppButton from '../Shared/AppButton'
import Dialog from '../Shared/WideDialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import WideDialog from '../Shared/WideDialog'
import TextField from '@mui/material/TextField'
import DatePicker from '../Shared/DatePicker'
// date input uses native TextField
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import AddIcon from '@mui/icons-material/Add'
import { fetchNetworkingEvents, createNetworkingEvent, updateNetworkingEvent, fetchEventTasks, addEventTask, deleteEventTaskLink, fetchReferenceData, createTask, deleteNetworkingEvent } from '../../api/client'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import IconButton from '@mui/material/IconButton'
import { BRAND_PURPLE } from '../../constants/colors'

function formatDateISO(d: Date) {
    return d.toISOString().slice(0, 10)
}

function calcOffsetDate(opts: { weeks?: number; months?: number }) {
    const now = new Date()
    if (opts.weeks) {
        now.setDate(now.getDate() + opts.weeks * 7)
    }
    if (opts.months) {
        now.setMonth(now.getMonth() + opts.months)
    }
    return formatDateISO(now)
}

function formatDisplayDate(dateStr?: string | null) {
    if (!dateStr) return ''
    try {
        // Parse YYYY-MM-DD or full ISO safely without timezone-shift by constructing UTC date
        // Accept formats like 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM:SSZ' etc.
        const m = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
        if (!m) {
            // Fallback: try Date parsing and format (best-effort)
            const d2 = new Date(dateStr)
            if (isNaN(d2.getTime())) return String(dateStr)
            return d2.toISOString().slice(0, 10)
        }
        const y = Number(m[1])
        const mm = Number(m[2])
        const dd = Number(m[3])
        // Construct UTC date to avoid local timezone offset changing the day
        const utc = new Date(Date.UTC(y, mm - 1, dd))
        return utc.toISOString().slice(0, 10)
    } catch (e) {
        return String(dateStr)
    }
}

export default function Networking() {
    const qc = useQueryClient()
    const { data: events = [], isLoading, refetch } = useQuery(['networking', 'events'], fetchNetworkingEvents, { staleTime: 30_000 })

    const [openAdd, setOpenAdd] = React.useState(false)
    const emptyForm = { eventName: '', eventDate: '', notes: '', eventTypeId: 0 }
    const [form, setForm] = React.useState(emptyForm)
    const [editingEventId, setEditingEventId] = React.useState<number | null>(null)
    const [selectedEventTasks, setSelectedEventTasks] = React.useState<any[] | null>(null)
    const [tasksDialogOpen, setTasksDialogOpen] = React.useState(false)
    const [currentEventId, setCurrentEventId] = React.useState<number | null>(null)

    // Create+link task modal state
    const [createTaskOpen, setCreateTaskOpen] = React.useState(false)
    const [newTaskName, setNewTaskName] = React.useState('')
    const [newTaskDue, setNewTaskDue] = React.useState<string>('')
    const [creatingTask, setCreatingTask] = React.useState(false)

    const { data: eventTypes = [] } = useQuery(['refdata', 'network_event_type'], () => fetchReferenceData('network_event_type'))

    const createMut = useMutation((p: any) => createNetworkingEvent(p), {
        onSuccess: () => {
            qc.invalidateQueries(['networking', 'events'])
            setOpenAdd(false)
            // Reset local form state after successful create so next open is clean
            setForm(emptyForm)
            setEditingEventId(null)
        }
    })

    const updateMut = useMutation((args: { id: number; payload: any }) => updateNetworkingEvent(args.id, args.payload), {
        onSuccess: () => {
            qc.invalidateQueries(['networking', 'events'])
            setOpenAdd(false)
            setForm(emptyForm)
            setEditingEventId(null)
        }
    })

    const deleteMut = useMutation((id: number) => deleteNetworkingEvent(id), {
        onSuccess: () => qc.invalidateQueries(['networking', 'events'])
    })

    const viewTasks = async (eventId: number) => {
        try {
            const rows = await fetchEventTasks(eventId)
            setSelectedEventTasks(rows)
            setCurrentEventId(eventId)
            setTasksDialogOpen(true)
        } catch (e) {
            console.error('Failed to load event tasks', e)
        }
    }

    async function handleCreateAndLink() {
        if (!newTaskName.trim() || !currentEventId) return
        setCreatingTask(true)
        try {
            // Only send a due date when the user selected one (newTaskDue non-empty)
            const duedateToSend = newTaskDue ? newTaskDue : null

            const created: any = await createTask({ name: newTaskName.trim(), duedate: duedateToSend })
            if (!created || !created.taskid) throw new Error('Invalid task created')
            await addEventTask(currentEventId, created.taskid)
            // refresh modal list and events counts
            const rows = await fetchEventTasks(currentEventId)
            setSelectedEventTasks(rows)
            qc.invalidateQueries(['networking', 'events'])
            setCreateTaskOpen(false)
            setNewTaskName('')
            setNewTaskDue(formatDateISO(new Date()))
        } catch (e) {
            console.error('Failed to create and link task', e)
        } finally {
            setCreatingTask(false)
        }
    }

    async function handleUnlink(linkId: number) {
        if (!currentEventId) return
        try {
            await deleteEventTaskLink(linkId)
            const rows = await fetchEventTasks(currentEventId)
            setSelectedEventTasks(rows)
            qc.invalidateQueries(['networking', 'events'])
        } catch (e) {
            console.error('Failed to unlink task', e)
        }
    }

    return (
        <Box>
            <h2 style={{ margin: 0, marginTop: 2 }}>Networking</h2>
            <Paper sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <AppButton startIcon={<AddIcon />} colorScheme="purple" onClick={() => setOpenAdd(true)}>Add event</AppButton>
                </Box>

                <Box sx={{ mt: 2 }}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell><strong>Event</strong></TableCell>
                                <TableCell><strong>Date</strong></TableCell>
                                <TableCell><strong>Type</strong></TableCell>
                                <TableCell><strong>Notes</strong></TableCell>
                                <TableCell title="Actions"><strong>Actions</strong></TableCell>
                                <TableCell title="Row Actions"><strong>Row Actions</strong></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {(events || []).map((e: any) => (
                                <TableRow key={e.eventid}>
                                    <TableCell>{e.eventname}</TableCell>
                                    <TableCell>{formatDisplayDate(e.eventdate)}</TableCell>
                                    <TableCell>{e.eventtype}</TableCell>
                                    <TableCell>{e.notes}</TableCell>
                                    <TableCell>
                                        {/* show numeric count and open the linked-tasks modal */}
                                        <AppButton size="small" colorScheme="white" onClick={() => viewTasks(e.eventid)} title="Show linked tasks" aria-label={`Show linked tasks for event ${e.eventid}`}>{Number(e.actions_count || e.actionsCount || 0)}</AppButton>
                                    </TableCell>
                                    <TableCell>
                                        {/* row-level action icons (delete, etc) */}
                                        <IconButton size="small" onClick={() => {
                                            // open edit dialog with prefilled values
                                            setForm({
                                                eventName: e.eventname ?? e.eventName ?? '',
                                                // normalize incoming event date to YYYY-MM-DD so the native date input accepts it
                                                eventDate: formatDisplayDate(e.eventdate ?? e.eventDate ?? ''),
                                                notes: e.notes ?? '',
                                                eventTypeId: Number(e.eventtypeid ?? e.eventtypeid ?? e.eventtypeid ?? 0) || Number(e.eventtypeid ?? e.eventtype ?? 0) || 0
                                            })
                                            setEditingEventId(Number(e.eventid))
                                            setOpenAdd(true)
                                        }} title="Edit event" aria-label={`Edit networking event ${e.eventid}`}>
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                        <IconButton size="small" onClick={() => {
                                            if (window.confirm('Delete this networking event?')) {
                                                deleteMut.mutate(e.eventid)
                                            }
                                        }} title="Delete event" aria-label={`Delete networking event ${e.eventid}`} disabled={deleteMut.isLoading}>
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Box>
            </Paper>

            <Dialog open={openAdd} onClose={() => { setOpenAdd(false); setForm(emptyForm); setEditingEventId(null) }} fullWidth maxWidth="sm">
                <DialogTitle>{editingEventId ? 'Edit networking event' : 'Add networking event'}</DialogTitle>
                <DialogContent sx={{
                    '& .MuiOutlinedInput-root': {
                        position: 'relative',
                        zIndex: (theme: any) => (theme?.zIndex?.modal ?? 1300) + 10,
                    },
                    '& .MuiOutlinedInput-notchedOutline': {
                        borderStyle: 'solid',
                        borderWidth: '1px',
                        borderColor: 'rgba(0,0,0,0.23)'
                    }
                }}>
                    <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
                        <TextField label="Event name" value={form.eventName} onChange={e => setForm({ ...form, eventName: e.target.value })} />
                        <DatePicker label="Event date" value={form.eventDate || null} onChange={(v) => setForm({ ...form, eventDate: v ?? '' })} />
                        <TextField label="Notes" multiline minRows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                        <FormControl fullWidth>
                            <InputLabel id="event-type-label">Event type</InputLabel>
                            <Select
                                labelId="event-type-label"
                                label="Event type"
                                value={form.eventTypeId || ''}
                                onChange={(e) => setForm({ ...form, eventTypeId: Number(e.target.value) })}
                            >
                                <MenuItem value="">-- Select --</MenuItem>
                                {(eventTypes || []).map((r: any) => (
                                    <MenuItem key={r.refid} value={r.refid}>{r.refvalue}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                    <AppButton colorScheme="white" onClick={() => { setOpenAdd(false); setForm(emptyForm); setEditingEventId(null) }}>Cancel</AppButton>
                    <AppButton
                        colorScheme="purple"
                        onClick={() => {
                            const payload = { eventName: form.eventName, eventDate: form.eventDate, notes: form.notes, eventTypeId: form.eventTypeId }
                            if (editingEventId) {
                                updateMut.mutate({ id: editingEventId, payload })
                            } else {
                                createMut.mutate(payload)
                            }
                        }}
                        disabled={(createMut.isLoading || updateMut.isLoading) || !form.eventName.trim() || !form.eventDate || !form.eventTypeId}
                    >
                        Save
                    </AppButton>
                </DialogActions>
            </Dialog>

            <WideDialog open={tasksDialogOpen} onClose={() => setTasksDialogOpen(false)} fullWidth maxWidth="md">
                <DialogTitle>Linked Actions</DialogTitle>
                <DialogContent sx={{
                    '& .MuiOutlinedInput-root': {
                        position: 'relative',
                        zIndex: (theme: any) => (theme?.zIndex?.modal ?? 1300) + 10,
                    },
                    '& .MuiOutlinedInput-notchedOutline': {
                        borderStyle: 'solid',
                        borderWidth: '1px',
                        borderColor: 'rgba(0,0,0,0.23)'
                    }
                }}>
                    {selectedEventTasks ? (
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell><strong>Action Name</strong></TableCell>
                                    <TableCell><strong>Due</strong></TableCell>
                                    <TableCell><strong>Actions</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {selectedEventTasks.map((t: any) => (
                                    <TableRow key={t.id}>
                                        <TableCell>{t.taskname || t.taskName || t.name}</TableCell>
                                        <TableCell>{formatDisplayDate(t.duedate)}</TableCell>
                                        <TableCell>
                                            <IconButton size="small" onClick={() => handleUnlink(t.id)} title="Unlink action"><DeleteIcon fontSize="small" /></IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : <div>Loading…</div>}
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                    <AppButton onClick={() => setTasksDialogOpen(false)} colorScheme="white">Close</AppButton>
                    <AppButton onClick={() => { setCreateTaskOpen(true); setNewTaskName(''); setNewTaskDue(formatDateISO(new Date())) }} startIcon={<AddIcon />} colorScheme="purple">CREATE ACTION</AppButton>
                </DialogActions>
            </WideDialog>

            <Dialog open={createTaskOpen} onClose={() => setCreateTaskOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>Create Linked Action</DialogTitle>
                <DialogContent sx={{
                    '& .MuiOutlinedInput-root': {
                        position: 'relative',
                        zIndex: (theme: any) => (theme?.zIndex?.modal ?? 1300) + 10,
                    },
                    '& .MuiOutlinedInput-notchedOutline': {
                        borderStyle: 'solid',
                        borderWidth: '1px',
                        borderColor: 'rgba(0,0,0,0.23)'
                    },
                    '& .MuiOutlinedInput-notchedOutline legend, & .MuiOutlinedInput-notchedOutline legend span': {
                        display: 'inline-block',
                        visibility: 'visible'
                    },
                }}>
                    <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
                        <TextField label="Task name" value={newTaskName} onChange={(e) => setNewTaskName(e.target.value)} />
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <DatePicker
                                    label="Due date"
                                    value={newTaskDue || null}
                                    onChange={(v) => { setNewTaskDue(v || '') }}
                                    sx={{ flex: 1, minWidth: 140, mr: 2 }}
                                    size="small"
                                />
                                <Box sx={{ display: 'flex', gap: 1, marginLeft: 'auto' }}>
                                    <AppButton size="small" colorScheme="white" onClick={() => { setNewTaskDue(calcOffsetDate({ weeks: 1 })); }}>1W</AppButton>
                                    <AppButton size="small" colorScheme="white" onClick={() => { setNewTaskDue(calcOffsetDate({ weeks: 2 })); }}>2W</AppButton>
                                    <AppButton size="small" colorScheme="white" onClick={() => { setNewTaskDue(calcOffsetDate({ months: 1 })); }}>1M</AppButton>
                                    <AppButton size="small" colorScheme="white" onClick={() => { setNewTaskDue(calcOffsetDate({ months: 3 })); }}>3M</AppButton>
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                    <AppButton onClick={() => setCreateTaskOpen(false)} colorScheme="white">Cancel</AppButton>
                    <AppButton onClick={() => handleCreateAndLink()} disabled={creatingTask || !newTaskName.trim()} colorScheme="purple">SAVE</AppButton>
                </DialogActions>
            </Dialog>
        </Box>
    )
}
