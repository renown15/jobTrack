import React, { useState } from 'react'
import { BRAND_PURPLE, BRAND_PURPLE_LIGHT } from '../../constants/colors'
import Avatar from '@mui/material/Avatar'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getApplicantId } from '../../auth/currentApplicant'
import DataTable from '../DataTable'
import { fetchAllContacts, updateContact, fetchReferenceData, fetchContactTasks, fetchContactTaskCounts, fetchContactDocuments, fetchTasks, addTaskTarget } from '../../api/client'
import { toNumberOrNull } from '../../utils/pickerUtils'
import { sortArray } from '../../utils/sort'
import type { Contact } from '../../api/types'
import Box from '@mui/material/Box'
import AppButton from '../Shared/AppButton'
import Dialog from '../Shared/WideDialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import WideDialog from '../Shared/WideDialog'
import FormControl from '@mui/material/FormControl'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
// Typography omitted; sector is read-only text
import IconButton from '@mui/material/IconButton'
import InputLabel from '@mui/material/InputLabel'
import Button from '@mui/material/Button'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import LinkedInIcon from '@mui/icons-material/LinkedIn'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import Tooltip from '@mui/material/Tooltip'
import Switch from '@mui/material/Switch'
import QuickCreateModal from './QuickCreateModal'
// fetchOrganisation removed; sector is read-only here
import RolesTable from './RolesTable'
import EngagementsTable from './EngagementsTable'
import { deleteContact } from '../../api/client'
import ConfirmDialog from '../Shared/ConfirmDialog'
import Toast from '../Shared/Toast'

