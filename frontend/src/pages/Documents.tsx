import React, { useEffect, useState } from 'react'
import { Box, Button, TextField, Typography, Paper, Grid, Select, MenuItem, FormControl, InputLabel, FormHelperText, DialogTitle, DialogContent, DialogActions, IconButton } from '@mui/material'
import Dialog from '../components/Shared/WideDialog'
import AppButton from '../components/Shared/AppButton'
import { fetchDocuments, createDocument, deleteDocument, fetchReferenceData, updateDocument, downloadDocument, fetchDocumentEngagements } from '../api/client'
import EngagementsTable from '../components/Hub/EngagementsTable'
import ResponsiveDataView from '../components/ResponsiveDataView'
import MobileEngagementsList from '../components/Hub/MobileEngagementsList'
import CloseIcon from '@mui/icons-material/Close'
import DataTable from '../components/DataTable'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import GetAppIcon from '@mui/icons-material/GetApp'

// Helper: compute a safe Select value by checking that the provided `value`
// exists in `types`. Returns the original value when valid, otherwise ''
// so MUI Select doesn't warn about out-of-range values.
const safeTypeSelectValue = (typesList: any[], val: any) => {
    if (val == null) return ''
    if (Array.isArray(typesList) && typesList.some((t: any) => Number(t.refid) === Number(val))) return val
    return ''
}

