import React, { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import AppButton from '../Shared/AppButton'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import HandshakeIcon from '@mui/icons-material/Handshake'
import WideDialog from '../Shared/WideDialog'
import ContactsTable from '../Hub/ContactsTable'
// Avatar replaced by engagement count circle
// removed icon imports — keep cards simple
import type { Contact as ContactType } from '../../api/types'
import { BRAND_PURPLE, BRAND_PURPLE_LIGHT } from '../../constants/colors'

type Position = { x: number; y: number }

export default function ActionCanvasBoard({ contacts, onOpenEngagements, groupBy = 'none', organisations = [], sortBy = 'name', visibleContactIds, onSelectionChange, scale = 1, onContentHeightChange }: { contacts: any[]; onOpenEngagements?: (contactId: number, contactName?: string) => void; groupBy?: 'none' | 'sector' | 'organisation' | 'last_contact' | 'engagement_count' | 'contact_count'; organisations?: any[]; sortBy?: 'name' | 'organisation' | 'role' | 'last_contact' | 'engagement_count' | 'contact_count'; visibleContactIds?: Set<string> | undefined; onSelectionChange?: (ids: Set<string>) => void; scale?: number; onContentHeightChange?: (height: number) => void }) {
    const boardRef = useRef<HTMLDivElement | null>(null)
    const [positions, setPositions] = useState<Record<string, Position>>(() => {
        try {
            const raw = localStorage.getItem('action_canvas_positions')
            return raw ? JSON.parse(raw) : {}
        } catch (e) {
            return {}
        }
    })

    useEffect(() => {
        try { localStorage.setItem('action_canvas_positions', JSON.stringify(positions)) } catch (e) { /* ignore */ }
    }, [positions])

    // selection state for rubberband and selected ids
    const [selectedIds, setSelectedIdsState] = useState<Set<string>>(new Set())
    // wrapper so parent can be notified when selection changes
    function setSelectedIds(next: Set<string> | ((prev: Set<string>) => Set<string>)) {
        if (typeof next === 'function') {
            setSelectedIdsState((prev) => {
                const computed = (next as any)(prev)
                try { onSelectionChange && onSelectionChange(new Set(computed)) } catch (e) { /* ignore */ }
                return computed
            })
        } else {
            setSelectedIdsState(next)
            try { onSelectionChange && onSelectionChange(new Set(next)) } catch (e) { /* ignore */ }
        }
    }
    const [rubber, setRubber] = useState<{ startX: number; startY: number; x: number; y: number; visible: boolean } | null>(null)

    // contact modal state (opened from the per-card "more" button)
    const [contactModalOpen, setContactModalOpen] = useState(false)
    const [modalContactId, setModalContactId] = useState<number | null>(null)

    // dragging state for multi-drag
    const draggingRef = useRef<{ primaryId: string; originClientX: number; originClientY: number; originPositions: Record<string, Position>; ids: string[] } | null>(null)

    // card sizing and layout (standardised to sectors card size)
    const CARD_W = 240
    const CARD_H = 96
    const GAP_X = 20
    const GAP_Y = 20
    const [cols, setCols] = useState<number>(6)

    function onDragStart(e: React.DragEvent, id: string) {
        // prepare multi-drag if multiple selected
        const ids = selectedIds.has(id) ? Array.from(selectedIds) : [id]
        // Build origin positions from the currently rendered positions so dragging works when grouped
        const originPositions: Record<string, Position> = {}
        function getRenderedPosById(i: string) {
            const idx = displayContacts.findIndex((c: any) => String(c.contactid ?? c.id ?? c.leadid ?? '') === String(i))
            const defaultGridPos = { x: 16 + (idx % cols) * (CARD_W + GAP_X), y: 16 + Math.floor(idx / cols) * (CARD_H + GAP_Y) }
            return (positions[i] || groupedPositions[i] || defaultGridPos)
        }
        ids.forEach((i) => {
            originPositions[i] = getRenderedPosById(i)
        })
        draggingRef.current = { primaryId: id, originClientX: e.clientX, originClientY: e.clientY, originPositions, ids }
        try {
            e.dataTransfer.setData('application/json', JSON.stringify(ids))
        } catch (err) {
            e.dataTransfer.setData('text/plain', id)
        }
        // allow move
        e.dataTransfer.effectAllowed = 'move'
    }

    function onDrop(e: React.DragEvent) {
        e.preventDefault()
        const board = boardRef.current
        if (!board) return
        const rect = board.getBoundingClientRect()
        const clientX = e.clientX
        const clientY = e.clientY

        const dragInfo = draggingRef.current
        if (!dragInfo) return
        const { primaryId, originPositions, ids } = dragInfo
        const old = originPositions[primaryId] || { x: 0, y: 0 }
        const unscaledWidth = rect.width / scale
        const unscaledHeight = rect.height / scale
        const newX = Math.max(8, Math.min(unscaledWidth - CARD_W, (clientX - rect.left) / scale - CARD_W / 2))
        const newY = Math.max(8, Math.min(unscaledHeight - CARD_H, (clientY - rect.top) / scale - CARD_H / 2))
        const dx = newX - old.x
        const dy = newY - old.y
        setPositions((prev) => {
            const next = { ...prev }
            ids.forEach((i) => {
                const op = originPositions[i] || prev[i] || { x: 16, y: 16 }
                next[i] = { x: Math.max(8, Math.min(unscaledWidth - CARD_W, op.x + dx)), y: Math.max(8, Math.min(unscaledHeight - CARD_H, op.y + dy)) }
            })
            return next
        })
        draggingRef.current = null
    }

    function onDragOver(e: React.DragEvent) {
        e.preventDefault()
    }

    // compute number of columns based on available board width so layout adapts to container size
    useEffect(() => {
        function measureCols() {
            const b = boardRef.current
            if (!b) return
            try {
                const rect = b.getBoundingClientRect()
                const unscaled = rect.width / (scale || 1)
                // reserve some padding; compute number of columns that can fit
                const candidate = Math.max(1, Math.floor((unscaled - 32) / (CARD_W + GAP_X)))
                setCols(candidate)
            } catch (e) { }
        }
        measureCols()
        const ro = (window as any).ResizeObserver ? new (window as any).ResizeObserver(() => measureCols()) : null
        if (ro && boardRef.current) ro.observe(boardRef.current)
        window.addEventListener('resize', measureCols)
        return () => {
            try { if (ro && boardRef.current) ro.unobserve(boardRef.current) } catch (e) { }
            window.removeEventListener('resize', measureCols)
        }
    }, [scale])

    // ensure each contact has an initial position if not already present (only for none grouping)
    useEffect(() => {
        if (groupBy !== 'none') return
        setPositions((prev) => {
            const next = { ...prev }
            let changed = false
            // seed positions for displayed contacts
            const seedList = (visibleContactIds ? (contacts || []).filter((c: any) => visibleContactIds.has(String(c.contactid ?? c.id ?? c.leadid ?? ''))) : contacts) || []
            seedList.slice(0, 50).forEach((c, idx) => {
                const id = String(c.contactid ?? c.id ?? c.leadid ?? idx)
                if (!next[id]) {
                    // place in a simple grid
                    const col = idx % cols
                    const row = Math.floor(idx / cols)
                    next[id] = { x: 16 + col * (CARD_W + GAP_X), y: 16 + row * (CARD_H + GAP_Y) }
                    changed = true
                }
            })
            return changed ? next : prev
        })
    }, [contacts, groupBy, visibleContactIds, cols, sortBy])

    // apply sorting to contacts before layout
    const sortedContacts = React.useMemo(() => {
        const arr = (contacts || []).slice()
        function getName(c: any) {
            return (c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || '').toLowerCase()
        }
        function getOrgName(c: any) {
            return (c.current_organization || c.company || c.organisation || (() => {
                const orgId = Number(c.currentorgid ?? c.current_orgid ?? c.companyorgid ?? c.orgid ?? 0)
                const o = organisations.find((x: any) => Number(x.orgid) === orgId || Number(x.id) === orgId)
                return o ? (o.name ?? o.summary ?? '') : ''
            })() || '').toLowerCase()
        }
        function getRole(c: any) {
            return (c.role_type ?? c.role ?? c.currentrole ?? '').toLowerCase()
        }
        function getLastContactSort(c: any) {
            const raw = c.last_contact_date ?? c.last_contact ?? c.last_contacted ?? null
            const d = raw ? new Date(raw) : null
            return d && !isNaN(d.getTime()) ? d.getTime() : 0
        }
        function getEngCount(c: any) {
            return Number(c.engagement_count ?? c.engagements?.length ?? 0)
        }

        arr.sort((a: any, b: any) => {
            if (sortBy === 'name') return getName(a).localeCompare(getName(b))
            if (sortBy === 'organisation') return getOrgName(a).localeCompare(getOrgName(b))
            if (sortBy === 'role') return getRole(a).localeCompare(getRole(b))
            if (sortBy === 'last_contact') return getLastContactSort(b) - getLastContactSort(a) // recent first
            if (sortBy === 'engagement_count') return getEngCount(b) - getEngCount(a)
            return 0
        })
        return arr
    }, [contacts, sortBy, organisations])

    // filter contacts according to visibleContactIds (picker filter)
    const displayContacts = React.useMemo(() => {
        if (!visibleContactIds) return sortedContacts
        return (sortedContacts || []).filter((c: any) => {
            const id = String(c.contactid ?? c.id ?? c.leadid ?? '')
            return visibleContactIds.has(id)
        })
    }, [sortedContacts, visibleContactIds])

    // grouping layout: compute grouped positions when groupBy is active
    const groupedPositions: Record<string, Position> = {}
    const groupKeys: string[] = []
    if (groupBy && groupBy !== 'none') {
        const groups: Record<string, any[]> = {}
        function getKey(c: any) {
            if (groupBy === 'sector') {
                // Prefer sector from organisation mapping, fall back to contact sector fields
                const orgId = Number(c.currentorgid ?? c.current_orgid ?? c.companyorgid ?? c.orgid ?? c.currentorgid)
                if (orgId && organisations && organisations.length) {
                    const o = organisations.find((x: any) => Number(x.orgid) === orgId || Number(x.id) === orgId)
                    if (o) return o.sector_summary ?? o.sector_name ?? o.sector ?? o.sector_summary ?? (o.sectorid ? String(o.sectorid) : 'Unknown')
                }
                return c.sector_name ?? c.sector ?? 'Unknown'
            }
            if (groupBy === 'organisation') return c.current_organization ?? c.company ?? c.organisation ?? (c.currentorgid ? `Org ${c.currentorgid}` : 'Unknown')
            if (groupBy === 'last_contact') {
                // Group by YYYY-MM
                const raw = c.last_contact_date ?? c.last_contact ?? c.last_contacted ?? null
                if (!raw) return 'Never'
                try {
                    const d = new Date(raw)
                    if (isNaN(d.getTime())) return 'Never'
                    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                    return ym
                } catch (e) {
                    return 'Never'
                }
            }
            if (groupBy === 'engagement_count') return String(Number(c.engagement_count ?? c.engagements?.length ?? 0))
            return 'Unknown'
        }
        displayContacts.forEach((c: any) => {
            const key = getKey(c) || 'Unknown'
            if (!groups[key]) groups[key] = []
            groups[key].push(c)
        })
        // stable key ordering
        let keys = Object.keys(groups)
        // for last_contact we prefer most recent first
        if (groupBy === 'last_contact') keys.sort((a, b) => (a === 'Never' ? 1 : (b === 'Never' ? -1 : (a < b ? 1 : -1))))
        else if (groupBy === 'engagement_count') {
            // Order engagement_count groups from smallest to largest (0,1,2,...)
            keys = keys.sort((a, b) => Number(a) - Number(b))
        } else keys.sort()
        keys.forEach((k) => groupKeys.push(k))
        groupKeys.forEach((k, colIdx) => {
            const list = groups[k]
            list.forEach((c: any, rowIdx: number) => {
                const id = String(c.contactid ?? c.id ?? c.leadid ?? 0)
                groupedPositions[id] = { x: 16 + colIdx * (CARD_W + GAP_X), y: 48 + rowIdx * (CARD_H + GAP_Y) }
            })
        })
    }

    // Ensure cols is at least the number of groups when grouped view is active.
    React.useEffect(() => {
        try {
            if (groupBy && groupBy !== 'none' && groupKeys && groupKeys.length) {
                setCols((prev) => Math.max(prev, groupKeys.length))
            }
        } catch (e) { }
    }, [groupBy, groupKeys.length])

    // compute board size to fit more cards; allow scrolling when large
    // if grouped, compute rows based on largest group, and cols based on number of groups
    let rowsNeeded = Math.max(1, Math.ceil((contacts?.length || 0) / cols))
    let colsNeeded = cols
    if (groupBy && groupBy !== 'none' && groupKeys.length > 0) {
        colsNeeded = Math.max(1, groupKeys.length)
        const counts = groupKeys.map((k) => {
            const count = displayContacts.filter((c: any) => {
                if (groupBy === 'sector') return (c.sector_name ?? c.sector ?? 'Unknown') === k
                if (groupBy === 'organisation') return (c.current_organization ?? c.company ?? c.organisation ?? 'Unknown') === k
                if (groupBy === 'last_contact') return (c.last_contact_date ?? c.last_contact ?? 'Never') === k
                if (groupBy === 'engagement_count') return String(Number(c.engagement_count ?? c.engagements?.length ?? 0)) === k
                return false
            }).length
            return count
        })
        rowsNeeded = Math.max(1, Math.max(...counts))
    }
    const boardHeight = Math.max(420, rowsNeeded * (CARD_H + GAP_Y) + 96)

    // Calculate the actual content height based on rendered card positions
    const maxCardBottom = React.useMemo(() => {
        try {
            let maxB = 0
                ; (displayContacts || []).forEach((c: any, idx: number) => {
                    const id = String(c.contactid ?? c.id ?? c.leadid ?? idx)
                    const defaultGridPos = { x: 16 + (idx % cols) * (CARD_W + GAP_X), y: 16 + Math.floor(idx / cols) * (CARD_H + GAP_Y) }
                    const p = (positions[id] || groupedPositions[id] || defaultGridPos)
                    const bottom = (p?.y ?? 0) + CARD_H
                    if (bottom > maxB) maxB = bottom
                })
            return maxB
        } catch (e) { return boardHeight }
    }, [displayContacts, positions, groupedPositions, cols, CARD_H])

    const contentHeight = Math.max(boardHeight, (maxCardBottom || 0) + 48)

    // Notify parent about content height (scaled) so containers can adapt sizing
    React.useEffect(() => {
        try {
            if (onContentHeightChange) onContentHeightChange(contentHeight * (scale || 1))
        } catch (e) { /* ignore */ }
    }, [contentHeight, scale, onContentHeightChange])

    // Recalculate positions whenever grouping changes so all cards move
    // to their group-based or default grid locations. This intentionally
    // overwrites manual `positions` so switching `groupBy` yields a full
    // re-layout consistent with the selected grouping.
    useEffect(() => {
        setPositions(() => {
            const next: Record<string, Position> = {};
            (displayContacts || []).forEach((c: any, idx: number) => {
                const id = String(c.contactid ?? c.id ?? c.leadid ?? idx)
                const defaultGridPos = { x: 16 + (idx % cols) * (CARD_W + GAP_X), y: 16 + Math.floor(idx / cols) * (CARD_H + GAP_Y) }
                const p = (groupBy && groupBy !== 'none') ? (groupedPositions[id] || defaultGridPos) : defaultGridPos
                next[id] = p
            })
            return next
        })
    }, [groupBy, visibleContactIds, sortBy])

    // Rubberband handlers: start on mousedown on empty board
    useEffect(() => {
        function onMove(e: MouseEvent) {
            setRubber((r) => (r ? { ...r, x: e.clientX, y: e.clientY } : r))
        }
        function onUp(e: MouseEvent) {
            const r = rubber
            if (r && boardRef.current) {
                const rect = boardRef.current.getBoundingClientRect()
                const left = (Math.min(r.startX, r.x) - rect.left) / scale
                const top = (Math.min(r.startY, r.y) - rect.top) / scale
                const right = (Math.max(r.startX, r.x) - rect.left) / scale
                const bottom = (Math.max(r.startY, r.y) - rect.top) / scale
                const newlySelected: string[] = []
                // selection area may be outside board; clamp
                const sel = { left, top, right, bottom }
                // Use rendered positions (overrides or grouped positions) for selection
                displayContacts.forEach((c: any, idx: number) => {
                    const id = String(c.contactid ?? c.id ?? c.leadid ?? idx)
                    const defaultGridPos = { x: 16 + (idx % cols) * (CARD_W + GAP_X), y: 16 + Math.floor(idx / cols) * (CARD_H + GAP_Y) }
                    const p = (positions[id] || groupedPositions[id] || defaultGridPos)
                    const cardRect = { left: p.x, top: p.y, right: p.x + CARD_W, bottom: p.y + CARD_H }
                    const intersects = !(cardRect.left > sel.right || cardRect.right < sel.left || cardRect.top > sel.bottom || cardRect.bottom < sel.top)
                    if (intersects) newlySelected.push(id)
                })
                setSelectedIds(new Set(newlySelected))
            }
            setRubber(null)
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
        if (rubber) {
            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
        }
        return () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
    }, [rubber, positions])

    function handleBoardMouseDown(e: React.MouseEvent) {
        // only start rubberband if clicking the board itself (not a card)
        if (e.button !== 0) return
        if (e.target !== boardRef.current) return
        setRubber({ startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, visible: true })
        // clear previous selection unless shift is held
        if (!e.shiftKey) setSelectedIds(new Set())
    }

    function handleCardClick(e: React.MouseEvent, id: string) {
        e.stopPropagation()
        setSelectedIds((s) => {
            const next = new Set(s)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    return (
        <Box sx={{ mt: 3 }}>
            <Paper ref={boardRef} onMouseDown={handleBoardMouseDown} onDrop={onDrop} onDragOver={onDragOver} sx={{ position: 'relative', height: contentHeight * (scale || 1), overflow: 'auto', p: 1 }}>
                <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', minHeight: contentHeight }}>
                    {/* rubberband visual */}
                    {rubber && rubber.visible && boardRef.current ? (() => {
                        const rect = boardRef.current.getBoundingClientRect()
                        const left = (Math.min(rubber.startX, rubber.x) - rect.left) / scale
                        const top = (Math.min(rubber.startY, rubber.y) - rect.top) / scale
                        const width = Math.abs(rubber.x - rubber.startX) / scale
                        const height = Math.abs(rubber.y - rubber.startY) / scale
                        return <div style={{ position: 'absolute', left, top, width, height, background: 'rgba(63,0,113,0.12)', border: '1px dashed rgba(63,0,113,0.5)', pointerEvents: 'none', zIndex: 9999 }} />
                    })() : null}

                    {displayContacts.map((c: any, idx: number) => {
                        const id = String(c.contactid ?? c.id ?? c.leadid ?? idx)
                        const defaultGridPos = { x: 16 + (idx % cols) * (CARD_W + GAP_X), y: 16 + Math.floor(idx / cols) * (CARD_H + GAP_Y) }
                        // prefer manual overrides in `positions` first, then groupedPositions, then default grid
                        const pos = positions[id] || groupedPositions[id] || defaultGridPos
                        const name = c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || `Contact ${id}`
                        const roleText = (c.role_type ?? c.role ?? c.currentrole ?? '') as string
                        const isRecruiter = (roleText && String(roleText).toLowerCase().includes('recruiter'))
                        // Slightly stronger purple tint for recruiter cards
                        const recruiterBg = 'rgba(106,52,193,0.18)'
                        const nonRecruiterBg = undefined
                        const engagementCount = Number(c.engagement_count ?? c.engagements?.length ?? c.engagementCount ?? 0)
                        return (
                            <div
                                key={id}
                                draggable
                                onDragStart={(e) => onDragStart(e, id)}
                                onClick={(e) => handleCardClick(e, id)}
                                style={{
                                    position: 'absolute',
                                    left: pos.x,
                                    top: pos.y,
                                    width: CARD_W,
                                    height: CARD_H,
                                    cursor: 'grab',
                                    zIndex: 10,
                                }}
                            >
                                <Paper
                                    elevation={6}
                                    sx={{
                                        p: 1.5,
                                        display: 'flex',
                                        gap: 1,
                                        alignItems: 'flex-start',
                                        height: '100%',
                                        boxSizing: 'border-box',
                                        border: selectedIds.has(id) ? '2px solid rgba(94,6,187,0.16)' : '1px solid rgba(0,0,0,0.06)',
                                        borderRadius: '8px',
                                        boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
                                        transition: 'transform 150ms ease, box-shadow 150ms ease',
                                        '&:hover': { transform: 'translateY(-6px)', boxShadow: '0 14px 36px rgba(0,0,0,0.14)' },
                                        backgroundColor: selectedIds.has(id) ? 'rgba(94, 6, 187, 0.06)' : (isRecruiter ? recruiterBg : '#fff'),
                                    }}
                                >
                                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                                        <AppButton size="small" colorScheme="white" onClick={(e: any) => { e.stopPropagation(); onOpenEngagements && onOpenEngagements(Number(c.contactid ?? c.id ?? c.leadid ?? idx), name) }}>
                                            <HandshakeIcon fontSize="small" sx={{ mr: 0.5 }} />
                                            <span>{engagementCount}</span>
                                        </AppButton>
                                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setModalContactId(Number(c.contactid ?? c.id ?? c.leadid ?? idx)); setContactModalOpen(true); }}>
                                            <MoreHorizIcon fontSize="small" />
                                        </IconButton>
                                    </Box>
                                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, gap: 2 }}>
                                        <Typography variant="body2" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>{name}</Typography>
                                        {roleText ? <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{roleText}</Typography> : null}
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.current_organization ?? ''}</Typography>
                                    </div>
                                </Paper>
                            </div>
                        )
                    })}
                    {/* render group headers when grouped */}
                    {groupBy && groupBy !== 'none' && groupKeys.map((k, colIdx) => (
                        <div key={`hdr-${colIdx}`} style={{ position: 'absolute', left: 16 + colIdx * (CARD_W + GAP_X), top: 8, width: CARD_W }}>
                            <Paper elevation={1} sx={{ p: 0.5 }}>
                                <Typography variant="caption">{k}</Typography>
                            </Paper>
                        </div>
                    ))}
                </div>
            </Paper>
            <WideDialog open={contactModalOpen} onClose={() => { setContactModalOpen(false); setModalContactId(null) }} fullWidth fitToContent>
                <DialogTitle>Contact details</DialogTitle>
                <DialogContent dividers>
                    <div style={{ padding: 12, minWidth: 480 }}>
                        {modalContactId ? <ContactsTable onlyIds={[Number(modalContactId)]} inModal={true} /> : null}
                    </div>
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                    <AppButton colorScheme="white" onClick={() => { setContactModalOpen(false); setModalContactId(null) }}>Close</AppButton>
                </DialogActions>
            </WideDialog>
        </Box>
    )
}
