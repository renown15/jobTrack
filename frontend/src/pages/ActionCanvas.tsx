import React from 'react'
import Box from '@mui/material/Box'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Typography from '@mui/material/Typography'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import ActionList from '../components/ActionCanvas/ActionList'
import ActionCanvasBoard from '../components/ActionCanvas/ActionCanvasBoard'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
// Box already imported above
import { ACCORDION_TITLE_SX, ACCORDION_TITLE_VARIANT } from '../constants/ui'
import WideDialog from '../components/Shared/WideDialog'
import EngagementsTable from '../components/Hub/EngagementsTable'
import ContactsTable from '../components/Hub/ContactsTable'
import OrganisationsTable from '../components/Hub/OrganisationsTable'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Menu from '@mui/material/Menu'
import Stack from '@mui/material/Stack'
import Fab from '@mui/material/Fab'
import Badge from '@mui/material/Badge'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import IconButton from '@mui/material/IconButton'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import PeopleAltIcon from '@mui/icons-material/PeopleAlt'
import BusinessIcon from '@mui/icons-material/Business'
import { useTheme } from '@mui/material/styles'
import { createPortal } from 'react-dom'
import { useState } from 'react'
import AppButton from '../components/Shared/AppButton'
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd'
import { fetchTasks, fetchAllContacts, fetchOrganisations, fetchTaskTargets, addTaskTarget, fetchReferenceData, fetchSectors } from '../api/client'
import type { Task } from '../api/types'

