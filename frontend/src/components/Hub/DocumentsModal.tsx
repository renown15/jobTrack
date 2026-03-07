import React, { useState, useEffect, useRef } from 'react'
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Box,
    TextField,
    Button,
    Typography,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    IconButton
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import AppButton from '../Shared/AppButton'
import { uploadDocumentFile, updateDocument, fetchReferenceData } from '../../api/client'

interface DocumentsModalProps {
    open: boolean
    onClose: () => void
    onSaved: () => void
    documentId?: number | null
    initialData?: {
        documentname?: string
        documentdescription?: string
        documenttypeid?: number
    }
    contactId?: number | null
    engagementId?: number | null
}

export default function DocumentsModal({
    open,
    onClose,
    onSaved,
    documentId = null,
    initialData,
    contactId,
    engagementId
}: DocumentsModalProps) {
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [typeId, setTypeId] = useState<number | null>(null)
    const [types, setTypes] = useState<any[]>([])
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [saving, setSaving] = useState(false)
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    const isEdit = documentId != null

    useEffect(() => {
        if (open) {
            loadTypes()
            if (initialData) {
                setName(initialData.documentname || '')
                setDescription(initialData.documentdescription || '')
                setTypeId(initialData.documenttypeid || null)
            }
        }
    }, [open, initialData])

    async function loadTypes() {
        try {
            const ref = await fetchReferenceData('document_type')
            setTypes(ref)
        } catch (e) {
            console.error('Failed to load document types', e)
        }
    }

    function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files && e.target.files[0]
        if (!f) return
        if (!name) setName(f.name)
        setSelectedFile(f)
    }

    function openFileDialog() {
        fileInputRef.current?.click()
    }

    async function handleSave() {
        setSaving(true)
        try {
            if (isEdit) {
                // Edit existing document
                const payload: any = {
                    documentdescription: description
                }
                if (name) payload.documentname = name
                if (typeId != null) payload.documenttypeid = typeId
                await updateDocument(documentId, payload)
            } else {
                // Create new document
                if (!selectedFile && !description) {
                    alert('Please select a file or enter a description')
                    return
                }

                if (selectedFile) {
                    await uploadDocumentFile(
                        selectedFile,
                        name || undefined,
                        typeId ?? undefined,
                        description || undefined
                    )
                } else {
                    // For now, require a file
                    alert('Please select a file to upload')
                    return
                }
            }

            // Reset form
            setName('')
            setDescription('')
            setTypeId(null)
            setSelectedFile(null)

            onSaved()
            onClose()
        } catch (err: any) {
            console.error('Failed to save document', err)
            alert(err?.response?.data?.error || 'Failed to save document')
        } finally {
            setSaving(false)
        }
    }

    const safeTypeValue = typeId != null && types.some(t => Number(t.refid) === Number(typeId)) ? typeId : ''
    const canSave = isEdit ? true : selectedFile != null

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>
                {isEdit ? 'Edit Document' : 'Add Document'}
                <IconButton
                    aria-label="close"
                    onClick={onClose}
                    sx={{ position: 'absolute', right: 8, top: 8 }}
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent>
                <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                />
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                    {!isEdit && (
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Button variant="outlined" onClick={openFileDialog}>
                                Choose file…
                            </Button>
                            <Typography variant="body2">
                                {selectedFile ? selectedFile.name : 'No file selected'}
                            </Typography>
                        </Box>
                    )}

                    <TextField
                        label="Document Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        fullWidth
                    />

                    <FormControl fullWidth>
                        <InputLabel id="doc-type-label">Type</InputLabel>
                        <Select
                            labelId="doc-type-label"
                            value={safeTypeValue}
                            label="Type"
                            onChange={(e) => setTypeId(e.target.value ? Number(e.target.value) : null)}
                        >
                            {types.map((t: any) => (
                                <MenuItem key={t.refid} value={t.refid}>
                                    {t.refvalue}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <TextField
                        label="Description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        fullWidth
                        multiline
                        rows={3}
                    />
                </Box>
            </DialogContent>
            <DialogActions>
                <AppButton colorScheme="white" onClick={onClose}>
                    Cancel
                </AppButton>
                <AppButton
                    colorScheme="purple"
                    onClick={handleSave}
                    disabled={!canSave || saving}
                >
                    {saving ? 'Saving...' : 'Save'}
                </AppButton>
            </DialogActions>
        </Dialog>
    )
}
