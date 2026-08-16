import React from 'react'
import Dialog from './WideDialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import AppButton from './AppButton'
import Typography from '@mui/material/Typography'

type Props = {
    open: boolean
    title?: string
    description?: string
    onConfirm: () => void
    onClose: () => void
}

export default function ConfirmDialog({ open, title = 'Confirm', description = '', onConfirm, onClose }: Props) {
    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>{title}</DialogTitle>
            <DialogContent>
                {description && <Typography>{description}</Typography>}
            </DialogContent>
            <DialogActions>
                <AppButton colorScheme="purple" onClick={() => { onConfirm(); onClose(); }}>Delete</AppButton>
            </DialogActions>
        </Dialog>
    )
}