export default function ContactsTable({ search, roleTypeFilterId, orgFilterId, heatRange, contactOrgMode = 'all', onlyIds, inModal, excludeRoleTypeId, hideCreateButton, initialSortKey, initialSortDir, extraActionRender, activeOnly }: { search?: string; roleTypeFilterId?: number; orgFilterId?: number; heatRange?: number[]; contactOrgMode?: 'all' | 'employed' | 'targeting'; onlyIds?: number[]; inModal?: boolean; excludeRoleTypeId?: number; hideCreateButton?: boolean; initialSortKey?: string; initialSortDir?: 'asc' | 'desc'; extraActionRender?: (row: any) => React.ReactNode; activeOnly?: boolean }) {
    const [page, setPage] = useState(0)
    const initialPageSize = inModal ? 10 : 20
    const [pageSize, setPageSize] = useState(initialPageSize)
    const [openCreate, setOpenCreate] = useState(false)

    // Fetch the full list (datasets small) so client-side sorting works across the whole set
    const queryClient = useQueryClient()
    const aid = getApplicantId()
    // include applicant id in the query key to avoid reusing cached results across applicants
    const q = useQuery(['contactsList', { applicantId: aid, roleTypeFilterId, orgFilterId }], () => fetchAllContacts(roleTypeFilterId, orgFilterId), { staleTime: 60000 })

    // Toggle to show a debug column with raw timestamps for troubleshooting.

    // (removed dev debug effect)

    let all = q.data ?? []
    // If caller provided excludeRoleTypeId, filter out contacts that match that role type (e.g., exclude recruiters)
    if (excludeRoleTypeId != null) {
        const excl = Number(excludeRoleTypeId)
        all = (all || []).filter((r: any) => {
            const rid = Number(r?.role_type_id ?? r?.roleid ?? 0)
            return rid !== excl
        })
    }
    // Filter to active-only contacts when requested
    if (activeOnly) {
        all = (all || []).filter((r: any) => {
            const contactStatusValue = (r.contact_status_value || r.contact_status || '').toString().toLowerCase()
            const legacyCv = r.latestcvsent
            const isActive = contactStatusValue ? contactStatusValue === 'active' : (legacyCv == null ? true : (legacyCv === true || String(legacyCv) === 'True' || String(legacyCv) === 'true' || String(legacyCv) === '1'))
            return Boolean(isActive)
        })
    }
    // If caller provided onlyIds, restrict the dataset to those contact ids (makes the component reusable in modals)
    // Note: treat an explicit empty array as "no rows" rather than "no filter".
    if (Array.isArray(onlyIds)) {
        if (onlyIds.length > 0) {
            const idSet = new Set(onlyIds.map((i) => Number(i)))
            all = (all || []).filter((r: any) => idSet.has(Number(r?.contactid || 0)))
        } else {
            // caller explicitly passed an empty array => render no rows
            all = []
        }
    }
    // Documents count is now provided by the backend as `documents_count` per contact.
    // Keep a small derived map for legacy column rendering convenience.
    const [docCounts, setDocCounts] = React.useState<Record<number, number>>({})
    React.useEffect(() => {
        const map: Record<number, number> = {}
        for (const c of all) {
            const cid = Number((c && c.contactid) || 0)
            map[cid] = Number(c?.documents_count ?? 0)
        }
        // shallow equality check to avoid triggering re-renders when nothing changed
        let changed = false
        const prevKeys = Object.keys(docCounts)
        const newKeys = Object.keys(map)
        if (prevKeys.length !== newKeys.length) changed = true
        if (!changed) {
            for (const k of newKeys) {
                const nk = Number(k)
                if ((docCounts[nk] ?? 0) !== (map[nk] ?? 0)) {
                    changed = true
                    break
                }
            }
        }
        if (changed) setDocCounts(map)
    }, [all])
    // Default sort: allow caller to override; otherwise sort by name
    const [sortKey, setSortKey] = useState<string | null>(initialSortKey ?? '__updated_ts')
    const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(initialSortDir ?? 'desc')

    const filtered = React.useMemo(() => {
        if (!search || !search.trim()) return all
        const s = search.trim().toLowerCase()
        return all.filter((r: any) => {
            return (
                (r.name && String(r.name).toLowerCase().includes(s)) ||
                (r.current_organization && String(r.current_organization).toLowerCase().includes(s)) ||
                (r.currentrole && String(r.currentrole).toLowerCase().includes(s)) ||
                (r.current_org_sector && String(r.current_org_sector).toLowerCase().includes(s))
            )
        })
    }, [all, search])

    // If an org filter mode is provided, further restrict results by employment/targeting status.
    const orgFilteredByMode = React.useMemo(() => {
        if (!orgFilterId || contactOrgMode === 'all') return filtered
        try {
            const oid = Number(orgFilterId)
            if (contactOrgMode === 'employed') {
                return filtered.filter((r: any) => Number(r.currentorgid) === oid)
            }
            if (contactOrgMode === 'targeting') {
                // Show contacts that have a contact-target link to this org but are NOT currently employed there.
                // This prevents employed contacts (currentorgid === org) from appearing in the targeting list.
                return filtered.filter((r: any) => {
                    try {
                        const isTargeting = Boolean(r.is_targeting === true || String(r.is_targeting) === 'True' || String(r.is_targeting) === 'true' || Number(r.is_targeting) === 1)
                        const employedHere = Number(r.currentorgid) === oid
                        return isTargeting && !employedHere
                    } catch (e) {
                        return false
                    }
                })
            }
        } catch (e) {
            return filtered
        }
        return filtered
    }, [filtered, orgFilterId, contactOrgMode])

    // compute dataset max days-ago so we can treat "never contacted" consistently
    const datasetMaxDays = React.useMemo(() => {
        const list = all ?? []
        const today = Date.now()
        let max = -Infinity
        for (const c of list) {
            // normalize date fields to match Latest Contact ordering: prefer engagement, then contact, then aggregated
            const last = c?.last_engagement_date ?? c?.last_contact_date ?? c?.last_activity_date
            if (!last) continue
            const d = new Date(last)
            if (isNaN(d.getTime())) continue
            const daysAgo = Math.max(0, Math.floor((today - d.getTime()) / (1000 * 60 * 60 * 24)))
            if (daysAgo > max) max = daysAgo
        }
        if (!isFinite(max)) return 365
        return Math.min(365, Math.max(0, max))
    }, [all])

    // Apply heatRange filter: heatRange is [minDaysAgo, maxDaysAgo]
    const withHeatFiltered = React.useMemo(() => {
        // Apply org-mode filtering first (employed/targeting) before heat filtering
        const sourceList = orgFilteredByMode
        if (!heatRange || heatRange.length !== 2) return sourceList
        let [minDays, maxDays] = heatRange
        // Normalize range so minDays <= maxDays to avoid inverted ranges returning no results
        if (minDays == null) minDays = 0
        if (maxDays == null) maxDays = 365
        const low = Math.min(minDays, maxDays)
        const high = Math.max(minDays, maxDays)
        // (dev debug removed)

        // If both low=0 and high big, no filtering — return the
        // already org-filtered source list (not the pre-org filtered list)
        if (low === 0 && high >= 365) {
            return sourceList
        }

        const today = new Date()
        const out = sourceList.filter((r: any) => {
            // Prefer Latest Contact ordering: engagement -> contact -> aggregated
            const last = r.last_engagement_date ?? r.last_contact_date ?? r.last_activity_date ?? null
            let daysAgo: number
            if (!last) {
                // treat no contact as if they were on the dataset oldest day
                daysAgo = datasetMaxDays
            } else {
                const d = new Date(last)
                if (isNaN(d.getTime())) {
                    daysAgo = datasetMaxDays
                } else {
                    const diffMs = today.getTime() - d.getTime()
                    daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24))
                }
            }
            const capped = Math.min(daysAgo, 365)
            return capped >= low && capped <= high
        })
        // (dev debug removed)
        return out
    }, [orgFilteredByMode, heatRange])

    // Deduplicate contacts by contactid to avoid accidental duplicates from server or caching
    const dedupedById = React.useMemo(() => {
        const seen = new Set<number>()
        const out: any[] = []
        for (const r of withHeatFiltered) {
            const cid = Number(r?.contactid || 0)
            if (!seen.has(cid)) {
                seen.add(cid)
                out.push(r)
            }
        }
        return out
    }, [withHeatFiltered])

    // (removed dev debug effect)

    // (removed dev log)

    // Fetch counts of linked action-plan tasks per contact so we can display the counts in the table
    // include applicant id here too so counts are scoped correctly per applicant
    const taskCountsQ = useQuery(['contactTaskCounts', { applicantId: aid }], () => fetchContactTaskCounts(), { staleTime: 60000 })
    const taskCountsMap: Record<number, number> = React.useMemo(() => {
        const map: Record<number, number> = {}
        const rows: any[] = taskCountsQ.data || []
        for (const r of rows) {
            const cid = Number(r.contactid)
            map[cid] = Number(r.actions_count ?? 0)
        }
        return map
    }, [taskCountsQ.data])

    // Actions modal state: clicking the actions count opens a modal listing the linked task names
    const [actionsModalOpen, setActionsModalOpen] = useState(false)
    const [actionsModalContactId, setActionsModalContactId] = useState<number | null>(null)
    const [actionsModalContactName, setActionsModalContactName] = useState<string | null>(null)
    const [actionsList, setActionsList] = useState<any[]>([])

    // Task picker for linking an existing action to a contact
    const [taskPickerOpen, setTaskPickerOpen] = useState(false)
    const [selectedTaskIdForLink, setSelectedTaskIdForLink] = useState<number | null>(null)
    const [tasksList, setTasksList] = useState<any[]>([])
    const [taskPickerLoading, setTaskPickerLoading] = useState(false)

    // fetch action_plan_target_type refdata to find contact target refid
    const targetTypesQ = useQuery(['refdata', 'action_plan_target_type'], () => fetchReferenceData('action_plan_target_type'), { staleTime: 60000 })
    const contactTargetRefId = React.useMemo(() => {
        const list = targetTypesQ.data ?? []
        const found = (list || []).find((t: any) => String((t.refvalue || '').toLowerCase()).includes('contact'))
        return found ? Number(found.refid) : null
    }, [targetTypesQ.data])

    async function openActionsModal(contactId: number, contactName?: string) {
        setActionsModalContactId(contactId ?? null)
        setActionsModalContactName(contactName ?? null)
        setActionsModalOpen(true)
        try {
            const tasks = await fetchContactTasks(contactId)
            setActionsList(tasks ?? [])
        } catch (err: any) {
            console.error('Failed to fetch contact tasks', err)
            setActionsList([])
        }
    }

    function closeActionsModal() {
        setActionsModalOpen(false)
        setActionsModalContactId(null)
        setActionsModalContactName(null)
        setActionsList([])
    }

    // Prepare rows with a computed '__li_sort' key so the LI column can be sorted
    // Use the deduplicated, heat-filtered (and org-filtered) array as the source for prepared rows
    const prepared = React.useMemo(() => {
        return dedupedById.map((row: any) => {
            // normalize/fallback date fields to support sorting and rendering:
            // - last_engagement_date should prefer engagement-only date, fall back to legacy keys
            // - last_activity_date should prefer aggregated activity date, fall back to engagement date
            const normalizedLastEngagement = row.last_engagement_date ?? row.last_contact_date ?? row.last_activity_date ?? null
            const normalizedLastActivity = row.last_activity_date ?? row.last_engagement_date ?? row.last_contact_date ?? null
            // create a shallow copy to avoid mutating original
            row = { ...row, last_engagement_date: normalizedLastEngagement, last_activity_date: normalizedLastActivity }

            const linkedInCandidates = [
                'islinkedinconnected',
                'is_linkedin_connected',
                'linkedin_connected',
                'linkedInConnected',
            ]

            function findLinkedIn(obj: any) {
                if (!obj) return false
                for (const n of linkedInCandidates) {
                    if (Object.prototype.hasOwnProperty.call(obj, n) && obj[n] != null) return (obj[n] === true || obj[n] === 1 || String(obj[n]).toLowerCase() === 'true' || String(obj[n]) === '1')
                }
                const lowered = Object.keys(obj).reduce((acc: any, k: string) => {
                    acc[k.toLowerCase()] = obj[k]
                    return acc
                }, {})
                for (const n of linkedInCandidates) {
                    const v = lowered[n.toLowerCase()]
                    if (v !== undefined && v !== null) return (v === true || v === 1 || String(v).toLowerCase() === 'true' || String(v) === '1')
                }
                return false
            }

            const isLinkedIn = findLinkedIn(row)
            // Linked in members first (0), non-members (1)
            const liSort = isLinkedIn ? '0:' : '1:'

            // compute heat score and daysAgo for sorting and rendering
            let daysAgo: number | null = null
            // Use Latest Contact (`last_engagement_date`) to drive heat/daysAgo
            const last = row.last_engagement_date ?? row.last_activity_date
            if (last) {
                const d = new Date(last)
                if (!isNaN(d.getTime())) {
                    daysAgo = Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)))
                }
            }
            const MAX_DAYS = 365
            const capped = daysAgo != null ? Math.min(daysAgo, MAX_DAYS) : MAX_DAYS
            const heatScore = Math.round((1 - capped / MAX_DAYS) * 100) // 0..100

            const actionsCount = Number(taskCountsMap[Number(row.contactid)] ?? 0)
            // Use only the authoritative `updated_at` (or `updatedAt`) timestamp
            // for Last Update sorting. Do not fall back to created/other fields.
            const upd = row.updated_at ?? row.updatedAt ?? null
            const updTsRaw = upd ? Date.parse(String(upd)) : NaN
            const __updated_ts = !isNaN(updTsRaw) ? updTsRaw : null
            return { ...row, __li_sort: liSort, __heat_score: heatScore, __heat_days: daysAgo, __actions_count: actionsCount, __updated_ts }
        })
    }, [dedupedById, taskCountsQ.data])

    function formatDateYMD(value: any) {
        if (!value && value !== 0) return ''
        try {
            const d = new Date(value)
            if (isNaN(d.getTime())) {
                // fallback: try to slice the first 10 characters
                const s = String(value || '')
                return s.length >= 10 ? s.slice(0, 10) : s
            }
            return d.toISOString().slice(0, 10)
        } catch (e) {
            const s = String(value || '')
            return s.length >= 10 ? s.slice(0, 10) : s
        }
    }

    const sorted = React.useMemo(() => sortArray(prepared, sortKey, sortDir), [prepared, sortKey, sortDir])
    const total = sorted.length
    const start = page * pageSize
    const items = sorted.slice(start, start + pageSize)



    const heatThreshQ = useQuery(['refdata', 'heat_threshold'], () => fetchReferenceData('heat_threshold'), { staleTime: 60000 })

    // fetch contact_status reference data so we can map Active/Inactive to refids
    const contactStatusQ = useQuery(['refdata', 'contact_status'], () => fetchReferenceData('contact_status'), { staleTime: 60000 })

    const contactStatusMap = React.useMemo(() => {
        const rows: any[] = contactStatusQ.data || []
        const map: Record<string, number> = {}
        for (const r of rows) {
            if (!r) continue
            const key = String(r.refvalue || '').toLowerCase()
            map[key] = Number(r.refid)
        }
        return map
    }, [contactStatusQ.data])

    const heatThresholds = React.useMemo(() => {
        // defaults (days)
        let warm = 30
        let cold = 90
        try {
            const items: any[] = heatThreshQ.data || []
            for (const it of items) {
                const v = String(it.refvalue || '')
                const parts = v.split(/[:=]/).map(s => s.trim())
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
            // fall back to defaults
        }
        // ensure sensible ordering
        if (warm >= cold) cold = warm + 30
        return { warm, cold }
    }, [heatThreshQ.data])

    const [engagementsColumnsExpanded, setEngagementsColumnsExpanded] = useState<boolean>(false)
    const [nameColumnsExpanded, setNameColumnsExpanded] = useState<boolean>(false)

    const buildColumns = () => {
        const cols: any[] = []



        cols.push({
            key: '__heat_score', label: 'Heat', render: (row: any) => {
                // Buckets based on thresholds provided in ReferenceData class 'heat_threshold'
                // hot: daysAgo < warm
                // warm: warm <= daysAgo < cold
                // cold: daysAgo >= cold
                // never contacted -> grey
                const daysAgo: number | null = row.__heat_days ?? null
                const score: number = typeof row.__heat_score === 'number' ? row.__heat_score : 0

                const { warm, cold } = heatThresholds
                let color = '#9e9e9e' // grey
                let label = 'Never contacted'
                const fillPercent = score
                if (daysAgo != null) {
                    if (daysAgo < warm) {
                        color = '#e53935' // red - hot
                        label = `-${daysAgo} days (hot)`
                    } else if (daysAgo < cold) {
                        color = '#fb8c00' // orange - warm
                        label = `-${daysAgo} days (warm)`
                    } else {
                        color = BRAND_PURPLE_LIGHT // lighter purple for UI fills/borders (heat bars remain blue in HeatFilter)
                        label = `-${daysAgo} days (cold)`
                    }
                }

                return (
                    <Tooltip title={label}>
                        <div style={{ width: 80, height: 10, background: '#eee', borderRadius: 4 }} aria-label={label}>
                            <div style={{ width: `${fillPercent}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 200ms ease' }} />
                        </div>
                    </Tooltip>
                )
            }
        })

        // Move Name/Title immediately after Heat, and include Role in that group.
        // Name / Title: table-level toggle. Title is hidden by default.
        if (!nameColumnsExpanded) {
            cols.push({
                key: 'name',
                label: (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <span>Name</span>
                        <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); setNameColumnsExpanded(true) }}
                            aria-label="Expand name columns"
                            sx={{
                                bgcolor: BRAND_PURPLE,
                                color: '#fff',
                                '&:hover': { bgcolor: BRAND_PURPLE, boxShadow: '0 10px 28px rgba(16,24,40,0.08)' },
                                width: 32,
                                height: 32,
                                padding: '6px',
                                borderRadius: '50%',
                                boxShadow: '0 6px 18px rgba(16,24,40,0.06)',
                                '&:active': { boxShadow: '0 4px 10px rgba(16,24,40,0.04)' }
                            }}
                        >
                            <ExpandMoreIcon fontSize="small" />
                        </IconButton>
                    </Box>
                ),
                render: (row: any) => (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {row.avatar_url ? (
                            <Avatar src={row.avatar_url} alt={row.name || ''} sx={{ width: 28, height: 28, fontSize: 16 }} />
                        ) : (
                            <Avatar sx={{ width: 28, height: 28, fontSize: 16 }}>{(row.name || '').charAt(0).toUpperCase()}</Avatar>
                        )}
                        <span>{row.name}</span>
                    </span>
                )
            })
            // collapsed: only show Name by default. Title/Role appear when the name group is expanded.
        } else {
            cols.push({
                key: 'name',
                label: (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <span>Name</span>
                        <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); setNameColumnsExpanded(false) }}
                            aria-label="Collapse name columns"
                            sx={{
                                bgcolor: BRAND_PURPLE,
                                color: '#fff',
                                '&:hover': { bgcolor: BRAND_PURPLE, boxShadow: '0 10px 28px rgba(16,24,40,0.08)' },
                                width: 32,
                                height: 32,
                                padding: '6px',
                                borderRadius: '50%',
                                boxShadow: '0 6px 18px rgba(16,24,40,0.06)',
                                '&:active': { boxShadow: '0 4px 10px rgba(16,24,40,0.04)' }
                            }}
                        >
                            <ExpandLessIcon fontSize="small" />
                        </IconButton>
                    </Box>
                ),
                render: (row: any) => (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {row.avatar_url ? (
                            <Avatar src={row.avatar_url} alt={row.name || ''} sx={{ width: 28, height: 28, fontSize: 16 }} />
                        ) : (
                            <Avatar sx={{ width: 28, height: 28, fontSize: 16 }}>{(row.name || '').charAt(0).toUpperCase()}</Avatar>
                        )}
                        <span>{row.name}</span>
                    </span>
                )
            })
            cols.push({ key: 'currentrole', label: 'Title', render: (row: any) => (<span>{row.currentrole ?? ''}</span>) })
            // role follows title in expanded group
            cols.push({ key: 'role_type', label: 'Role' })
        }

        cols.push({ key: 'current_organization', label: 'Organisation' })
        cols.push({ key: 'current_org_sector', label: 'Sector', render: (row: any) => (<span>{row.current_org_sector ?? ''}</span>) })

        cols.push({
            key: '__li_sort',
            label: (
                <Box sx={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', pl: '16px' }}>
                    <LinkedInIcon fontSize="small" sx={{ color: '#0A66C2' }} style={{ verticalAlign: 'middle' }} />
                </Box>
            ),
            // keep the LinkedIn column compact
            width: 48,
            render: (row: any) => {
                const linkedInFlags = [
                    row.islinkedinconnected,
                    row.is_linkedin_connected,
                    row.linkedin_connected,
                    row.linkedInConnected,
                ]
                const isLinkedIn = linkedInFlags.some((v) => v === true || v === 1 || String(v).toLowerCase() === 'true' || String(v) === '1')

                const handleClick = async () => {
                    // If already linked, open a search in a new tab
                    if (isLinkedIn) {
                        // Open a LinkedIn people search for the contact name
                        const query = encodeURIComponent(String(row.name || ''))
                        window.open(`https://www.linkedin.com/search/results/people/?keywords=${query}`, '_blank')
                        return
                    }
                    // Optimistically update the cached contacts list so the icon colour changes immediately
                    try {
                        const keyWithFilters = ['contactsList', { roleTypeFilterId, orgFilterId }]
                        const keyPlain = ['contactsList']
                        // Update filtered cache
                        queryClient.setQueryData(keyWithFilters, (old: any) => {
                            if (!old) return old
                            return (old as any[]).map((r: any) => {
                                if (Number(r.contactid) === Number(row.contactid)) {
                                    return { ...r, islinkedinconnected: true, is_linkedin_connected: true, linkedin_connected: true }
                                }
                                return r
                            })
                        })
                        // Also update plain cache used by other components
                        queryClient.setQueryData(keyPlain, (old: any) => {
                            if (!old) return old
                            try {
                                return (old as any[]).map((r: any) => {
                                    if (Number(r.contactid) === Number(row.contactid)) {
                                        return { ...r, islinkedinconnected: true, is_linkedin_connected: true, linkedin_connected: true }
                                    }
                                    return r
                                })
                            } catch (e) {
                                return old
                            }
                        })

                        await updateContact(Number(row.contactid), { islinkedinconnected: true })
                        // ensure server state is re-fetched in background
                        q.refetch()
                        setToastMsg('Marked LinkedIn connected')
                        setToastSeverity('success')
                        setToastOpen(true)
                    } catch (err: any) {
                        console.error('Failed to mark LinkedIn connected', err)
                        setToastMsg('Failed to mark LinkedIn connected')
                        setToastSeverity('error')
                        setToastOpen(true)
                        // revert optimistic update by refetching from server
                        // refetch table and ensure other contactsList queries are refreshed
                        q.refetch()
                        queryClient.invalidateQueries(['contactsList'])
                    }
                }

                return (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', pl: '16px' }}>
                        <Tooltip title={isLinkedIn ? 'Open search' : 'Mark as LinkedIn connected'}>
                            <IconButton aria-label={isLinkedIn ? `Open LinkedIn for ${row.name}` : `Mark LinkedIn for ${row.name}`} size="small" onClick={handleClick} sx={{ marginLeft: 0, padding: 0 }}>
                                {isLinkedIn ? (
                                    <LinkedInIcon fontSize="small" sx={{ color: '#0A66C2' }} />
                                ) : (
                                    <LinkedInIcon fontSize="small" sx={{ color: '#9e9e9e' }} />
                                )}
                            </IconButton>
                        </Tooltip>
                    </Box>
                )
            }
        })

        cols.push({
            key: '__actions_count',
            label: (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <strong>Actions</strong>
                </Box>
            ),
            render: (row: any) => {
                const cid = Number(row.contactid)
                const count = row.__actions_count ?? (taskCountsMap[cid] ?? 0)
                return (
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <AppButton size="small" colorScheme="white" sx={{ fontWeight: 700, justifyContent: 'center', pl: 0, minWidth: 64 }} onClick={() => openActionsModal(cid, row.name)}>{count}</AppButton>
                    </div>
                )
            },
            // make the actions count column narrow to the header text
            shrinkToHeader: true,
            center: true
        })

        // Simple cache to avoid refetching contact documents repeatedly
        const contactDocsCache: Map<number, string[]> = (typeof window !== 'undefined' ? (window as any).__contactDocsCache || ((window as any).__contactDocsCache = new Map()) : new Map())

        function DocPreview({ contactId, count }: { contactId: number, count: number }) {
            const [names, setNames] = React.useState<string[] | null>(() => {
                try {
                    const cached = contactDocsCache.get(contactId)
                    return cached ? cached.slice() : null
                } catch (e) { return null }
            })
            const [loading, setLoading] = React.useState(false)

            const handleOpen = async () => {
                if (names != null) return
                if (!count || count <= 0) {
                    setNames([])
                    return
                }
                // fetch and cache
                try {
                    setLoading(true)
                    const docs = await fetchContactDocuments(contactId)
                    const extracted = (docs || []).map((d: any) => (d.documentname || d.document_name || d.documentdescription || d.documenturi || '').toString()).filter(Boolean)
                    contactDocsCache.set(contactId, extracted)
                    setNames(extracted)
                } catch (e) {
                    contactDocsCache.set(contactId, [])
                    setNames([])
                } finally {
                    setLoading(false)
                }
            }

            const titleNode = loading ? 'Loading…' : (names && names.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {names.map((n, i) => <div key={i} style={{ whiteSpace: 'pre-wrap' }}>{n}</div>)}
                </div>
            ) : 'No documents')

            return (
                <Tooltip title={titleNode} placement="top" onOpen={handleOpen}>
                    <span style={{ cursor: count > 0 ? 'help' : 'default' }}>{count}</span>
                </Tooltip>
            )
        }

        cols.push({
            key: 'documents_count',
            label: (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <strong>Docs</strong>
                </Box>
            ),
            render: (row: any) => {
                const cid = Number(row.contactid)
                const count = Number(row.documents_count ?? docCounts[cid] ?? 0)
                return (
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <DocPreview contactId={cid} count={count} />
                    </div>
                )
            }, center: true, shrinkToHeader: true, width: 72
        })

        cols.push({
            key: 'roles_count',
            label: (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <strong>Roles</strong>
                </Box>
            ),
            render: (row: any) => (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <AppButton size="small" colorScheme="white" sx={{ fontWeight: 700, justifyContent: 'center', pl: 0, minWidth: 64 }} onClick={() => openCountModal('roles', row.contactid, row.name)}>{row.roles_count ?? 0}</AppButton>
                </div>
            ),
            shrinkToHeader: true,
            width: 72,
            center: true
        })

        // last_activity_date will be added inside engagement blocks (collapsed or expanded)

        if (!engagementsColumnsExpanded) {
            // collapsed: single sortable engagement_count column with per-row expand control
            cols.push({
                key: 'engagement_count',
                label: (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <span>Engagements</span>
                        <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); setEngagementsColumnsExpanded(true) }}
                            aria-label="Expand engagements columns"
                            sx={{
                                bgcolor: BRAND_PURPLE,
                                color: '#fff',
                                '&:hover': { bgcolor: BRAND_PURPLE, boxShadow: '0 10px 28px rgba(16,24,40,0.08)' },
                                width: 32,
                                height: 32,
                                padding: '6px',
                                borderRadius: '50%',
                                boxShadow: '0 6px 18px rgba(16,24,40,0.06)',
                                '&:active': { boxShadow: '0 4px 10px rgba(16,24,40,0.04)' }
                            }}
                        >
                            <ExpandMoreIcon fontSize="small" />
                        </IconButton>
                    </Box>
                ),
                render: (row: any) => {
                    const cid = Number(row.contactid)
                    const count = row.engagement_count ?? 0
                    return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                            <AppButton size="small" colorScheme="white" aria-label={`Expand engagement details for ${row.name}`} sx={{ fontWeight: 700, justifyContent: 'center', pl: 0, minWidth: 64 }} onClick={() => openCountModal('engagements', cid, row.name)}>{count}</AppButton>
                        </div>
                    )
                }
                , center: true
            })
            // (removed) Last activity column: intentionally omitted from collapsed view
        } else {
            // expanded: three separate sortable columns
            cols.push({
                key: 'engagement_count',
                label: (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <span>Engagements</span>
                        <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); setEngagementsColumnsExpanded(false) }}
                            aria-label="Collapse engagements columns"
                            sx={{
                                bgcolor: BRAND_PURPLE,
                                color: '#fff',
                                '&:hover': { bgcolor: BRAND_PURPLE, boxShadow: '0 10px 28px rgba(16,24,40,0.08)' },
                                width: 32,
                                height: 32,
                                padding: '6px',
                                borderRadius: '50%',
                                boxShadow: '0 6px 18px rgba(16,24,40,0.06)',
                                '&:active': { boxShadow: '0 4px 10px rgba(16,24,40,0.04)' }
                            }}
                        >
                            <ExpandLessIcon fontSize="small" />
                        </IconButton>
                    </Box>
                ),
                render: (row: any) => (<div style={{ display: 'flex', justifyContent: 'center' }}><AppButton size="small" colorScheme="white" sx={{ fontWeight: 700, justifyContent: 'center', pl: 0, minWidth: 64 }} onClick={() => openCountModal('engagements', Number(row.contactid), row.name)}>{row.engagement_count ?? 0}</AppButton></div>)
                , center: true
            })

            cols.push({ key: 'first_contact_date', label: 'First Contact', render: (row: any) => (<span>{row.first_contact_date ?? ''}</span>), center: true })
            cols.push({ key: 'last_engagement_date', label: 'Latest Contact', render: (row: any) => (<span>{row.last_engagement_date ?? row.last_contact_date ?? row.last_activity_date ?? ''}</span>), center: true, sortable: true })
        }

        // Ensure last update column is visible (use derived timestamp for sorting but render yyyy-mm-dd)
        cols.push({ key: '__updated_ts', label: 'Last Update', render: (row: any) => (<span>{formatDateYMD(row.updated_at ?? row.updatedAt ?? '')}</span>), center: true, sortable: true })

        // support injection of an extra per-row action (e.g. remove mapping) when used inside modals
        // Note: do not add a separate extra action column here — render any
        // injected `extraActionRender` inside the Actions column so buttons
        // appear at the end of the row consistently.

        return cols
    }

    const columns = buildColumns()

    // add actions column
    columns.push({
        key: 'actions', label: 'Actions',
        // keep the edit/delete actions column compact; add extra padding in modals
        shrinkToHeader: true,
        width: inModal ? 180 : 120,
        render: (row: any) => {
            const cid = Number(row.contactid)

            // Determine active state: prefer contact_status_value, fall back to latestcvsent, default true
            const contactStatusValue = (row.contact_status_value || row.contact_status || '').toString().toLowerCase()
            const legacyCv = row.latestcvsent
            const isActive = contactStatusValue ? contactStatusValue === 'active' : (legacyCv == null ? true : (legacyCv === true || String(legacyCv) === 'True' || String(legacyCv) === 'true' || String(legacyCv) === '1'))

            const toggleActive = async (_e: any, checked: boolean) => {
                // optimistic update in cached contacts lists
                const keyWithFilters = ['contactsList', { applicantId: aid, roleTypeFilterId, orgFilterId }]
                const keyPlain = ['contactsList', { applicantId: aid }]
                try {
                    queryClient.setQueryData(keyWithFilters, (old: any) => {
                        if (!old) return old
                        try {
                            return (old as any[]).map((r: any) => (Number(r.contactid) === cid ? { ...r, contact_status_value: checked ? 'Active' : 'Inactive', latestcvsent: checked } : r))
                        } catch (e) { return old }
                    })
                    queryClient.setQueryData(keyPlain, (old: any) => {
                        if (!old) return old
                        try {
                            return (old as any[]).map((r: any) => (Number(r.contactid) === cid ? { ...r, contact_status_value: checked ? 'Active' : 'Inactive', latestcvsent: checked } : r))
                        } catch (e) { return old }
                    })

                    // prepare payload: prefer statusid refids if available
                    const activeRef = contactStatusMap['active'] ?? null
                    const inactiveRef = contactStatusMap['inactive'] ?? null
                    if (activeRef && inactiveRef) {
                        // Backend now accepts `contact_status` (string). Send the label
                        // rather than refid; server will map to refid internally.
                        await updateContact(cid, { contact_status: checked ? 'Active' : 'Inactive' })
                    } else {
                        // fallback to legacy boolean flag
                        await updateContact(cid, { latestcvsent: checked })
                    }

                    // ensure server state is re-fetched in background
                    q.refetch()
                    // also ensure any other cached queries for this applicant refresh
                    try { queryClient.invalidateQueries(['contactsList', { applicantId: aid }]) } catch (e) { /* ignore */ }
                    setToastMsg(`Marked contact ${checked ? 'Active' : 'Inactive'}`)
                    setToastSeverity('success')
                    setToastOpen(true)
                } catch (err: any) {
                    console.error('Failed to update contact status', err)
                    setToastMsg('Failed to update contact status')
                    setToastSeverity('error')
                    setToastOpen(true)
                    // revert optimistic update by refetching
                    q.refetch()
                    queryClient.invalidateQueries(['contactsList', { applicantId: aid }])
                }
            }

            return (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: inModal ? 12 : 8, alignItems: 'center', paddingLeft: inModal ? 16 : 0 }}>
                    <Tooltip title={`Toggle Contact Status to ${isActive ? 'Inactive' : 'Active'}`}>
                        <span>
                            <Switch checked={Boolean(isActive)} onChange={toggleActive} inputProps={{ 'aria-label': `${row.name} active` }} size="small" />
                        </span>
                    </Tooltip>
                    <IconButton size="small" aria-label={`Edit contact ${row.contactid}`} onClick={() => handleEdit(row)}><EditIcon fontSize="small" /></IconButton>
                    {!inModal ? <IconButton size="small" aria-label={`Delete contact ${row.contactid}`} onClick={() => handleDelete(row)}><DeleteIcon fontSize="small" /></IconButton> : null}
                    {typeof (extraActionRender as any) === 'function' ? <div style={{ display: 'flex', alignItems: 'center' }}>{(extraActionRender as any)(row)}</div> : null}
                </div>
            )
        }
    })

    // (debug column removed)

    const [editingRow, setEditingRow] = useState<any | null>(null)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [confirmRow, setConfirmRow] = useState<any | null>(null)
    const [toastOpen, setToastOpen] = useState(false)
    const [toastMsg, setToastMsg] = useState('')
    const [toastSeverity, setToastSeverity] = useState<'success' | 'error' | 'info' | 'warning'>('success')

    // modal state for clickable counts
    const [countModalOpen, setCountModalOpen] = useState(false)
    const [countModalMode, setCountModalMode] = useState<'roles' | 'engagements'>('roles')
    const [countModalContactId, setCountModalContactId] = useState<number | null>(null)
    const [countModalContactName, setCountModalContactName] = useState<string | null>(null)

    // Track per-row expanded state for grouped columns (engagements -> shows first/last dates)
    const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({})

    function toggleExpandedRow(contactId?: number) {
        if (contactId == null) return
        setExpandedRows(prev => ({ ...prev, [contactId]: !prev[contactId] }))
    }

    function openCountModal(mode: 'roles' | 'engagements', contactId: number, contactName?: string) {
        setCountModalMode(mode)
        setCountModalContactId(contactId ?? null)
        setCountModalContactName(contactName ?? null)
        setCountModalOpen(true)
    }

    function closeCountModal() {
        setCountModalOpen(false)
        setCountModalContactId(null)
        setCountModalContactName(null)
    }

    function handleEdit(row: any) {
        setEditingRow(row)
        setOpenCreate(true)
    }

    // sector is read-only here; organisation edits happen in Organisations view

    function handleDelete(row: any) {
        setConfirmRow(row)
        setConfirmOpen(true)
    }

    async function confirmDelete() {
        const row = confirmRow
        if (!row || !row.contactid) return
        try {
            await deleteContact(Number(row.contactid))
            q.refetch()
            // Ensure Hub-level stats/cards refresh without a full page reload
            try { queryClient.invalidateQueries(['contactsList']) } catch (e) { /* ignore */ }
            try { queryClient.invalidateQueries(['contactsCount']) } catch (e) { /* ignore */ }
            try { queryClient.invalidateQueries(['contactsAllForHeat']) } catch (e) { /* ignore */ }
            try { queryClient.invalidateQueries(['analyticsSummary']) } catch (e) { /* ignore */ }
            try { queryClient.invalidateQueries(['engagementsAll']) } catch (e) { /* ignore */ }
            try { queryClient.invalidateQueries(['engagementsCount']) } catch (e) { /* ignore */ }
            setToastMsg('Contact deleted')
            setToastSeverity('success')
            setToastOpen(true)
        } catch (err: any) {
            console.error('Delete failed', err)
            setToastMsg('Failed to delete contact: ' + String(err?.message || err))
            setToastSeverity('error')
            setToastOpen(true)
        } finally {
            setConfirmOpen(false)
            setConfirmRow(null)
        }
    }

    return (
        <Box>

            {!hideCreateButton && contactOrgMode !== 'targeting' && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                    <AppButton colorScheme="purple" onClick={() => setOpenCreate(true)}>+ Add Contact</AppButton>
                </Box>
            )}
            <DataTable
                rows={items}
                total={total}
                columns={columns}
                page={page}
                pageSize={pageSize}
                onPageChange={(p) => setPage(p)}
                onPageSizeChange={(s) => { setPageSize(s); setPage(0) }}
                sortKey={sortKey ?? undefined}
                sortDirection={sortDir ?? undefined}
                onSortChange={(key, dir) => { setSortKey(key); setSortDir(dir); setPage(0) }}
            />

            <QuickCreateModal open={openCreate} onClose={() => { setOpenCreate(false); setEditingRow(null) }} editing={editingRow} />
            <ConfirmDialog
                open={confirmOpen}
                title="Delete contact"
                description={confirmRow ? `Are you sure you want to delete ${confirmRow.name}? This will remove associated engagement logs.` : ''}
                onConfirm={confirmDelete}
                onClose={() => setConfirmOpen(false)}
            />
            <Toast open={toastOpen} message={toastMsg} severity={toastSeverity} onClose={() => setToastOpen(false)} />

            <WideDialog open={countModalOpen} onClose={closeCountModal} fullWidth fitToContent>
                <DialogTitle>
                    {countModalMode === 'roles' ? 'Roles' : 'Engagements'} for {countModalContactName ?? ''}
                </DialogTitle>
                <DialogContent dividers>
                    {countModalMode === 'roles' ? (
                        // lazy import the RolesTable; pass contactId so it fetches filtered data
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        // @ts-ignore
                        <RolesTable contactId={countModalContactId ?? undefined} />
                    ) : (
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        // @ts-ignore
                        <EngagementsTable contactId={countModalContactId ?? undefined} />
                    )}
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                    <AppButton colorScheme="white" onClick={closeCountModal}>Close</AppButton>
                </DialogActions>
            </WideDialog>

            <Dialog open={actionsModalOpen} onClose={closeActionsModal} fullWidth maxWidth="sm">
                <DialogTitle>Actions for {actionsModalContactName ?? ''}</DialogTitle>
                <DialogContent dividers>
                    {actionsList && actionsList.length ? (
                        <div>
                            {actionsList.map((t: any) => (
                                <Box key={t.taskid} sx={{ mb: 1, p: 1, borderBottom: '1px solid #eee' }}>
                                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                                    <div style={{ fontSize: 12, color: '#666' }}>{t.duedate ?? ''}</div>
                                </Box>
                            ))}
                        </div>
                    ) : (
                        <div>No linked actions</div>
                    )}
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                    <AppButton colorScheme="white" onClick={closeActionsModal}>Close</AppButton>
                    <AppButton colorScheme="purple" onClick={async () => {
                        // Open task picker to link an existing action to this contact
                        try {
                            setTaskPickerLoading(true)
                            const tasks = await fetchTasks()
                            setTasksList(tasks || [])
                            if (tasks && tasks.length) setSelectedTaskIdForLink(tasks[0].taskid ?? null)
                            setTaskPickerOpen(true)
                        } catch (e) {
                            console.error('Failed to load tasks for linking', e)
                        } finally {
                            setTaskPickerLoading(false)
                        }
                    }}>Link to action</AppButton>
                </DialogActions>
            </Dialog>

            {/* Task picker dialog for linking contact to an existing task */}
            <Dialog open={taskPickerOpen} onClose={() => { setTaskPickerOpen(false); setSelectedTaskIdForLink(null) }} maxWidth="sm" fullWidth>
                <DialogTitle>Link {actionsModalContactName ?? 'contact'} to an existing Action</DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 1 }}>
                        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                            <InputLabel id="select-task-link-label">Select existing task</InputLabel>
                            <Select
                                labelId="select-task-link-label"
                                value={selectedTaskIdForLink ?? ''}
                                label="Select existing task"
                                onChange={(e) => setSelectedTaskIdForLink(e.target.value ? Number(e.target.value) : null)}
                            >
                                <MenuItem value="">(none)</MenuItem>
                                {tasksList.map((t: any) => (
                                    <MenuItem key={t.taskid} value={t.taskid}>{t.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                    <Button onClick={() => { setTaskPickerOpen(false); setSelectedTaskIdForLink(null); }} variant="outlined" sx={{ borderColor: BRAND_PURPLE, color: BRAND_PURPLE, fontWeight: 'normal' }}>
                        Cancel
                    </Button>
                    <AppButton colorScheme="purple" onClick={async () => {
                        if (!selectedTaskIdForLink || !actionsModalContactId || !contactTargetRefId) return
                        try {
                            await addTaskTarget(Number(selectedTaskIdForLink), { targettype: Number(contactTargetRefId), targetid: Number(actionsModalContactId) })
                            // refresh actions list for the contact
                            const tasks = await fetchContactTasks(Number(actionsModalContactId))
                            setActionsList(tasks || [])
                            // ensure counts and contact caches refresh so the table shows updated counts
                            try { queryClient.invalidateQueries(['contactTaskCounts']) } catch (e) { /* ignore */ }
                            try { queryClient.invalidateQueries(['contactsList']) } catch (e) { /* ignore */ }
                            // show a brief toast
                            setToastMsg('Linked contact to action')
                            setToastSeverity('success')
                            setToastOpen(true)
                        } catch (e) {
                            console.error('Failed to link contact to task', e)
                            setToastMsg('Failed to link contact to action')
                            setToastSeverity('error')
                            setToastOpen(true)
                        } finally {
                            setTaskPickerOpen(false)
                            setSelectedTaskIdForLink(null)
                        }
                    }}>
                        Link action
                    </AppButton>
                </DialogActions>
            </Dialog>
        </Box>
    )
}
