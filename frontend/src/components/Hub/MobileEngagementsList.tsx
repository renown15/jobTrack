import React, { useState, useMemo } from 'react'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import FormControl from '@mui/material/FormControl'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import { MobileEngagementCard } from '../Mobile'
import { sortArray } from '../../utils/sort'

interface MobileEngagementsListProps {
    engagements: any[]
    loading?: boolean
    onEdit?: (engagementId: number) => void
    onDelete?: (engagementId: number) => void
    emptyMessage?: string
    sortable?: boolean
}

export default function MobileEngagementsList({
    engagements,
    loading = false,
    onEdit,
    onDelete,
    emptyMessage = 'No engagements found',
    sortable = true,
}: MobileEngagementsListProps) {
    const [sortBy, setSortBy] = useState<string>('engagementdate')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

    const sortedEngagements = useMemo(() => {
        if (!sortable || !engagements || engagements.length === 0) return engagements
        return sortArray(engagements, sortBy, sortOrder)
    }, [engagements, sortBy, sortOrder, sortable])

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                <CircularProgress />
            </Box>
        )
    }

    if (!engagements || engagements.length === 0) {
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
                            <MenuItem value="engagementdate">Date</MenuItem>
                            <MenuItem value="contact_name">Contact</MenuItem>
                            <MenuItem value="kind">Type</MenuItem>
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
            {sortedEngagements.map((engagement) => (
                <MobileEngagementCard
                    key={engagement.engagementlogid || engagement.engagementid}
                    engagement={engagement}
                    onEdit={onEdit}
                    onDelete={onDelete}
                />
            ))}
        </Box>
    )
}
