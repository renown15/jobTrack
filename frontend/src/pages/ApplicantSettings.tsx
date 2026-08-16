import React, { useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import AppButton from '../components/Shared/AppButton'
import TextField from '@mui/material/TextField'
import DatePicker from '../components/Shared/DatePicker'
import Avatar from '@mui/material/Avatar'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import MenuItem from '@mui/material/MenuItem'
import Menu from '@mui/material/Menu'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApplicantSettings, updateApplicantSettings, uploadApplicantAvatar } from '../api/client'
import NavigatorBriefings from './NavigatorBriefings'
import { useAuth } from '../auth/AuthProvider'
import Toast from '../components/Shared/Toast'

const SaveIcon = (props: any) => React.createElement('span', { 'aria-hidden': true }, '💾')

function logActiveHandles(label?: string) {
    try {
        // Access Node's `process._getActiveHandles` in a safe way without referencing
        // the bare identifier `process` which can throw in some browser envs.
        const proc = (typeof globalThis !== 'undefined') ? (globalThis as any).process : undefined
        if (proc && proc._getActiveHandles) {
            const names = proc._getActiveHandles().map((h: any) => (h && h.constructor && h.constructor.name) || String(h))
            // eslint-disable-next-line no-console
            console.log(`SETTINGS_DIAG: ${label || 'handles'} -`, names)
        }
        // Silent when not available in browser runtime — avoids noisy ReferenceErrors or extra logs.
    } catch (e) {
        // eslint-disable-next-line no-console
        console.log('SETTINGS_DIAG: failed to read active handles', e && (e as any).message ? (e as any).message : e)
    }
}

