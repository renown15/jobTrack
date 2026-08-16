import React, { useRef, useState, useEffect } from 'react'
import { SEARCH_HUB } from '../constants/labels'
import { NavLink } from 'react-router-dom'
import HomeIcon from '@mui/icons-material/Home'
import BarChartIcon from '@mui/icons-material/BarChart'
import DescriptionIcon from '@mui/icons-material/Description'
import PeopleIcon from '@mui/icons-material/People'
import ExploreIcon from '@mui/icons-material/Explore'
import ShareIcon from '@mui/icons-material/Share'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import SettingsIcon from '@mui/icons-material/Settings'
import IconButton from '@mui/material/IconButton'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import DoubleArrowIcon from '@mui/icons-material/DoubleArrow'
import LightbulbIcon from '@mui/icons-material/Lightbulb'
import SchoolIcon from '@mui/icons-material/School'
import IssueReportModal from './IssueReportModal'
import { useQuery } from '@tanstack/react-query'
import { fetchApplicantSettings } from '../api/client'
import Snackbar from '@mui/material/Snackbar'
import MuiAlert from '@mui/material/Alert'
import Link from '@mui/material/Link'

const baseLinkStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    color: '#333',
    textDecoration: 'none',
    borderRadius: 6,
}

const activeStyle: React.CSSProperties = {
    background: '#ffffff',
    color: '#3f0071',
    fontWeight: 600,
}

export const brandPurple = '#3f0071'

