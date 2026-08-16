import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Avatar from '@mui/material/Avatar'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import LinkedInIcon from '@mui/icons-material/LinkedIn'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import WhatshotIcon from '@mui/icons-material/Whatshot'
import AcUnitIcon from '@mui/icons-material/AcUnit'
import BoltIcon from '@mui/icons-material/Bolt'
import { MobileCard } from '../Mobile'
import type { MobileCardMetadataItem } from '../Mobile'
import type { Contact } from '../../api/types'

interface MobileContactCardProps {
    /**
     * Contact data from API
     */
    contact: Contact

    /**
     * Callback when Edit is clicked
     */
    onEdit?: (contactId: number) => void

    /**
     * Callback when Delete is clicked
     */
    onDelete?: (contactId: number) => void

    /**
     * Callback when card is tapped (navigate to detail view)
     */
    onClick?: (contactId: number) => void

    /**
     * Callback when engagements count is clicked
     */
    onEngagementsClick?: (contactId: number) => void

    /**
     * Callback when roles count is clicked
     */
    onRolesClick?: (contactId: number) => void

    /**
     * Callback when actions count is clicked
     */
    onActionsClick?: (contactId: number) => void

    /**
     * Callback when documents count is clicked
     */
    onDocumentsClick?: (contactId: number) => void

    /**
     * Dense mode for compact layouts
     * @default false
     */
    dense?: boolean

    /**
     * Heat thresholds for determining contact temperature
     * @default { warm: 30, cold: 90 }
     */
    heatThresholds?: { warm: number; cold: number }
}

/**
 * Mobile-optimized contact card for Hub and Contacts pages
 * 
 * **Features:**
 * - Avatar with role type badge
 * - Heat indicator (🔥 Hot / ⚡ Warm / ❄️ Cold)
 * - Days since last contact
 * - Organisation and sector
 * - Engagement count
 * - Quick actions: Edit, LinkedIn, Delete
 * 
 * **Usage:**
 * ```tsx
 * <MobileContactCard
 *   contact={contact}
 *   onEdit={handleEdit}
 *   onDelete={handleDelete}
 *   onClick={handleViewDetails}
 *   heatThresholds={{ warm: 30, cold: 90 }}
 * />
 * ```
 */
