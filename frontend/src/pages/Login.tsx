import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import TextField from '@mui/material/TextField'
import AppButton from '../components/Shared/AppButton'
import Box from '@mui/material/Box'
import TitleBar from '../components/TitleBar'
import SignupModal from '../components/SignupModal'
import Stack from '@mui/material/Stack'
import Alert from '@mui/material/Alert'
import Toast from '../components/Shared/Toast'
import Divider from '@mui/material/Divider'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [signupOpen, setSignupOpen] = useState(false)
    const [toastOpen, setToastOpen] = useState(false)
    const [toastMessage, setToastMessage] = useState('')
    const [toastSeverity, setToastSeverity] = useState<'success' | 'info' | 'warning' | 'error'>('error')
    const auth = useAuth()
    const navigate = useNavigate()

    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setLoading(true)
        try {
            await auth.login(email, password)
            navigate('/')
        } catch (err: any) {
            // Extract useful information from axios / network errors so the toast is informative
            const extractMessage = (e: any) => {
                try {
                    if (!e) return 'Login failed'
                    // If server responded with JSON, prefer server-provided error fields
                    if (e.response) {
                        const status = e.response.status
                        const data = e.response.data
                        const serverMsg = (data && (data.error || data.message)) || (typeof data === 'string' ? data : '')
                        const details = data && (data.details || data.detail || data.error_description)
                        const parts: string[] = []
                        if (status) parts.push(String(status))
                        if (serverMsg) parts.push(String(serverMsg))
                        if (details) parts.push(String(details))
                        const joined = parts.join(' - ')
                        return joined || `Server responded with status ${status}`
                    }

                    // Request made but no response -> network/CORS error. Provide URL/method/code if available.
                    if (e.request) {
                        const method = e.config?.method?.toUpperCase() || 'REQUEST'
                        const url = e.config?.url || 'unknown URL'
                        const code = e.code || ''
                        // Axios commonly uses message 'Network Error' — expand that for the user
                        const base = e.message && e.message !== 'Network Error' ? e.message : `Network error contacting ${url}`
                        const extra = code ? ` (${code})` : ''
                        return `${method} ${url} — ${base}${extra}`
                    }

                    // Other error: use message or toString
                    return e.message || String(e)
                } catch (ex) {
                    return 'Login failed'
                }
            }

            const msg = extractMessage(err)
            // Truncate long messages for the toast UI
            const short = msg.length > 300 ? msg.slice(0, 300) + '…' : msg
            setError(short)
            setToastMessage(short)
            setToastSeverity('error')
            setToastOpen(true)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Box
            component="div"
            sx={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                background: 'linear-gradient(180deg, #4c1d95 0%, #7c3aed 50%, #a78bfa 100%)',
                color: 'common.white'
            }}
        >
            <TitleBar />
            <Box display="flex" justifyContent="center" alignItems="center" flexGrow={1} sx={{ px: 2 }}>
                <Box sx={{ width: '100%', maxWidth: 980 }}>
                    <Box sx={{ bgcolor: 'rgba(255,255,255,0.92)', borderRadius: 2, boxShadow: 8, p: { xs: 2, md: 3 }, minHeight: { md: 340 } }}>
                        <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' }, alignItems: 'stretch' }}>
                            <Box sx={{ flex: 2, color: 'text.primary', pr: { xs: 0, md: 2 }, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <Box>
                                    <Box component="h2" sx={{ mt: 0, fontSize: { xs: '1.35rem', md: '1.5rem' }, fontWeight: 600, mb: 1, color: '#4c1d95' }}>Welcome to JobTrack</Box>
                                    <Box sx={{ mb: 2, color: 'text.secondary' }}>An online tool to help senior professionals find their next role.</Box>
                                    <Box component="div" sx={{ fontWeight: 600, mb: 1, color: 'text.primary' }}>Use JobTrack to:</Box>
                                    <Box component="ul" sx={{ pl: 3, m: 0, mb: 2, color: 'text.secondary' }}>
                                        <li>Mine your LinkedIn network for key contacts</li>
                                        <li>Use this as the basis of a curated job search contact list, identifying the right search consultants, sectors and companies to target</li>
                                        <li>Record every message and conversation with your contact list, so you never forget what you said to whom when</li>
                                        <li>Keep track of every job application, including the documents you’ve submitted</li>
                                        <li>Draw up detailed Action Plans, including actions agreed with your career transition coach</li>
                                        <li>Note the Networking events you attending, and what you got out of them</li>
                                        <li>Review your progress when you need some inspiration using the comprehensive analytics</li>
                                    </Box>
                                </Box>

                                <Box sx={{ display: { xs: 'block', md: 'block' }, alignSelf: { xs: 'auto', md: 'end' } }}>
                                    <AppButton
                                        colorScheme="white"
                                        size="small"
                                        onClick={() => setSignupOpen(true)}
                                        sx={{ mt: { xs: 2, md: 0 }, textTransform: 'uppercase', minWidth: { md: 160 } }}
                                    >
                                        SIGN UP TO JOBTRACK
                                    </AppButton>
                                </Box>
                            </Box>

                            <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />

                            <Box component="form" onSubmit={submit} sx={{ width: { xs: '100%', md: 360 }, bgcolor: 'transparent', p: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <Stack spacing={1} sx={{ flex: '1 1 auto' }}>
                                    <Box component="h2" sx={{ mt: 0, color: '#4c1d95', mb: 0, fontSize: '1.5rem', fontWeight: 600 }}>
                                        Log in
                                    </Box>
                                    {error && <Alert severity="error">{error}</Alert>}
                                    <TextField
                                        label="Email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        fullWidth
                                        margin="normal"
                                        type="email"
                                        required
                                    />
                                    <TextField
                                        label="Password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        fullWidth
                                        margin="normal"
                                        type="password"
                                        required
                                    />
                                </Stack>

                                <Box sx={{ mt: 2, alignSelf: { xs: 'auto', md: 'end' } }}>
                                    <AppButton
                                        colorScheme="purple"
                                        type="submit"
                                        disabled={loading}
                                        sx={{ width: { xs: '100%', md: 160 }, minWidth: { md: 160 } }}
                                    >
                                        {loading ? 'Signing in...' : 'Sign in'}
                                    </AppButton>
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                </Box>
            </Box>
            <SignupModal
                open={signupOpen}
                onClose={() => setSignupOpen(false)}
                onCreate={(payload) => {
                    // TODO: call API to create user. For now we log and close.
                    // Payload contains { name, email, passwordHash }
                    console.log('Create user payload:', payload)
                    setSignupOpen(false)
                }}
            />
            <Toast open={toastOpen} message={toastMessage} severity={toastSeverity} onClose={() => setToastOpen(false)} />
            <Box component="div" sx={{ bgcolor: '#ffb74d', color: '#000', py: 1, textAlign: 'center', fontSize: '0.9rem' }}>
                JobTrack is in Beta. Use is limited to friends and family and is at the user's own risk.
            </Box>
        </Box>
    )
}
