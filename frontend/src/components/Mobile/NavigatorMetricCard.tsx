import React from 'react'
import { Box, Card, CardContent, Typography, Avatar, Chip } from '@mui/material'
import PersonIcon from '@mui/icons-material/Person'
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import AccountCircleIcon from '@mui/icons-material/AccountCircle'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import RemoveIcon from '@mui/icons-material/Remove'
import { BRAND_PURPLE } from '../../constants/colors'

interface NavigatorMetricCardProps {
    metric: {
        metric: string
        label?: string
        value?: any
        trend?: 'up' | 'down' | 'stable' | null
        delta?: number | string
        missing?: boolean
        icon?: 'contacts' | 'roles' | 'actions' | 'applicant' | 'help'
    }
    onDetailClick?: () => void
}

const NavigatorMetricCard: React.FC<NavigatorMetricCardProps> = ({ metric, onDetailClick }) => {
    const renderIcon = () => {
        const iconType = metric.icon || 'help'
        const sx = { width: 40, height: 40, bgcolor: BRAND_PURPLE, color: '#fff' }

        switch (iconType) {
            case 'contacts':
                return <Avatar sx={sx}><PersonIcon fontSize="small" sx={{ color: '#fff' }} /></Avatar>
            case 'roles':
                return <Avatar sx={sx}><BusinessCenterIcon fontSize="small" sx={{ color: '#fff' }} /></Avatar>
            case 'actions':
                return <Avatar sx={sx}><TaskAltIcon fontSize="small" sx={{ color: '#fff' }} /></Avatar>
            case 'applicant':
                return <Avatar sx={sx}><AccountCircleIcon fontSize="small" sx={{ color: '#fff' }} /></Avatar>
            default:
                return <Avatar sx={sx}><HelpOutlineIcon fontSize="small" sx={{ color: '#fff' }} /></Avatar>
        }
    }

    const renderTrend = () => {
        if (!metric.trend) return null

        const trendStyles = {
            up: { color: '#4caf50', icon: <ArrowUpwardIcon fontSize="small" /> },
            down: { color: '#f44336', icon: <ArrowDownwardIcon fontSize="small" /> },
            stable: { color: '#9e9e9e', icon: <RemoveIcon fontSize="small" /> },
        }

        const trend = trendStyles[metric.trend]
        if (!trend) return null

        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: trend.color }}>
                {trend.icon}
                {metric.delta && (
                    <Typography variant="body2" sx={{ color: trend.color, fontWeight: 600 }}>
                        {typeof metric.delta === 'number' ? `${metric.delta > 0 ? '+' : ''}${metric.delta}` : metric.delta}
                    </Typography>
                )}
            </Box>
        )
    }

    const renderValue = () => {
        if (metric.missing) {
            const chipLabel = metric.metric === 'navigator_briefing_score'
                ? 'Review Briefing Questions'
                : 'Upload document'
            return <Chip label={chipLabel} size="small" sx={{ bgcolor: 'grey.500', color: '#fff' }} />
        }

        return (
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {metric.value ?? '—'}
            </Typography>
        )
    }

    return (
        <Card
            sx={{
                mb: 1.5,
                cursor: onDetailClick ? 'pointer' : 'default',
                '&:hover': onDetailClick ? { boxShadow: 3 } : {},
                bgcolor: '#fbf8ff',
            }}
            onClick={onDetailClick}
        >
            <CardContent>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                    {/* Icon */}
                    <Box sx={{ flexShrink: 0 }}>
                        {renderIcon()}
                    </Box>

                    {/* Content */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, mb: 1, color: 'text.primary' }}>
                            {metric.label || metric.metric}
                        </Typography>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            {renderValue()}
                            {renderTrend()}
                        </Box>
                    </Box>
                </Box>
            </CardContent>
        </Card>
    )
}

export default NavigatorMetricCard