export default function Sidebar() {
    const [collapsed, setCollapsed] = useState(false)
    const [reportOpen, setReportOpen] = useState(false)
    const [snackOpen, setSnackOpen] = useState(false)
    const [snackData, setSnackData] = useState<{ issue_id?: number | null; issue_number?: number | null; issue_url?: string | null } | null>(null)
    const [hoverLabel, setHoverLabel] = useState<{ text: string; top: number } | null>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)

    // Sidebar width is responsive to collapsed state. Keep layout responsive
    // and let the main layout handle spacing. Avoid hard-coded layout width.
    const [toggleTop, setToggleTop] = useState<number | null>(null)
    const [iconsTop, setIconsTop] = useState<number | null>(null)

    useEffect(() => {
        function updateTop() {
            const container = containerRef.current
            const header = document.querySelector('header')
            if (!container || !header) {
                setToggleTop(null)
                setIconsTop(null)
                return
            }
            // Prefer aligning to the JobTrack logo if available, otherwise fall back to header center
            const logo = header.querySelector('[data-jobtrack-logo]') as HTMLElement | null
            const cRect = container.getBoundingClientRect()
            const refRect = logo ? logo.getBoundingClientRect() : header.getBoundingClientRect()
            const btnHeight = 36
            const top = Math.round(refRect.top - cRect.top + refRect.height / 2 - btnHeight / 2)
            setToggleTop(top)
            // Compute icons top so the first icon aligns with the bottom of the header/logo area
            const iconsOffset = Math.round((logo ? logo.getBoundingClientRect().bottom : header.getBoundingClientRect().bottom) - cRect.top)
            // Nudge icons slightly lower to align visually with header bottom
            const VISUAL_NUDGE = 12
            setIconsTop(Math.max(8, iconsOffset + VISUAL_NUDGE))
        }
        updateTop()
        window.addEventListener('resize', updateTop)
        const mo = new MutationObserver(updateTop)
        mo.observe(document.body, { childList: true, subtree: true })
        return () => { window.removeEventListener('resize', updateTop); mo.disconnect() }
    }, [containerRef.current])

    // Notify layout-sensitive components (e.g. HeatFilter) when the sidebar
    // collapsed state changes so they can re-measure their layout.
    useEffect(() => {
        try {
            window.dispatchEvent(new Event('layoutchange'))
        } catch (e) {
            // ignore
        }
    }, [collapsed])

    function handleMouseEnterLabel(e: React.MouseEvent, label: string) {
        if (!collapsed) return
        const target = e.currentTarget as HTMLElement
        const container = containerRef.current
        if (!container) return
        const tRect = target.getBoundingClientRect()
        const cRect = container.getBoundingClientRect()
        const top = tRect.top - cRect.top
        setHoverLabel({ text: label, top })
    }

    function handleMouseLeaveLabel() {
        if (!collapsed) return
        setHoverLabel(null)
    }

    const { data: applicantSettings } = useQuery(['settings', 'applicant'], fetchApplicantSettings)

    const links: Array<{ to: string; label: string; icon: React.ReactNode; end?: boolean }> = [
        { to: '/', label: SEARCH_HUB, icon: <HomeIcon />, end: true },
        { to: '/navigator', label: 'Navigator Insights', icon: <ExploreIcon /> },
        { to: '/action-canvas', label: 'Action Canvas', icon: <TaskAltIcon /> },
        { to: '/analytics', label: 'Analytics Studio', icon: <BarChartIcon /> },
        { to: '/networking', label: 'Networking', icon: <ShareIcon /> },
        { to: '/documents', label: 'Documents', icon: <DescriptionIcon /> },
        { to: '/coaching', label: 'Coaching', icon: <SchoolIcon /> },
        { to: '/leads', label: 'LinkedIn Leads', icon: <PeopleIcon /> },
        { to: '/settings', label: 'Settings', icon: <SettingsIcon /> },
        // Slightly separated helper page
        { to: '/get-started', label: 'Get Started', icon: <LightbulbIcon /> },
        // Only show Applicant Manager to superusers (place below Get Started)
        ...(applicantSettings?.isSuperuser ? [{ to: '/admin/applicants', label: 'Applicant Manager', icon: <PeopleIcon /> }] : []),
    ]

    const asideStyle: React.CSSProperties = {
        borderRight: `1px solid ${brandPurple}`,
        padding: 12,
        boxSizing: 'border-box',
        position: 'relative',
        backgroundColor: brandPurple,
        color: '#fff',
        width: collapsed ? 56 : 220,
        minWidth: collapsed ? 56 : 160,
        transition: 'width 180ms ease',
        overflow: 'hidden',
    }

    return (
        <aside ref={containerRef} style={asideStyle}>
            {/* absolutely positioned toggle so it can be vertically aligned with header */}
            {(() => {
                const top = toggleTop ?? 12
                const common: any = { position: 'absolute', top, zIndex: 30 }
                const style = collapsed
                    ? { ...common, left: '50%', transform: 'translateX(-50%)' }
                    : { ...common, right: 8 }
                return (
                    <div style={style}>
                        <IconButton
                            size="small"
                            onClick={() => setCollapsed(!collapsed)}
                            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
                            sx={{
                                color: '#fff',
                                transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                                transition: 'transform 160ms ease',
                                p: 0.5,
                                // make the toggle slightly less bold/large
                                '& .MuiSvgIcon-root': { fontSize: 20, opacity: 0.95 }
                            }}
                        >
                            <DoubleArrowIcon sx={{ fontSize: 20 }} />
                        </IconButton>
                    </div>
                )
            })()}
            <nav aria-label="Main navigation" style={{ paddingTop: iconsTop ?? 48 }}>
                {links.map((l) => (
                    <NavLink
                        key={l.to}
                        to={l.to}
                        end={l.end}
                        style={({ isActive }) => {
                            const base = (baseLinkStyle as any)
                            const styleObj = isActive ? { ...base, ...activeStyle } : { ...base, color: '#fff' }
                            styleObj.justifyContent = collapsed ? 'center' : 'flex-start'
                            // Add a slightly larger gap above the Get Started item so it
                            // appears separated from the main navigation group.
                            if (l.to === '/get-started') styleObj.marginTop = 12
                            return styleObj
                        }}
                        onMouseEnter={(e) => handleMouseEnterLabel(e, l.label)}
                        onMouseLeave={handleMouseLeaveLabel}
                    >
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'inherit' }}>{l.icon}</span>
                        {!collapsed && (() => {
                            const labelStyle: React.CSSProperties = {
                                color: 'inherit',
                                // allow up to two lines, then clamp
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                WebkitLineClamp: 2 as any,
                                WebkitBoxOrient: 'vertical' as any,
                                display: '-webkit-box',
                                // leave some room for icon/padding
                                maxWidth: 120,
                                lineHeight: '1.1em',
                                maxHeight: `calc(1.1em * 2)`,
                            }
                            return <span style={labelStyle}>{l.label}</span>
                        })()}
                    </NavLink>
                ))}
            </nav>

            {collapsed && hoverLabel && (
                <div style={{ position: 'absolute', left: '100%', marginLeft: 8, top: hoverLabel.top, background: brandPurple, border: '1px solid rgba(255,255,255,0.08)', padding: '8px 12px', borderRadius: 6, boxShadow: '0 6px 18px rgba(0,0,0,0.08)', pointerEvents: 'none', whiteSpace: 'nowrap', color: '#fff', zIndex: 1400 }}>{hoverLabel.text}</div>
            )}

            <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, fontSize: 12, color: '#666', display: 'flex', justifyContent: 'center' }}>
                <div
                    role="button"
                    onClick={() => setReportOpen(true)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setReportOpen(true) }}
                    tabIndex={0}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        color: '#fff',
                        padding: '8px 10px',
                        borderRadius: 6,
                        justifyContent: 'center',
                    }}
                    onMouseEnter={(e) => handleMouseEnterLabel(e as any, 'Make JobTrack Better')}
                    onMouseLeave={handleMouseLeaveLabel}
                >
                    <LightbulbIcon />
                    {!collapsed && <span style={{ fontSize: 13 }}>Make JobTrack Better</span>}
                </div>
            </div>
            <IssueReportModal open={reportOpen} onClose={(created?: boolean, info?: any) => {
                // Close modal first
                setReportOpen(false)
                if (created && info) {
                    setSnackData(info)
                    setSnackOpen(true)
                } else if (created) {
                    setSnackOpen(true)
                }
            }} />
            <Snackbar open={snackOpen} autoHideDuration={8000} onClose={() => setSnackOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
                <MuiAlert elevation={6} variant="filled" onClose={() => setSnackOpen(false)} severity="success" sx={{ display: 'flex', alignItems: 'center' }}>
                    {snackData ? (
                        <span>Issue created — #{snackData.issue_number} (id: {snackData.issue_id})&nbsp;—&nbsp;<Link href={snackData.issue_url || '#'} target="_blank" rel="noreferrer">Open on GitHub</Link></span>
                    ) : (
                        'Issue created'
                    )}
                </MuiAlert>
            </Snackbar>
        </aside>
    )
}
