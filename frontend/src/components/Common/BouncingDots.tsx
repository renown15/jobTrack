import React from 'react'
import Box from '@mui/material/Box'

export default function BouncingDots({ size = 14, color = '#666' }: { size?: number, color?: string }) {
    const dotSize = Math.max(6, Math.round(size * 0.4))
    const style = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: `${Math.max(4, Math.round(size * 0.12))}px`,
    } as const

    const dotCommon = {
        width: dotSize,
        height: dotSize,
        borderRadius: '50%',
        backgroundColor: color,
        display: 'inline-block',
    } as const

    // Keyframes are emitted inline via a style tag so we don't require a global stylesheet.
    return (
        <Box component="span" sx={style} aria-hidden>
            <style>{`@keyframes bounceDots{0%,80%,100%{transform:translateY(0);}40%{transform:translateY(-6px);}}`}</style>
            <Box component="span" sx={{ ...dotCommon, animation: 'bounceDots 1s infinite', animationDelay: '0s' }} />
            <Box component="span" sx={{ ...dotCommon, animation: 'bounceDots 1s infinite', animationDelay: '0.15s' }} />
            <Box component="span" sx={{ ...dotCommon, animation: 'bounceDots 1s infinite', animationDelay: '0.3s' }} />
        </Box>
    )
}
