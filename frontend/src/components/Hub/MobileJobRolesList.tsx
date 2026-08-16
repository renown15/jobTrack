import React, { useState, useMemo } from 'react'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import FormControl from '@mui/material/FormControl'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import { MobileJobRoleCard } from '../Mobile'
import { sortArray } from '../../utils/sort'

interface MobileJobRolesListProps {
    roles: any[]
    loading?: boolean
    onEdit?: (roleId: number) => void
    onDelete?: (roleId: number) => void
    emptyMessage?: string
    sortable?: boolean
}

export default function MobileJobRolesList({
    roles,
    loading = false,
    onEdit,
    onDelete,
    emptyMessage = 'No job applications found',
    sortable = true,
}: MobileJobRolesListProps) {
    const [sortBy, setSortBy] = useState<string>('applicationdate')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

    const sortedRoles = useMemo(() => {
        if (!sortable || !roles || roles.length === 0) return roles
        return sortArray(roles, sortBy, sortOrder)
    }, [roles, sortBy, sortOrder, sortable])

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                <CircularProgress />
            </Box>
        )
    }

    if (!roles || roles.length === 0) {
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
                            <MenuItem value="rolename">Role</MenuItem>
                            <MenuItem value="company_name">Company</MenuItem>
                            <MenuItem value="applicationdate">Date Applied</MenuItem>
                            <MenuItem value="status_name">Status</MenuItem>
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
            {sortedRoles.map((role) => (
                <MobileJobRoleCard
                    key={role.jobid}
                    role={role}
                    onEdit={onEdit}
                    onDelete={onDelete}
                />
            ))}
        </Box>
    )
}