export default function Documents() {
    const [docs, setDocs] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [name, setName] = useState('')
    const [typeId, setTypeId] = useState<number | null>(null)
    const [types, setTypes] = useState<any[]>([])
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const fileInputRef = React.useRef<HTMLInputElement | null>(null)
    const [description, setDescription] = useState('')
    const [addOpen, setAddOpen] = useState(false)

    useEffect(() => {
        load()
        loadTypes()
        const handler = () => { load() }
        window.addEventListener('documents:refresh', handler)
        return () => window.removeEventListener('documents:refresh', handler)
    }, [])

    async function loadTypes() {
        const ref = await fetchReferenceData('document_type')
        setTypes(ref)
    }

    async function load() {
        setLoading(true)
        try {
            const list = await fetchDocuments()
            // normalize paginated or single-array responses to an array of docs
            const docsArray = Array.isArray(list) ? list : ((list && Array.isArray((list as any).items)) ? (list as any).items : [])
            setDocs(docsArray)
        } finally {
            setLoading(false)
        }
    }

    // Compute a safe Select value for the Add dialog using the helper above.
    const safeTypeValue = safeTypeSelectValue(types, typeId)

    // friendlyFromUri removed — URI/link input removed from the Add dialog

    async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files && e.target.files[0]
        if (!f) return
        // Default: populate friendly name
        if (!name) setName(f.name)
        setSelectedFile(f)
    }

    function openFileDialog() {
        if (fileInputRef.current) fileInputRef.current.click()
    }

    function openAddDialog() {
        setAddOpen(true)
    }

    // no blob URLs to cleanup when storing file:// paths

    async function handleCreate() {
        // If a file was selected, upload via FormData (includes applicantid)
        try {
            if (selectedFile) {
                // import dynamically to avoid top-level unused import if not needed
                const { uploadDocumentFile } = await import('../api/client')
                const created = await uploadDocumentFile(selectedFile, name || undefined, typeId ?? undefined, description || undefined)
                // If user provided a description for the file, try to update the created document
                try {
                    const docId = created?.documentid ?? created?.id ?? created?.documentId
                    if (description && docId) {
                        await updateDocument(Number(docId), { documentdescription: description })
                    }
                } catch (e) {
                    // ignore update failure; upload succeeded
                }
            } else {
                // Require at least a description when not uploading a file
                if (!description) return
                const payload: any = { documentdescription: description }
                if (name) payload.documentname = name
                if (typeId) payload.documenttypeid = typeId
                await createDocument(payload)
            }
        } finally {
            setName('')
            setTypeId(null)
            setSelectedFile(null)
            setDescription('')
            setAddOpen(false)
            // refresh local documents list
            await load()
        }
    }

    async function handleDelete(id: number, name?: string) {
        const display = (name && String(name).trim()) || `#${id}`
        const safe = String(display).replace(/"/g, '\\"')
        if (!confirm(`Delete document "${safe}"?`)) return
        await deleteDocument(id)
        await load()
    }

    async function handleOpen(documentId: number, documentName?: string) {
        try {
            const blob = await downloadDocument(documentId)
            const url = URL.createObjectURL(blob)

            // Prefer to trigger a download with the stored document name so the
            // saved file uses a sensible filename instead of 'unknown.xlsx'.
            const a = document.createElement('a')
            a.href = url
            a.download = documentName || `document-${documentId}`
            document.body.appendChild(a)
            a.click()
            a.remove()

            // Revoke after a short timeout to allow the browser to complete download
            setTimeout(() => URL.revokeObjectURL(url), 60_000)
        } catch (err: any) {
            console.error('Failed to open document', err)
            alert(err?.response?.data?.error || 'Failed to download document')
        }
    }

    return (
        <Box>
            <h2 style={{ margin: 0 }}>Documents</h2>
            <Paper sx={{ p: 2, mb: 2 }}>
                <Grid container spacing={2} alignItems="flex-start">
                    <Grid item xs={12}>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', justifyContent: 'flex-end' }}>
                            <AppButton colorScheme="purple" size="small" onClick={openAddDialog}>+ Add document</AppButton>
                        </Box>
                    </Grid>
                </Grid>

                <Box sx={{ mt: 2 }}>
                    {loading ? (
                        <div>Loading...</div>
                    ) : docs.length === 0 ? (
                        <div>No documents</div>
                    ) : (
                        <DataTable
                            rows={docs}
                            total={docs.length}
                            columns={[
                                { key: 'documentname', label: 'Name', render: (row: any) => (row.documentname || row.documentdescription || row.documenturi || '') },
                                { key: 'document_type', label: 'Type', render: (row: any) => (row.document_type ?? '') },
                                { key: 'documentdescription', label: 'Description', render: (row: any) => <DescriptionCell row={row} /> },
                                { key: 'engagements', label: 'Engagements', render: (row: any) => <EngagementsCell row={row} /> },
                                {
                                    key: 'document_date', label: 'Date', render: (row: any) => {
                                        const candidates = [
                                            row.documentdate,
                                            row.document_date,
                                            row.created_at,
                                            row.createdat,
                                            row.documentcreated,
                                            row.createddate,
                                            row.created,
                                            row.date
                                        ]
                                        const found = candidates.find((c: any) => c != null && String(c).trim() !== '')
                                        if (!found) return '—'
                                        const s = String(found).trim()
                                        // If the backend already supplies an ISO date prefix, use YYYY-MM-DD directly
                                        const m = s.match(/^\d{4}-\d{2}-\d{2}/)
                                        if (m) return m[0]
                                        // Fallback: parse and format as local YYYY-MM-DD
                                        try {
                                            const d = new Date(s)
                                            if (!isNaN(d.getTime())) {
                                                const y = d.getFullYear()
                                                const mm = String(d.getMonth() + 1).padStart(2, '0')
                                                const dd = String(d.getDate()).padStart(2, '0')
                                                return `${y}-${mm}-${dd}`
                                            }
                                        } catch (e) {
                                            // ignore
                                        }
                                        return s
                                    }
                                },
                                { key: '__actions', label: 'Action', render: (row: any) => <ActionsCell row={row} types={types} onOpen={handleOpen} onDelete={handleDelete} onSaved={() => load()} />, shrinkToHeader: true, width: 160 }
                            ]}
                            page={0}
                            pageSize={20}
                            onPageChange={() => { }}
                            onPageSizeChange={() => { }}
                        />
                    )}
                </Box>
            </Paper>

            <Dialog open={addOpen} onClose={() => setAddOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>Add document</DialogTitle>
                <DialogContent sx={{
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
                }}>
                    <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileSelect} />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Button variant="outlined" onClick={openFileDialog}>Choose file…</Button>
                            <Typography variant="body2">{selectedFile ? selectedFile.name : ''}</Typography>
                        </Box>
                        <TextField label="Document Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
                        <FormControl fullWidth>
                            <InputLabel id="doc-type-label-add">Type</InputLabel>
                            <Select
                                labelId="doc-type-label-add"
                                value={safeTypeValue}
                                label="Type"
                                onChange={(e) => setTypeId(e.target.value ? Number(e.target.value) : null)}
                            >
                                {types.map((t: any) => (
                                    <MenuItem key={t.refid} value={t.refid}>{t.refvalue}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline rows={3} />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <AppButton colorScheme="white" onClick={() => setAddOpen(false)}>Cancel</AppButton>
                    {(() => {
                        // Require a selected file to enable Add — do not allow creating
                        // a document record without an uploaded file from this dialog.
                        const canAdd = selectedFile != null
                        return (
                            <AppButton colorScheme="purple" onClick={handleCreate} disabled={!canAdd}>
                                Add
                            </AppButton>
                        )
                    })()}
                </DialogActions>
            </Dialog>


        </Box>
    )
}

function DescriptionCell({ row }: any) {
    return (
        <div style={{ fontSize: 14, color: '#222', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
            {row.documentdescription ?? row.documenturi ?? ''}
        </div>
    )
}

function EngagementsCell({ row }: any) {
    const [open, setOpen] = useState(false)
    const [engIds, setEngIds] = useState<number[] | null>(null)
    const [engs, setEngs] = useState<any[] | null>(null)
    const [count, setCount] = useState<number | null>(null)

    useEffect(() => {
        if (Array.isArray(row.engagements)) setCount(row.engagements.length)
        else if (Array.isArray(row.linked_engagements)) setCount(row.linked_engagements.length)
        else if (typeof row.engagements_count === 'number') setCount(row.engagements_count)
        else if (typeof row.engagement_count === 'number') setCount(row.engagement_count)
        else setCount(null)
    }, [row])

    async function openEngs() {
        setEngIds(null)
        setEngs(null)
        setOpen(true)
        try {
            const list = await fetchDocumentEngagements(Number(row.documentid))
            const ids = Array.isArray(list) ? list.map((e: any) => Number(e.engagementlogid ?? e.engagementid ?? e.logid ?? 0)).filter((n: number) => n > 0) : []
            setEngIds(ids)
            setEngs(Array.isArray(list) ? list : [])
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Failed to fetch document engagements', e)
            setEngIds([])
            setEngs([])
        }
    }

    return (
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <AppButton size="small" colorScheme="white" sx={{ fontWeight: 700, justifyContent: 'center', pl: 0, minWidth: 64 }} onClick={openEngs}>{count ?? 0}</AppButton>
            <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="lg">
                <DialogTitle>
                    Engagements for {row.documentname || row.documentdescription || ''}
                    <IconButton aria-label="close" onClick={() => setOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {engIds == null ? (
                        <div>Loading…</div>
                    ) : engIds.length === 0 ? (
                        <div>No linked engagements</div>
                    ) : (
                        <ResponsiveDataView
                            desktopView={<EngagementsTable onlyIds={engIds} inModal={true} showCreate={false} />}
                            mobileView={<MobileEngagementsList engagements={engs || []} loading={false} />}
                            breakpoint="md"
                        />
                    )}
                </DialogContent>
                <DialogActions>
                    <AppButton colorScheme="white" onClick={() => setOpen(false)}>Close</AppButton>
                </DialogActions>
            </Dialog>
        </div>
    )
}

function ActionsCell({ row, types, onOpen, onDelete, onSaved }: any) {
    const [editOpen, setEditOpen] = useState(false)
    const [draft, setDraft] = useState<string>(row.documentdescription ?? row.documenturi ?? '')
    const [nameDraft, setNameDraft] = useState<string>(row.documentname ?? '')
    const [typeDraft, setTypeDraft] = useState<number | null>(row.documenttypeid ?? row.documenttypeid ?? null)

    async function save() {
        try {
            const payload: any = { documentdescription: draft }
            if (nameDraft) payload.documentname = nameDraft
            if (typeDraft != null) payload.documenttypeid = typeDraft
            await updateDocument(Number(row.documentid), payload)
            setEditOpen(false)
            if (onSaved) onSaved()
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Failed to save document description', e)
            alert('Failed to save')
        }
    }

    return (
        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8 }}>
            <IconButton aria-label={`Open document ${row.documentid}`} size="small" onClick={() => onOpen(row.documentid, row.documentname)}><GetAppIcon fontSize="small" /></IconButton>
            <IconButton aria-label={`Edit document ${row.documentid}`} size="small" onClick={() => { setDraft(row.documentdescription ?? row.documenturi ?? ''); setNameDraft(row.documentname ?? ''); setTypeDraft(row.documenttypeid ?? null); setEditOpen(true) }}><EditIcon fontSize="small" /></IconButton>
            <IconButton aria-label={`Delete document ${row.documentid}`} size="small" onClick={() => onDelete(row.documentid, row.documentname ?? row.documentdescription ?? row.documenturi)}><DeleteIcon fontSize="small" /></IconButton>

            <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>Edit document</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                        <TextField label="Name" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} fullWidth />
                        <FormControl fullWidth>
                            <InputLabel id={`doc-type-label-${row.documentid}`}>Type</InputLabel>
                            <Select
                                labelId={`doc-type-label-${row.documentid}`}
                                value={safeTypeSelectValue(types, typeDraft)}
                                label="Type"
                                onChange={(e) => setTypeDraft(e.target.value ? Number(e.target.value) : null)}
                            >
                                {Array.isArray(types) ? types.map((t: any) => (<MenuItem key={t.refid} value={t.refid}>{t.refvalue}</MenuItem>)) : null}
                            </Select>
                        </FormControl>
                        <TextField label="Description" value={draft} onChange={(e) => setDraft(e.target.value)} fullWidth multiline rows={4} />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <AppButton colorScheme="white" onClick={() => setEditOpen(false)}>Cancel</AppButton>
                    <AppButton colorScheme="purple" onClick={save}>Save</AppButton>
                </DialogActions>
            </Dialog>
        </div>
    )
}