export default function ApplicantSettings({ globalEditing, setGlobalEditing }: { globalEditing: boolean; setGlobalEditing: (v: boolean) => void }) {
    // Diagnostics: run once per mount and only in DEV to avoid duplicate StrictMode logs
    const didInitRef = React.useRef(false)
    React.useEffect(() => {
        if (didInitRef.current) return
        didInitRef.current = true
        if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('SETTINGS_DIAG: ApplicantSettings entry')
            try {
                logActiveHandles('ApplicantSettings entry')
            } catch (e) {
                // ignore
            }
            // eslint-disable-next-line no-console
            console.log('SETTINGS_DIAG: initial applicant query state', { isLoading, data })
        }
        // run only once on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    const qc = useQueryClient()
    const { applicant, refresh } = useAuth()
    const { data = {}, isLoading } = useQuery(['settings', 'applicant'], fetchApplicantSettings)
    const [form, setForm] = useState<any>(null)

    React.useEffect(() => {
        if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('SETTINGS_DIAG: applicant query changed', { isLoading, data })
        }
        if (!isLoading) {
            if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log('SETTINGS_DIAG: setting form from data', data)
            }
            try {
                const next = { ...(data || {}) }
                const raw = next.searchStartDate ?? next.searchstartdate ?? null
                if (raw) {
                    const asDate = (() => {
                        try {
                            if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw)
                            const d = new Date(raw)
                            if (!isNaN(d.getTime())) {
                                const y = d.getFullYear()
                                const m = String(d.getMonth() + 1).padStart(2, '0')
                                const dd = String(d.getDate()).padStart(2, '0')
                                return `${y}-${m}-${dd}`
                            }
                        } catch (e) { }
                        return String(raw).slice(0, 10)
                    })()
                    next.searchStartDate = asDate
                }
                setForm(next)
            } catch (err) {
                setForm(data)
            }
        }
    }, [data, isLoading])

    // Track form updates too (DEV only)
    React.useEffect(() => {
        if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('SETTINGS_DIAG: form changed', form)
        }
    }, [form])

    const upd = useMutation(updateApplicantSettings, {
        onSuccess: async () => {
            qc.invalidateQueries(['settings', 'applicant'])
            setToastMessage('Settings updated')
            setToastSeverity('success')
            setToastOpen(true)
            try {
                await refresh()
            } catch (e) {
                // ignore refresh errors
            }
        },
        onError: (err: any) => {
            const msg = (err && err.response && err.response.data && err.response.data.error) || err?.message || 'Failed to update settings'
            setToastMessage(msg)
            setToastSeverity('error')
            setToastOpen(true)
        }
    })

    const [toastOpen, setToastOpen] = useState(false)
    const [toastMessage, setToastMessage] = useState('')
    const [toastSeverity, setToastSeverity] = useState<'success' | 'info' | 'warning' | 'error'>('success')
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)
    const [subTab, setSubTab] = useState<'details' | 'briefing'>('details')

    const [briefingMenuAnchor, setBriefingMenuAnchor] = useState<HTMLElement | null>(null)
    const openBriefingMenu = Boolean(briefingMenuAnchor)
    const openBriefingMenuHandler = (e: React.MouseEvent<HTMLElement>) => setBriefingMenuAnchor(e.currentTarget)
    const closeBriefingMenu = () => setBriefingMenuAnchor(null)

    if (isLoading || !form) return <div>Loading applicant settings…</div>
    // DEV debug block: shows raw/mapped searchStartDate for troubleshooting
    const showDebug = typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.DEV

    return (
        <Box className={`settings-container ${subTab === 'briefing' ? 'briefing-mode' : ''}`}>
            {showDebug ? (
                <Box sx={{ mb: 1, p: 1, background: '#fff8e1', border: '1px dashed #ffb300' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>DEBUG: applicant searchStartDate</Typography>
                    <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify({ raw: data?.searchstartdate ?? data?.searchStartDate ?? null, mapped: (form && form.searchStartDate) ? form.searchStartDate : null }, null, 2)}</pre>
                </Box>
            ) : null}
            <Typography variant="h6">Applicant profile</Typography>
            <Box className="row-gap-1 row-gap-1-mt2-mb2">
                <AppButton variant={subTab === 'details' ? 'contained' : 'outlined'} onClick={() => setSubTab('details')}>Details</AppButton>
                <AppButton variant={subTab === 'briefing' ? 'contained' : 'outlined'} onClick={() => setSubTab('briefing')}>Navigator Briefing</AppButton>
            </Box>
            {subTab === 'details' ? (
                <Paper className="paper-p2-mb2">
                    <Typography variant="subtitle1" className="mb-1">Applicant details</Typography>
                    <Box className="grid-2col-gap2">
                        <TextField fullWidth label="First name" value={form.firstName || ''} onChange={e => setForm((prev: any) => ({ ...prev, firstName: e.target.value }))} />
                        <TextField fullWidth label="Last name" value={form.lastName || ''} onChange={e => setForm({ ...form, lastName: e.target.value })} />
                        <TextField fullWidth label="Email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} />
                        <TextField fullWidth label="Phone" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} />
                        <TextField fullWidth label="LinkedIn" value={form.linkedin || ''} onChange={e => setForm({ ...form, linkedin: e.target.value })} />
                        <TextField fullWidth label="Website" value={form.website || ''} onChange={e => setForm({ ...form, website: e.target.value })} />
                        <Box className="flex-align-center-gap2">
                            <Avatar src={previewUrl || form.avatarUrl || ''} alt="Avatar" className="avatar-56" />
                            <Box className="flex-align-center-gap1">
                                <input
                                    id="avatar-file"
                                    type="file"
                                    accept="image/*"
                                    className="avatar-file"
                                    onChange={(e) => {
                                        const f = e.target.files && e.target.files[0]
                                        if (!f) return
                                        setSelectedFile(f)
                                        try {
                                            const url = URL.createObjectURL(f)
                                            setPreviewUrl(url)
                                        } catch (e) {
                                            setPreviewUrl(null)
                                        }
                                    }}
                                />
                                <AppButton variant="outlined" colorScheme="white" onClick={async () => {
                                    if (!selectedFile) return
                                    setUploading(true)
                                    try {
                                        const data = await uploadApplicantAvatar(selectedFile)
                                        if (data && data.avatarUrl) {
                                            setForm({ ...form, avatarUrl: data.avatarUrl })
                                            setPreviewUrl(data.avatarUrl)
                                            try { qc.invalidateQueries(['settings', 'applicant']) } catch (e) { }
                                            setToastMessage('Avatar uploaded')
                                            setToastSeverity('success')
                                            setToastOpen(true)
                                        }
                                    } catch (err: any) {
                                        const msg = err?.message || 'Avatar upload failed'
                                        setToastMessage(msg)
                                        setToastSeverity('error')
                                        setToastOpen(true)
                                    } finally {
                                        setUploading(false)
                                    }
                                }} disabled={uploading}>
                                    {uploading ? <CircularProgress size={18} /> : 'Upload'}
                                </AppButton>
                                {previewUrl && (
                                    <AppButton colorScheme="white" onClick={() => { if (selectedFile) { try { URL.revokeObjectURL(previewUrl || '') } catch (e) { } } setSelectedFile(null); setPreviewUrl(null); }}>Clear</AppButton>
                                )}
                            </Box>
                        </Box>
                        <TextField fullWidth label="Address" value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} className="grid-col-span" />
                        <TextField fullWidth label="City" value={form.city || ''} onChange={e => setForm({ ...form, city: e.target.value })} />
                        <TextField fullWidth label="Postcode" value={form.postcode || ''} onChange={e => setForm({ ...form, postcode: e.target.value })} />
                        <DatePicker
                            fullWidth
                            label="Search start date"
                            value={form.searchStartDate || null}
                            onChange={(v) => setForm({ ...form, searchStartDate: v || '' })}
                        />

                    </Box>
                    <Box className="mt-2">
                        <AppButton startIcon={<SaveIcon />} colorScheme="purple" disabled={upd.isLoading} onClick={() => upd.mutate({ applicantId: data.applicantId, firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone, linkedin: form.linkedin, address: form.address, city: form.city, postcode: form.postcode, website: form.website, avatarUrl: form.avatarUrl, searchStartDate: form.searchStartDate, searchStatusId: form.searchStatusId })}>Save</AppButton>
                    </Box>
                </Paper>
            ) : (
                <Paper className="paper-p2-mb2 paper-briefing full-width">
                    <NavigatorBriefings />
                </Paper>
            )}


            <Toast open={toastOpen} message={toastMessage} severity={toastSeverity} onClose={() => setToastOpen(false)} />
        </Box>
    )
}
