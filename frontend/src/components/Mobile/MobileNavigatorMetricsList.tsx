import React from 'react'
import { Box, CircularProgress, Typography } from '@mui/material'
import NavigatorMetricCard from './NavigatorMetricCard'

interface Metric {
    metric: string
    label?: string
    value?: any
    trend?: 'up' | 'down' | 'stable' | null
    delta?: number | string
    missing?: boolean
    icon?: 'contacts' | 'roles' | 'actions' | 'applicant' | 'help'
}

interface MobileNavigatorMetricsListProps {
    metrics: Metric[]
    loading?: boolean
    onDetailClick?: (metric: Metric) => void
}

const MobileNavigatorMetricsList: React.FC<MobileNavigatorMetricsListProps> = ({
    metrics,
    loading = false,
    onDetailClick,
}) => {
    if (loading) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: 200,
                }}
            >
                <CircularProgress />
            </Box>
        )
    }

    if (!metrics || metrics.length === 0) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: 200,
                }}
            >
                <Typography variant="body2" color="text.secondary">
                    No metrics available
                </Typography>
            </Box>
        )
    }

    return (
        <Box sx={{ pb: 2 }}>
            {metrics.map((metric) => (
                <NavigatorMetricCard
                    key={metric.metric}
                    metric={metric}
                    onDetailClick={onDetailClick ? () => onDetailClick(metric) : undefined}
                />
            ))}
        </Box>
    )
}

export default MobileNavigatorMetricsList
