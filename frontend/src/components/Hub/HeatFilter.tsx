import React from 'react'
import { BRAND_PURPLE } from '../../constants/colors'
import { ACCORDION_TITLE_SX, ACCORDION_TITLE_VARIANT } from '../../constants/ui'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Slider from '@mui/material/Slider'
import Typography from '@mui/material/Typography'
import AppButton from '../Shared/AppButton'
import { useQuery } from '@tanstack/react-query'
import { fetchReferenceData } from '../../api/client'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'

export default function HeatFilter({ value, onChange, dataMin = 0, dataMax = 365, lockMin, matchesCount, bucketCounts, noContactCount, totalCount, disableClamp, activeOnly, onActiveOnlyChange }: { value: number[]; onChange: (v: number[]) => void; dataMin?: number; dataMax?: number; lockMin?: number; matchesCount?: number; bucketCounts?: { hot?: number; warm?: number; cold?: number; never?: number }; noContactCount?: number; totalCount?: number; disableClamp?: boolean; activeOnly?: boolean; onActiveOnlyChange?: (v: boolean) => void }) {
    // Treat `value` as an unordered pair [a, b]. For the slider we always show
    // an increasing pair [min, max]. When the user changes the slider we emit
    // the ordered pair [min, max] via `onChange`.

    const sliderValue = React.useMemo(() => {
        if (!Array.isArray(value) || value.length !== 2) return [dataMin, dataMax]
        const a = Number(value[0] ?? dataMin)
        const b = Number(value[1] ?? dataMax)
        let lo = Math.min(a, b)
        const hi = Math.max(a, b)
        const effectiveLock = (typeof lockMin === 'number') ? Number(lockMin) : Number(dataMin ?? 0)
        if (lo < effectiveLock) lo = effectiveLock
        return [lo, hi]
    }, [value, dataMin, dataMax, lockMin])

    // refs and measurement state for pixel-perfect overlay
    const sliderRef = React.useRef<HTMLDivElement | null>(null)
    const containerRef = React.useRef<HTMLDivElement | null>(null)
    const [railRect, setRailRect] = React.useState<{ left: number; width: number; top: number; height: number } | null>(null)

    const measureRail = React.useCallback(() => {
        try {
            const sliderEl = sliderRef.current
            if (!sliderEl) {
                setRailRect(null)
                return
            }
            // find the rail element rendered by MUI Slider
            const rail = sliderEl.querySelector?.('.MuiSlider-rail') as HTMLElement | null
            const containerEl = containerRef.current
            if (!rail || !containerEl) {
                setRailRect(null)
                return
            }
            const railB = rail.getBoundingClientRect()
            const containerB = containerEl.getBoundingClientRect()
            const left = Math.max(0, railB.left - containerB.left)
            const top = Math.max(0, railB.top - containerB.top)
            const width = Math.max(0, railB.width)
            const height = Math.max(0, railB.height)
            setRailRect({ left, width, top, height })
        } catch (e) {
            setRailRect(null)
        }
    }, [])

    React.useLayoutEffect(() => {
        measureRail()
        window.addEventListener('resize', measureRail)
        // listen for custom layout changes (sidebar open/close)
        window.addEventListener('layoutchange', measureRail)
        return () => {
            window.removeEventListener('resize', measureRail)
            window.removeEventListener('layoutchange', measureRail)
        }
    }, [measureRail, dataMin, dataMax, sliderValue])

    const handleChange = (_: Event, v: number | number[]) => {
        if (!Array.isArray(v) || v.length !== 2) return
        let lo = Number(v[0])
        let hi = Number(v[1])
        const minDomain = Number(dataMin ?? 0)
        const maxDomain = Number(dataMax ?? 365)
        const effectiveLock = (typeof lockMin === 'number') ? Number(lockMin) : minDomain
        lo = Math.max(effectiveLock, Math.min(maxDomain, lo))
        hi = Math.max(minDomain, Math.min(maxDomain, hi))
        // emit ordered [min, max]
        onChange([lo, hi])
    }

    // Ensure incoming `value` respects the lockMin; correct it if needed.
    React.useEffect(() => {
        if (disableClamp) return
        const maxNum = Number(dataMax ?? 0)
        if (!Number.isFinite(maxNum) || maxNum < 1) return
        if (!Array.isArray(value) || value.length !== 2) return
        const a = Number(value[0] ?? dataMin)
        const b = Number(value[1] ?? dataMax)
        const lo = Math.min(a, b)
        const hi = Math.max(a, b)
        const effectiveLock = (typeof lockMin === 'number') ? Number(lockMin) : Number(dataMin ?? 0)
        const effectiveMax = Number(dataMax ?? 365)
        let newLo = lo
        let newHi = hi
        if (newLo < effectiveLock) newLo = effectiveLock
        if (newHi > effectiveMax) newHi = effectiveMax
        // If the incoming value is out of domain (below lockMin or above dataMax), correct it.
        if (newLo !== lo || newHi !== hi) {
            onChange([newLo, newHi])
            return
        }
        // only run when lockMin or incoming value changes
    }, [value, lockMin, dataMin, dataMax, onChange, disableClamp])

    // fetch heat threshold refdata to show visual bars (warm / cold)
    const heatThreshQ = useQuery(['refdata', 'heat_threshold'], () => fetchReferenceData('heat_threshold'), { staleTime: 60000 })

    const heatThresholds = React.useMemo(() => {
        let warm = 30
        let cold = 90
        try {
            const items: any[] = heatThreshQ.data || []
            for (const it of items) {
                const v = String(it.refvalue || '')
                const parts = v.split(/[:=]/).map((s: string) => s.trim())
                if (parts.length >= 2) {
                    const key = parts[0].toLowerCase()
                    const val = parseInt(parts[1], 10)
                    if (Number.isFinite(val)) {
                        if (key === 'warm' || key === 'hot') warm = val
                        if (key === 'cold') cold = val
                    }
                }
            }
        } catch (e) {
            // ignore and use defaults
        }
        if (warm >= cold) cold = warm + 30
        return { warm, cold }
    }, [heatThreshQ.data])

    // Precompute labels and heat segments to keep JSX simple and avoid nested IIFEs
    const labelLeft = new Date(Date.now() - Number(dataMin ?? 0) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const labelRight = new Date(Date.now() - Number(dataMax ?? 365) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const segMin = 0
    const segMax = Number(dataMax ?? 365)
    const segRange = Math.max(1, segMax - segMin)
    const segWarm = Math.max(segMin, Math.min(segMax, heatThresholds.warm))
    const segCold = Math.max(segMin, Math.min(segMax, heatThresholds.cold))

    let hotW = ((Math.max(0, segWarm - segMin)) / segRange) * 100
    let warmW = ((Math.max(0, segCold - segWarm)) / segRange) * 100
    let coldW = ((Math.max(0, segMax - segCold)) / segRange) * 100
    if (!Number.isFinite(hotW) || hotW < 0) hotW = 0
    if (!Number.isFinite(warmW) || warmW < 0) warmW = 0
    if (!Number.isFinite(coldW) || coldW < 0) coldW = 0
    const residual = 100 - (hotW + warmW + coldW)
    coldW = coldW + residual

    const segments = [
        { key: 'hot', w: hotW, label: `Hot (<${heatThresholds.warm}d)`, count: bucketCounts?.hot ?? 0, color: '#e53935' },
        { key: 'warm', w: warmW, label: `Warm (${heatThresholds.warm}–${heatThresholds.cold}d)`, count: bucketCounts?.warm ?? 0, color: '#fb8c00' },
        { key: 'cold', w: coldW, label: `Cold (≥${heatThresholds.cold}d)`, count: bucketCounts?.cold ?? 0, color: '#42a5f5' },
    ]

    if (process.env.NODE_ENV !== 'production' && typeof console !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log('HeatFilter layout:', { segMin, segMax, warm: heatThresholds.warm, cold: heatThresholds.cold, hotW, warmW, coldW, bucketCounts })
    }

    // compute pixel widths when railRect is available
    const pixelWidths = React.useMemo(() => {
        if (!railRect) return null
        const total = Math.max(1, railRect.width)
        const hotPx = Math.round((hotW / 100) * total)
        const warmPx = Math.round((warmW / 100) * total)
        const coldPx = Math.max(0, total - hotPx - warmPx)
        return { hotPx, warmPx, coldPx }
    }, [railRect, hotW, warmW])

    return (
        <Accordion sx={{ py: 1 }} elevation={1}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant={ACCORDION_TITLE_VARIANT as any} sx={ACCORDION_TITLE_SX}>Contact Filering</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AppButton size="small" colorScheme="white" onClick={(e: any) => {
                            try {
                                e.stopPropagation()
                                e.preventDefault()
                            } catch (err) { /* ignore */ }
                            try {
                                // Reset to show the entire dataset
                                onChange([0, 365])
                                if (typeof onActiveOnlyChange === 'function') onActiveOnlyChange(false)
                            } catch (e) { /* ignore */ }
                        }}>Reset</AppButton>
                        <FormControlLabel
                            onClick={(e: any) => { try { e.stopPropagation() } catch (err) { } }}
                            control={<Switch checked={Boolean(activeOnly)} onChange={(e: any, v: boolean) => { try { e.stopPropagation() } catch (err) { } try { if (typeof onActiveOnlyChange === 'function') onActiveOnlyChange(Boolean(v)) } catch (e) { } }} />}
                            label="Active only"
                        />
                    </Box>
                </Box>
            </AccordionSummary>

            <AccordionDetails>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
                    {/* Labels above the slider: left = domain min (today), right = domain max (oldest) */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 1 }}>
                        <Typography variant="caption">{labelLeft}</Typography>
                        <Typography variant="caption">{labelRight}</Typography>
                    </Box>

                    <Box sx={{ px: 1 }}>
                        <Slider
                            ref={(el) => { sliderRef.current = el as any }}
                            value={sliderValue}
                            onChange={handleChange}
                            valueLabelDisplay="auto"
                            min={Number(dataMin ?? 0)}
                            max={Math.max(1, Number(dataMax ?? 1))}
                            aria-labelledby="heat-range"
                            sx={{ width: '100%', mb: 1 }}
                        />

                        <Box sx={{ display: 'flex', width: '100%', mt: 0.5 }}>
                            <Box ref={containerRef} sx={{ flex: 1, position: 'relative', minHeight: 52 }}>
                                <Box sx={{ height: 12, mb: 1 }} aria-hidden>
                                    {railRect && pixelWidths ? (
                                        <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
                                            <Box sx={{ position: 'absolute', left: `${railRect.left}px`, width: `${railRect.width}px`, height: '100%', display: 'flex', borderRadius: 1, overflow: 'hidden', boxSizing: 'border-box', pointerEvents: 'none', border: (theme) => process.env.NODE_ENV !== 'production' ? `1px dashed ${theme.palette.divider}` : 'none' }}>
                                                <Box sx={{ width: pixelWidths.hotPx, backgroundColor: segments[0].color, height: '100%' }} />
                                                <Box sx={{ width: pixelWidths.warmPx, backgroundColor: segments[1].color, height: '100%' }} />
                                                <Box sx={{ width: pixelWidths.coldPx, backgroundColor: segments[2].color, height: '100%' }} />
                                            </Box>
                                        </Box>
                                    ) : (
                                        <Box sx={{ display: 'grid', gridTemplateColumns: `${Number(hotW.toFixed(6))}% ${Number(warmW.toFixed(6))}% ${Number(coldW.toFixed(6))}%`, width: '100%', height: '100%', borderRadius: 1, overflow: 'hidden', boxSizing: 'border-box', border: (theme) => process.env.NODE_ENV !== 'production' ? `1px dashed ${theme.palette.divider}` : 'none' }}>
                                            <Box sx={{ backgroundColor: segments[0].color, height: '100%' }} />
                                            <Box sx={{ backgroundColor: segments[1].color, height: '100%' }} />
                                            <Box sx={{ backgroundColor: segments[2].color, height: '100%' }} />
                                        </Box>
                                    )}
                                </Box>

                                {railRect && pixelWidths ? (
                                    <Box sx={{ position: 'absolute', left: `${railRect.left}px`, top: `${railRect.top + railRect.height + 8}px`, width: `${railRect.width}px`, height: 'auto', display: 'flex' }}>
                                        <Box sx={{ width: `${pixelWidths.hotPx}px`, overflow: 'hidden', pl: '6px', boxSizing: 'border-box' }}>
                                            <Typography variant="caption" color={'text.secondary'}>{segments[0].label}</Typography>
                                            <Typography variant="caption" color={'text.secondary'} sx={{ fontWeight: 700, display: 'block' }}>{segments[0].count}</Typography>
                                        </Box>
                                        <Box sx={{ width: `${pixelWidths.warmPx}px`, overflow: 'hidden', pl: '6px', boxSizing: 'border-box' }}>
                                            <Typography variant="caption" color={'text.secondary'}>{segments[1].label}</Typography>
                                            <Typography variant="caption" color={'text.secondary'} sx={{ fontWeight: 700, display: 'block' }}>{segments[1].count}</Typography>
                                        </Box>
                                        <Box sx={{ width: `${pixelWidths.coldPx}px`, overflow: 'hidden', pl: '6px', boxSizing: 'border-box' }}>
                                            <Typography variant="caption" color={'text.secondary'}>{segments[2].label}</Typography>
                                            <Typography variant="caption" color={'text.secondary'} sx={{ fontWeight: 700, display: 'block' }}>{segments[2].count}</Typography>
                                        </Box>
                                    </Box>
                                ) : (
                                    <Box sx={{ display: 'grid', gridTemplateColumns: `${Number(hotW.toFixed(6))}% ${Number(warmW.toFixed(6))}% ${Number(coldW.toFixed(6))}%`, gap: 1, mt: 1 }}>
                                        {segments.map((s) => (
                                            <Box key={s.key} sx={{ textAlign: 'left', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', pr: 1 }}>
                                                <Typography variant="caption" color={'text.secondary'}>{s.label}</Typography>
                                                <Typography variant="caption" color={'text.secondary'} sx={{ fontWeight: 700, display: 'block' }}>{s.count}</Typography>
                                            </Box>
                                        ))}
                                    </Box>
                                )}
                            </Box>

                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end', pl: 2 }}>
                                <Box sx={{ width: 80, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'left' }}>Dormant</Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textAlign: 'left' }}>{typeof noContactCount === 'number' ? `${noContactCount}` : ''}</Typography>
                                </Box>
                                <Box sx={{ width: 80, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                                    <Typography variant="caption" color="text.secondary">All</Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{typeof totalCount === 'number' ? `${totalCount}` : ''}</Typography>
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                </Box>
            </AccordionDetails>
        </Accordion>
    )
}
