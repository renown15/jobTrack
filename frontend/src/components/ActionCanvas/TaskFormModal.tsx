import React, { useEffect, useState } from 'react'
import Dialog from '../Shared/WideDialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import DatePicker from '../Shared/DatePicker'
import Box from '@mui/material/Box'
import { createTask, updateTask } from '../../api/client'
import AppButton from '../Shared/AppButton'

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

type Props = {
    open: boolean
    onClose: () => void
    // called after create or update
    onSaved: (task: any) => void
    initialTask?: any
}

export default function TaskFormModal({ open, onClose, onSaved, initialTask }: Props) {
    const [name, setName] = useState('')
    const [duedate, setDuedate] = useState<string | null>(null)
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!open) {
            setName('')
            setDuedate(null)
            setNotes('')
        } else {
            if (initialTask) {
                setName(initialTask.name || '')
                setDuedate(initialTask.duedate || null)
                setNotes(initialTask.notes || '')
            } else {
                // When opening the modal to create a new task, default the due date to today
                setName('')
                setDuedate(formatDateISO(new Date()))
                setNotes('')
            }
        }
    }, [open, initialTask])

    async function handleSave() {
        if (!name.trim()) return
        setSaving(true)
        try {
            // Backend treats missing fields and explicit null differently when updating.
            // To clear a due date we send an empty string which the server maps to NULL.
            const payload: any = { name: name.trim(), duedate: (duedate === null ? '' : (duedate || null)), notes: notes || null }
            if (initialTask && initialTask.taskid) {
                const res = await updateTask(initialTask.taskid, payload)
                onSaved(res)
            } else {
                const res = await createTask(payload)
                onSaved(res)
            }
            onClose()
        } catch (e) {
            console.error(e)
        } finally {
            setSaving(false)
        }

    }

    // (Debug measurement code removed)

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>{initialTask ? 'Edit Action' : 'Create Action'}</DialogTitle>
            <DialogContent>
                <Box sx={{
                    display: 'flex', gap: 2, flexDirection: 'column', mt: 1,
                    // Ensure the outlined inputs in this modal render above dialog content
                    // and that the notched outline/legend are visible. This is a scoped,
                    // tactical override to avoid global theme changes while we stabilize.
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
                    '& .MuiOutlinedInput-notchedOutline legend span': { px: 0.75 }
                }}>
                    <TextField
                        id="task-name"
                        label="Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                    />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <DatePicker
                            label="Due date"
                            value={duedate ?? null}
                            onChange={(v) => setDuedate(v ?? null)}
                            sx={{ flex: 1, minWidth: 140, mr: 2 }}
                            allowNull={true}
                        />
                        <Box sx={{ display: 'flex', gap: 1, marginLeft: 'auto', alignItems: 'center' }}>
                            <AppButton size="small" colorScheme="white" onClick={() => setDuedate(calcOffsetDate({ weeks: 1 }))}>1W</AppButton>
                            <AppButton size="small" colorScheme="white" onClick={() => setDuedate(calcOffsetDate({ weeks: 2 }))}>2W</AppButton>
                            <AppButton size="small" colorScheme="white" onClick={() => setDuedate(calcOffsetDate({ months: 1 }))}>1M</AppButton>
                            <AppButton size="small" colorScheme="white" onClick={() => setDuedate(calcOffsetDate({ months: 3 }))}>3M</AppButton>
                            <AppButton size="small" colorScheme="white" onClick={() => setDuedate(null)}>No due date</AppButton>
                        </Box>
                    </Box>
                    <TextField
                        id="task-notes"
                        label="Notes"
                        multiline
                        minRows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                    />
                </Box>
            </DialogContent>
            <DialogActions>
                <AppButton onClick={onClose} colorScheme="white">Cancel</AppButton>
                <AppButton onClick={handleSave} disabled={saving || !name.trim()} colorScheme="purple">{saving ? 'Saving...' : 'Save'}</AppButton>
            </DialogActions>
        </Dialog>
    )
}


