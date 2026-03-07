import React from 'react'
import Chip from '@mui/material/Chip'
import WorkIcon from '@mui/icons-material/Work'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { MobileCard } from '../Mobile'
import type { MobileCardMetadataItem } from '../Mobile'

interface MobileJobRoleCardProps {
    role: any
    onEdit?: (roleId: number) => void
    onDelete?: (roleId: number) => void
    onClick?: (roleId: number) => void
    dense?: boolean
}

/**
 * Mobile-optimized job role/application card
 */
export default function MobileJobRoleCard({
    role,
    onEdit,
    onDelete,
    onClick,
    dense = false,
}: MobileJobRoleCardProps) {
    const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null)
    const [expanded, setExpanded] = React.useState(false)

    const roleId = role.jobid ?? 0
    const title = role.rolename || 'Unknown Role'
    const company = role.company_name || 'Unknown Company'
    const status = role.status_name || 'Unknown'
    const applicationDate = role.applicationdate
    const source = role.source_name || null

    // Avatar
    const avatar = <WorkIcon sx={{ fontSize: 32, color: 'primary.main' }} />

    // Subtitle
    const subtitle = company

    // Status badge color
    const statusColor = React.useMemo(() => {
        const statusLower = status.toLowerCase()
        if (statusLower.includes('offer') || statusLower.includes('accepted')) return 'success'
        if (statusLower.includes('interview')) return 'info'
        if (statusLower.includes('reject') || statusLower.includes('declined')) return 'error'
        if (statusLower.includes('applied')) return 'primary'
        return 'default'
    }, [status])

    // Badge
    const badge = (
        <Chip
            label={status}
            size="small"
            color={statusColor as any}
            sx={{ height: 24, fontSize: '0.75rem' }}
        />
    )

    // Basic metadata
    const metadata: MobileCardMetadataItem[] = React.useMemo(() => {
        const items: MobileCardMetadataItem[] = []

        if (applicationDate) {
            items.push({
                label: 'Applied',
                value: new Date(applicationDate).toLocaleDateString(),
            })
        }

        if (source) {
            items.push({
                label: 'Source',
                value: source,
            })
        }

        return items
    }, [applicationDate, source])

    // Expanded metadata
    const expandedMetadata: MobileCardMetadataItem[] = React.useMemo(() => {
        const items: MobileCardMetadataItem[] = []

        if (role.notes) {
            items.push({
                label: 'Notes',
                value: role.notes.length > 100 ? role.notes.substring(0, 100) + '...' : role.notes,
            })
        }

        return items
    }, [role.notes])

    // Menu button
    const menuButton = (
        <>
            <IconButton
                size="small"
                onClick={(e) => {
                    e.stopPropagation()
                    setMenuAnchor(e.currentTarget)
                }}
                aria-label="Job role actions"
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
                            console.log('[MobileJobRoleCard] Edit clicked, roleId:', roleId)
                            setMenuAnchor(null)
                            onEdit(roleId)
                        }}
                    >
                        <EditIcon sx={{ mr: 1, fontSize: 18 }} />
                        Edit
                    </MenuItem>
                )}
                {onDelete && (
                    <MenuItem
                        onClick={() => {
                            console.log('[MobileJobRoleCard] Delete clicked, roleId:', roleId)
                            setMenuAnchor(null)
                            onDelete(roleId)
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
            title={title}
            subtitle={subtitle}
            badge={badge}
            metadata={expanded ? [...metadata, ...expandedMetadata] : metadata}
            menuButton={menuButton}
            onClick={() => setExpanded(!expanded)}
            dense={dense}
        />
    )
}
