import React from 'react'
import { Paper, Typography } from '@mui/material'
import { SxProps } from '@mui/system'
import { BRAND_PURPLE_LIGHT } from '../constants/colors'

type Props = {
    title: string
    children: React.ReactNode
    sx?: SxProps
}

const ChartCard = React.forwardRef<HTMLDivElement, Props>(function ChartCard({ title, children, sx }, ref) {
    return (
        <Paper ref={ref} className="chart-card" data-chart-card variant="outlined" sx={{ p: 1.5, borderColor: BRAND_PURPLE_LIGHT, ...sx }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {title}
            </Typography>
            <div>
                {children}
            </div>
        </Paper>
    )
})

export default ChartCard
