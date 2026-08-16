import React, { useState } from 'react'
import Dialog from '../Shared/WideDialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import { resetPassword } from '../../api/client'

interface PasswordResetDialogProps {
    open: boolean
    onClose: () => void
}

export default function PasswordResetDialog({ open, onClose }: PasswordResetDialogProps) {
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleReset = () => {
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setError(null)
        setSuccess(false)
    }

    const handleClose = () => {
        handleReset()
        onClose()
    }

    const handleSubmit = async () => {
        setError(null)
        setSuccess(false)

        if (!currentPassword) {
            setError('Please enter your current password')
            return
        }

        if (!newPassword || newPassword.length < 8) {
            setError('New password must be at least 8 characters')
            return
        }

        if (newPassword !== confirmPassword) {
            setError('New passwords do not match')
            return
        }

        if (currentPassword === newPassword) {
            setError('New password must be different from current password')
            return
        }

        setLoading(true)
        try {
            await resetPassword(currentPassword, newPassword)
            setSuccess(true)
            setTimeout(() => {
                handleClose()
            }, 2000)
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || 'Failed to reset password')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogContent>
                <Box sx={{ pt: 1 }}>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    {success && (
                        <Alert severity="success" sx={{ mb: 2 }}>
                            Password reset successfully!
                        </Alert>
                    )}
                    <TextField
                        label="Current Password"
                        type="password"
                        fullWidth
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        margin="normal"
                        disabled={success}
                    />
                    <TextField
                        label="New Password"
                        type="password"
                        fullWidth
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        margin="normal"
                        helperText="Must be at least 8 characters"
                        disabled={success}
                    />
                    <TextField
                        label="Confirm New Password"
                        type="password"
                        fullWidth
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        margin="normal"
                        disabled={success}
                    />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} disabled={loading}>
                    {success ? 'Close' : 'Cancel'}
                </Button>
                {!success && (
                    <Button
                        onClick={handleSubmit}
                        variant="contained"
                        color="primary"
                        disabled={loading}
                    >
                        {loading ? 'Resetting...' : 'Reset Password'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    )
}
