import React from 'react'
import Chip from '@mui/material/Chip'
import BusinessIcon from '@mui/icons-material/Business'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { MobileCard } from '../Mobile'
import type { MobileCardMetadataItem } from '../Mobile'

interface MobileOrganisationCardProps {
    organisation: any
    onEdit?: (orgId: number) => void
    onDelete?: (orgId: number) => void
    onClick?: (orgId: number) => void
    onContactsClick?: (orgId: number) => void
    onRolesClick?: (orgId: number) => void
    dense?: boolean
}

/**
 * Mobile-optimized organisation card
 */
export default function MobileOrganisationCard({
    organisation,
    onEdit,
    onDelete,
    onClick,
    onContactsClick,
    onRolesClick,
    dense = false,
}: MobileOrganisationCardProps) {
    const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null)
    const [expanded, setExpanded] = React.useState(false)

    const orgId = organisation.orgid ?? 0
    const name = organisation.name || 'Unknown Organisation'
    const sector = organisation.sector_summary || organisation.sector || null
    const isTalentCommunity = organisation.talent_community_member === true
    const contactCount = organisation.contacts_count ?? organisation.contact_count ?? 0
    const rolesCount = organisation.roles_count ?? 0
    const createdAt = organisation.created_at || null

    // Avatar
    const avatar = <BusinessIcon sx={{ fontSize: 32, color: 'primary.main' }} />

    // Subtitle
    const subtitle = sector || 'No sector'

    // Badge
    const badge = isTalentCommunity ? (
        <Chip
            label="Talent Community"
            size="small"
            color="success"
            sx={{ height: 24, fontSize: '0.75rem' }}
        />
    ) : null

    // Basic metadata
    const metadata: MobileCardMetadataItem[] = React.useMemo(() => {
        const items: MobileCardMetadataItem[] = []

        if (contactCount > 0) {
            items.push({
                label: 'Contacts',
                value: String(contactCount),
                onClick: onContactsClick ? () => onContactsClick(orgId) : undefined,
            })
        }

        if (rolesCount > 0) {
            items.push({
                label: 'Roles',
                value: String(rolesCount),
                onClick: onRolesClick ? () => onRolesClick(orgId) : undefined,
            })
        }

        return items
    }, [contactCount, rolesCount, onContactsClick, onRolesClick, orgId])

    // Expanded metadata
    const expandedMetadata: MobileCardMetadataItem[] = React.useMemo(() => {
        const items: MobileCardMetadataItem[] = []

        if (createdAt) {
            items.push({
                label: 'Created',
                value: new Date(createdAt).toLocaleDateString(),
            })
        }

        if (organisation.date_joined) {
            items.push({
                label: 'Talent Community Since',
                value: new Date(organisation.date_joined).toLocaleDateString(),
            })
        }

        return items
    }, [createdAt, organisation.date_joined])

    // Menu button
    const menuButton = (
        <>
            <IconButton
                size="small"
                onClick={(e) => {
                    e.stopPropagation()
                    setMenuAnchor(e.currentTarget)
                }}
                aria-label="Organisation actions"
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
                            console.log('[MobileOrganisationCard] Edit clicked, orgId:', orgId)
                            setMenuAnchor(null)
                            onEdit(orgId)
                        }}
                    >
                        <EditIcon sx={{ mr: 1, fontSize: 18 }} />
                        Edit
                    </MenuItem>
                )}
                {onDelete && (
                    <MenuItem
                        onClick={() => {
                            console.log('[MobileOrganisationCard] Delete clicked, orgId:', orgId)
                            setMenuAnchor(null)
                            onDelete(orgId)
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
