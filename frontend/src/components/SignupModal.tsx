import React, { useState } from 'react'
import { signupApplicant } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import { useNavigate } from 'react-router-dom'
import Dialog from './Shared/WideDialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import AppButton from './Shared/AppButton'
import TextField from '@mui/material/TextField'
import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'

type Props = {
    open: boolean
    onClose: () => void
    onCreate?: (payload: { name: string; email: string; passwordHash: string }) => void
}
export default function SignupModal({ open, onClose, onCreate }: Props) {
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [encoded, setEncoded] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const auth = useAuth()
    const navigate = useNavigate()

    const reset = () => {
        setName('')
        setEmail('')
        setPassword('')
        setConfirm('')
        setError(null)
        setEncoded(null)
    }

    const handleClose = () => {
        reset()
        onClose()
    }

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault()
        setError(null)
        if (!name || !email || !password) {
            setError('Please complete name, email and password')
            return
        }
        if (password !== confirm) {
            setError('Passwords do not match')
            return
        }
        try {
            setSubmitting(true)
            // call server signup endpoint
            await signupApplicant({ name, email, password })
            // auto-login the new user to establish client-side state
            try {
                await auth.login(email, password)
            } catch (e) {
                // If login fails for any reason, ignore — the server should have set the session already.
            }
            // notify caller and close modal
            if (onCreate) onCreate({ name, email, passwordHash: '' })
            setName('')
            setEmail('')
            setPassword('')
            setConfirm('')
            setError(null)
            onClose()
            navigate('/')
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || String(err))
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
            <DialogTitle>I'm new to JobTrack</DialogTitle>
            <DialogContent>
                <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1, display: 'grid', gap: 2 }}>
                    {error && <Alert severity="error">{error}</Alert>}
                    <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
                    <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
                    <TextField
                        label="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        type="password"
                        required
                    />
                    <TextField
                        label="Confirm password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        type="password"
                        required
                    />
                    {encoded && (
                        <TextField
                            label="Encoded password (SHA-256 hex)"
                            value={encoded}
                            InputProps={{ readOnly: true }}
                            helperText="This is the client-side SHA-256 encoding of your password."
                        />
                    )}
                </Box>
            </DialogContent>
            <DialogActions>
                <AppButton colorScheme="white" onClick={handleClose} disabled={submitting}>Cancel</AppButton>
                <AppButton colorScheme="purple" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? 'Creating...' : "Create account"}
                </AppButton>
            </DialogActions>
        </Dialog>
    )
}
