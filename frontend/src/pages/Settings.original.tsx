import React, { useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import DatePicker from '../components/Shared/DatePicker'
import Avatar from '@mui/material/Avatar'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { ACCORDION_TITLE_SX, ACCORDION_TITLE_VARIANT } from '../constants/ui'
import './Settings.css'
import MenuItem from '@mui/material/MenuItem'
import Menu from '@mui/material/Menu'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import IconButton from '@mui/material/IconButton'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CloseIcon from '@mui/icons-material/Close'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import SaveIcon from '@mui/icons-material/Save'
import AddIcon from '@mui/icons-material/Add'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Toast from '../components/Shared/Toast'
import { api, fetchApplicantSettings, updateApplicantSettings, uploadApplicantAvatar, fetchReferenceData, fetchReferenceDataAll, createReferenceData, updateReferenceData, deleteReferenceData, fetchSectors, createSector, updateSector, deleteSector, fetchNavigatorPrompts, createNavigatorPrompt, updateNavigatorPrompt, deleteNavigatorPrompt, fetchNavigatorBriefingQuestions, createNavigatorBriefingQuestion, updateNavigatorBriefingQuestion, deleteNavigatorBriefingQuestion, fetchApplicantBriefingBatches, fetchApplicantBriefingBatch, createApplicantBriefingBatch, updateNavigatorBriefingOrder, fetchNavigatorActions, createNavigatorAction, updateNavigatorAction, deleteNavigatorAction, createNavigatorActionInput, updateNavigatorActionInput, deleteNavigatorActionInput } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import ExportToSpreadsheet from '../components/ExportData/ExportToSpreadsheet'

function ApplicantSettings({ globalEditing, setGlobalEditing }: { globalEditing: boolean; setGlobalEditing: (v: boolean) => void }) {
    const qc = useQueryClient()
    const { applicant } = useAuth()
    const { data = {}, isLoading } = useQuery(['settings', 'applicant'], fetchApplicantSettings)
    const [form, setForm] = useState<any>(null)

    React.useEffect(() => {
        if (!isLoading) {
            try {
                const next = { ...(data || {}) }
                const raw = next.searchStartDate ?? next.search_start_date ?? null
                if (raw) {
                    // Normalize to YYYY-MM-DD which is required for native date inputs
                    const asDate = (() => {
                        try {
                            // If already in YYYY-MM-DD, keep
                            if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw)
                            // Try ISO-ish or timestamp formats
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

    const upd = useMutation(updateApplicantSettings, {
        onSuccess: () => {
            qc.invalidateQueries(['settings', 'applicant'])
            setToastMessage('Settings updated')
            setToastSeverity('success')
            setToastOpen(true)
        },
        onError: (err: any) => {
            // Try to extract a useful message
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
    // Navigator briefing state
    const { data: briefingQuestions = [], isLoading: loadingBriefingQuestions } = useQuery(['navbrief:questions'], fetchNavigatorBriefingQuestions)
    const { data: briefingBatches = [] } = useQuery(['navbrief:batches'], fetchApplicantBriefingBatches)
    const [selectedBatch, setSelectedBatch] = useState<string | null>(null)
    const [answers, setAnswers] = useState<Record<number, string>>({})
    const fetchInProgressRef = React.useRef(false)
    const lastRequestedBatchRef = React.useRef<string | null>(null)

    // Menu state for the briefing-sets control (replaces prior TextField select)
    const [briefingMenuAnchor, setBriefingMenuAnchor] = useState<HTMLElement | null>(null)
    const openBriefingMenu = Boolean(briefingMenuAnchor)
    const openBriefingMenuHandler = (e: React.MouseEvent<HTMLElement>) => setBriefingMenuAnchor(e.currentTarget)
    const closeBriefingMenu = () => setBriefingMenuAnchor(null)

    // Load selected batch answers when batch changes
    React.useEffect(() => {
        let mounted = true
        if (!selectedBatch) {
            // New blank answers
            const initial: Record<number, string> = {};
            (briefingQuestions || []).forEach((q: any) => { initial[q.questionid] = '' })
            setAnswers(initial)
            return
        }
        // Prevent duplicate concurrent requests for the same batch which can happen
        // if the effect is retriggered rapidly. Use a ref-based guard so multiple
        // renders don't issue repeated network requests.
        if (fetchInProgressRef.current && lastRequestedBatchRef.current === selectedBatch) {
            return
        }
        ; (async () => {
            fetchInProgressRef.current = true
            lastRequestedBatchRef.current = selectedBatch
            try {
                const rows = await fetchApplicantBriefingBatch(selectedBatch)
                if (!mounted) return
                const map: Record<number, string> = {};
                (briefingQuestions || []).forEach((q: any) => { map[q.questionid] = '' });
                (rows || []).forEach((r: any) => { if (r && r.questionid != null) map[r.questionid] = r.questionanswer || '' })
                setAnswers(map)
            } catch (e) {
                console.error('Failed to load briefing batch', e)
            } finally {
                fetchInProgressRef.current = false
            }
        })()
        return () => { mounted = false }
    }, [selectedBatch, briefingQuestions])

    if (isLoading || !form) return <div>Loading applicant settings…</div>

    return (
        <Box className={`settings-container ${subTab === 'briefing' ? 'briefing-mode' : ''}`}>
            <Typography variant="h6">Applicant profile</Typography>
            <Box className="row-gap-1 row-gap-1-mt2-mb2">
                <Button variant={subTab === 'details' ? 'contained' : 'outlined'} onClick={() => setSubTab('details')}>Details</Button>
                <Button variant={subTab === 'briefing' ? 'contained' : 'outlined'} onClick={() => setSubTab('briefing')}>Navigator Briefing</Button>
            </Box>
            {subTab === 'details' ? (
                <Paper className="paper-p2-mb2">
                    <Typography variant="subtitle1" className="mb-1">Applicant details</Typography>
                    <Box className="grid-2col-gap2">
                        <TextField label="First name" value={form.firstName || ''} onChange={e => setForm({ ...form, firstName: e.target.value })} />
                        <TextField label="Last name" value={form.lastName || ''} onChange={e => setForm({ ...form, lastName: e.target.value })} />
                        <TextField label="Email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} />
                        <TextField label="Phone" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} />
                        <TextField label="LinkedIn" value={form.linkedin || ''} onChange={e => setForm({ ...form, linkedin: e.target.value })} />
                        <TextField label="Website" value={form.website || ''} onChange={e => setForm({ ...form, website: e.target.value })} />
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
                                <Button variant="outlined" onClick={async () => {
                                    if (!selectedFile) return
                                    setUploading(true)
                                    try {
                                        const data = await uploadApplicantAvatar(selectedFile)
                                        // server returns avatarUrl field
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
                                </Button>
                                {previewUrl && (
                                    <Button onClick={() => { if (selectedFile) { try { URL.revokeObjectURL(previewUrl || '') } catch (e) { } } setSelectedFile(null); setPreviewUrl(null); }}>Clear</Button>
                                )}
                            </Box>
                        </Box>
                        <TextField label="Address" value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} className="grid-col-span" />
                        <TextField label="City" value={form.city || ''} onChange={e => setForm({ ...form, city: e.target.value })} />
                        <TextField label="Postcode" value={form.postcode || ''} onChange={e => setForm({ ...form, postcode: e.target.value })} />
                        <DatePicker
                            label="Search start date"
                            value={form.searchStartDate || null}
                            onChange={(v) => setForm({ ...form, searchStartDate: v || '' })}
                        />
                        {/* Search status select populated from reference data 'search_status' */}
                        <Box className="flex-column">
                            <React.Suspense fallback={<div>Loading search statuses…</div>}>
                                <SearchStatusSelect form={form} setForm={setForm} />
                            </React.Suspense>
                        </Box>
                    </Box>
                    <Box className="mt-2">
                        <Button startIcon={<SaveIcon />} variant="contained" disabled={upd.isLoading} onClick={() => upd.mutate({ applicantId: data.applicantId, firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone, linkedin: form.linkedin, address: form.address, city: form.city, postcode: form.postcode, website: form.website, avatarUrl: form.avatarUrl, searchStartDate: form.searchStartDate, searchStatusId: form.searchStatusId })}>Save</Button>
                    </Box>
                </Paper>
            ) : (
                <Paper className="paper-p2-mb2 paper-briefing full-width">
                    <Box className="flex-align-center-gap1 mb-1">
                        <Box className="flex-align-center-gap1" style={{ width: '100%' }}>
                            <Button variant="outlined" size="small" onClick={openBriefingMenuHandler} className="nowrap">Select saved briefing</Button>
                            <Menu anchorEl={briefingMenuAnchor} open={openBriefingMenu} onClose={closeBriefingMenu}>
                                {(briefingBatches || []).map((b: any) => {
                                    const ts = (typeof b === 'string') ? b : (b.batchcreationtimestamp || b.batch || '')
                                    const count = (b && typeof b === 'object') ? (b.count ?? null) : null
                                    const label = ts ? new Date(ts).toLocaleString() + (count != null ? ` (${count})` : '') : '(unknown)'
                                    return <MenuItem key={ts || String(Math.random())} onClick={() => { setSelectedBatch(ts); closeBriefingMenu() }}>{label}</MenuItem>
                                })}
                            </Menu>
                            <Typography variant="body2" className="nowrap" style={{ marginLeft: 8 }}>{selectedBatch ? new Date(selectedBatch).toLocaleString() : '(new)'}</Typography>
                            <Box sx={{ flex: 1 }} />
                            <Button
                                onClick={() => { setSelectedBatch(null); const initial: Record<number, string> = {}; (briefingQuestions || []).forEach((q: any) => { initial[q.questionid] = '' }); setAnswers(initial) }}
                                disabled={((briefingBatches || []).length === 0)}
                                className="nowrap"
                            >+ NEW</Button>
                        </Box>
                    </Box>

                    <Divider className="divider-mb2" />

                    {(loadingBriefingQuestions) ? <div>Loading questions…</div> : (
                        <Box className="grid-gap2">
                            {(briefingQuestions || []).map((q: any) => (
                                <Box key={q.questionid}>
                                    <Typography sx={{ fontWeight: 700 }}>{q.questiontext}</Typography>
                                    <TextField multiline rows={4} fullWidth value={answers[q.questionid] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.questionid]: e.target.value })} />
                                </Box>
                            ))}

                            <Box className="flex-gap-1">
                                <Button startIcon={<SaveIcon />} variant="contained" onClick={async () => {
                                    try {
                                        const payload = (briefingQuestions || []).map((q: any) => ({ questionid: q.questionid, questionanswer: answers[q.questionid] || '' }))
                                        await createApplicantBriefingBatch(payload)
                                        try { qc.invalidateQueries(['navbrief:questions']); qc.invalidateQueries(['navbrief:batches']); } catch (e) { }
                                        setToastMessage('Navigator briefing saved')
                                        setToastSeverity('success')
                                        setToastOpen(true)
                                    } catch (err: any) {
                                        setToastMessage(err?.message || 'Save failed')
                                        setToastSeverity('error')
                                        setToastOpen(true)
                                    }
                                }}>Save</Button>
                            </Box>
                        </Box>
                    )}
                </Paper>
            )}


            <Toast open={toastOpen} message={toastMessage} severity={toastSeverity} onClose={() => setToastOpen(false)} />
        </Box>
    )
}

function LLMPromptsManager({ globalEditing, setGlobalEditing }: { globalEditing: boolean; setGlobalEditing: (v: boolean) => void }) {
    const qc = useQueryClient()
    const { data = [], isLoading } = useQuery(['navprompts'], fetchNavigatorPrompts)
    const [newName, setNewName] = useState('')
    const [newValue, setNewValue] = useState('')
    const [editingPrompt, setEditingPrompt] = useState<{ promptid?: number; promptname?: string; promptvalue?: string } | null>(null)

    const createMut = useMutation((p: any) => createNavigatorPrompt(p), { onSuccess: () => qc.invalidateQueries(['navprompts']) })
    const updateMut = useMutation((p: any) => updateNavigatorPrompt(p.promptid, { promptname: p.promptname, promptvalue: p.promptvalue }), { onSuccess: () => qc.invalidateQueries(['navprompts']) })
    const deleteMut = useMutation((id: number) => deleteNavigatorPrompt(id), { onSuccess: () => qc.invalidateQueries(['navprompts']) })

    if (isLoading) return <div>Loading prompts…</div>

    return (
        <Box>
            <Box className="grid-1fr-120px-auto">
                <TextField label="Prompt name" value={newName} onChange={e => setNewName(e.target.value)} className="grid-col-1" fullWidth />
                <Button startIcon={<AddIcon />} onClick={() => { if (!newName || !newValue) return; createMut.mutate({ promptname: newName, promptvalue: newValue }); setNewName(''); setNewValue('') }} className="grid-col-2 height-40">Prompt</Button>
                <TextField label="Prompt value" value={newValue} onChange={e => setNewValue(e.target.value)} className="grid-col-span multiline-auto" multiline minRows={3} maxRows={8} fullWidth />
            </Box>

            <Divider />
            <List>
                {(data || []).map((p: any) => (
                    <ListItem key={p.promptid} className="pr-10">
                        {editingPrompt && editingPrompt.promptid === p.promptid ? (
                            <Box className="flex-align-center-gap1 full-width">
                                <TextField value={editingPrompt.promptname} onChange={e => setEditingPrompt({ ...editingPrompt, promptname: e.target.value })} className="flex-1" />
                                <TextField value={editingPrompt.promptvalue} onChange={e => setEditingPrompt({ ...editingPrompt, promptvalue: e.target.value })} className="flex-2 multiline-auto" multiline minRows={3} maxRows={12} />
                                <IconButton edge="end" aria-label="save" onClick={() => { updateMut.mutate(editingPrompt); setEditingPrompt(null); setGlobalEditing(false) }}><SaveIcon /></IconButton>
                                <IconButton edge="end" aria-label="cancel" onClick={() => { setEditingPrompt(null); setGlobalEditing(false) }}><CloseIcon /></IconButton>
                            </Box>
                        ) : (
                            <>
                                <ListItemText primary={p.promptname} secondary={p.promptvalue} secondaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }} />
                                <Box className="flex-align-center-gap1">
                                    <IconButton edge="end" aria-label="edit" onClick={() => { setEditingPrompt({ promptid: p.promptid, promptname: p.promptname, promptvalue: p.promptvalue }); setGlobalEditing(true) }} disabled={globalEditing}><EditIcon /></IconButton>
                                    <IconButton edge="end" aria-label="delete" onClick={() => deleteMut.mutate(p.promptid)} disabled={globalEditing}><DeleteIcon /></IconButton>
                                </Box>
                            </>
                        )}
                    </ListItem>
                ))}
            </List>
            {/* inline editing handled per-list item */}
        </Box>
    )
}

function ReferenceDataSettings({ globalEditing, setGlobalEditing }: { globalEditing: boolean; setGlobalEditing: (v: boolean) => void }) {
    const qc = useQueryClient()
    const [selectedClass, setSelectedClass] = useState<string>('application_status')
    const [newValue, setNewValue] = useState('')
    const [editing, setEditing] = useState<{ refid?: number; refvalue?: string } | null>(null)
    const [newSector, setNewSector] = useState<{ summary: string; description?: string }>({ summary: '', description: '' })
    const [editingSector, setEditingSector] = useState<any | null>(null)

    const { data = [] } = useQuery(['refdata', selectedClass], () => fetchReferenceData(selectedClass))
    // Load full payload so we can derive available reference-data classes dynamically
    const { data: refAll = { referencedata: [], sectors: [] } } = useQuery(['refdata', 'all'], fetchReferenceDataAll)
    const sectorsQ = useQuery(['sectors'], () => fetchSectors())

    const createMut = useMutation((payload: any) => createReferenceData(payload.refdataclass, payload.refvalue), { onSuccess: () => qc.invalidateQueries(['refdata', selectedClass]) })
    const updateMut = useMutation((payload: any) => updateReferenceData(payload.refid, payload.refdataclass, payload.refvalue), { onSuccess: () => qc.invalidateQueries(['refdata', selectedClass]) })
    const deleteMut = useMutation((refid: number) => deleteReferenceData(refid), { onSuccess: () => qc.invalidateQueries(['refdata', selectedClass]) })

    const createSectorMut = useMutation((payload: any) => createSector(payload), { onSuccess: () => qc.invalidateQueries(['sectors']) })
    const updateSectorMut = useMutation((payload: any) => updateSector(payload.sectorid, payload), { onSuccess: () => qc.invalidateQueries(['sectors']) })
    const deleteSectorMut = useMutation((sectorid: number) => deleteSector(sectorid), { onSuccess: () => qc.invalidateQueries(['sectors']) })

    const classes = React.useMemo(() => {
        const items: string[] = (refAll?.referencedata || []).map((r: any) => String(r.refdataclass || '').trim()).filter(Boolean)
        const uniq = Array.from(new Set(items))
        // Preferred ordering for well-known classes
        const defaults = ['application_status', 'source_channel', 'engagement_type', 'contact_role_type']
        const ordered = [
            ...defaults.filter(d => uniq.includes(d)),
            ...uniq.filter(u => !defaults.includes(u)).sort(),
        ]
        // Ensure sectors (special case) is available as a tab
        if (!ordered.includes('sectors')) ordered.push('sectors')
        // Add LLM prompts as a special management tab
        if (!ordered.includes('llmprompts')) ordered.push('llmprompts')
        // Navigator briefing questions management
        if (!ordered.includes('navbriefquestions')) ordered.push('navbriefquestions')
        // Navigator actions management (custom table)
        if (!ordered.includes('navigator_actions')) ordered.push('navigator_actions')
        return ordered
    }, [refAll])

    const [navSelected, setNavSelected] = useState<'navprompts' | 'navbriefquestions' | 'navigator_actions'>('navprompts')

    const humanLabel = (c: string) => {
        switch (c) {
            case 'application_status':
                return 'Application status'
            case 'source_channel':
                return 'Source channels'
            case 'engagement_type':
                return 'Engagement types'
            case 'contact_role_type':
                return 'Contact roles'
            case 'sectors':
                return 'Sectors'
            case 'llmprompts':
                return 'LLM prompts'
            case 'navbriefquestions':
                return 'Navigator briefing questions'
            case 'navigator_actions':
                return 'Navigator actions'
            default:
                return c.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
        }
    }

    return (
        <Box>
            {/* Title intentionally removed — top tab now reads 'JobTrack Configuration' */}

            <Accordion defaultExpanded className="mb-2">
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant={ACCORDION_TITLE_VARIANT} sx={ACCORDION_TITLE_SX}>Reference Data Types</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Box className="flex-gap-1 mt-1 mb-2 flex-wrap">
                        {classes.filter(c => c !== 'sectors' && c !== 'llmprompts' && c !== 'navbriefquestions' && c !== 'navigator_actions').map(c => (
                            <Button key={c} variant={selectedClass === c ? 'contained' : 'outlined'} onClick={() => setSelectedClass(c)}>{humanLabel(c)}</Button>
                        ))}
                    </Box>

                    {/* Selected class content (non-sectors, non-navigator items) */}
                    {(selectedClass && selectedClass !== 'sectors' && selectedClass !== 'llmprompts' && selectedClass !== 'navbriefquestions' && selectedClass !== 'navigator_actions') && (
                        <Box>
                            <Box className="flex-align-center-gap1 mb-2">
                                <TextField label="New value" value={newValue} onChange={e => setNewValue(e.target.value)} />
                                <Button startIcon={<AddIcon />} onClick={() => { if (!newValue) return; createMut.mutate({ refdataclass: selectedClass, refvalue: newValue }); setNewValue('') }}>Add</Button>
                            </Box>

                            <Divider className="divider-mb2" />
                            <List>
                                {(data || []).map((r: any) => (
                                    <ListItem key={r.refid} className="pr-10">
                                        {editing && editing.refid === r.refid ? (
                                            <TextField
                                                value={editing.refvalue}
                                                onChange={(e) => setEditing({ ...editing, refvalue: e.target.value })}
                                                fullWidth
                                                multiline
                                                minRows={3}
                                                maxRows={8}
                                                className="multiline-auto"
                                            />
                                        ) : (
                                            <ListItemText primary={r.refvalue} secondary={r.refdataclass} secondaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }} />
                                        )}
                                        <Box className="flex-align-center-gap1">
                                            {editing && editing.refid === r.refid ? (
                                                <>
                                                    <IconButton edge="end" aria-label="save" onClick={() => { updateMut.mutate({ refid: editing.refid, refdataclass: selectedClass, refvalue: editing.refvalue }); setEditing(null); setGlobalEditing(false) }}><SaveIcon /></IconButton>
                                                    <IconButton edge="end" aria-label="cancel" onClick={() => { setEditing(null); setGlobalEditing(false) }}><CloseIcon /></IconButton>
                                                </>
                                            ) : (
                                                <>
                                                    <IconButton edge="end" aria-label="edit" onClick={() => { setEditing({ refid: r.refid, refvalue: r.refvalue }); setGlobalEditing(true) }} disabled={globalEditing}><EditIcon /></IconButton>
                                                    <IconButton edge="end" aria-label="delete" onClick={() => deleteMut.mutate(r.refid)} disabled={globalEditing}><DeleteIcon /></IconButton>
                                                </>
                                            )}
                                        </Box>
                                    </ListItem>
                                ))}
                            </List>
                        </Box>
                    )}
                </AccordionDetails>
            </Accordion>

            <Accordion className="mb-2">
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant={ACCORDION_TITLE_VARIANT} sx={ACCORDION_TITLE_SX}>Navigator</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Box className="flex-gap-1 mb-2 flex-wrap">
                        <Button variant={navSelected === 'navprompts' ? 'contained' : 'outlined'} onClick={() => setNavSelected('navprompts')}>Navigator prompts</Button>
                        <Button variant={navSelected === 'navbriefquestions' ? 'contained' : 'outlined'} onClick={() => setNavSelected('navbriefquestions')}>Navigator briefing questions</Button>
                        <Button variant={navSelected === 'navigator_actions' ? 'contained' : 'outlined'} onClick={() => setNavSelected('navigator_actions')}>Navigator actions</Button>
                    </Box>

                    <Box>
                        {navSelected === 'navprompts' && <LLMPromptsManager globalEditing={globalEditing} setGlobalEditing={setGlobalEditing} />}
                        {navSelected === 'navbriefquestions' && <NavigatorBriefingQuestionsManager globalEditing={globalEditing} setGlobalEditing={setGlobalEditing} />}
                        {navSelected === 'navigator_actions' && <NavigatorActionsManager globalEditing={globalEditing} setGlobalEditing={setGlobalEditing} />}
                    </Box>
                </AccordionDetails>
            </Accordion>

            <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant={ACCORDION_TITLE_VARIANT} sx={ACCORDION_TITLE_SX}>Other</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    {/* Sectors management */}
                    <Box className="mb-2">
                        <Typography className="fontWeight-700 mb-1">Sectors</Typography>
                        <Box className="sectors-grid">
                            <TextField label="Sector Name" value={newSector.summary} onChange={e => setNewSector({ ...newSector, summary: e.target.value })} />
                            <Button startIcon={<AddIcon />} onClick={() => { if (!newSector.summary) return; createSectorMut.mutate(newSector); setNewSector({ summary: '', description: '' }) }}>
                                Add Sector
                            </Button>
                            <TextField label="Description" value={newSector.description} onChange={e => setNewSector({ ...newSector, description: e.target.value })} className="description-span multiline-auto" multiline minRows={3} maxRows={6} />
                        </Box>

                        <Divider />
                        <List>
                            {(sectorsQ.data || []).map((s: any) => (
                                <ListItem key={s.sectorid} className="pr-10">
                                    <ListItemText primary={s.summary} secondary={s.description} secondaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }} />
                                    <Box className="flex-align-center-gap1">
                                        <IconButton edge="end" aria-label="edit" onClick={() => setEditingSector(s)}><EditIcon /></IconButton>
                                        <IconButton edge="end" aria-label="delete" onClick={() => deleteSectorMut.mutate(s.sectorid)}><DeleteIcon /></IconButton>
                                    </Box>
                                </ListItem>
                            ))}
                        </List>

                        {editingSector && (
                            <Box className="mt-2 grid-gap1">
                                <TextField label="Summary" value={editingSector.summary || ''} onChange={e => setEditingSector({ ...editingSector, summary: e.target.value })} />
                                <TextField label="Description" value={editingSector.description || ''} onChange={e => setEditingSector({ ...editingSector, description: e.target.value })} multiline minRows={3} maxRows={6} className="multiline-auto" />
                                <Box>
                                    <Button variant="contained" onClick={() => { updateSectorMut.mutate(editingSector); setEditingSector(null) }}>Save</Button>
                                    <Button onClick={() => setEditingSector(null)}>Cancel</Button>
                                </Box>
                            </Box>
                        )}
                    </Box>
                    {/* Note: remaining classes can be managed from the Reference Data Types accordion above */}
                </AccordionDetails>
            </Accordion>
        </Box>
    )
}

function NavigatorActionsManager({ globalEditing, setGlobalEditing }: { globalEditing: boolean; setGlobalEditing: (v: boolean) => void }) {
    const qc = useQueryClient()
    const { data = [], isLoading } = useQuery(['nav:actions'], fetchNavigatorActions)
    const inputTypesQ = useQuery(['refdata', 'NAVIGATOR_INPUT_TYPE'], () => fetchReferenceData('NAVIGATOR_INPUT_TYPE'))
    // NAVIGATOR_ACTION_TYPE is not used at action edit level; action types are managed via inputs
    const [newName, setNewName] = useState('')
    const [newSort, setNewSort] = useState<number | undefined>(undefined)
    const [editing, setEditing] = useState<any | null>(null)
    const [editingInput, setEditingInput] = useState<any | null>(null)
    const [newInputs, setNewInputs] = useState<Record<number, { inputtypeid?: number; inputvalue?: string; sortorderid?: number }>>({})

    const createMut = useMutation((p: any) => createNavigatorAction(p), { onSuccess: () => qc.invalidateQueries(['nav:actions']) })
    const updateMut = useMutation((p: any) => updateNavigatorAction(p.actionid, p), { onSuccess: () => qc.invalidateQueries(['nav:actions']) })
    const deleteMut = useMutation((id: number) => deleteNavigatorAction(id), { onSuccess: () => qc.invalidateQueries(['nav:actions']) })
    const createInputMut = useMutation((payload: any) => createNavigatorActionInput(payload.actionid, { inputtypeid: payload.inputtypeid, inputvalue: payload.inputvalue, sortorderid: payload.sortorderid }), { onSuccess: () => qc.invalidateQueries(['nav:actions']) })
    const deleteInputMut = useMutation((id: number) => deleteNavigatorActionInput(id), { onSuccess: () => qc.invalidateQueries(['nav:actions']) })
    const updateInputMut = useMutation((p: any) => updateNavigatorActionInput(p.inputid, { inputtypeid: p.inputtypeid, inputvalue: p.inputvalue, sortorderid: p.sortorderid }), { onSuccess: () => qc.invalidateQueries(['nav:actions']) })

    if (isLoading) return <div>Loading navigator actions…</div>

    return (
        <Box>
            <Box className="grid-1fr-120px-auto">
                <TextField label="Action name" value={newName} onChange={e => setNewName(e.target.value)} />
                <TextField label="Sort" value={newSort ?? ''} onChange={e => setNewSort(e.target.value ? Number(e.target.value) : undefined)} />
                <Button startIcon={<AddIcon />} disabled={globalEditing} onClick={async () => {
                    if (!newName) return
                    try {
                        await createMut.mutateAsync({ actionname: newName, sortorderid: newSort ?? 0 })
                        setNewName('')
                        setNewSort(undefined)
                    } catch (e) {
                        // let react-query handle errors via onError if configured
                    }
                }}>Add</Button>
            </Box>

            <Divider />
            <List>
                {(data || []).map((a: any) => (
                    <ListItem key={a.actionid} className="pr-10">
                        {editing && editing.actionid === a.actionid ? (
                            <Box className="flex-align-center-gap1 full-width">
                                <TextField value={editing.actionname} onChange={e => setEditing({ ...editing, actionname: e.target.value })} className="flex-1" />
                                <TextField value={editing.sortorderid ?? ''} onChange={e => setEditing({ ...editing, sortorderid: e.target.value ? Number(e.target.value) : undefined })} className="width-80" />
                            </Box>
                        ) : (
                            <ListItemText primary={a.actionname} secondary={`${a.sortorderid != null ? `Sort: ${a.sortorderid}` : ''}${a.actiontype && a.actiontype.refvalue ? ` • ${a.actiontype.refvalue}` : ''}`} secondaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }} />
                        )}
                        <Box className="flex-align-center-gap1">
                            {editing && editing.actionid === a.actionid ? (
                                <>
                                    <IconButton edge="end" aria-label="save" onClick={async () => {
                                        try {
                                            await updateMut.mutateAsync(editing)
                                        } catch (e) {
                                            // errors handled by react-query
                                        } finally {
                                            setEditing(null)
                                            setGlobalEditing(false)
                                        }
                                    }}><SaveIcon /></IconButton>
                                    <IconButton edge="end" aria-label="cancel" onClick={() => { setEditing(null); setGlobalEditing(false) }}><CloseIcon /></IconButton>
                                </>
                            ) : (
                                <>
                                    <IconButton edge="end" aria-label="edit" onClick={() => { setEditing({ actionid: a.actionid, actionname: a.actionname, sortorderid: a.sortorderid }); setGlobalEditing(true) }} disabled={globalEditing && !(editing && editing.actionid === a.actionid)}><EditIcon /></IconButton>
                                    <IconButton edge="end" aria-label="delete" onClick={() => deleteMut.mutate(a.actionid)} disabled={globalEditing}><DeleteIcon /></IconButton>
                                </>
                            )}
                        </Box>
                        {/* inputs */}
                    </ListItem>
                ))}
            </List>

            {editing && (
                <Box className="mt-2 grid-gap1">
                    <TextField label="Action name" value={editing.actionname || ''} onChange={e => setEditing({ ...editing, actionname: e.target.value })} />
                    <TextField label="Sort" value={editing.sortorderid ?? ''} onChange={e => setEditing({ ...editing, sortorderid: e.target.value ? Number(e.target.value) : undefined })} />
                    <Box>
                        <Button variant="contained" onClick={async () => {
                            try {
                                await updateMut.mutateAsync(editing)
                            } catch (e) {
                                // handled by react-query
                            } finally {
                                setEditing(null)
                                setGlobalEditing(false)
                            }
                        }}>Save</Button>
                        <Button onClick={() => { setEditing(null); setGlobalEditing(false) }}>Cancel</Button>
                    </Box>
                </Box>
            )}

            {/* Per-action inputs shown inline below each action */}
            {(data || []).map((a: any) => (
                <Paper key={a.actionid} className="paper-p1-mt1">
                    <Typography className="nav-action-title">{a.actionname}</Typography>
                    <Box className="mb-1">
                        <Box className="flex-gap-1-align-start">
                            <TextField
                                select
                                size="small"
                                label="Type"
                                value={(newInputs[a.actionid] && newInputs[a.actionid].inputtypeid) || ''}
                                onChange={(e) => setNewInputs({ ...newInputs, [a.actionid]: { ...(newInputs[a.actionid] || {}), inputtypeid: e.target.value ? Number(e.target.value) : undefined } })}
                                className="type-select fixed-height-56"
                                SelectProps={{ MenuProps: { PaperProps: { style: { minWidth: 240 } } } }}
                            >
                                {(inputTypesQ.data || []).map((t: any) => {
                                    const id = (t && (t.refid ?? t.id ?? t.value)) || ''
                                    const v = id !== '' ? Number(id) : ''
                                    const label = (t && (t.refvalue ?? t.label ?? t.name)) || String(id)
                                    return <MenuItem key={String(id)} value={v}>{label}</MenuItem>
                                })}
                            </TextField>
                            {
                                // Provide a contextual placeholder/help when the selected input type
                                // is the DB_QUERY type so admins know to supply a stored query id
                                (() => {
                                    const selectedType = (newInputs[a.actionid] && newInputs[a.actionid].inputtypeid) || ''
                                    const typeObj = (inputTypesQ.data || []).find((t: any) => (t.refid ?? t.id ?? t.value) === selectedType)
                                    const isDbQuery = typeObj && String(typeObj.refvalue || '').toUpperCase() === 'DB_QUERY'
                                    return (
                                        <TextField
                                            size="small"
                                            label="Value"
                                            placeholder={isDbQuery ? 'Enter stored navigatorinput id (numeric) for DB_QUERY' : undefined}
                                            helperText={isDbQuery ? 'DB_QUERY inputs must reference a navigatorinput id (DB_QUERY) rather than raw SQL' : ''}
                                            value={(newInputs[a.actionid] && newInputs[a.actionid].inputvalue) || ''}
                                            onChange={(e) => setNewInputs({ ...newInputs, [a.actionid]: { ...(newInputs[a.actionid] || {}), inputvalue: e.target.value } })}
                                            className="value-flex multiline-auto"
                                            multiline
                                            minRows={2}
                                            maxRows={6}
                                        />
                                    )
                                })()
                            }
                            <TextField size="small" label="Sort" value={(newInputs[a.actionid] && newInputs[a.actionid].sortorderid) ?? ''} onChange={(e) => setNewInputs({ ...newInputs, [a.actionid]: { ...(newInputs[a.actionid] || {}), sortorderid: e.target.value ? Number(e.target.value) : undefined } })} className="sort-width fixed-height-56" />
                            <Button startIcon={<AddIcon />} size="small" className="add-button-center" disabled={globalEditing} onClick={() => { const p = newInputs[a.actionid] || {}; if (!p.inputtypeid || !p.inputvalue) return; createInputMut.mutate({ actionid: a.actionid, inputtypeid: p.inputtypeid, inputvalue: p.inputvalue, sortorderid: p.sortorderid ?? 0 }); setNewInputs({ ...newInputs, [a.actionid]: { inputtypeid: undefined, inputvalue: '', sortorderid: undefined } }) }}>Add</Button>
                        </Box>
                    </Box>
                    <List>
                        {(a.inputs || []).map((inp: any) => (
                            <ListItem key={inp.navigatoractioninputid}>
                                {editingInput && editingInput.inputid === inp.navigatoractioninputid ? (
                                    <Box className="flex-gap-1-align-start full-width">
                                        <TextField
                                            select
                                            size="small"
                                            label="Type"
                                            value={editingInput.inputtypeid ?? ''}
                                            onChange={(e) => setEditingInput({ ...editingInput, inputtypeid: e.target.value ? Number(e.target.value) : undefined })}
                                            className="type-select-160 fixed-height-56"
                                            SelectProps={{ MenuProps: { PaperProps: { style: { minWidth: 240 } } } }}
                                        >
                                            {(inputTypesQ.data || []).map((t: any) => {
                                                const id = (t && (t.refid ?? t.id ?? t.value)) || ''
                                                const v = id !== '' ? Number(id) : ''
                                                const label = (t && (t.refvalue ?? t.label ?? t.name)) || String(id)
                                                return <MenuItem key={String(id)} value={v}>{label}</MenuItem>
                                            })}
                                        </TextField>
                                        {
                                            (() => {
                                                const typeObj = (inputTypesQ.data || []).find((t: any) => (t.refid ?? t.id ?? t.value) === editingInput.inputtypeid)
                                                const isDbQuery = typeObj && String(typeObj.refvalue || '').toUpperCase() === 'DB_QUERY'
                                                return (
                                                    <TextField
                                                        size="small"
                                                        label="Value"
                                                        placeholder={isDbQuery ? 'Enter stored navigatorinput id (numeric) for DB_QUERY' : undefined}
                                                        helperText={isDbQuery ? 'DB_QUERY inputs must reference a navigatorinput id (DB_QUERY) rather than raw SQL' : ''}
                                                        value={editingInput.inputvalue ?? ''}
                                                        onChange={(e) => setEditingInput({ ...editingInput, inputvalue: e.target.value })}
                                                        className="flex-1 multiline-auto"
                                                        multiline
                                                        minRows={2}
                                                        maxRows={8}
                                                    />
                                                )
                                            })()
                                        }
                                        <TextField size="small" label="Sort" value={editingInput.sortorderid ?? ''} onChange={(e) => setEditingInput({ ...editingInput, sortorderid: e.target.value ? Number(e.target.value) : undefined })} className="width-90 fixed-height-56" />
                                        <IconButton onClick={() => { updateInputMut.mutate({ inputid: editingInput.inputid, inputtypeid: editingInput.inputtypeid, inputvalue: editingInput.inputvalue, sortorderid: editingInput.sortorderid }); setEditingInput(null); setGlobalEditing(false) }}><SaveIcon /></IconButton>
                                        <IconButton onClick={() => { setEditingInput(null); setGlobalEditing(false) }}><CloseIcon /></IconButton>
                                    </Box>
                                ) : (
                                    <>
                                        <ListItemText
                                            primary={`${(inputTypesQ.data || []).find((t: any) => (t.refid ?? t.id ?? t.value) === inp.inputtypeid)?.refvalue || inp.inputtypeid || ''}: ${inp.inputvalue || ''}`}
                                            secondary={
                                                inp.sortorderid != null ? (
                                                    <Typography variant="caption" color="text.secondary" className="input-sort-caption">{`Sort: ${inp.sortorderid}`}</Typography>
                                                ) : null
                                            }
                                        />
                                        <Box className="flex-align-center-gap1">
                                            <IconButton onClick={() => { setEditingInput({ inputid: inp.navigatoractioninputid, inputtypeid: inp.inputtypeid, inputvalue: inp.inputvalue, sortorderid: inp.sortorderid }); setGlobalEditing(true) }} disabled={globalEditing && !(editingInput && editingInput.inputid === inp.navigatoractioninputid)}><EditIcon /></IconButton>
                                            <IconButton onClick={() => deleteInputMut.mutate(inp.navigatoractioninputid)} disabled={globalEditing}><DeleteIcon /></IconButton>
                                        </Box>
                                    </>
                                )}
                            </ListItem>
                        ))}
                    </List>
                </Paper>
            ))}
        </Box>
    )
}

function NavigatorBriefingQuestionsManager({ globalEditing, setGlobalEditing }: { globalEditing: boolean; setGlobalEditing: (v: boolean) => void }) {
    const qc = useQueryClient()
    const { data = [], isLoading } = useQuery(['navbrief:questions'], fetchNavigatorBriefingQuestions)
    const [editing, setEditing] = useState<any | null>(null)
    const [newText, setNewText] = useState('')
    // Local mutable list for client-side reordering before persisting
    const [localList, setLocalList] = useState<Array<any>>([])
    const [orderDirty, setOrderDirty] = useState(false)

    React.useEffect(() => {
        // Map incoming server data into a stable local list sorted by order
        const list = (data || []).slice().map((q: any) => ({
            // Normalize backend fields: some responses use `questionorderindex`, others `displayorder`
            questionid: q.questionid,
            questiontext: q.questiontext,
            questionorderindex: q.questionorderindex != null ? q.questionorderindex : (q.displayorder != null ? q.displayorder : 0),
        })).sort((a: any, b: any) => {
            const ia = (a.questionorderindex != null ? a.questionorderindex : 0)
            const ib = (b.questionorderindex != null ? b.questionorderindex : 0)
            if (ia !== ib) return ia - ib
            return (a.questionid || 0) - (b.questionid || 0)
        }).map((q: any, idx: number) => ({ ...q, _idx: idx }))
        setLocalList(list)
        setOrderDirty(false)
    }, [data])

    const createMut = useMutation((p: any) => createNavigatorBriefingQuestion(p), { onSuccess: () => qc.invalidateQueries(['navbrief:questions']) })
    const updateMut = useMutation((p: any) => updateNavigatorBriefingQuestion(p.questionid, { questionorderindex: p.questionorderindex, questiontext: p.questiontext }), { onSuccess: () => qc.invalidateQueries(['navbrief:questions']) })
    const deleteMut = useMutation((id: number) => deleteNavigatorBriefingQuestion(id), { onSuccess: () => qc.invalidateQueries(['navbrief:questions']) })

    if (isLoading) return <div>Loading navigator briefing questions…</div>

    return (
        <Box>
            <Box className="grid-1fr-auto">
                <TextField label="Question text" value={newText} onChange={e => setNewText(e.target.value)} fullWidth />
                <Button startIcon={<AddIcon />} onClick={() => { if (!newText) return; createMut.mutate({ questiontext: newText }); setNewText('') }}>Add</Button>
            </Box>

            <Divider />
            <List>
                {(localList || []).map((q: any, i: number) => (
                    <ListItem key={q.questionid} className="pr-10">
                        {editing && editing.questionid === q.questionid ? (
                            <Box className="flex-align-center-gap1 full-width">
                                <TextField value={editing.questionorderindex ?? 0} onChange={e => setEditing({ ...editing, questionorderindex: Number(e.target.value) })} className="width-100" />
                                <TextField value={editing.questiontext || ''} onChange={e => setEditing({ ...editing, questiontext: e.target.value })} multiline rows={2} className="flex-1" />
                                <IconButton edge="end" aria-label="save" onClick={() => { updateMut.mutate(editing); setEditing(null); setGlobalEditing(false) }}><SaveIcon /></IconButton>
                                <IconButton edge="end" aria-label="cancel" onClick={() => { setEditing(null); setGlobalEditing(false) }}><CloseIcon /></IconButton>
                            </Box>
                        ) : (
                            <>
                                <ListItemText primary={q.questiontext} secondary={`Order: ${q.questionorderindex ?? ''}`} secondaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }} />
                                <Box className="flex-align-center-gap1">
                                    <IconButton edge="end" aria-label="up" disabled={i === 0 || globalEditing} onClick={() => {
                                        const copy = localList.slice()
                                        const tmp = copy[i - 1]
                                        copy[i - 1] = copy[i]
                                        copy[i] = tmp
                                        // Renumber order indexes to be 1-based sequential
                                        const renum = copy.map((it, idx) => ({ ...it, questionorderindex: idx + 1 }))
                                        setLocalList(renum)
                                        setOrderDirty(true)
                                    }}><ArrowUpwardIcon /></IconButton>
                                    <IconButton edge="end" aria-label="down" disabled={i === (localList.length - 1) || globalEditing} onClick={() => {
                                        const copy = localList.slice()
                                        const tmp = copy[i + 1]
                                        copy[i + 1] = copy[i]
                                        copy[i] = tmp
                                        const renum = copy.map((it, idx) => ({ ...it, questionorderindex: idx + 1 }))
                                        setLocalList(renum)
                                        setOrderDirty(true)
                                    }}><ArrowDownwardIcon /></IconButton>
                                    <IconButton edge="end" aria-label="edit" onClick={() => { setEditing({ questionid: q.questionid, questionorderindex: q.questionorderindex, questiontext: q.questiontext }); setGlobalEditing(true) }} disabled={globalEditing && !(editing && editing.questionid === q.questionid)}><EditIcon /></IconButton>
                                    <IconButton edge="end" aria-label="delete" onClick={() => deleteMut.mutate(q.questionid)} disabled={globalEditing}><DeleteIcon /></IconButton>
                                </Box>
                            </>
                        )}
                    </ListItem>
                ))}
            </List>

            {localList.length > 0 && (
                <Box className="row-gap-1 mt-2">
                    <Button variant="outlined" disabled={!orderDirty} onClick={async () => {
                        try {
                            // Build payload and call API
                            const payload = localList.map((it: any) => ({ questionid: it.questionid, questionorderindex: Number(it.questionorderindex || 0) }))
                            await updateNavigatorBriefingOrder(payload)
                            try { qc.invalidateQueries(['navbrief:questions']) } catch (e) { }
                            setOrderDirty(false)
                        } catch (e: any) {
                            console.error('Save order failed', e)
                            setOrderDirty(true)
                        }
                    }}>Save order</Button>
                </Box>
            )}

            {/* inline editing per list item; save/cancel actions appear inline */}
        </Box>
    )
}

