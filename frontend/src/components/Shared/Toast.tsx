import React from 'react'
import Snackbar from '@mui/material/Snackbar'
import MuiAlert, { AlertProps } from '@mui/material/Alert'

// DEBUG: Toast module loaded
// eslint-disable-next-line no-console
console.log('MODULE: Toast loaded')

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(function Alert(props, ref) {
    return <MuiAlert elevation={6} ref={ref} variant="filled" {...props} />
})

type Props = {
    open: boolean
    message: string
    severity?: 'success' | 'info' | 'warning' | 'error'
    onClose: () => void
}

export default function Toast({ open, message, severity = 'info', onClose }: Props) {
    return (
        <Snackbar open={open} autoHideDuration={4000} onClose={onClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
            <Alert onClose={onClose} severity={severity} sx={{ width: '100%' }}>
                {message}
            </Alert>
        </Snackbar>
    )
}
