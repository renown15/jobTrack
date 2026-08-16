import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../auth/AuthProvider'
import Dialog from './Shared/WideDialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
// Note: snackbar is displayed by parent (Sidebar) after modal closes
import AppButton from './Shared/AppButton'
import TextField from '@mui/material/TextField'
import IconButton from '@mui/material/IconButton'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import AttachFileIcon from '@mui/icons-material/AttachFile'

type IssueInfo = { issue_id?: number | null; issue_number?: number | null; issue_url?: string | null }
export default function IssueReportModal({ open, onClose }: { open: boolean; onClose: (created?: boolean, info?: IssueInfo) => void }) {
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [files, setFiles] = useState<File[]>([])
    const [submitting, setSubmitting] = useState(false)
    const { applicant } = useAuth()

    // Prefill name/email from applicant profile when modal opens
    useEffect(() => {
        if (!open) return
        try {
            const a: any = applicant
            const first = a?.firstname || a?.firstName || ''
            const last = a?.lastname || a?.lastName || ''
            const full = [first, last].filter(Boolean).join(' ').trim()
            if (full) setName(full)
            const aemail = a?.email || a?.Email || ''
            if (aemail) setEmail(aemail)
        } catch (e) {
            // ignore
        }
    }, [open, applicant])

    const fileInputRef = useRef<HTMLInputElement | null>(null)

    function resetForm() {
        setTitle('')
        setDescription('')
        setFiles([])
        // reset native file input value
        try {
            if (fileInputRef.current) fileInputRef.current.value = ''
        } catch (e) { /* ignore */ }
    }
    async function handleSubmit() {
        if (!title || !description) return
        setSubmitting(true)
        try {
            const fd = new FormData()
            fd.append('title', title)
            fd.append('description', description)
            fd.append('reporter_name', name)
            fd.append('reporter_email', email)
            for (const f of files) fd.append('files', f)

            // Resolve API base: prefer Vite env `VITE_API_BASE_URL`, else
            // if app is served under `/app/` use that prefix, otherwise root.
            const viteBase = (import.meta && (import.meta as any).env && (import.meta as any).env.VITE_API_BASE_URL) || ''
            const pathname = typeof window !== 'undefined' ? window.location.pathname : ''
            const mountPrefix = pathname.startsWith('/app/') || pathname === '/app' ? '/app' : ''
            const apiBase = viteBase || mountPrefix || ''
            const apiUrl = apiBase ? `${apiBase.replace(/\/$/, '')}/api/report_issue` : '/api/report_issue'

            // Send cookies + CSRF token. Use 'include' so cookies are sent when
            // the frontend dev server is on a different origin than the API.
            const csrf = typeof window !== 'undefined' ? window.sessionStorage.getItem('JOBTRACK_CSRF') : null
            const fetchOpts: RequestInit = {
                method: 'POST',
                body: fd,
                credentials: 'include',
                headers: {},
            }
            if (csrf) {
                ; (fetchOpts.headers as any)['X-CSRF-Token'] = csrf
            }
            const res = await fetch(apiUrl, fetchOpts)
            if (!res.ok) {
                const txt = await res.text()
                throw new Error(txt || `Status ${res.status}`)
            }

            // Parse returned issue data, delegate UI to parent, then clear form
            let data: any = null
            try { data = await res.json() } catch (e) { /* ignore */ }
            const info: IssueInfo = {
                issue_url: data?.issue_url || null,
                issue_id: data?.issue_id ?? null,
                issue_number: data?.issue_number ?? null,
            }
            resetForm()
            // Inform parent the modal created an issue and pass the issue info
            try { onClose(true, info) } catch (e) { onClose(true) }
        } catch (e: any) {
            // Better error handling for authentication issues
            // eslint-disable-next-line no-console
            console.error('IssueReportModal submit error', e)
            try {
                // If the server returned a JSON error body, show it
                if (e && e.message && typeof e.message === 'string' && e.message.includes('{')) {
                    const parsed = JSON.parse(e.message)
                    if (parsed.error && parsed.error.toLowerCase().includes('not authenticated')) {
                        alert('You must sign in before reporting an issue. Please sign in and try again.')
                        return
                    }
                }
            } catch (parseErr) {
                // ignore parse errors
            }
            alert('Failed to create issue: ' + (e?.message || e))
        } finally {
            setSubmitting(false)
        }
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const list = e.target.files ? Array.from(e.target.files) : []
        setFiles(list)
    }

    return (
        <>
            <Dialog open={open} onClose={() => onClose(false)} fullWidth maxWidth="sm">
                <DialogTitle>Make JobTrack Better</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                        Submit a bug report or feature request and we'll create a GitHub issue. Do not paste secrets or tokens.
                    </Typography>
                    <TextField
                        label="Title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        fullWidth
                        margin="dense"
                        variant="outlined"
                        InputLabelProps={{ sx: { bgcolor: 'background.paper', px: 0.5, zIndex: 1 } }}
                    />
                    <TextField
                        label="Description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        fullWidth
                        margin="dense"
                        multiline
                        rows={6}
                        variant="outlined"
                        InputLabelProps={{ sx: { bgcolor: 'background.paper', px: 0.5, zIndex: 1 } }}
                    />
                    <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                        <TextField label="Your name" value={name} fullWidth margin="dense" disabled />
                        <TextField label="Your email" value={email} fullWidth margin="dense" disabled />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                        <IconButton component="label">
                            <AttachFileIcon />
                            <input ref={fileInputRef} hidden multiple type="file" onChange={handleFileChange} />
                        </IconButton>
                        <Typography variant="body2">{files.length ? files.map(f => f.name).join(', ') : 'No files attached'}</Typography>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <AppButton colorScheme="white" onClick={() => onClose(false)} disabled={submitting}>Cancel</AppButton>
                    <AppButton colorScheme="purple" onClick={handleSubmit} disabled={submitting || !title || !description}>Submit</AppButton>
                </DialogActions>
            </Dialog>
            {/* parent will show snackbar after modal closes */}
        </>
    )
}