export default function MobileContactCard({
    contact,
    onEdit,
    onDelete,
    onClick,
    onEngagementsClick,
    onRolesClick,
    onActionsClick,
    onDocumentsClick,
    dense = false,
    heatThresholds = { warm: 30, cold: 90 },
}: MobileContactCardProps) {
    const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null)
    const [expanded, setExpanded] = React.useState(false)

    const contactId = contact.contactid ?? 0
    const name = contact.name || `${contact.firstname || ''} ${contact.lastname || ''}`.trim() || 'Unknown'
    const organisation = contact.current_organization || null
    const sector = contact.current_org_sector || null
    const roleType = contact.role_type || 'Contact'
    const engagementCount = contact.engagement_count ?? 0
    const rolesCount = contact.roles_count ?? 0
    const actionsCount = contact.__actions_count ?? 0
    const documentsCount = contact.documents_count ?? 0
    const isLinkedInConnected = contact.islinkedinconnected || contact.is_linkedin_connected || contact.linkedin_connected || false
    const avatarUrl = contact.avatar_url || undefined

    // Calculate days since last activity
    const daysAgo = React.useMemo(() => {
        if (!contact.last_activity_date) return null
        const lastContact = new Date(contact.last_activity_date)
        if (isNaN(lastContact.getTime())) return null
        const now = new Date()
        const diffMs = now.getTime() - lastContact.getTime()
        return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
    }, [contact.last_activity_date])

    // Determine heat level
    const heat = React.useMemo(() => {
        if (daysAgo === null) return 'cold'
        if (daysAgo <= heatThresholds.warm) return 'hot'
        if (daysAgo <= heatThresholds.cold) return 'warm'
        return 'cold'
    }, [daysAgo, heatThresholds])

    // Heat indicator icon
    const heatIcon = React.useMemo(() => {
        if (heat === 'hot') {
            return <WhatshotIcon sx={{ fontSize: 18, color: 'error.main' }} />
        }
        if (heat === 'warm') {
            return <BoltIcon sx={{ fontSize: 18, color: 'warning.main' }} />
        }
        return <AcUnitIcon sx={{ fontSize: 18, color: 'info.main' }} />
    }, [heat])

    // Role type badge color
    const roleTypeBadgeColor = React.useMemo(() => {
        const roleTypeLower = roleType.toLowerCase()
        if (roleTypeLower.includes('recruiter')) return 'secondary'
        if (roleTypeLower.includes('friend') || roleTypeLower.includes('colleague')) return 'success'
        if (roleTypeLower.includes('interviewer')) return 'warning'
        return 'default'
    }, [roleType])

    // Avatar (from URL or initials)
    const avatarContent = React.useMemo(() => {
        if (avatarUrl) {
            return <Avatar src={avatarUrl} sx={{ width: 40, height: 40 }} />
        }
        // Generate initials
        const nameParts = name.split(' ')
        const initials = nameParts
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join('')
        return (
            <Avatar sx={{ width: 40, height: 40, bgcolor: 'primary.main' }}>
                {initials}
            </Avatar>
        )
    }, [name, avatarUrl])

    // Subtitle: role type + organisation
    const subtitle = React.useMemo(() => {
        const parts: string[] = []
        if (organisation) {
            parts.push(organisation)
        }
        return parts.join(' • ') || 'No organisation'
    }, [organisation])

    // Metadata items
    const metadata: MobileCardMetadataItem[] = React.useMemo(() => {
        const items: MobileCardMetadataItem[] = []

        // Last contact
        if (daysAgo !== null) {
            items.push({
                label: 'Last contact',
                value: `${daysAgo} days ago`,
                icon: heatIcon,
            })
        } else {
            items.push({
                label: 'Last contact',
                value: 'Never',
                icon: heatIcon,
            })
        }

        // Sector (if available)
        if (sector) {
            items.push({
                label: 'Sector',
                value: sector,
            })
        }

        // LinkedIn status
        items.push({
            label: 'LinkedIn',
            value: isLinkedInConnected ? '✓ Connected' : 'Not connected',
            color: isLinkedInConnected ? 'success' : undefined,
        })

        // Actions count - always show if handler provided
        if (onActionsClick) {
            items.push({
                label: 'Actions',
                value: String(actionsCount),
                onClick: () => onActionsClick(contactId),
            })
        }

        // Documents count - always show if handler provided
        if (onDocumentsClick) {
            items.push({
                label: 'Documents',
                value: String(documentsCount),
                onClick: () => onDocumentsClick(contactId),
            })
        }

        // Engagements - always show if handler provided
        if (onEngagementsClick) {
            items.push({
                label: 'Engagements',
                value: String(engagementCount),
                onClick: () => {
                    console.log('[MobileContactCard] Engagements clicked, contactId:', contactId, 'count:', engagementCount)
                    onEngagementsClick(contactId)
                },
            })
        }

        // Job applications - always show if handler provided
        if (onRolesClick) {
            items.push({
                label: 'Applications',
                value: String(rolesCount),
                onClick: () => {
                    console.log('[MobileContactCard] Roles clicked, contactId:', contactId, 'count:', rolesCount)
                    onRolesClick(contactId)
                },
            })
        }

        return items
    }, [daysAgo, heatIcon, sector, isLinkedInConnected, actionsCount, documentsCount, engagementCount, rolesCount, onActionsClick, onDocumentsClick, onEngagementsClick, onRolesClick, contactId])

    // Additional metadata for expanded view
    const expandedMetadata: MobileCardMetadataItem[] = React.useMemo(() => {
        const items: MobileCardMetadataItem[] = []

        if (contact.email) {
            items.push({
                label: 'Email',
                value: contact.email,
            })
        }

        if (contact.phone) {
            items.push({
                label: 'Phone',
                value: contact.phone,
            })
        }

        if (contact.first_contact_date) {
            items.push({
                label: 'First Contact',
                value: new Date(contact.first_contact_date).toLocaleDateString(),
            })
        }

        if (contact.last_activity_date) {
            items.push({
                label: 'Last activity date',
                value: new Date(contact.last_activity_date).toLocaleDateString(),
            })
        }

        if (contact.created_at) {
            items.push({
                label: 'Created',
                value: new Date(contact.created_at).toLocaleDateString(),
            })
        }

        return items
    }, [contact.email, contact.phone, contact.first_contact_date, contact.last_activity_date])

    // Badge (role type)
    const badge = (
        <Chip
            label={roleType}
            size="small"
            color={roleTypeBadgeColor}
            sx={{ height: 24, fontSize: '0.75rem' }}
        />
    )

    // Menu button
    const menuButton = (
        <>
            <IconButton
                size="small"
                onClick={(e) => {
                    e.stopPropagation()
                    setMenuAnchor(e.currentTarget)
                }}
                aria-label="Contact actions"
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
                            setMenuAnchor(null)
                            onEdit(contactId)
                        }}
                    >
                        <EditIcon sx={{ mr: 1, fontSize: 18 }} />
                        Edit
                    </MenuItem>
                )}
                {onDelete && (
                    <MenuItem
                        onClick={() => {
                            setMenuAnchor(null)
                            onDelete(contactId)
                        }}
                        sx={{ color: 'error.main' }}
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
            avatar={avatarContent}
            title={name}
            subtitle={subtitle}
            badge={badge}
            metadata={expanded ? [...metadata, ...expandedMetadata] : metadata}
            menuButton={menuButton}
            onClick={() => setExpanded(!expanded)}
            dense={dense}
        />
    )
}
