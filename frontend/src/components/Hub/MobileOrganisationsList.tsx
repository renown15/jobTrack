import React, { useState, useMemo } from 'react'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import FormControl from '@mui/material/FormControl'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import { MobileOrganisationCard } from '../Mobile'
import { sortArray } from '../../utils/sort'

interface MobileOrganisationsListProps {
    organisations: any[]
    loading?: boolean
    onEdit?: (orgId: number) => void
    onDelete?: (orgId: number) => void
    onContactsClick?: (orgId: number) => void
    onRolesClick?: (orgId: number) => void
    emptyMessage?: string
    sortable?: boolean
}

export default function MobileOrganisationsList({
    organisations,
    loading = false,
    onEdit,
    onDelete,
    onContactsClick,
    onRolesClick,
    emptyMessage = 'No organisations found',
    sortable = true,
}: MobileOrganisationsListProps) {
    const [sortBy, setSortBy] = useState<string>('name')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

    const sortedOrganisations = useMemo(() => {
        if (!sortable || !organisations || organisations.length === 0) return organisations
        return sortArray(organisations, sortBy, sortOrder)
    }, [organisations, sortBy, sortOrder, sortable])

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                <CircularProgress />
            </Box>
        )
    }

    if (!organisations || organisations.length === 0) {
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
                            <MenuItem value="sector">Sector</MenuItem>
                            <MenuItem value="contact_count">Contacts</MenuItem>
                            <MenuItem value="engagement_count">Engagements</MenuItem>
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
            {sortedOrganisations.map((org) => (
                <MobileOrganisationCard
                    key={org.orgid}
                    organisation={org}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onContactsClick={onContactsClick}
                    onRolesClick={onRolesClick}
                />
            ))}
        </Box>
    )
}