export default function ActionCanvas() {
    const navigate = useNavigate()
    const { data: tasks = [] } = useQuery<Task[]>(['tasks'], () => fetchTasks())
    const { data: contacts = [] } = useQuery(['contacts', 'all'], () => fetchAllContacts())
    const { data: organisations = [] } = useQuery(['organisations', 'all'], () => fetchOrganisations())
    const [activeTab, setActiveTab] = useState<'contacts' | 'organisations' | 'sectors'>('contacts')
    const { data: sectors = [] } = useQuery(['sectors', 'all'], () => fetchSectors())

    const [groupBy, setGroupBy] = useState<'none' | 'sector' | 'organisation' | 'last_contact' | 'engagement_count' | 'contact_count'>('none')
    const [sortBy, setSortBy] = useState<'name' | 'organisation' | 'role' | 'last_contact' | 'engagement_count' | 'contact_count'>('name')
    const [scale, setScale] = useState<number>(1)
    const [activePanelHeight, setActivePanelHeight] = useState<number | null>(null)

    function zoomIn() { setScale((s) => Math.min(2, +(s + 0.1).toFixed(2))) }
    function zoomOut() { setScale((s) => Math.max(0.5, +(s - 0.1).toFixed(2))) }
    function resetZoom() { setScale(1) }

    // multi-select: 'unmapped' or task ids
    const [taskFilter, setTaskFilter] = useState<Array<'unmapped' | number>>(['unmapped'])
    const [targetsByTaskLocal, setTargetsByTaskLocal] = useState<Record<number, any[]>>({})
    const [allMappedContactIds, setAllMappedContactIds] = useState<Set<string>>(new Set())

    // preload targets for all tasks so 'unmapped' can be computed quickly
    React.useEffect(() => {
        if (!tasks || tasks.length === 0) return
        void Promise.all(tasks.map(async (t) => {
            try { const tid = Number(t.taskid ?? t.id ?? 0); const targs = await fetchTaskTargets(tid); return [tid, targs] as [number, any[]] } catch (e) { const tid = Number(t.taskid ?? t.id ?? 0); return [tid, []] as [number, any[]] }
        })).then((entries) => {
            const map: Record<number, any[]> = {}
            const all = new Set<string>()
            entries.forEach(([id, arr]) => { map[id] = arr; arr.forEach((tg) => all.add(String(tg.targetid))) })
            setTargetsByTaskLocal(map)
            setAllMappedContactIds(all)
        })
    }, [tasks])

    const [countModalOpen, setCountModalOpen] = useState(false)
    const [countModalContactId, setCountModalContactId] = useState<number | null>(null)
    const [countModalContactName, setCountModalContactName] = useState<string | null>(null)

    function openEngagements(contactId: number, contactName?: string) {
        setCountModalContactId(contactId)
        setCountModalContactName(contactName ?? null)
        setCountModalOpen(true)
    }

    function closeEngagements() {
        setCountModalOpen(false)
        setCountModalContactId(null)
        setCountModalContactName(null)
    }

    // selection state reported by the board
    const [selectedIdsLocal, setSelectedIdsLocal] = useState<Set<string>>(new Set())
    const [orgContactsModalOpen, setOrgContactsModalOpen] = useState(false)
    const [orgContactsModalOrg, setOrgContactsModalOrg] = useState<any | null>(null)
    const [orgDetailsModalOpen, setOrgDetailsModalOpen] = useState(false)
    const [orgDetailsModalOrg, setOrgDetailsModalOrg] = useState<any | null>(null)
    const [sectorOrgsModalOpen, setSectorOrgsModalOpen] = useState(false)
    const [sectorOrgsModalSector, setSectorOrgsModalSector] = useState<any | null>(null)
    const [selectedAttachTaskId, setSelectedAttachTaskId] = useState<number | ''>('')
    const [attachLoading, setAttachLoading] = useState(false)
    const [contactTargetRefId, setContactTargetRefId] = useState<number | null>(null)
    const [fabPanelOpen, setFabPanelOpen] = useState(false)
    const [taskPickOpen, setTaskPickOpen] = useState(false)
    const fabRef = React.useRef<HTMLButtonElement | null>(null)
    const theme = useTheme()
    const [searchQuery, setSearchQuery] = useState<string>('')



    function openOrgContactsModal(org: any) {
        setOrgContactsModalOrg(org)
        setOrgContactsModalOpen(true)
    }

    function closeOrgContactsModal() {
        setOrgContactsModalOpen(false)
        setOrgContactsModalOrg(null)
    }

    function openOrgDetailsModal(org: any) {
        setOrgDetailsModalOrg(org)
        setOrgDetailsModalOpen(true)
    }

    function closeOrgDetailsModal() {
        setOrgDetailsModalOpen(false)
        setOrgDetailsModalOrg(null)
    }

    function openSectorOrgsModal(sector: any) {
        setSectorOrgsModalSector(sector)
        setSectorOrgsModalOpen(true)
    }

    function closeSectorOrgsModal() {
        setSectorOrgsModalOpen(false)
        setSectorOrgsModalSector(null)
    }

    // NOTE: debug overlays are opt-in; do not force them on by default.

    // debug state tracing
    React.useEffect(() => {
        try {
            console.debug('ActionCanvas: state trace -> taskPickOpen=', taskPickOpen, 'activeTab=', activeTab)
        } catch (e) { }
    }, [taskPickOpen, activeTab])

    // clear selection when switching tabs
    React.useEffect(() => {
        setSelectedIdsLocal(new Set())
    }, [activeTab])

    // Ensure `groupBy` is valid for the active tab; if not, reset to 'none'.
    React.useEffect(() => {
        try {
            const isValid = (() => {
                if (!groupBy || groupBy === 'none') return true
                // 'organisation' grouping is not valid when viewing organisations or sectors
                if (groupBy === 'organisation' && (activeTab === 'organisations' || activeTab === 'sectors')) return false
                // 'contact_count' grouping is not valid when viewing contacts
                if (groupBy === 'contact_count' && activeTab === 'contacts') return false
                return true
            })()
            if (!isValid) setGroupBy('none')
        } catch (e) { }
    }, [activeTab, groupBy])

    /* Custom menu rendered into document.body and positioned relative to the FAB.
       Built from scratch rather than reusing previous Popper/Menu logic. */
    function CustomTaskMenu(props: { open: boolean; anchorRef: React.RefObject<HTMLElement>; tasks: any[]; onClose: () => void; onSelect: (taskId: number) => void }) {
        const { open, anchorRef, tasks, onClose, onSelect } = props
        const menuRef = React.useRef<HTMLDivElement | null>(null)
        const [pos, setPos] = React.useState<{ right: number; bottom: number } | null>(null)

        React.useEffect(() => {
            if (!open) return
            const node = anchorRef.current
            if (!node) return
            const r = node.getBoundingClientRect()
            // anchor menu: right aligned to FAB right, bottom attached to FAB top
            const right = Math.max(8, Math.round(window.innerWidth - r.right))
            const bottom = Math.max(8, Math.round(window.innerHeight - r.top + 8))
            setPos({ right, bottom })
        }, [open, anchorRef])

        React.useEffect(() => {
            if (!open) return
            function onDocPointer(e: PointerEvent) {
                try {
                    const m = menuRef.current
                    const a = anchorRef.current
                    const target = e.target as Node | null
                    if (!m) return
                    if (m.contains(target)) return
                    if (a && a.contains && a.contains(target)) return
                    onClose()
                } catch (err) { onClose() }
            }
            document.addEventListener('pointerdown', onDocPointer, true)
            return () => document.removeEventListener('pointerdown', onDocPointer, true)
        }, [open, anchorRef, onClose])

        if (!open || !pos) return null

        const menu = (
            <div ref={menuRef} style={{ position: 'fixed', right: pos.right, bottom: pos.bottom, zIndex: 2147483647, minWidth: 360 }}>
                <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', fontWeight: 700, fontSize: 16, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>Choose action</div>
                    <div style={{ maxHeight: 360, overflow: 'auto' }}>
                        {tasks.map((t) => (
                            <button key={t.taskid} onClick={() => onSelect(t.taskid)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 0, background: 'transparent', cursor: 'pointer', fontSize: 15, lineHeight: '1.4' }}>{t.name}</button>
                        ))}
                    </div>
                </div>
            </div>
        )

        try { return createPortal(menu, document.body) } catch (e) { return menu }
    }

    // no mount-timer cleanup required after simplifying panel mounting

    // Debug overlays removed — no automatic stylesheet injection.

    // load target-type refdata to discover the contact target ref id
    React.useEffect(() => {
        let mounted = true
        void (async () => {
            try {
                const rd = await fetchReferenceData('action_plan_target_type')
                if (!mounted) return
                const found = (rd || []).find((r: any) => String(r.refvalue || '').toLowerCase().includes('contact'))
                setContactTargetRefId(found?.refid ?? null)
            } catch (e) {
                // ignore
            }
        })()
        return () => { mounted = false }
    }, [])

    async function attachSelectedToTask() {
        if (!selectedAttachTaskId) return
        if (!contactTargetRefId) {
            console.warn('No contact target ref id available; cannot attach')
            return
        }
        const ids = Array.from(selectedIdsLocal || [])
        if (!ids.length) return
        setAttachLoading(true)
        try {
            for (const sid of ids) {
                const targetid = Number(sid)
                if (!Number.isFinite(targetid)) continue
                try { await addTaskTarget(Number(selectedAttachTaskId), { targettype: Number(contactTargetRefId), targetid }) } catch (e) { /* ignore per-item errors */ }
            }
            // refresh targets for the attached task
            await fetchAndMergeTargets([Number(selectedAttachTaskId)])
        } finally {
            setAttachLoading(false)
        }
    }

    // attach to a specific task id directly (used by the FAB menu)
    async function attachSelectedToTaskId(taskId: number) {
        if (!taskId) return
        if (!contactTargetRefId) {
            console.warn('No contact target ref id available; cannot attach')
            return
        }
        const ids = Array.from(selectedIdsLocal || [])
        if (!ids.length) return
        setAttachLoading(true)
        try {
            for (const sid of ids) {
                const targetid = Number(sid)
                if (!Number.isFinite(targetid)) continue
                try { await addTaskTarget(Number(taskId), { targettype: Number(contactTargetRefId), targetid }) } catch (e) { /* ignore per-item errors */ }
            }
            await fetchAndMergeTargets([Number(taskId)])
        } finally {
            setAttachLoading(false)
        }
    }

    // helper to fetch targets for a list of task ids and merge into local state
    async function fetchAndMergeTargets(taskIds: number[]) {
        if (!taskIds || !taskIds.length) return
        const entries = await Promise.all(taskIds.map(async (tid) => {
            try { const targs = await fetchTaskTargets(tid); return [tid, targs] as [number, any[]] } catch (e) { return [tid, []] as [number, any[]] }
        }))
        setTargetsByTaskLocal((s) => {
            const next = { ...s }
            entries.forEach(([id, arr]) => { next[id] = arr })
            return next
        })
        setAllMappedContactIds((prev) => {
            const next = new Set<string>(Array.from(prev || []))
            entries.forEach(([, arr]) => arr.forEach((tg: any) => next.add(String(tg.targetid))))
            return next
        })
    }

    // compute visible contact ids from the multi-select filter
    const visibleContactIds = React.useMemo(() => {
        const selected = taskFilter || []

        // No filter selected => show all contacts
        if (!selected || (Array.isArray(selected) && selected.length === 0)) {
            return new Set((contacts || []).map((c: any) => String(c.contactid ?? c.id ?? c.leadid ?? '')))
        }

        const visible = new Set<string>()
        const mapped = allMappedContactIds instanceof Set ? allMappedContactIds : new Set<string>()

        if (selected.includes('unmapped')) {
            ; (contacts || []).forEach((c: any) => {
                const id = String(c.contactid ?? c.id ?? c.leadid ?? '')
                if (!mapped.has(id)) visible.add(id)
            })
        }

        selected.forEach((v) => {
            if (v !== 'unmapped') {
                const tid = Number(v)
                const targs = targetsByTaskLocal[tid]
                if (targs && targs.length) targs.forEach((tg: any) => visible.add(String(tg.targetid)))
            }
        })

        return visible
    }, [taskFilter, targetsByTaskLocal, allMappedContactIds, contacts])

    // compute displayed contacts after applying the search filter
    const displayedContacts = React.useMemo(() => {
        const q = String(searchQuery || '').trim().toLowerCase()
        if (!q) return (contacts || [])
        return (contacts || []).filter((c: any) => {
            try {
                const name = String(c.name || c.display_name || c.full_name || c.firstname || '').toLowerCase()
                const org = String(c.organisation_name || c.currentorgname || c.currentorg || '').toLowerCase()
                const role = String(c.role || c.jobtitle || c.title || '').toLowerCase()
                return name.includes(q) || org.includes(q) || role.includes(q)
            } catch (e) { return false }
        })
    }, [contacts, searchQuery])

    const displayedVisibleContactIds = React.useMemo(() => {
        try {
            const set = new Set<string>(Array.from(visibleContactIds || []))
            if (!searchQuery) return set
            const idsInDisplay = new Set((displayedContacts || []).map((c: any) => String(c.contactid ?? c.id ?? c.leadid ?? '')))
            return new Set(Array.from(set).filter((id) => idsInDisplay.has(id)))
        } catch (e) { return visibleContactIds }
    }, [visibleContactIds, displayedContacts, searchQuery])

    // ---- organisation & sector positions (contacts-style absolute positions) ----
    const ORG_CARD_W = 240
    const ORG_CARD_H = 96
    const GAP_X = 20
    const GAP_Y = 20

    function computeExplicitHeight(items: any[], positions: Record<string, { x: number; y: number }>, cols: number) {
        try {
            let maxY = 0
                ; (items || []).forEach((it: any, idx: number) => {
                    const id = String(it.orgid ?? it.id ?? it.sectorid ?? '')
                    const defaultY = 16 + Math.floor(idx / (cols || 1)) * (ORG_CARD_H + GAP_Y)
                    const y = (positions && positions[id] && typeof positions[id].y === 'number') ? positions[id].y : defaultY
                    if (typeof y === 'number') maxY = Math.max(maxY, y)
                })
            return Math.max(420, maxY + ORG_CARD_H + 48)
        } catch (e) { return 420 }
    }

    const [orgPositions, setOrgPositions] = useState<Record<string, { x: number; y: number }>>(() => {
        try { const raw = localStorage.getItem('action_canvas_org_positions'); return raw ? JSON.parse(raw) : {} } catch (e) { return {} }
    })
    const [sectorPositions, setSectorPositions] = useState<Record<string, { x: number; y: number }>>(() => {
        try { const raw = localStorage.getItem('action_canvas_sector_positions'); return raw ? JSON.parse(raw) : {} } catch (e) { return {} }
    })

    const orgPanelRef = React.useRef<HTMLDivElement | null>(null)
    const sectorPanelRef = React.useRef<HTMLDivElement | null>(null)
    const [orgCols, setOrgCols] = useState<number>(6)
    const [sectorCols, setSectorCols] = useState<number>(6)

    React.useEffect(() => {
        function measureOrg() {
            const el = orgPanelRef.current
            if (!el) return
            try {
                const rect = el.getBoundingClientRect()
                const unscaled = rect.width
                const candidate = Math.max(1, Math.floor((unscaled - 32) / (ORG_CARD_W + 12)))
                setOrgCols(candidate)
            } catch (e) { }
        }
        measureOrg()
        const ro = (window as any).ResizeObserver ? new (window as any).ResizeObserver(measureOrg) : null
        if (ro && orgPanelRef.current) ro.observe(orgPanelRef.current)
        window.addEventListener('resize', measureOrg)
        return () => { try { if (ro && orgPanelRef.current) ro.unobserve(orgPanelRef.current) } catch (e) { } window.removeEventListener('resize', measureOrg) }
    }, [organisations])

    React.useEffect(() => {
        function measureSector() {
            const el = sectorPanelRef.current
            if (!el) return
            try {
                const rect = el.getBoundingClientRect()
                const unscaled = rect.width
                const candidate = Math.max(1, Math.floor((unscaled - 32) / (ORG_CARD_W + 12)))
                setSectorCols(candidate)
            } catch (e) { }
        }
        measureSector()
        const ro = (window as any).ResizeObserver ? new (window as any).ResizeObserver(measureSector) : null
        if (ro && sectorPanelRef.current) ro.observe(sectorPanelRef.current)
        window.addEventListener('resize', measureSector)
        return () => { try { if (ro && sectorPanelRef.current) ro.unobserve(sectorPanelRef.current) } catch (e) { } window.removeEventListener('resize', measureSector) }
    }, [sectors])

    // seed org positions when organisations list changes
    React.useEffect(() => {
        setOrgPositions((prev) => {
            const next = { ...prev }
            let changed = false
            const list = organisations || []
            list.slice(0, 200).forEach((org: any, idx: number) => {
                const id = String(org.orgid ?? org.id ?? '')
                if (!next[id]) {
                    const col = idx % (orgCols || 1)
                    const row = Math.floor(idx / (orgCols || 1))
                    next[id] = { x: 16 + col * (ORG_CARD_W + GAP_X), y: 16 + row * (ORG_CARD_H + GAP_Y) }
                    changed = true
                }
            })
            if (changed) try { localStorage.setItem('action_canvas_org_positions', JSON.stringify(next)) } catch (e) { }
            return next
        })
    }, [organisations, orgCols])

    // recompute org positions when grouping or columns change so cards reflow between views
    React.useEffect(() => {
        try {
            let visibleOrgs = (organisations || []).filter((org: any) => {
                const q = String(searchQuery || '').trim().toLowerCase()
                if (!q) return true
                try {
                    const name = String(org.name || '').toLowerCase()
                    const sector = String(org.sector_summary || org.sector_name || '').toLowerCase()
                    return name.includes(q) || sector.includes(q)
                } catch (e) { return false }
            })

            // Apply sorting to organisations canvas based on `sortBy` selection
            try {
                visibleOrgs = visibleOrgs.slice()
                function getOrgLastContact(org: any) {
                    try {
                        const orgId = Number(org.orgid ?? org.id ?? 0)
                        let max = 0
                            ; (contacts || []).forEach((c: any) => {
                                const cid = Number(c.currentorgid ?? c.current_orgid ?? c.companyorgid ?? c.orgid ?? 0)
                                if (cid !== orgId) return
                                const raw = c.last_contact_date ?? c.last_contact ?? c.last_contacted ?? c.reviewdate ?? null
                                if (!raw) return
                                const t = new Date(raw).getTime()
                                if (!isNaN(t) && t > max) max = t
                            })
                        return max
                    } catch (e) { return 0 }
                }
                if (sortBy === 'name') visibleOrgs.sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')))
                else if (sortBy === 'contact_count') visibleOrgs.sort((a: any, b: any) => (Number(b.contacts_count ?? 0) - Number(a.contacts_count ?? 0)))
                else if (sortBy === 'engagement_count') visibleOrgs.sort((a: any, b: any) => (Number(b.engagement_count ?? 0) - Number(a.engagement_count ?? 0)))
                else if (sortBy === 'last_contact') visibleOrgs.sort((a: any, b: any) => getOrgLastContact(b) - getOrgLastContact(a))
            } catch (e) { }

            // build groups same as render logic
            const groups: Record<string, any[]> = {}
            // local helpers for robust contact/org matching
            function contactOrgId(c: any) { return Number(c.currentorgid ?? c.current_orgid ?? c.companyorgid ?? c.orgid ?? 0) }
            function contactEngagements(c: any) { return Number(c.engagement_count ?? c.engagements?.length ?? c.engagementCount ?? 0) || 0 }

            visibleOrgs.forEach((org: any) => {
                let key = 'All'
                if (groupBy === 'sector') key = org.sector_summary || org.sector_name || 'Unspecified'
                else if (groupBy === 'contact_count') {
                    const orgId = Number(org.orgid ?? org.id ?? 0)
                    const cnt = (contacts || []).filter((c: any) => contactOrgId(c) === orgId).length
                    key = String(Number(org.contacts_count ?? cnt ?? 0))
                } else if (groupBy === 'engagement_count') {
                    const orgId = Number(org.orgid ?? org.id ?? 0)
                    const cnt = (contacts || []).filter((c: any) => contactOrgId(c) === orgId).reduce((acc, c) => acc + contactEngagements(c), 0)
                    key = String(Number(org.engagement_count ?? cnt ?? 0))
                } else if (groupBy === 'last_contact') {
                    // find latest contact month for org
                    const orgId = Number(org.orgid ?? org.id ?? 0)
                    let maxDate: string | null = null
                        ; (contacts || []).forEach((c: any) => {
                            try {
                                if (Number(c.currentorgid) === orgId) {
                                    const raw = c.last_contact_date ?? c.last_contact ?? c.last_contacted ?? c.reviewdate ?? null
                                    if (!raw) return
                                    const d = new Date(raw)
                                    if (isNaN(d.getTime())) return
                                    const iso = d.toISOString().slice(0, 10)
                                    if (!maxDate || iso > maxDate) maxDate = iso
                                }
                            } catch (e) { }
                        })
                    key = maxDate ? (maxDate as string).slice(0, 7) : 'Never'
                }
                if (!groups[key]) groups[key] = []
                groups[key].push(org)
            })

            // compute ordered keys
            let groupKeys = Object.keys(groups || {})
            if (groupBy === 'contact_count' || groupBy === 'engagement_count') {
                groupKeys = groupKeys.map((k) => ({ k, n: Number(k) || 0 })).sort((a, b) => a.n - b.n).map(x => x.k)
            } else if (groupBy === 'last_contact') {
                groupKeys = groupKeys.sort((a, b) => {
                    if (a === 'Never') return 1
                    if (b === 'Never') return -1
                    return a < b ? -1 : a > b ? 1 : 0
                })
            } else {
                groupKeys = groupKeys.sort()
            }

            // build next positions
            const next: Record<string, { x: number; y: number }> = {}
            if (!groupBy || groupBy === 'none') {
                visibleOrgs.forEach((org: any, idx: number) => {
                    const id = String(org.orgid ?? org.id ?? '')
                    const col = idx % (orgCols || 1)
                    const row = Math.floor(idx / (orgCols || 1))
                    next[id] = { x: 16 + col * (ORG_CARD_W + GAP_X), y: 16 + row * (ORG_CARD_H + GAP_Y) }
                })
            } else {
                groupKeys.forEach((k, colIdx) => {
                    const list = groups[k] || []
                    list.forEach((org: any, rowIdx: number) => {
                        const id = String(org.orgid ?? org.id ?? '')
                        next[id] = { x: 16 + colIdx * (ORG_CARD_W + GAP_X), y: 48 + rowIdx * (ORG_CARD_H + GAP_Y) }
                    })
                })
            }

            setOrgPositions((prev) => {
                try { localStorage.setItem('action_canvas_org_positions', JSON.stringify(next)) } catch (e) { }
                return next
            })
        } catch (e) { /* ignore */ }
    }, [groupBy, organisations, orgCols, contacts, searchQuery, sortBy])

    // seed sector positions
    React.useEffect(() => {
        setSectorPositions((prev) => {
            const next = { ...prev }
            let changed = false
            const list = sectors || []
            list.slice(0, 200).forEach((s: any, idx: number) => {
                const id = String(s.sectorid ?? s.id ?? '')
                if (!next[id]) {
                    const col = idx % (sectorCols || 1)
                    const row = Math.floor(idx / (sectorCols || 1))
                    next[id] = { x: 16 + col * (ORG_CARD_W + GAP_X), y: 16 + row * (ORG_CARD_H + GAP_Y) }
                    changed = true
                }
            })
            if (changed) try { localStorage.setItem('action_canvas_sector_positions', JSON.stringify(next)) } catch (e) { }
            return next
        })
    }, [sectors, sectorCols])

    // recompute sector positions when grouping or columns change so sector cards reflow between views
    React.useEffect(() => {
        try {
            let visibleSectors = (sectors || []).filter((s: any) => {
                const q = String(searchQuery || '').trim().toLowerCase()
                if (!q) return true
                try {
                    const name = String(s.name || s.sector_summary || s.sector_name || '').toLowerCase()
                    return name.includes(q)
                } catch (e) { return false }
            })

            // apply sorting to sectors so positions follow sort order
            try {
                if (sortBy === 'name') {
                    visibleSectors = visibleSectors.slice().sort((a: any, b: any) => String((a.name || a.summary) || '').localeCompare(String((b.name || b.summary) || '')))
                } else if (sortBy === 'contact_count' || sortBy === 'engagement_count' || sortBy === 'last_contact') {
                    const sectorAgg: Record<string, { contacts: number; engagements: number; lastContact: number }> = {}
                        ; (organisations || []).forEach((o: any) => {
                            const sname = String(o.sector_summary || o.sector_name || '').trim() || String(o.sectorid || '')
                            const orgId = Number(o.orgid ?? o.id ?? 0)
                            if (!sectorAgg[sname]) sectorAgg[sname] = { contacts: 0, engagements: 0, lastContact: 0 }
                            const orgContacts = (contacts || []).filter((c: any) => Number(c.currentorgid ?? c.current_orgid ?? c.companyorgid ?? c.orgid ?? 0) === orgId)
                            sectorAgg[sname].contacts += orgContacts.length
                            sectorAgg[sname].engagements += orgContacts.reduce((acc: number, c: any) => acc + Number(c.engagement_count ?? c.engagements?.length ?? 0), 0)
                            orgContacts.forEach((c: any) => {
                                const raw = c.last_contact_date ?? c.last_contact ?? c.last_contacted ?? null
                                if (!raw) return
                                const t = new Date(raw).getTime()
                                if (!isNaN(t) && t > sectorAgg[sname].lastContact) sectorAgg[sname].lastContact = t
                            })
                        })
                    if (sortBy === 'contact_count') visibleSectors = visibleSectors.slice().sort((a: any, b: any) => (sectorAgg[String(b.name || b.summary || '')]?.contacts || 0) - (sectorAgg[String(a.name || a.summary || '')]?.contacts || 0))
                    else if (sortBy === 'engagement_count') visibleSectors = visibleSectors.slice().sort((a: any, b: any) => (sectorAgg[String(b.name || b.summary || '')]?.engagements || 0) - (sectorAgg[String(a.name || a.summary || '')]?.engagements || 0))
                    else if (sortBy === 'last_contact') visibleSectors = visibleSectors.slice().sort((a: any, b: any) => (sectorAgg[String(b.name || b.summary || '')]?.lastContact || 0) - (sectorAgg[String(a.name || a.summary || '')]?.lastContact || 0))
                }
            } catch (e) { }

            // build groups for sectors based on aggregated org->contact metrics
            const groups: Record<string, any[]> = {}

            function contactOrgId(c: any) { return Number(c.currentorgid ?? c.current_orgid ?? c.companyorgid ?? c.orgid ?? 0) }
            function contactEngagements(c: any) { return Number(c.engagement_count ?? c.engagements?.length ?? c.engagementCount ?? 0) || 0 }

            visibleSectors.forEach((sec: any) => {
                let key = 'All'
                const sectorName = String(sec.name || sec.sector_summary || sec.sector_name || '').trim()

                if (groupBy === 'sector') {
                    key = sectorName || 'Unspecified'
                } else if (groupBy === 'contact_count') {
                    // sum contacts across organisations that belong to this sector
                    const matchingOrgs = (organisations || []).filter((o: any) => {
                        const oname = String(o.sector_summary || o.sector_name || '').trim()
                        return oname.toLowerCase() === sectorName.toLowerCase()
                    })
                    const cnt = matchingOrgs.reduce((acc: number, o: any) => {
                        const orgId = Number(o.orgid ?? o.id ?? 0)
                        const c = (contacts || []).filter((c2: any) => contactOrgId(c2) === orgId).length
                        return acc + (Number(o.contacts_count ?? c ?? 0) || 0)
                    }, 0)
                    key = String(cnt)
                } else if (groupBy === 'engagement_count') {
                    const matchingOrgs = (organisations || []).filter((o: any) => {
                        const oname = String(o.sector_summary || o.sector_name || '').trim()
                        return oname.toLowerCase() === sectorName.toLowerCase()
                    })
                    const cnt = matchingOrgs.reduce((acc: number, o: any) => {
                        const orgId = Number(o.orgid ?? o.id ?? 0)
                        const csum = (contacts || []).filter((c2: any) => contactOrgId(c2) === orgId).reduce((a: number, c3: any) => a + contactEngagements(c3), 0)
                        return acc + (Number(o.engagement_count ?? csum ?? 0) || 0)
                    }, 0)
                    key = String(cnt)
                } else if (groupBy === 'last_contact') {
                    // latest contact month across orgs in this sector
                    const matchingOrgs = (organisations || []).filter((o: any) => {
                        const oname = String(o.sector_summary || o.sector_name || '').trim()
                        return oname.toLowerCase() === sectorName.toLowerCase()
                    })
                    let maxDate: string | null = null
                    matchingOrgs.forEach((o: any) => {
                        const orgId = Number(o.orgid ?? o.id ?? 0);
                        ; (contacts || []).forEach((c: any) => {
                            try {
                                if (contactOrgId(c) === orgId) {
                                    const raw = c.last_contact_date ?? c.last_contact ?? c.last_contacted ?? c.reviewdate ?? null
                                    if (!raw) return
                                    const d = new Date(raw)
                                    if (isNaN(d.getTime())) return
                                    const iso = d.toISOString().slice(0, 10)
                                    if (!maxDate || iso > maxDate) maxDate = iso
                                }
                            } catch (e) { }
                        })
                    })
                    key = maxDate ? (maxDate as string).slice(0, 7) : 'Never'
                }

                if (!groups[key]) groups[key] = []
                groups[key].push(sec)
            })

            // compute ordered keys
            let groupKeys = Object.keys(groups || {})
            if (groupBy === 'contact_count' || groupBy === 'engagement_count') {
                groupKeys = groupKeys.map((k) => ({ k, n: Number(k) || 0 })).sort((a, b) => a.n - b.n).map(x => x.k)
            } else if (groupBy === 'last_contact') {
                groupKeys = groupKeys.sort((a, b) => {
                    if (a === 'Never') return 1
                    if (b === 'Never') return -1
                    return a < b ? -1 : a > b ? 1 : 0
                })
            } else {
                groupKeys = groupKeys.sort()
            }

            // build next positions

            const next: Record<string, { x: number; y: number }> = {}
            if (!groupBy || groupBy === 'none') {
                visibleSectors.forEach((s: any, idx: number) => {
                    const id = String(s.sectorid ?? s.id ?? '')
                    const col = idx % (sectorCols || 1)
                    const row = Math.floor(idx / (sectorCols || 1))
                    next[id] = { x: 16 + col * (ORG_CARD_W + GAP_X), y: 16 + row * (ORG_CARD_H + GAP_Y) }
                })
            } else {
                groupKeys.forEach((k, colIdx) => {
                    const list = groups[k] || []
                    list.forEach((s: any, rowIdx: number) => {
                        const id = String(s.sectorid ?? s.id ?? '')
                        next[id] = { x: 16 + colIdx * (ORG_CARD_W + GAP_X), y: 48 + rowIdx * (ORG_CARD_H + GAP_Y) }
                    })
                })
            }

            setSectorPositions((prev) => {
                try { localStorage.setItem('action_canvas_sector_positions', JSON.stringify(next)) } catch (e) { }
                return next
            })
        } catch (e) { /* ignore */ }
    }, [groupBy, sectors, sectorCols, organisations, contacts, searchQuery, sortBy])

    // Debug logging for computed explicit heights to help diagnose rendering issues
    React.useEffect(() => {
        try {
            const h = computeExplicitHeight(organisations || [], orgPositions || {}, orgCols || 1)
            console.debug('ActionCanvas: org explicitHeight=', h, 'orgPositionsCount=', Object.keys(orgPositions || {}).length)
        } catch (e) { }
    }, [organisations, orgPositions, orgCols])

    React.useEffect(() => {
        try {
            const h = computeExplicitHeight(sectors || [], sectorPositions || {}, sectorCols || 1)
            console.debug('ActionCanvas: sector explicitHeight=', h, 'sectorPositionsCount=', Object.keys(sectorPositions || {}).length)
        } catch (e) { }
    }, [sectors, sectorPositions, sectorCols])

    // dragging refs and handlers for org/sector panels (multi-drag support)
    const orgDraggingRef = React.useRef<any | null>(null)
    const sectorDraggingRef = React.useRef<any | null>(null)

    function orgOnDragStart(e: React.DragEvent, id: string) {
        const ids = selectedIdsLocal.has(id) ? Array.from(selectedIdsLocal) : [id]
        const originPositions: Record<string, { x: number; y: number }> = {}
        ids.forEach((i) => {
            const idx = (organisations || []).findIndex((o: any) => String(o.orgid ?? o.id ?? '') === String(i))
            const defaultGridPos = { x: 16 + (idx % (orgCols || 1)) * (ORG_CARD_W + GAP_X), y: 16 + Math.floor(idx / (orgCols || 1)) * (ORG_CARD_H + GAP_Y) }
            originPositions[i] = orgPositions[i] || defaultGridPos
        })
        orgDraggingRef.current = { primaryId: id, originClientX: e.clientX, originClientY: e.clientY, originPositions, ids }
        try { e.dataTransfer.setData('application/json', JSON.stringify({ ids })) } catch (err) { e.dataTransfer.setData('text/plain', JSON.stringify(ids)) }
        try { e.dataTransfer.effectAllowed = 'move' } catch (err) { }
    }

    function orgOnDrop(e: React.DragEvent) {
        e.preventDefault()
        const panel = orgPanelRef.current
        if (!panel) return
        const rect = panel.getBoundingClientRect()
        const clientX = e.clientX
        const clientY = e.clientY
        const dragInfo = orgDraggingRef.current
        if (!dragInfo) return
        const { primaryId, originPositions, ids } = dragInfo
        const unscaledWidth = rect.width / (scale || 1)
        const unscaledHeight = rect.height / (scale || 1)
        const newX = Math.max(8, Math.min(unscaledWidth - ORG_CARD_W, (clientX - rect.left) / (scale || 1) - ORG_CARD_W / 2))
        const newY = Math.max(8, Math.min(unscaledHeight - ORG_CARD_H, (clientY - rect.top) / (scale || 1) - ORG_CARD_H / 2))
        const old = originPositions[primaryId] || { x: 0, y: 0 }
        const dx = newX - old.x
        const dy = newY - old.y
        setOrgPositions((prev) => {
            const next = { ...prev }
            ids.forEach((i: string) => {
                const op = originPositions[i] || prev[i] || { x: 16, y: 16 }
                next[i] = { x: Math.max(8, Math.min(unscaledWidth - ORG_CARD_W, op.x + dx)), y: Math.max(8, Math.min(unscaledHeight - ORG_CARD_H, op.y + dy)) }
            })
            try { localStorage.setItem('action_canvas_org_positions', JSON.stringify(next)) } catch (e) { }
            return next
        })
        orgDraggingRef.current = null
    }

    function orgOnDragOver(e: React.DragEvent) { e.preventDefault() }

    function sectorOnDragStart(e: React.DragEvent, id: string) {
        const ids = selectedIdsLocal.has(id) ? Array.from(selectedIdsLocal) : [id]
        const originPositions: Record<string, { x: number; y: number }> = {}
        ids.forEach((i) => {
            const idx = (sectors || []).findIndex((s: any) => String(s.sectorid ?? s.id ?? '') === String(i))
            const defaultGridPos = { x: 16 + (idx % (sectorCols || 1)) * (ORG_CARD_W + GAP_X), y: 16 + Math.floor(idx / (sectorCols || 1)) * (ORG_CARD_H + GAP_Y) }
            originPositions[i] = sectorPositions[i] || defaultGridPos
        })
        sectorDraggingRef.current = { primaryId: id, originClientX: e.clientX, originClientY: e.clientY, originPositions, ids }
        try { e.dataTransfer.setData('application/json', JSON.stringify({ ids })) } catch (err) { e.dataTransfer.setData('text/plain', JSON.stringify(ids)) }
        try { e.dataTransfer.effectAllowed = 'move' } catch (err) { }
    }

    function sectorOnDrop(e: React.DragEvent) {
        e.preventDefault()
        const panel = sectorPanelRef.current
        if (!panel) return
        const rect = panel.getBoundingClientRect()
        const clientX = e.clientX
        const clientY = e.clientY
        const dragInfo = sectorDraggingRef.current
        if (!dragInfo) return
        const { primaryId, originPositions, ids } = dragInfo
        const unscaledWidth = rect.width / (scale || 1)
        const unscaledHeight = rect.height / (scale || 1)
        const newX = Math.max(8, Math.min(unscaledWidth - ORG_CARD_W, (clientX - rect.left) / (scale || 1) - ORG_CARD_W / 2))
        const newY = Math.max(8, Math.min(unscaledHeight - ORG_CARD_H, (clientY - rect.top) / (scale || 1) - ORG_CARD_H / 2))
        const old = originPositions[primaryId] || { x: 0, y: 0 }
        const dx = newX - old.x
        const dy = newY - old.y
        setSectorPositions((prev) => {
            const next = { ...prev }
            ids.forEach((i: string) => {
                const op = originPositions[i] || prev[i] || { x: 16, y: 16 }
                next[i] = { x: Math.max(8, Math.min(unscaledWidth - ORG_CARD_W, op.x + dx)), y: Math.max(8, Math.min(unscaledHeight - ORG_CARD_H, op.y + dy)) }
            })
            try { localStorage.setItem('action_canvas_sector_positions', JSON.stringify(next)) } catch (e) { }
            return next
        })
        sectorDraggingRef.current = null
    }

    function sectorOnDragOver(e: React.DragEvent) { e.preventDefault() }

    // CanvasPanel: local wrapper to give Organisations and Sectors the same
    // sizing and scale behavior as the Contacts `ActionCanvasBoard`.
    const CanvasPanel = ({ children, count, cardW = 240, cardH = 96, explicitHeight, onHeight, outerRef, onDrop, onDragOver }: { children: React.ReactNode; count: number; cardW?: number; cardH?: number; explicitHeight?: number; onHeight?: (h: number) => void; outerRef?: React.RefObject<HTMLDivElement>; onDrop?: (e: React.DragEvent) => void; onDragOver?: (e: React.DragEvent) => void }) => {
        const internalRef = React.useRef<HTMLDivElement | null>(null)
        const panelRef = (outerRef as any) ?? internalRef
        const [colsLocal, setColsLocal] = React.useState<number>(6)
        React.useEffect(() => {
            function measure() {
                const el = panelRef.current
                if (!el) return
                try {
                    const rect = el.getBoundingClientRect()
                    const unscaled = rect.width
                    const candidate = Math.max(1, Math.floor((unscaled - 32) / (cardW + 12)))
                    setColsLocal(candidate)
                } catch (e) { }
            }
            measure()
            const ro = (window as any).ResizeObserver ? new (window as any).ResizeObserver(measure) : null
            if (ro && panelRef.current) ro.observe(panelRef.current)
            window.addEventListener('resize', measure)
            return () => { try { if (ro && panelRef.current) ro.unobserve(panelRef.current) } catch (e) { } window.removeEventListener('resize', measure) }
        }, [cardW])

        const rowsNeeded = Math.max(1, Math.ceil((count || 0) / (colsLocal || 1)))
        const GAP = 12
        const autoHeight = Math.max(420, rowsNeeded * (cardH + GAP) + 96)
        const boardHeight = explicitHeight ? Math.max(autoHeight, explicitHeight) : autoHeight

        React.useEffect(() => {
            try {
                if (onHeight) onHeight(boardHeight * (scale || 1))
            } catch (e) { }
        }, [boardHeight, scale, onHeight])

        return (
            <div ref={panelRef} style={{ height: '100%', width: '100%' }}>
                <Paper sx={{ position: 'relative', height: boardHeight * (scale || 1), overflow: 'auto', p: 1 }} onDrop={onDrop} onDragOver={onDragOver}>
                    <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', minHeight: boardHeight }}>
                        {children}
                    </div>
                </Paper>
            </div>
        )
    }

    return (
        <Box>
            <Typography variant={ACCORDION_TITLE_VARIANT as any} sx={ACCORDION_TITLE_SX}>Action Canvas</Typography>
            <ActionList
                tasks={tasks as Task[]}
                onEdit={() => { }}
                onDelete={() => { }}
                onOpenTargets={async () => { }}
                onOpenLogs={async () => { }}
                onAdd={() => navigate('/action-canvas')}
            />

            <Accordion defaultExpanded sx={{ my: 2 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontWeight: 700, color: '#3f0071' }}>{'Action Canvas'}</div>
                    </div>
                </AccordionSummary>
                <AccordionDetails>
                    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', my: 1 }}>
                        <TextField
                            size="small"
                            placeholder="Search contacts, organisations, sectors..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            sx={{ width: 360 }}
                        />
                        <FormControl size="small">
                            <InputLabel id="groupby-label">Group By</InputLabel>
                            <Select
                                labelId="groupby-label"
                                value={groupBy}
                                label="Group By"
                                onChange={(e) => setGroupBy(e.target.value as any)}
                                sx={{ width: 220 }}
                            >
                                <MenuItem value="none">None</MenuItem>
                                <MenuItem value="sector">Sector</MenuItem>
                                {/* organisation grouping doesn't apply when viewing organisations or sectors themselves */}
                                {activeTab !== 'organisations' && activeTab !== 'sectors' ? <MenuItem value="organisation">Organisation</MenuItem> : null}
                                <MenuItem value="last_contact">Last Contact</MenuItem>
                                <MenuItem value="engagement_count">Engagement Count</MenuItem>
                                {activeTab !== 'contacts' ? <MenuItem value="contact_count">Contact Count</MenuItem> : null}
                            </Select>
                        </FormControl>

                        <FormControl size="small">
                            <InputLabel id="sortby-label">Sort By</InputLabel>
                            <Select
                                labelId="sortby-label"
                                value={sortBy}
                                label="Sort By"
                                onChange={(e) => setSortBy(e.target.value as any)}
                                sx={{ width: 220 }}
                            >
                                {['name', 'organisation', 'role', 'last_contact', 'engagement_count', 'contact_count'].map((opt) => {
                                    const key = opt as any
                                    const labels: Record<string, string> = { name: 'Name', organisation: 'Organisation', role: 'Role Type', last_contact: 'Last Contact', engagement_count: 'Engagement Count', contact_count: 'Contact Count' }
                                    // hide options that are redundant with current grouping
                                    if (groupBy !== 'none' && ((groupBy === key) || (groupBy === 'organisation' && key === 'organisation'))) return null
                                    // organisation sort doesn't apply when viewing organisations- or sectors-only
                                    if ((activeTab === 'organisations' || activeTab === 'sectors') && key === 'organisation') return null
                                    // contact_count sort doesn't apply when viewing contacts-only
                                    if (activeTab === 'contacts' && key === 'contact_count') return null
                                    return <MenuItem key={key} value={key}>{labels[key]}</MenuItem>
                                })}
                            </Select>
                        </FormControl>

                        <FormControl size="small" sx={{ overflow: 'visible' }}>
                            <InputLabel id="task-filter-label">Filter</InputLabel>
                            <Select
                                labelId="task-filter-label"
                                multiple
                                value={taskFilter}
                                label="Filter"
                                onChange={(e) => {
                                    const val = e.target.value as Array<any>
                                    setTaskFilter(val)
                                    // fetch missing task targets in background
                                    const toFetch: number[] = []
                                    val.forEach((v) => {
                                        if (v !== 'unmapped' && !(targetsByTaskLocal && targetsByTaskLocal[Number(v)])) toFetch.push(Number(v))
                                    })
                                    if (toFetch.length) void fetchAndMergeTargets(toFetch)
                                }}
                                sx={{ width: 320 }}
                                renderValue={(selected) => {
                                    if (!selected || (selected as any[]).length === 0) return 'None'
                                    return (selected as any[]).map((v) => v === 'unmapped' ? 'Not mapped to an action' : (tasks.find((t: any) => t.taskid === Number(v))?.name || `Task ${v}`)).join(', ')
                                }}
                            >
                                <MenuItem value={'unmapped'}>Not mapped to an action</MenuItem>
                                {tasks.map((t: any) => <MenuItem key={t.taskid} value={t.taskid}>{t.name || `Task ${t.taskid}`}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <AppButton colorScheme="white" onClick={() => setTaskFilter([])}>Clear filter</AppButton>
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                            <AppButton size="small" colorScheme="white" onClick={zoomOut}>−</AppButton>
                            <div style={{ width: 48, textAlign: 'center', fontSize: 13 }}>{Math.round(scale * 100)}%</div>
                            <AppButton size="small" colorScheme="white" onClick={zoomIn}>+</AppButton>
                            <AppButton size="small" colorScheme="white" onClick={resetZoom}>Reset</AppButton>
                        </div>
                    </Stack>

                    <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 1 }}>
                        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} aria-label="Action canvas tabs">
                            <Tab value="contacts" label="Contacts" />
                            <Tab value="organisations" label="Organisations" />
                            <Tab value="sectors" label="Sectors" />
                        </Tabs>
                    </Box>

                    {/* Floating Attach FAB + simple Menu shown when there are selected ids */}
                    {selectedIdsLocal && selectedIdsLocal.size > 0 ? (
                        <>
                            <div style={{ position: 'fixed', right: 24, bottom: 96, zIndex: 1500 }}>
                                <Badge badgeContent={selectedIdsLocal.size} color="secondary">
                                    <Fab color="primary" ref={fabRef} onClick={(e) => {
                                        try { e.stopPropagation(); e.nativeEvent && e.nativeEvent.stopImmediatePropagation && e.nativeEvent.stopImmediatePropagation() } catch (err) { /* ignore */ }
                                        console.debug('ActionCanvas: FAB click, taskPickOpen=', taskPickOpen)
                                        setTaskPickOpen((v) => !v)
                                    }} aria-label="attach" sx={{ boxShadow: 6 }}>
                                        <PlaylistAddIcon sx={{ color: 'white' }} />
                                    </Fab>
                                </Badge>
                            </div>
                            <CustomTaskMenu open={taskPickOpen} anchorRef={fabRef} tasks={tasks as any[]} onClose={() => setTaskPickOpen(false)} onSelect={async (taskId: number) => { setTaskPickOpen(false); await attachSelectedToTaskId(taskId) }} />
                        </>
                    ) : null}

                    {/* Stacked content panels for each tab: keep mounted but only the active panel is interactive and on top */}
                    <div style={{ position: 'relative', marginTop: 12, height: activePanelHeight ?? 'auto' }}>
                        {/* compute explicit heights so CanvasPanel can expand to fit absolutely-positioned cards */}
                        <div style={{ position: 'absolute', inset: 0, transition: 'opacity 180ms, transform 180ms', zIndex: activeTab === 'contacts' ? 3 : 1, opacity: activeTab === 'contacts' ? 1 : 0, pointerEvents: activeTab === 'contacts' ? 'auto' : 'none' }}>
                            <ActionCanvasBoard contacts={displayedContacts || []} onOpenEngagements={openEngagements} groupBy={groupBy} organisations={organisations || []} sortBy={sortBy} visibleContactIds={displayedVisibleContactIds} onSelectionChange={(ids) => setSelectedIdsLocal(new Set(ids))} scale={scale} onContentHeightChange={(h) => { if (activeTab === 'contacts') setActivePanelHeight(h) }} />
                        </div>

                        <div style={{ position: 'absolute', inset: 0, overflow: 'auto', transition: 'opacity 180ms, transform 180ms', zIndex: activeTab === 'organisations' ? 3 : 1, opacity: activeTab === 'organisations' ? 1 : 0, pointerEvents: activeTab === 'organisations' ? 'auto' : 'none' }}>
                            <CanvasPanel count={organisations.length} explicitHeight={computeExplicitHeight(organisations, orgPositions, orgCols)} onHeight={(h) => { if (activeTab === 'organisations') setActivePanelHeight(h) }} outerRef={orgPanelRef} onDrop={orgOnDrop} onDragOver={orgOnDragOver}>
                                <div style={{ position: 'relative', minHeight: 420 }}>
                                    {(() => {
                                        try {
                                            const visibleOrgs = (organisations || []).filter((org: any) => {
                                                const q = String(searchQuery || '').trim().toLowerCase()
                                                if (!q) return true
                                                try {
                                                    const name = String(org.name || '').toLowerCase()
                                                    const sector = String(org.sector_summary || org.sector_name || '').toLowerCase()
                                                    return name.includes(q) || sector.includes(q)
                                                } catch (e) { return false }
                                            })

                                            const groups: Record<string, any[]> = {}
                                            // helper to compute counts from contacts when org doesn't include them
                                            function getContactOrgId(c: any) {
                                                return Number(c.currentorgid ?? c.current_orgid ?? c.companyorgid ?? c.orgid ?? 0)
                                            }
                                            function getContactEngagementCount(c: any) {
                                                return Number(c.engagement_count ?? c.engagements?.length ?? c.engagementCount ?? 0) || 0
                                            }
                                            function computeOrgContactCount(org: any) {
                                                try {
                                                    const orgId = Number(org.orgid ?? org.id ?? 0)
                                                    return (contacts || []).filter((c: any) => getContactOrgId(c) === orgId).length
                                                } catch (e) { return 0 }
                                            }
                                            function computeOrgEngagementCount(org: any) {
                                                try {
                                                    const orgId = Number(org.orgid ?? org.id ?? 0)
                                                    return (contacts || []).filter((c: any) => getContactOrgId(c) === orgId).reduce((acc, c) => acc + getContactEngagementCount(c), 0)
                                                } catch (e) { return 0 }
                                            }

                                            visibleOrgs.forEach((org: any) => {
                                                let key = 'All'
                                                if (groupBy === 'sector') {
                                                    key = org.sector_summary || org.sector_name || 'Unspecified'
                                                } else if (groupBy === 'contact_count') {
                                                    key = String(Number(org.contacts_count ?? computeOrgContactCount(org) ?? 0))
                                                } else if (groupBy === 'engagement_count') {
                                                    key = String(Number(org.engagement_count ?? computeOrgEngagementCount(org) ?? 0))
                                                } else if (groupBy === 'last_contact') {
                                                    // derive most recent contact date for this org and group by YYYY-MM; use 'Never' when no dates
                                                    const orgId = Number(org.orgid ?? org.id ?? 0)
                                                    let maxDate: string | null = null
                                                        ; (contacts || []).forEach((c: any) => {
                                                            try {
                                                                if (Number(c.currentorgid) === orgId) {
                                                                    const raw = c.last_contact_date ?? c.last_contact ?? c.last_contacted ?? c.reviewdate ?? null
                                                                    if (!raw) return
                                                                    const d = new Date(raw)
                                                                    if (isNaN(d.getTime())) return
                                                                    const iso = d.toISOString().slice(0, 10)
                                                                    if (!maxDate || iso > maxDate) maxDate = iso
                                                                }
                                                            } catch (e) { }
                                                        })
                                                    key = maxDate ? (maxDate as string).slice(0, 7) : 'Never'
                                                } else {
                                                    key = 'All'
                                                }
                                                if (!groups[key]) groups[key] = []
                                                groups[key].push(org)
                                            })

                                            // sort keys sensibly depending on grouping type
                                            let groupKeys = Object.keys(groups || {})
                                            if (groupBy === 'contact_count' || groupBy === 'engagement_count') {
                                                groupKeys = groupKeys.map((k) => ({ k, n: Number(k) || 0 })).sort((a, b) => a.n - b.n).map(x => x.k)
                                            } else if (groupBy === 'last_contact') {
                                                // sort YYYY-MM ascending, keep 'Never' last
                                                groupKeys = groupKeys.sort((a, b) => {
                                                    if (a === 'Never') return 1
                                                    if (b === 'Never') return -1
                                                    return a < b ? -1 : a > b ? 1 : 0
                                                })
                                            } else if (groupBy === 'sector') {
                                                groupKeys = groupKeys.sort()
                                            } else {
                                                groupKeys = groupKeys.sort()
                                            }

                                            const cards = visibleOrgs.map((org: any, idx: number) => {
                                                const id = String(org.orgid ?? org.id ?? '')
                                                const selected = selectedIdsLocal.has(id)
                                                const defaultGridPos = { x: 16 + (idx % (orgCols || 1)) * (ORG_CARD_W + GAP_X), y: 16 + Math.floor(idx / (orgCols || 1)) * (ORG_CARD_H + GAP_Y) }
                                                let pos = orgPositions[id] || defaultGridPos
                                                if (groupBy && groupBy !== 'none' && groupKeys.length > 0) {
                                                    let key = 'All'
                                                    if (groupBy === 'sector') key = (org.sector_summary || org.sector_name || 'Unspecified')
                                                    else if (groupBy === 'contact_count') key = String(Number(org.contacts_count ?? computeOrgContactCount(org) ?? 0))
                                                    else if (groupBy === 'engagement_count') key = String(Number(org.engagement_count ?? computeOrgEngagementCount(org) ?? 0))
                                                    else key = 'All'
                                                    const colIdx = groupKeys.indexOf(key)
                                                    const rowIdx = groups[key] ? groups[key].findIndex((o: any) => String(o.orgid ?? o.id ?? '') === id) : -1
                                                    if (colIdx >= 0 && rowIdx >= 0) pos = { x: 16 + colIdx * (ORG_CARD_W + GAP_X), y: 48 + rowIdx * (ORG_CARD_H + GAP_Y) }
                                                }
                                                const orgSectorText = String(org.sector_summary || org.sector_name || '').toLowerCase()
                                                const isRecruitOrg = orgSectorText.includes('recruit')
                                                return (
                                                    <div key={id} style={{ position: 'absolute', left: pos.x, top: pos.y, width: ORG_CARD_W, height: ORG_CARD_H }}>
                                                        <Paper
                                                            draggable
                                                            onDragStart={(e) => orgOnDragStart(e, id)}
                                                            onClick={() => {
                                                                setSelectedIdsLocal((prev) => {
                                                                    const next = new Set(prev)
                                                                    if (next.has(id)) next.delete(id)
                                                                    else next.add(id)
                                                                    return next
                                                                })
                                                            }}
                                                            elevation={6}
                                                            sx={{
                                                                borderRadius: '8px',
                                                                p: 1.5,
                                                                height: '100%',
                                                                boxSizing: 'border-box',
                                                                display: 'flex',
                                                                flexDirection: 'row',
                                                                alignItems: 'flex-start',
                                                                cursor: 'grab',
                                                                border: selected ? '2px solid rgba(94,6,187,0.16)' : '1px solid rgba(0,0,0,0.06)',
                                                                boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
                                                                backgroundColor: selected ? 'rgba(94, 6, 187, 0.06)' : (isRecruitOrg ? 'rgba(106,52,193,0.18)' : '#fff'),
                                                                transition: 'transform 150ms ease, box-shadow 150ms ease',
                                                                '&:hover': { transform: 'translateY(-6px)', boxShadow: '0 14px 36px rgba(0,0,0,0.14)' }
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                                <div style={{ width: 84, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                                                                    <AppButton size="small" colorScheme="white" onClick={(e: any) => { e.stopPropagation(); openOrgContactsModal(org) }}>
                                                                        <PeopleAltIcon fontSize="small" sx={{ mr: 1 }} />
                                                                        {org.contacts_count ?? computeOrgContactCount(org)}
                                                                    </AppButton>
                                                                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); openOrgDetailsModal(org) }} aria-label="open organisation details"><MoreHorizIcon fontSize="small" /></IconButton>
                                                                </div>
                                                                <div style={{ flex: 1 }}>
                                                                    <div style={{ fontWeight: 700, fontSize: 15 }}>{org.name}</div>
                                                                    <div style={{ fontSize: 13, color: '#666', marginTop: 6 }}>{org.sector_summary || org.sector_name || ''}</div>
                                                                </div>
                                                            </div>
                                                        </Paper>
                                                    </div>
                                                )
                                            })

                                            // Render group headers (if grouping active) similar to contacts canvas
                                            const headers = (groupBy && groupBy !== 'none' && groupKeys.length > 0) ? groupKeys.map((k, colIdx) => (
                                                <div key={`hdr-org-${colIdx}`} style={{ position: 'absolute', left: 16 + colIdx * (ORG_CARD_W + GAP_X), top: 8, width: ORG_CARD_W }}>
                                                    <Paper elevation={1} sx={{ p: 0.5 }}>
                                                        <Typography variant="caption">{k}</Typography>
                                                    </Paper>
                                                </div>
                                            )) : []

                                            return [...headers, ...cards]
                                        } catch (err) {
                                            console.error('ActionCanvas: organisations render error', err)
                                            return <div style={{ padding: 16 }}><Typography color="error">Error rendering organisations canvas — see console</Typography></div>
                                        }
                                    })()}
                                </div>
                            </CanvasPanel>
                        </div>

                        <div style={{ position: 'absolute', inset: 0, overflow: 'auto', transition: 'opacity 180ms, transform 180ms', zIndex: activeTab === 'sectors' ? 3 : 1, opacity: activeTab === 'sectors' ? 1 : 0, pointerEvents: activeTab === 'sectors' ? 'auto' : 'none' }}>
                            <CanvasPanel count={sectors.length} explicitHeight={computeExplicitHeight(sectors, sectorPositions, sectorCols)} onHeight={(h) => { if (activeTab === 'sectors') setActivePanelHeight(h) }} outerRef={sectorPanelRef} onDrop={sectorOnDrop} onDragOver={sectorOnDragOver}>
                                <div style={{ position: 'relative', minHeight: 420 }}>
                                    {(() => {
                                        try {
                                            let visibleSectors = (sectors || []).filter((s: any) => {
                                                const q = String(searchQuery || '').trim().toLowerCase()
                                                if (!q) return true
                                                try {
                                                    const name = String(s.summary || s.name || '').toLowerCase()
                                                    const desc = String(s.description || '').toLowerCase()
                                                    return name.includes(q) || desc.includes(q)
                                                } catch (e) { return false }
                                            }).map((s: any, idx: number) => {
                                                const id = String(s.sectorid ?? s.id ?? '')
                                                const selected = selectedIdsLocal.has(id)
                                                const defaultGridPos = { x: 16 + (idx % (sectorCols || 1)) * (ORG_CARD_W + GAP_X), y: 16 + Math.floor(idx / (sectorCols || 1)) * (ORG_CARD_H + GAP_Y) }
                                                const pos = sectorPositions[id] || defaultGridPos
                                                const sectorText = String(s.summary || s.name || '').toLowerCase()
                                                const isRecruitSector = sectorText.includes('recruit')
                                                return (
                                                    <div key={id} style={{ position: 'absolute', left: pos.x, top: pos.y, width: ORG_CARD_W, height: ORG_CARD_H }}>
                                                        <Paper
                                                            draggable
                                                            onDragStart={(e) => sectorOnDragStart(e, id)}
                                                            onClick={() => {
                                                                setSelectedIdsLocal((prev) => {
                                                                    const next = new Set(prev)
                                                                    if (next.has(id)) next.delete(id)
                                                                    else next.add(id)
                                                                    return next
                                                                })
                                                                // Apply sorting to sectors canvas based on `sortBy`
                                                                try {
                                                                    if (sortBy === 'name') {
                                                                        visibleSectors = visibleSectors.slice().sort((a: any, b: any) => String((a.summary || a.name) || '').localeCompare(String((b.summary || b.name) || '')))
                                                                    } else if (sortBy === 'contact_count' || sortBy === 'engagement_count' || sortBy === 'last_contact') {
                                                                        // compute aggregates per sector from organisations and contacts
                                                                        const sectorAgg: Record<string, { contacts: number; engagements: number; lastContact: number }> = {}
                                                                            ; (organisations || []).forEach((o: any) => {
                                                                                const sname = String(o.sector_summary || o.sector_name || '').trim() || String(o.sectorid || '')
                                                                                const orgId = Number(o.orgid ?? o.id ?? 0)
                                                                                if (!sectorAgg[sname]) sectorAgg[sname] = { contacts: 0, engagements: 0, lastContact: 0 }
                                                                                const orgContacts = (contacts || []).filter((c: any) => Number(c.currentorgid ?? c.current_orgid ?? c.companyorgid ?? c.orgid ?? 0) === orgId)
                                                                                sectorAgg[sname].contacts += orgContacts.length
                                                                                sectorAgg[sname].engagements += orgContacts.reduce((acc: number, c: any) => acc + Number(c.engagement_count ?? c.engagements?.length ?? 0), 0)
                                                                                orgContacts.forEach((c: any) => {
                                                                                    const raw = c.last_contact_date ?? c.last_contact ?? c.last_contacted ?? null
                                                                                    if (!raw) return
                                                                                    const t = new Date(raw).getTime()
                                                                                    if (!isNaN(t) && t > sectorAgg[sname].lastContact) sectorAgg[sname].lastContact = t
                                                                                })
                                                                            })
                                                                        if (sortBy === 'contact_count') visibleSectors = visibleSectors.slice().sort((a: any, b: any) => (sectorAgg[String(b.name || b.summary || '')]?.contacts || 0) - (sectorAgg[String(a.name || a.summary || '')]?.contacts || 0))
                                                                        else if (sortBy === 'engagement_count') visibleSectors = visibleSectors.slice().sort((a: any, b: any) => (sectorAgg[String(b.name || b.summary || '')]?.engagements || 0) - (sectorAgg[String(a.name || a.summary || '')]?.engagements || 0))
                                                                        else if (sortBy === 'last_contact') visibleSectors = visibleSectors.slice().sort((a: any, b: any) => (sectorAgg[String(b.name || b.summary || '')]?.lastContact || 0) - (sectorAgg[String(a.name || a.summary || '')]?.lastContact || 0))
                                                                    }
                                                                } catch (e) { }
                                                            }}
                                                            elevation={6}
                                                            sx={{
                                                                borderRadius: '8px',
                                                                p: 1.5,
                                                                height: '100%',
                                                                boxSizing: 'border-box',
                                                                display: 'flex',
                                                                flexDirection: 'row',
                                                                alignItems: 'flex-start',
                                                                cursor: 'grab',
                                                                border: selected ? '2px solid rgba(94,6,187,0.16)' : '1px solid rgba(0,0,0,0.06)',
                                                                boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
                                                                backgroundColor: selected ? 'rgba(94, 6, 187, 0.06)' : (isRecruitSector ? 'rgba(106,52,193,0.18)' : '#fff'),
                                                                transition: 'transform 150ms ease, box-shadow 150ms ease',
                                                                '&:hover': { transform: 'translateY(-6px)', boxShadow: '0 14px 36px rgba(0,0,0,0.14)' }
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                                <div style={{ width: 84, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                                                                    <AppButton size="small" colorScheme="white" onClick={(e: any) => { e.stopPropagation(); openSectorOrgsModal(s) }}>
                                                                        <BusinessIcon fontSize="small" sx={{ mr: 0.5 }} />
                                                                        {(() => {
                                                                            try {
                                                                                const sf = String(s.summary || s.name || '').toLowerCase().trim()
                                                                                const count = (organisations || []).filter((o: any) => {
                                                                                    if (!sf) return false
                                                                                    const os = String(o.sector_summary || o.sector_name || '').toLowerCase()
                                                                                    if (os.includes(sf)) return true
                                                                                    if (Number(o.sectorid) && Number(s.sectorid) && Number(o.sectorid) === Number(s.sectorid)) return true
                                                                                    return false
                                                                                }).length
                                                                                return count
                                                                            } catch (e) { return 0 }
                                                                        })()}
                                                                    </AppButton>
                                                                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); openSectorOrgsModal(s) }} aria-label="open sector organisations"><MoreHorizIcon fontSize="small" /></IconButton>
                                                                </div>
                                                                <div style={{ flex: 1 }}>
                                                                    <div style={{ fontWeight: 700, fontSize: 15 }}>{s.summary || s.name}</div>
                                                                </div>
                                                            </div>
                                                        </Paper>
                                                    </div>
                                                )
                                            })
                                        } catch (err) {
                                            console.error('ActionCanvas: sectors render error', err)
                                            return <div style={{ padding: 16 }}><Typography color="error">Error rendering sectors canvas — see console</Typography></div>
                                        }
                                    })()}
                                </div>
                            </CanvasPanel>
                        </div>
                    </div>

                    <WideDialog open={countModalOpen} onClose={closeEngagements} fullWidth fitToContent>
                        <div style={{ padding: 16 }}>
                            <h3>Engagements for {countModalContactName ?? ''}</h3>
                            <EngagementsTable contactId={countModalContactId ?? undefined} />
                            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                                <AppButton colorScheme="white" onClick={closeEngagements}>Close</AppButton>
                            </div>
                        </div>
                    </WideDialog>
                    <WideDialog open={orgContactsModalOpen} onClose={closeOrgContactsModal} fullWidth fitToContent>
                        <div style={{ padding: 16 }}>
                            <h3>Contacts for {orgContactsModalOrg ? orgContactsModalOrg.name : ''}</h3>
                            <Box sx={{ mb: 2 }}>
                                <strong>Employed contacts</strong>
                                <div style={{ minWidth: 'min(1200px, 95vw)' }}>
                                    {/* @ts-ignore */}
                                    <ContactsTable orgFilterId={orgContactsModalOrg && orgContactsModalOrg.orgid ? Number(orgContactsModalOrg.orgid) : undefined} contactOrgMode="employed" inModal hideCreateButton />
                                </div>
                            </Box>
                            <Box sx={{ mt: 3 }}>
                                <strong>Targeting / hiring for this organisation</strong>
                                <div style={{ minWidth: 'min(1200px, 95vw)' }}>
                                    {/* @ts-ignore */}
                                    <ContactsTable orgFilterId={orgContactsModalOrg && orgContactsModalOrg.orgid ? Number(orgContactsModalOrg.orgid) : undefined} contactOrgMode="targeting" inModal hideCreateButton />
                                </div>
                            </Box>
                            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                                <AppButton colorScheme="white" onClick={closeOrgContactsModal}>Close</AppButton>
                            </div>
                        </div>
                    </WideDialog>

                    <WideDialog open={orgDetailsModalOpen} onClose={closeOrgDetailsModal} fullWidth fitToContent>
                        <div style={{ padding: 16 }}>
                            <h3>{orgDetailsModalOrg ? orgDetailsModalOrg.name : 'Organisation'}</h3>
                            <div style={{ minWidth: 'min(1200px, 95vw)' }}>
                                {/* show the organisation row in a table modal */}
                                {/* @ts-ignore */}
                                <OrganisationsTable onlyIds={orgDetailsModalOrg && orgDetailsModalOrg.orgid ? [Number(orgDetailsModalOrg.orgid)] : undefined} inModal hideCreateButton />
                            </div>
                            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                                <AppButton colorScheme="white" onClick={closeOrgDetailsModal}>Close</AppButton>
                            </div>
                        </div>
                    </WideDialog>

                    <WideDialog open={sectorOrgsModalOpen} onClose={closeSectorOrgsModal} fullWidth fitToContent>
                        <div style={{ padding: 16 }}>
                            <h3>Organisations for {sectorOrgsModalSector ? (sectorOrgsModalSector.summary || sectorOrgsModalSector.name) : ''}</h3>
                            <div style={{ minWidth: 'min(1200px, 95vw)' }}>
                                {/* @ts-ignore */}
                                <OrganisationsTable sectorFilter={sectorOrgsModalSector ? (sectorOrgsModalSector.summary || sectorOrgsModalSector.name) : undefined} inModal hideCreateButton />
                            </div>
                            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                                <AppButton colorScheme="white" onClick={closeSectorOrgsModal}>Close</AppButton>
                            </div>
                        </div>
                    </WideDialog>
                </AccordionDetails>
            </Accordion>
        </Box>
    )
}
