import React from 'react'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import ChatIcon from '@mui/icons-material/Chat'
import PhoneIcon from '@mui/icons-material/Phone'
import EmailIcon from '@mui/icons-material/Email'
import VideocamIcon from '@mui/icons-material/Videocam'
import EventIcon from '@mui/icons-material/Event'
import { MobileCard } from '../Mobile'
import type { MobileCardMetadataItem } from '../Mobile'

interface MobileEngagementCardProps {
    engagement: any
    onEdit?: (engagementId: number) => void
    onDelete?: (engagementId: number) => void
    onClick?: (engagementId: number) => void
    dense?: boolean
}

/**
 * Mobile-optimized engagement card
 */
export default function MobileEngagementCard({
    engagement,
    onEdit,
    onDelete,
    onClick,
    dense = false,
}: MobileEngagementCardProps) {
    const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null)
    const [expanded, setExpanded] = React.useState(false)

    const engagementId = engagement.engagementlogid ?? engagement.engagementid ?? 0
    const contactName = engagement.contact_name || 'Unknown Contact'
    const companyName = engagement.company_name || engagement.organisation_name || null
    const kind = engagement.kind || engagement.engagement_type || 'Engagement'
    const date = engagement.engagementdate || engagement.date
    const notes = engagement.notes || null
    const isInterview = kind.toLowerCase().includes('interview')

    // Icon based on engagement type
    const avatar = React.useMemo(() => {
        const kindLower = kind.toLowerCase()
        if (kindLower.includes('phone') || kindLower.includes('call')) {
            return <PhoneIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        }
        if (kindLower.includes('email')) {
            return <EmailIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        }
        if (kindLower.includes('video') || kindLower.includes('zoom') || kindLower.includes('teams')) {
            return <VideocamIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        }
        if (kindLower.includes('interview')) {
            return <EventIcon sx={{ fontSize: 32, color: 'success.main' }} />
        }
        return <ChatIcon sx={{ fontSize: 32, color: 'primary.main' }} />
    }, [kind])

    // Subtitle
    const subtitle = contactName

    // Badge
    const badge = (
        <Chip
            label={kind}
            size="small"
            color={isInterview ? 'success' : 'default'}
            sx={{ height: 24, fontSize: '0.75rem' }}
        />
    )

    // Basic metadata
    const metadata: MobileCardMetadataItem[] = React.useMemo(() => {
        const items: MobileCardMetadataItem[] = []

        if (date) {
            items.push({
                label: 'Date',
                value: new Date(date).toLocaleDateString(),
            })
        }

        if (companyName) {
            items.push({
                label: 'Company',
                value: companyName,
            })
        }

        // Include engagement kind/type as a metadata row so mobile cards show a "Kind" label
        if (kind) {
            items.push({
                label: 'Kind',
                value: kind,
            })
        }

        if (notes && notes.trim()) {
            // If notes are short, show them. If long, don't show preview (user can expand)
            if (notes.length <= 60) {
                items.push({
                    label: 'Notes',
                    value: notes,
                })
            }
        }

        return items
    }, [date, companyName, notes])

    // Expanded metadata
    const expandedMetadata: MobileCardMetadataItem[] = React.useMemo(() => {
        const items: MobileCardMetadataItem[] = []

        // Show full notes when expanded (only if they weren't shown in basic metadata)
        if (notes && notes.length > 60) {
            items.push({
                label: 'Notes',
                value: notes,
            })
        }

        return items
    }, [notes])

    // Menu button
    const menuButton = (
        <>
            <IconButton
                size="small"
                onClick={(e) => {
                    e.stopPropagation()
                    setMenuAnchor(e.currentTarget)
                }}
                aria-label="Engagement actions"
            >
                <MoreVertIcon />
            </IconButton>
            <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => setMenuAnchor(null)}
                onClick={(e) => e.stopPropagation()}
            >
                {onEdit && (
                    <MenuItem
                        onClick={() => {
                            console.log('[MobileEngagementCard] Edit clicked, engagementId:', engagementId)
                            setMenuAnchor(null)
                            onEdit(engagementId)
                        }}
                    >
                        <EditIcon sx={{ mr: 1, fontSize: 18 }} />
                        Edit
                    </MenuItem>
                )}
                {onDelete && (
                    <MenuItem
                        onClick={() => {
                            console.log('[MobileEngagementCard] Delete clicked, engagementId:', engagementId)
                            setMenuAnchor(null)
                            onDelete(engagementId)
                        }}
                    >
                        <DeleteIcon sx={{ mr: 1, fontSize: 18 }} />
                        Delete
                    </MenuItem>
                )}
            </Menu>
        </>
    )

    return (
        <MobileCard
            avatar={avatar}
            title={contactName}
            subtitle={`${kind} on ${date ? new Date(date).toLocaleDateString() : 'Unknown date'}`}
            badge={badge}
            metadata={expanded ? [...metadata, ...expandedMetadata] : metadata}
            menuButton={menuButton}
            onClick={() => setExpanded(!expanded)}
            dense={dense}
        />
    )
}
