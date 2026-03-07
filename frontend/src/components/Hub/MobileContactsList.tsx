import React, { useState, useMemo } from 'react'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import FormControl from '@mui/material/FormControl'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import { MobileContactCard } from '../Mobile'
import { sortArray } from '../../utils/sort'
import type { Contact } from '../../api/types'

interface MobileContactsListProps {
    /**
     * Array of contacts to display
     */
    contacts: Contact[]

    /**
     * Loading state
     */
    loading?: boolean

    /**
     * Heat thresholds for determining contact temperature
     */
    heatThresholds?: { warm: number; cold: number }

    /**
     * Callback when Edit is clicked
     */
    onEdit?: (contactId: number) => void

    /**
     * Callback when Delete is clicked
     */
    onDelete?: (contactId: number) => void

    /**
     * Callback when card is tapped
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
     * Empty state message
     */
    emptyMessage?: string

    /**
     * Enable sorting controls
     */
    sortable?: boolean
}

/**
 * Mobile-optimized list of contact cards
 * 
 * Used in Hub and Contacts pages when viewport is mobile (< 900px)
 */
export default function MobileContactsList({
    contacts,
    loading = false,
    heatThresholds,
    onEdit,
    onDelete,
    onClick,
    onEngagementsClick,
    onRolesClick,
    onActionsClick,
    onDocumentsClick,
    emptyMessage = 'No contacts found',
    sortable = true,
}: MobileContactsListProps) {
    const [sortBy, setSortBy] = useState<string>('name')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

    // Sort contacts based on selected criteria
    const sortedContacts = useMemo(() => {
        if (!sortable || !contacts || contacts.length === 0) return contacts
        return sortArray(contacts, sortBy, sortOrder)
    }, [contacts, sortBy, sortOrder, sortable])

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                <CircularProgress />
            </Box>
        )
    }

    if (!contacts || contacts.length === 0) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200, px: 2 }}>
                <Typography variant="body2" color="text.secondary">
                    {emptyMessage}
                </Typography>
            </Box>
        )
    }

    return (
        <Box sx={{ px: { xs: 1, sm: 2 }, py: 1 }}>
            {sortable && (
                <Box sx={{ mb: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                        Sort by:
                    </Typography>
                    <FormControl size="small" sx={{ minWidth: 120, flex: 1 }}>
                        <Select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            sx={{ fontSize: 14 }}
                        >
                            <MenuItem value="name">Name</MenuItem>
                            <MenuItem value="last_activity_date">Last activity</MenuItem>
                            <MenuItem value="current_organization">Organisation</MenuItem>
                            <MenuItem value="engagement_count">Engagements</MenuItem>
                            <MenuItem value="roles_count">Applications</MenuItem>
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 80 }}>
                        <Select
                            value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                            sx={{ fontSize: 14 }}
                        >
                            <MenuItem value="asc">↑</MenuItem>
                            <MenuItem value="desc">↓</MenuItem>
                        </Select>
                    </FormControl>
                </Box>
            )}
            {sortedContacts.map((contact) => (
                <MobileContactCard
                    key={contact.contactid}
                    contact={contact}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onClick={onClick}
                    onEngagementsClick={onEngagementsClick}
                    onRolesClick={onRolesClick}
                    onActionsClick={onActionsClick}
                    onDocumentsClick={onDocumentsClick}
                    heatThresholds={heatThresholds}
                />
            ))}
        </Box>
    )
}
