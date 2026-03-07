import React from 'react'
import { Box, Typography, IconButton } from '@mui/material'
import MobileCard from '../Mobile/MobileCard'
import DescriptionIcon from '@mui/icons-material/Description'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import GetAppIcon from '@mui/icons-material/GetApp'

interface MobileDocumentsListProps {
    documents: any[]
    loading?: boolean
    onEdit?: (documentId: number) => void
    onDelete?: (documentId: number, documentName?: string) => void
    onDownload?: (documentId: number, documentName?: string) => void
    onEngagementsClick?: (documentId: number) => void
    onDocumentClick?: (documentId: number) => void
}

export default function MobileDocumentsList({ documents, loading, onEdit, onDelete, onDownload, onEngagementsClick, onDocumentClick }: MobileDocumentsListProps) {
    if (loading) {
        return (
            <Box sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">Loading documents...</Typography>
            </Box>
        )
    }

    if (!documents || documents.length === 0) {
        return (
            <Box sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">No documents found</Typography>
            </Box>
        )
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {documents.map((doc) => {
                const documentId = doc.documentid
                const name = doc.documentname || 'Untitled'
                const description = doc.documentdescription || doc.documenturi || ''
                const type = doc.document_type || 'Unknown'
                const dateStr = doc.documentdate || doc.document_date || doc.created_at || doc.createdat || ''

                // Format date if available
                let displayDate = ''
                if (dateStr) {
                    try {
                        const d = new Date(dateStr)
                        if (!isNaN(d.getTime())) {
                            displayDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        }
                    } catch (e) {
                        displayDate = String(dateStr).substring(0, 10)
                    }
                }

                const engagementsCount = doc.engagements_count ?? doc.engagement_count ?? 0

                const metadata = [
                    { label: 'Type', value: type },
                    displayDate && { label: 'Date', value: displayDate },
                    engagementsCount > 0 && onEngagementsClick ? {
                        label: 'Engagements',
                        value: String(engagementsCount),
                        onClick: () => onEngagementsClick(documentId)
                    } : (engagementsCount > 0 ? { label: 'Engagements', value: String(engagementsCount) } : null)
                ].filter(Boolean) as Array<{ label: string; value: string; onClick?: () => void }>

                const actions = (
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                        {onDownload && (
                            <IconButton
                                size="small"
                                aria-label="Download"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onDownload(documentId, name)
                                }}
                            >
                                <GetAppIcon fontSize="small" />
                            </IconButton>
                        )}
                        {onEdit && (
                            <IconButton
                                size="small"
                                aria-label="Edit"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onEdit(documentId)
                                }}
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        )}
                        {onDelete && (
                            <IconButton
                                size="small"
                                aria-label="Delete"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onDelete(documentId, name)
                                }}
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        )}
                    </Box>
                )

                return (
                    <MobileCard
                        key={documentId}
                        title={name}
                        subtitle={description}
                        avatar={<DescriptionIcon />}
                        metadata={metadata}
                        actions={(onDownload || onEdit || onDelete) ? actions : undefined}
                        onClick={onDocumentClick ? () => onDocumentClick(documentId) : undefined}
                    />
                )
            })}
        </Box>
    )
}