export default function Settings() {
    const [globalEditing, setGlobalEditing] = useState(false)
    const [tab, setTab] = useState<'applicant' | 'refdata'>('applicant')
    const { data: applicantSettings = {}, isLoading: loadingApplicantSettings } = useQuery(['settings', 'applicant'], fetchApplicantSettings)

    return (
        <Box>
            <h2 className="settings-header">Settings</h2>

            <Box className="row-gap-1 mb-3">
                <Button variant={tab === 'applicant' ? 'contained' : 'outlined'} onClick={() => setTab('applicant')}>Applicant</Button>
                {applicantSettings?.isSuperuser === true && (
                    <Button variant={tab === 'refdata' ? 'contained' : 'outlined'} onClick={() => setTab('refdata')}>JobTrack Configuration</Button>
                )}
            </Box>

            <Box className="mb-3">

            </Box>

            {tab === 'applicant' ? <ApplicantSettings globalEditing={globalEditing} setGlobalEditing={setGlobalEditing} /> : <ReferenceDataSettings globalEditing={globalEditing} setGlobalEditing={setGlobalEditing} />}
        </Box>
    )
}

function SearchStatusSelect({ form, setForm }: { form: any; setForm: (v: any) => void }) {
    const { data = [] } = useQuery(['refdata', 'search_status'], () => fetchReferenceData('search_status'))

    return (
        <TextField
            select
            fullWidth
            label="Search status"
            value={form.searchStatusId ?? ''}
            onChange={(e) => setForm({ ...form, searchStatusId: e.target.value ? Number(e.target.value) : null })}
            SelectProps={{ native: true }}
            InputLabelProps={{ shrink: true }}
        >
            <option value="">(none)</option>
            {(data || []).map((r: any) => (
                <option key={r.refid} value={r.refid}>{r.refvalue}</option>
            ))}
        </TextField>
    )
}
