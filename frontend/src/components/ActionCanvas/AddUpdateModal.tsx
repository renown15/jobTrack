import React, { useEffect, useState } from 'react'
import Dialog from '../Shared/WideDialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import DatePicker from '../Shared/DatePicker'
import AppButton from '../Shared/AppButton'

type Props = {
    open: boolean
    initial?: { commentary?: string; logdate?: string | null }
    editing?: any
    onClose: () => void
    onSave: (payload: { commentary: string; logdate?: string | null }) => Promise<void> | void
}

export default function AddUpdateModal({ open, initial, editing, onClose, onSave }: Props) {
    const [commentary, setCommentary] = useState(initial?.commentary || '')
    const [logdate, setLogdate] = useState<string | undefined>(initial?.logdate ?? undefined)

    useEffect(() => {
        if (open) {
            setCommentary(initial?.commentary || '')
            setLogdate(initial?.logdate ?? undefined)
        }
    }, [open, initial])

    const handleSave = async () => {
        const payload = { commentary: commentary || '', logdate: logdate ?? null }
        // call parent handler; parent may do optimistic updates
        await onSave(payload)
        // close modal
        onClose()
    }

    return (
        <Dialog open={open} onClose={() => onClose()} fullWidth maxWidth="sm" PaperProps={{ sx: { overflow: 'visible' } }}>
            <DialogTitle>{editing ? 'Edit Update' : 'Add Update'}</DialogTitle>
            <DialogContent sx={{ overflow: 'visible' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8, overflow: 'visible' }}>
                    <TextField
                        label="Commentary"
                        multiline
                        rows={4}
                        value={commentary}
                        onChange={(e) => setCommentary(e.target.value)}
                        fullWidth
                        InputLabelProps={{ sx: { zIndex: 1500, background: 'white', px: '6px' } }}
                    />
                    <DatePicker
                        label="Date"
                        value={logdate ?? null}
                        onChange={(v) => setLogdate(v ?? undefined)}
                        sx={{ maxWidth: 220 }}
                    />
                </div>
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                <AppButton colorScheme="white" onClick={() => onClose()}>Cancel</AppButton>
                <AppButton colorScheme="purple" onClick={handleSave}>Save</AppButton>
            </DialogActions>
        </Dialog>
    )
}
