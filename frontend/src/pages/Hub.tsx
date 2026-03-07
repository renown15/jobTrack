import React, { useState, useRef } from 'react'
import { BRAND_PURPLE } from '../constants/colors'
import { ACCORDION_TITLE_SX, ACCORDION_TITLE_VARIANT } from '../constants/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAnalyticsSummary, fetchContacts, fetchOrganisations, fetchJobRoles, fetchEngagementsCount, fetchEngagements, fetchReferenceData, fetchAllContacts, createExport } from '../api/client'
import StatsCards from '../components/Hub/StatsCards'
import HubMainView from '../components/Hub/HubMainView'
import QuickCreateModal from '../components/Hub/QuickCreateModal'
import HeatFilter from '../components/Hub/HeatFilter'
import Box from '@mui/material/Box'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Dialog from '../components/Shared/WideDialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { SEARCH_HUB } from '../constants/labels'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import Typography from '@mui/material/Typography'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import AppButton from '../components/Shared/AppButton'
import ExportToSpreadsheet from '../components/ExportData/ExportToSpreadsheet'
import { getApplicantId } from '../auth/currentApplicant'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import ClearIcon from '@mui/icons-material/Clear'
import CircularProgress from '@mui/material/CircularProgress'
import Toast from '../components/Shared/Toast'

export default function Hub() {
    const [exporting, setExporting] = useState(false)
    const [toastOpen, setToastOpen] = useState(false)
    const [toastMessage, setToastMessage] = useState('')
    const [toastSeverity, setToastSeverity] = useState<'success' | 'info' | 'warning' | 'error'>('info')
    const [exportConfirmOpen, setExportConfirmOpen] = useState(false)
    const [exportingNow, setExportingNow] = useState(false)
    const [overviewOpen, setOverviewOpen] = useState<boolean>(true)
    // Close the summary by default on mobile viewports for a cleaner UX
    const themeLocal = useTheme()
    const isMobile = useMediaQuery(themeLocal.breakpoints.down('md'))
    React.useEffect(() => {
        try {
            if (isMobile) setOverviewOpen(false)
        } catch (e) { /* ignore */ }
    }, [isMobile])
    const [activeKey, setActiveKey] = useState<'contacts' | 'organisations' | 'roles' | 'engagements' | 'recruiters' | 'recruiters_met' | 'other_contacts_met' | 'recruitment_organisations' | 'active_roles' | 'interviews'>('contacts')
    const [search, setSearch] = useState('')
    const [quickCreateOpen, setQuickCreateOpen] = useState(false)
    const [quickCreateMode, setQuickCreateMode] = useState<string>('contact')
    // Top-level nested quick-create state for child modal requests
    const [topQuickNestedOpen, setTopQuickNestedOpen] = useState(false)
    const [topQuickNestedMode, setTopQuickNestedMode] = useState<any | null>(null)
    const [topQuickNestedEditing, setTopQuickNestedEditing] = useState<any | null>(null)
    const topQuickNestedCallbackRef = useRef<((created: any) => void) | null>(null)
    const [sectorFilter, setSectorFilter] = useState<string | null>(null)
    const [heatRange, setHeatRange] = useState<number[]>([0, 365])
    const [suspendClamp, setSuspendClamp] = useState<boolean>(false)
    const [showActiveOnly, setShowActiveOnly] = useState<boolean>(false)
    const queryClient = useQueryClient()
    // Track whether the last heatRange change originated from a user action or
    // from programmatic updates within Hub. We only persist `globalHeatRange`
    // when the user changed the slider to avoid transient flips.
    const lastHeatChangeSourceRef = useRef<'user' | 'program' | null>(null)
    const applyProgrammaticHeatRange = (r: number[]) => {
        try {
            lastHeatChangeSourceRef.current = 'program'
            setHeatRange(r)
        } finally {
            // leave the marker for the immediate effect to observe
        }
    }

    // Fetch all contacts once to compute the newest engagement (smallest days-ago)
    const contactsAllForHeatQ = useQuery(['contactsAllForHeat'], () => fetchAllContacts(), { staleTime: 60000 })



    // Dev: log how many distinct last_contact_date values we have
    React.useEffect(() => {
        if (process.env.NODE_ENV === 'production') return
        const list = contactsAllForHeatQ.data ?? []
        const dates = new Set<string>()
        for (const c of list) {
            const last = c?.last_contact_date
            if (!last) continue
            const d = new Date(last)
            if (isNaN(d.getTime())) continue
            dates.add(d.toISOString().slice(0, 10))
        }
        // eslint-disable-next-line no-console
        console.log('Hub: distinct last_contact_date count', dates.size, 'sample=', Array.from(dates).slice(0, 10))
    }, [contactsAllForHeatQ.data])



    const summaryQ = useQuery(['analyticsSummary'], () => fetchAnalyticsSummary(), { staleTime: 60000 })

    // Fetch full contacts list length for an accurate total count. Using
    // `fetchContacts(1,1)` returned 1 due to client-side pagination, which
    // caused the Total Contacts card to show incorrect values on first render.
    const contactsCountQ = useQuery(['contactsCount'], async () => {
        const all = await fetchAllContacts()
        return Array.isArray(all) ? all.length : 0
    })

    const organisationsQ = useQuery(['organisations'], () => fetchOrganisations(), { staleTime: 60000 })
    const jobrolesQ = useQuery(['jobroles'], () => fetchJobRoles(), { staleTime: 60000 })
    const engagementsCountQ = useQuery(['engagementsCount'], () => fetchEngagementsCount(), { staleTime: 60000 })
    // fetch all engagements for computing interview counts (cached separately)
    const engagementsQ = useQuery(['engagementsAll'], () => fetchEngagements(), { staleTime: 60000 })
    const roleTypesQ = useQuery(['refdata', 'contact_role_type'], () => fetchReferenceData('contact_role_type'), { staleTime: 60000 })

    // fetch heat thresholds so we can show bucket counts in the HeatFilter
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
            // ignore
        }
        if (warm >= cold) cold = warm + 30
        return { warm, cold }
    }, [heatThreshQ.data])

    // count organisations in the Recruitment sector (various labels may exist)
    const recruitmentSectorString = 'Recruitment & Executive Search'
    const recruitmentSectorAlt = 'Recruitment & Exec Search'
    const recruitmentOrgsCount = React.useMemo(() => {
        const list = organisationsQ.data ?? []
        return (
            list.filter((o: any) => {
                const s = String(o.sector_summary || '').trim()
                if (!s) return false
                const lower = s.toLowerCase()
                return lower.includes('recruit') || s === recruitmentSectorString || s === recruitmentSectorAlt
            }).length
        )
    }, [organisationsQ.data])

    // Debug: log organisations data and recruitment count when organisations change
    React.useEffect(() => {
        try {
            // eslint-disable-next-line no-console
            console.debug('[Hub] organisationsQ.data length ->', (organisationsQ.data || []).length, 'recruitmentOrgsCount ->', recruitmentOrgsCount)
        } catch (e) {
            // ignore
        }
    }, [organisationsQ.data, recruitmentOrgsCount])

    // Employing organisations: any organisation NOT in the recruitment sector
    const employingOrgsCount = React.useMemo(() => {
        const list = organisationsQ.data ?? []
        return (
            list.filter((o: any) => {
                const s = String(o.sector_summary || '').trim()
                if (!s) return true // treat blank sector as employing
                const lower = s.toLowerCase()
                return !(lower.includes('recruit') || s === recruitmentSectorString || s === recruitmentSectorAlt)
            }).length
        )
    }, [organisationsQ.data])

    // If specific contact_role_type class doesn't contain 'Recruiter', fall back to searching all refdata
    const allRefDataQ = useQuery(['refdata', 'all'], () => fetchReferenceData(), { staleTime: 60000, enabled: !roleTypesQ.isLoading && (roleTypesQ.data ?? []).length === 0 })

    // compute recruiter refid. Search the specific class first, then fallback to all refdata if needed.
    const recruiterRefId = React.useMemo(() => {
        const list = roleTypesQ.data ?? []
        const findRecruiter = (arr: any[]) => arr.find((r: any) => String(r.refvalue || r.label || r.code || '').toLowerCase().includes('recruiter'))
        let found = findRecruiter(list)
        if (!found && (allRefDataQ.data ?? []).length > 0) {
            found = findRecruiter(allRefDataQ.data ?? [])
        }
        return found ? Number(found.refid) : null
    }, [roleTypesQ.data, allRefDataQ.data])

    const recruitersCountQ = useQuery(['recruitersCount', recruiterRefId], async () => {
        if (!recruiterRefId) return 0
        const list = await fetchAllContacts(recruiterRefId)
        return (list ?? []).length
    }, { enabled: !!recruiterRefId })

    // fetch all recruiter contacts when we have a recruiterRefId so the heat filter can reflect that dataset
    const contactsAllForHeatRecruitersQ = useQuery(
        ['contactsAllForHeat', 'recruiters', recruiterRefId],
        () => fetchAllContacts(recruiterRefId ?? undefined),
        { staleTime: 60000, enabled: !!recruiterRefId }
    )

    // Debug: log recruiter/refdata lookup state to help diagnose why recruiterRefId may be missing
    React.useEffect(() => {
        try {
            // eslint-disable-next-line no-console
            console.debug('[Hub] recruiterRefId ->', recruiterRefId,
                'roleTypesQ.len=', (roleTypesQ.data || []).length,
                'allRefDataQ.len=', (allRefDataQ.data || []).length,
                'recruitersCount=', recruitersCountQ.data,
                'contactsAllForHeatRecruitersQ.len=', (contactsAllForHeatRecruitersQ.data || []).length)
        } catch (e) { /* ignore */ }
    }, [recruiterRefId, roleTypesQ.data, allRefDataQ.data, recruitersCountQ.data, contactsAllForHeatRecruitersQ.data])










    // Choose which contact list to use for the heat filter depending on the active card
    const selectedContactsList = React.useMemo(() => {
        // If showing a 'met' view, restrict the heat dataset to only those contact ids that were met
        const engagementIdsSet = new Set<number>()
        for (const e of (engagementsQ.data ?? [])) {
            const t = String(e?.type || e?.kind || '').toLowerCase()
            if (t.includes('discussion') || t.includes('interview')) {
                if (e?.contactid) engagementIdsSet.add(Number(e.contactid))
            }
        }
        if (activeKey === 'recruiters' || activeKey === 'recruiters_met') {
            const base = contactsAllForHeatRecruitersQ.data ?? []
            if (activeKey === 'recruiters_met') return (base || []).filter((c: any) => engagementIdsSet.has(Number(c.contactid)))
            return base
        }
        if (activeKey === 'other_contacts_met') {
            const base = contactsAllForHeatQ.data ?? []
            // exclude recruiters and keep only met contacts
            return (base || []).filter((c: any) => {
                const cid = Number(c.contactid)
                if (!engagementIdsSet.has(cid)) return false
                const roleId = Number(c.role_type_id ?? c.roleid ?? 0)
                if (recruiterRefId != null && roleId === Number(recruiterRefId)) return false
                return true
            })
        }
        return contactsAllForHeatQ.data ?? []
    }, [activeKey, contactsAllForHeatQ.data, contactsAllForHeatRecruitersQ.data, engagementsQ.data, recruiterRefId])

    // Compute the minimum (newest) and maximum (oldest) days-ago from the selected contacts
    const daysAgoRange = React.useMemo(() => {
        const list = selectedContactsList || []
        let min = Infinity
        let max = -Infinity
        const today = Date.now()
        for (const c of list) {
            const last = c?.last_contact_date
            if (!last) continue
            const d = new Date(last)
            if (isNaN(d.getTime())) continue
            const daysAgo = Math.max(0, Math.floor((today - d.getTime()) / (1000 * 60 * 60 * 24)))
            if (daysAgo < min) min = daysAgo
            if (daysAgo > max) max = daysAgo
        }
        if (!isFinite(min)) min = 0
        if (!isFinite(max)) max = 0
        min = Math.min(365, Math.max(0, min))
        max = Math.min(365, Math.max(0, max))
        return { min, max }
    }, [selectedContactsList])

    // Initialize the heat range once when contact data becomes available.
    // Avoid re-initializing on subsequent reloads or small dataset changes
    // which was causing the slider to snap back to the minimum value.
    const heatRangeInitialized = useRef(false)
    React.useEffect(() => {
        if (activeKey !== 'contacts') return
        const list = selectedContactsList || []
        // only initialize once and only when we have contact data to compute a meaningful range
        if (!heatRangeInitialized.current && Array.isArray(list) && list.length > 0) {
            applyProgrammaticHeatRange([daysAgoRange.min, daysAgoRange.max])
            heatRangeInitialized.current = true
        }
        // only run when activeKey, the selected list or computed range changes
    }, [activeKey, selectedContactsList, daysAgoRange.min, daysAgoRange.max])

    // Remember the user's last-selected heatRange when viewing the main 'contacts' card.
    // We keep a separate `globalHeatRange` so the Total Contacts card uses a stable
    // range even when the user switches to recruiter/other-contact views which
    // temporarily set `heatRange` for the filtered dataset.
    const [globalHeatRange, setGlobalHeatRange] = useState<number[]>([0, 365])
    React.useEffect(() => {
        if (activeKey === 'contacts') {
            // Only persist the globalHeatRange when the user changed the slider.
            if (lastHeatChangeSourceRef.current === 'user') {
                setGlobalHeatRange(heatRange)
            }
        }
    }, [activeKey, heatRange])

    // Track previous dataset min so when the dataset min moves (e.g. after adding an engagement)
    // and the user had the slider pinned to the old min, we update the slider to the new min.
    const prevDatasetMinRef = useRef<number | null>(null)
    React.useEffect(() => {
        if (activeKey !== 'contacts') {
            prevDatasetMinRef.current = daysAgoRange.min
            return
        }
        try {
            const prev = prevDatasetMinRef.current
            const cur = daysAgoRange.min
            // If we have a previous min and the current heatRange lower bound equals that previous min,
            // update it to the new min so the slider remains effectively pinned to the dataset min.
            if (prev != null && Array.isArray(heatRange) && heatRange.length === 2) {
                const currentLo = Number(heatRange[0] ?? 0)
                const currentHi = Number(heatRange[1] ?? daysAgoRange.max)
                if (currentLo === prev && cur !== prev) {
                    // preserve the upper bound
                    applyProgrammaticHeatRange([cur, currentHi])
                }
            }
            prevDatasetMinRef.current = cur
        } catch (e) {
            // ignore
            prevDatasetMinRef.current = daysAgoRange.min
        }
    }, [daysAgoRange.min, activeKey, heatRange, daysAgoRange.max])

    // Track previous dataset max so when the dataset max moves (e.g. after adding
    // a contact or engagements) and the user had the slider upper bound pinned to
    // the old max, update the slider upper bound to the new max. This mirrors
    // the min-handling above and avoids requiring the user to press Reset.
    const prevDatasetMaxRef = useRef<number | null>(null)
    React.useEffect(() => {
        if (activeKey !== 'contacts') {
            prevDatasetMaxRef.current = daysAgoRange.max
            return
        }
        try {
            const prev = prevDatasetMaxRef.current
            const cur = daysAgoRange.max
            if (prev != null && Array.isArray(heatRange) && heatRange.length === 2) {
                const currentLo = Number(heatRange[0] ?? 0)
                const currentHi = Number(heatRange[1] ?? daysAgoRange.max)
                // If the user's current upper bound equals the previous dataset
                // max and the dataset max moved, update the upper bound to follow
                // the dataset so newly-visible rows (e.g. never-contacted) are
                // included automatically.
                if (currentHi === prev && cur !== prev) {
                    applyProgrammaticHeatRange([currentLo, cur])
                }
            }
            prevDatasetMaxRef.current = cur
        } catch (e) {
            prevDatasetMaxRef.current = daysAgoRange.max
        }
    }, [daysAgoRange.max, activeKey, heatRange, daysAgoRange.min])

    // Compute recruiter-specific counts (matches/no-contact/total) so the Recruitment Contacts card can show the same triplet
    // Recruitment contacts count should be fixed to the total population for recruiters
    // and should not change when the heat slider is moved.
    const matchesCountRecruiters = React.useMemo(() => {
        const list = contactsAllForHeatRecruitersQ.data ?? []
        return Array.isArray(list) ? list.length : 0
    }, [contactsAllForHeatRecruitersQ.data])

    const totalCountRecruiters = React.useMemo(() => {
        const list = contactsAllForHeatRecruitersQ.data ?? []
        return Array.isArray(list) ? list.length : 0
    }, [contactsAllForHeatRecruitersQ.data])

    const noContactCountRecruiters = React.useMemo(() => {
        const list = contactsAllForHeatRecruitersQ.data ?? []
        if (!Array.isArray(list) || list.length === 0) return 0
        let n = 0
        for (const c of list) {
            const last = c?.last_contact_date
            if (!last) {
                n++
                continue
            }
            const d = new Date(last)
            if (isNaN(d.getTime())) n++
        }
        return n
    }, [contactsAllForHeatRecruitersQ.data])

    // Avoid blocking the entire Hub render on analytics or optional refdata fetches.
    // Show spinner only while core data (counts and lists) are loading.
    const loading = contactsCountQ.isLoading || organisationsQ.isLoading || jobrolesQ.isLoading || engagementsCountQ.isLoading

    const counts = {
        contacts: contactsCountQ.data ?? 0,
        organisations: employingOrgsCount,
        roles: (jobrolesQ.data ?? []).length,
        engagements: engagementsCountQ.data ?? 0,
        recruiters: recruitersCountQ.data ?? 0,
        recruitmentOrganisations: recruitmentOrgsCount ?? 0,
        activeRoles: React.useMemo(() => {
            const list = jobrolesQ.data ?? []
            const active = (list.filter((r: any) => {
                const name = String(r.status_name || '').toLowerCase()
                // Consider roles with status 'Applied', 'Interview' or 'Yet to apply' as active
                return name === 'applied' || name === 'interview' || name === 'yet to apply'
            }))
            return active.length
        }, [jobrolesQ.data]) ?? 0,
        activeInterviews: React.useMemo(() => {
            const list = engagementsQ.data ?? []
            const active = list.filter((e: any) => String(e.kind || e.type || '').toLowerCase().includes('interview'))
            return active.length
        }, [engagementsQ.data]) ?? 0,
    }

    // Prefetch likely tables
    React.useEffect(() => {
        queryClient.prefetchQuery(['contacts', { page: 1, pageSize: 20 }], () => fetchContacts(1, 20))
        queryClient.prefetchQuery(['organisations'], () => fetchOrganisations())
    }, [queryClient])

    const overallList = contactsAllForHeatQ.data ?? []

    // Compute overall dataset min/max days-ago (across all contacts)
    const overallDaysAgoRange = React.useMemo(() => {
        const list = overallList || []
        let min = Infinity
        let max = -Infinity
        const today = Date.now()
        for (const c of list) {
            const last = c?.last_contact_date
            if (!last) continue
            const d = new Date(last)
            if (isNaN(d.getTime())) continue
            const daysAgo = Math.max(0, Math.floor((today - d.getTime()) / (1000 * 60 * 60 * 24)))
            if (daysAgo < min) min = daysAgo
            if (daysAgo > max) max = daysAgo
        }
        if (!isFinite(min)) min = 0
        if (!isFinite(max)) max = 0
        min = Math.min(365, Math.max(0, min))
        max = Math.min(365, Math.max(0, max))
        return { min, max }
    }, [overallList])
    // Clear a temporary clamp-suspension flag when the contacts dataset has finished loading.
    React.useEffect(() => {
        if (!suspendClamp) return
        try {
            // When the all-contacts dataset is no longer fetching, we can re-enable clamping.
            if (!contactsAllForHeatQ.isFetching) {
                setSuspendClamp(false)
            }
        } catch (e) {
            setSuspendClamp(false)
        }
    }, [suspendClamp, contactsAllForHeatQ.isFetching, contactsAllForHeatQ.data])
    // Compute contacts who have engagements of type 'Discussion' or 'Interview' and split by recruiter vs other
    const contactEngagementsCounts = React.useMemo(() => {
        const eng = engagementsQ.data ?? []
        const contactIdsWithContactEng = new Set<number>()
        for (const e of eng) {
            const t = String(e?.type || e?.kind || '').toLowerCase()
            if (t.includes('discussion') || t.includes('interview')) {
                if (e?.contactid) contactIdsWithContactEng.add(Number(e.contactid))
            }
        }
        let recruiters = 0
        let others = 0
        const contactById = new Map<number, any>()
        for (const c of overallList || []) contactById.set(Number(c.contactid), c)
        for (const cid of contactIdsWithContactEng) {
            const c = contactById.get(Number(cid))
            const roleId = c ? Number(c.role_type_id ?? c.roleid ?? 0) : 0
            if (recruiterRefId && roleId === Number(recruiterRefId)) recruiters++
            else others++
        }
        return { recruiters, others }
    }, [engagementsQ.data, overallList, recruiterRefId])

    // expose the list of contact ids that have a Discussion/Interview engagement
    const contactEngagementIds = React.useMemo(() => {
        const eng = engagementsQ.data ?? []
        const ids = new Set<number>()
        for (const e of eng) {
            const t = String(e?.type || e?.kind || '').toLowerCase()
            if (t.includes('discussion') || t.includes('interview')) {
                if (e?.contactid) ids.add(Number(e.contactid))
            }
        }
        return Array.from(ids)
    }, [engagementsQ.data])

    // Compute how many contacts match the current heatRange for the currently selected contact set (used by HeatFilter)
    const matchesCount = React.useMemo(() => {
        const list = selectedContactsList ?? []
        if (!Array.isArray(list) || list.length === 0) return 0
        const a = (heatRange && heatRange[0] != null) ? Number(heatRange[0]) : 0
        const b = (heatRange && heatRange[1] != null) ? Number(heatRange[1]) : 365
        const low = Math.min(a, b)
        const high = Math.max(a, b)
        if (low === 0 && high >= 365) return list.length
        const today = Date.now()
        let m = 0
        for (const c of list || []) {
            const last = c?.last_contact_date
            let daysAgo: number
            if (!last) {
                // Treat contacts with no date as if they were on the oldest day in the dataset
                daysAgo = daysAgoRange.max
            } else {
                const d = new Date(last)
                if (isNaN(d.getTime())) {
                    daysAgo = daysAgoRange.max
                } else {
                    daysAgo = Math.floor((today - d.getTime()) / (1000 * 60 * 60 * 24))
                }
            }
            if (daysAgo >= low && daysAgo <= high) m++
        }
        return m
    }, [selectedContactsList, heatRange, daysAgoRange.max])

    // Total number of contacts in the currently selected heat dataset
    const selectedTotalCount = React.useMemo(() => {
        const list = selectedContactsList ?? []
        return Array.isArray(list) ? list.length : 0
    }, [selectedContactsList])

    // Count contacts with no valid last_contact_date in the currently selected heat dataset
    const selectedNoContactCount = React.useMemo(() => {
        const list = selectedContactsList ?? []
        if (!Array.isArray(list) || list.length === 0) return 0
        let n = 0
        for (const c of list) {
            const last = c?.last_contact_date
            if (!last) {
                n++
                continue
            }
            const d = new Date(last)
            if (isNaN(d.getTime())) n++
        }
        return n
    }, [selectedContactsList])

    // Compute overall matches for the full contact dataset (used for Total Contacts card)
    // Use a cached value while the contacts dataset is fetching or when clamp suspension
    // is active to avoid transient recalculation during card transitions.
    const overallMatchesCacheRef = React.useRef<number | null>(null)
    const overallMatchesCount = React.useMemo(() => {
        const list = overallList ?? []
        if (!Array.isArray(list) || list.length === 0) return 0
        const range = globalHeatRange || [0, 365]
        const a = (range && range[0] != null) ? Number(range[0]) : 0
        const b = (range && range[1] != null) ? Number(range[1]) : 365
        const low = Math.min(a, b)
        const high = Math.max(a, b)
        if (low === 0 && high >= 365) {
            // full dataset match
            const full = list.length
            if (!contactsAllForHeatQ.isFetching && !suspendClamp) overallMatchesCacheRef.current = full
            return contactsAllForHeatQ.isFetching || suspendClamp ? (overallMatchesCacheRef.current ?? full) : full
        }
        const today = Date.now()
        let m = 0
        for (const c of list || []) {
            const last = c?.last_contact_date
            let daysAgo: number
            if (!last) {
                daysAgo = overallDaysAgoRange.max
            } else {
                const d = new Date(last)
                if (isNaN(d.getTime())) {
                    daysAgo = overallDaysAgoRange.max
                } else {
                    daysAgo = Math.floor((today - d.getTime()) / (1000 * 60 * 60 * 24))
                }
            }
            if (daysAgo >= low && daysAgo <= high) m++
        }
        if (!contactsAllForHeatQ.isFetching && !suspendClamp) {
            overallMatchesCacheRef.current = m
            return m
        }
        return overallMatchesCacheRef.current ?? m
    }, [overallList, globalHeatRange, daysAgoRange.max, contactsAllForHeatQ.isFetching, suspendClamp])

    // Total number of contacts in the dataset (including those without last_contact_date)
    const totalCount = React.useMemo(() => {
        return Array.isArray(overallList) ? overallList.length : 0
    }, [overallList])

    // Count contacts with no valid last_contact_date (overall dataset)
    const noContactCount = React.useMemo(() => {
        const list = overallList ?? []
        if (!Array.isArray(list) || list.length === 0) return 0
        let n = 0
        for (const c of list) {
            const last = c?.last_contact_date
            if (!last) {
                n++
                continue
            }
            const d = new Date(last)
            if (isNaN(d.getTime())) n++
        }
        return n
    }, [overallList])

    // Compute counts for each heat bucket (hot / warm / cold) across the dataset
    const bucketCounts = React.useMemo(() => {
        const list = selectedContactsList ?? []
        let hot = 0
        let warm = 0
        let cold = 0
        // We'll treat contacts with no last_contact_date as if they were on the oldest day
        if (!Array.isArray(list) || list.length === 0) return { hot, warm, cold }
        const today = Date.now()
        for (const c of list) {
            const last = c?.last_contact_date
            let daysAgo: number
            if (!last) {
                daysAgo = daysAgoRange.max
            } else {
                const d = new Date(last)
                if (isNaN(d.getTime())) {
                    daysAgo = daysAgoRange.max
                } else {
                    daysAgo = Math.floor((today - d.getTime()) / (1000 * 60 * 60 * 24))
                }
            }
            if (daysAgo < heatThresholds.warm) hot++
            else if (daysAgo < heatThresholds.cold) warm++
            else cold++
        }
        return { hot, warm, cold }
    }, [selectedContactsList, heatThresholds, daysAgoRange.max])

    // Stable overall matches shown in the Total Contacts card. This value is
    // only updated when the full contacts dataset is not fetching and no
    // clamp suspension is active, preventing transient flips during transitions.
    const [stableOverallMatches, setStableOverallMatches] = React.useState<number>(() => {
        try {
            return Number(overallList?.length ?? 0)
        } catch (e) { return 0 }
    })

    React.useEffect(() => {
        try {
            if (!contactsAllForHeatQ.isFetching && !suspendClamp) {
                // compute fresh overallMatchesCount synchronously
                const list = overallList ?? []
                // If the user hasn't explicitly changed the slider, prefer showing
                // the full dataset for the Total Contacts card to avoid accidental
                // narrowing produced by programmatic updates during transitions.
                if (lastHeatChangeSourceRef.current !== 'user') {
                    setStableOverallMatches(list.length)
                    if (process.env.NODE_ENV !== 'production') console.debug('[Hub] stableOverallMatches set ->', list.length, '(full dataset by default)')
                    return
                }
                const range = globalHeatRange || [0, 365]
                const a = (range && range[0] != null) ? Number(range[0]) : 0
                const b = (range && range[1] != null) ? Number(range[1]) : 365
                const low = Math.min(a, b)
                const high = Math.max(a, b)
                if (low === 0 && high >= 365) {
                    setStableOverallMatches(list.length)
                    if (process.env.NODE_ENV !== 'production') console.debug('[Hub] stableOverallMatches set ->', list.length)
                } else {
                    const today = Date.now()
                    let m = 0
                    for (const c of list || []) {
                        const last = c?.last_contact_date
                        let daysAgo: number
                        if (!last) {
                            daysAgo = overallDaysAgoRange.max
                        } else {
                            const d = new Date(last)
                            if (isNaN(d.getTime())) {
                                daysAgo = overallDaysAgoRange.max
                            } else {
                                daysAgo = Math.floor((today - d.getTime()) / (1000 * 60 * 60 * 24))
                            }
                        }
                        if (daysAgo >= low && daysAgo <= high) m++
                    }
                    setStableOverallMatches(m)
                    if (process.env.NODE_ENV !== 'production') console.debug('[Hub] stableOverallMatches set ->', m)
                }
            }
        } catch (e) {
            // ignore
        }
    }, [contactsAllForHeatQ.isFetching, suspendClamp, overallList, globalHeatRange, overallDaysAgoRange.max])

    return (
        <Box>
            <h2 style={{ margin: 0 }}>{SEARCH_HUB}</h2>
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <>
                    <Accordion expanded={overviewOpen} onChange={(_, v) => setOverviewOpen(v)}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                <Typography variant={ACCORDION_TITLE_VARIANT as any} sx={ACCORDION_TITLE_SX}>Summary</Typography>
                                <div>
                                    <span onClick={(e: any) => { e.stopPropagation(); e.preventDefault(); setExportConfirmOpen(true) }}>
                                        <AppButton colorScheme="white">EXPORT APP DATA</AppButton>
                                    </span>
                                </div>
                            </Box>
                        </AccordionSummary>
                        <AccordionDetails>
                            <StatsCards
                                summary={{ ...(summaryQ.data || {}), contactEngagements: contactEngagementsCounts }}
                                counts={counts}
                                contactStats={{ matchesCount: stableOverallMatches, noContactCount, totalCount }}
                                recruiterContactStats={{ matchesCount: matchesCountRecruiters, noContactCount: noContactCountRecruiters, totalCount: totalCountRecruiters }}
                                activeKey={activeKey}
                                onActivate={(k) => {
                                    try { /* eslint-disable-next-line no-console */ console.debug('[Hub] onActivate called ->', k) } catch (e) { }
                                    // preserve the clicked key so the card shows active state (e.g. 'recruitment_organisations')
                                    const prevKey = activeKey
                                    setActiveKey(k as any)
                                    // If user is switching from recruiters_met back to the main Contacts view
                                    // suspend the HeatFilter clamp briefly until the contacts dataset finishes
                                    // loading — this prevents a momentary collapse of the slider domain.
                                    try {
                                        if (k === 'contacts' && prevKey === 'recruiters_met') {
                                            setSuspendClamp(true)
                                        }
                                    } catch (e) { /* ignore */ }
                                    if (k === 'recruitment_organisations') {
                                        // show organisations table filtered to recruitment sector
                                        setSectorFilter(recruitmentSectorString)
                                    } else if (k === 'organisations') {
                                        // clear any recruitment sector filter when user explicitly chooses Organisations
                                        setSectorFilter(null)
                                    } else if (k === 'interviews') {
                                        // show Engagements table filtered to only interviews
                                        setSectorFilter(null)
                                    } else if (k === 'active_roles') {
                                        // clear sector filter and show RolesTable filtered to active statuses
                                        setSectorFilter(null)
                                    } else {
                                        // other cards clear the sector filter
                                        setSectorFilter(null)
                                    }

                                    // If a contacts-related card is clicked, update the heat slider in a safe way
                                    // to avoid transient resets that affect the Total Contacts card.
                                    // Run the heatRange update in the next tick to avoid a React state update ordering
                                    // race where `heatRange` changes while `activeKey` is still the previous value.
                                    if (k === 'contacts') {
                                        // For the main Contacts view prefer restoring the user's last global
                                        // selection if we have one. This avoids transient resets when the
                                        // user toggles from a filtered 'met' view back to Contacts.
                                        setTimeout(() => {
                                            try {
                                                if (heatRangeInitialized.current) {
                                                    applyProgrammaticHeatRange(globalHeatRange)
                                                } else {
                                                    applyProgrammaticHeatRange([overallDaysAgoRange.min, overallDaysAgoRange.max])
                                                    heatRangeInitialized.current = true
                                                }
                                            } catch (e) { /* ignore */ }
                                        }, 0)
                                    } else if (k === 'recruiters') {
                                        // For the Recruitment Contacts card we DO NOT want to reset the user's
                                        // global heat selection — preserve `globalHeatRange` to avoid transient
                                        // changes to the Total Contacts card when toggling between cards.
                                        setTimeout(() => {
                                            try {
                                                applyProgrammaticHeatRange(globalHeatRange)
                                            } catch (e) { /* ignore */ }
                                        }, 0)
                                    } else if (k === 'recruiters_met') {
                                        // For the recruiters_met view, show the overall dataset range for clarity.
                                        setTimeout(() => {
                                            try {
                                                applyProgrammaticHeatRange([overallDaysAgoRange.min, overallDaysAgoRange.max])
                                                heatRangeInitialized.current = true
                                            } catch (e) { /* ignore */ }
                                        }, 0)
                                    } else if (k === 'other_contacts_met') {
                                        // Preserve the user's global heat selection when switching to "Other Contacts Met"
                                        // to avoid transient clamping by the filtered dataset (which can be small/empty).
                                        setTimeout(() => {
                                            try {
                                                applyProgrammaticHeatRange(globalHeatRange)
                                            } catch (e) { /* ignore */ }
                                        }, 0)
                                    }

                                    // when the recruitment card is clicked we still want the bottom panel to show the organisations table;
                                    // BottomPanel handles 'recruitment_organisations' by rendering OrganisationsTable with sectorFilter.

                                    // Defensive: ensure heatRange remains the user's global selection when switching to organisation views.
                                    // This prevents unexpected recalculation of Total/Recruitment contact totals when the bottom panel changes.
                                    if (k === 'organisations' || k === 'recruitment_organisations') {
                                        try {
                                            applyProgrammaticHeatRange(globalHeatRange)
                                        } catch (e) {
                                            /* ignore */
                                        }
                                    }
                                }}
                            />
                            {/* Export button moved to the Summary title bar */}
                            <Toast open={toastOpen} message={toastMessage} severity={toastSeverity} onClose={() => setToastOpen(false)} />
                            <Dialog open={exportConfirmOpen} onClose={() => setExportConfirmOpen(false)}>
                                <DialogTitle>Download Application data?</DialogTitle>
                                <DialogContent>
                                    Do you wish to download Application data?
                                </DialogContent>
                                <DialogActions>
                                    <AppButton colorScheme="white" onClick={() => setExportConfirmOpen(false)}>Cancel</AppButton>
                                    <AppButton colorScheme="purple" onClick={async () => {
                                        setExportConfirmOpen(false)
                                        setExportingNow(true)
                                        try {
                                            const rawBase = (import.meta as any).env?.VITE_API_BASE_URL || ''
                                            const BASE_URL = rawBase.replace(/\/$/, '')
                                            const aid = getApplicantId()
                                            if (aid == null) throw new Error('No applicant selected')
                                            const res = await fetch(`${BASE_URL}/api/${aid}/export/spreadsheet.xlsx`, { credentials: 'include' })
                                            if (!res.ok) {
                                                const txt = await res.text()
                                                throw new Error('Export failed: ' + txt)
                                            }
                                            const contentType = res.headers.get('content-type') || ''
                                            const blob = await res.blob()
                                            const expectedMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                                            if (!contentType.includes(expectedMime)) {
                                                try {
                                                    const txt = await blob.text()
                                                    throw new Error('Export failed: server returned unexpected content-type: ' + contentType + '\n' + txt)
                                                } catch (e) {
                                                    throw new Error('Export failed: server returned unexpected content-type: ' + contentType)
                                                }
                                            }
                                            const buf = await blob.slice(0, 4).arrayBuffer()
                                            const view = new Uint8Array(buf)
                                            if (!(view[0] === 0x50 && view[1] === 0x4b)) {
                                                const txt = await blob.text()
                                                throw new Error('Export failed: response did not appear to be a valid .xlsx file. Server said:\n' + txt)
                                            }
                                            const url = window.URL.createObjectURL(blob)
                                            const a = document.createElement('a')
                                            a.href = url
                                            const cd = res.headers.get('content-disposition')
                                            let filename = 'jobtrack_export.xlsx'
                                            if (cd) {
                                                const m = cd.match(/filename\*=UTF-8''([^;\n]+)/)
                                                if (m && m[1]) filename = decodeURIComponent(m[1])
                                                else {
                                                    const m2 = cd.match(/filename="?([^";]+)"?/)
                                                    if (m2 && m2[1]) filename = m2[1]
                                                }
                                            }
                                            a.download = filename
                                            document.body.appendChild(a)
                                            a.click()
                                            a.remove()
                                            window.URL.revokeObjectURL(url)
                                            setToastMessage('Export started')
                                            setToastSeverity('success')
                                            setToastOpen(true)
                                        } catch (err: any) {
                                            console.error('Export failed', err)
                                            setToastMessage('Export failed: ' + (err?.message || String(err)))
                                            setToastSeverity('error')
                                            setToastOpen(true)
                                        } finally {
                                            setExportingNow(false)
                                        }
                                    }}>
                                        {exportingNow ? <CircularProgress size={16} sx={{ mr: 1 }} /> : 'Download'}
                                    </AppButton>
                                </DialogActions>
                            </Dialog>
                            {/* Contact heat panel is below as its own collapsible section */}
                        </AccordionDetails>
                    </Accordion>

                    <Box>
                        <Box sx={{ mt: 2 }}>
                            {(activeKey === 'contacts' || activeKey === 'recruiters' || activeKey === 'recruiters_met' || (activeKey === 'other_contacts_met' && daysAgoRange.max > 0)) && (
                                (() => {
                                    const safeDataMax = Math.max(1, Number(daysAgoRange.max ?? 0))
                                    const safeLockMin = Math.min(Number(daysAgoRange.min ?? 0), safeDataMax)
                                    const datasetFetching = (activeKey === 'recruiters' || activeKey === 'recruiters_met') ? contactsAllForHeatRecruitersQ.isFetching : contactsAllForHeatQ.isFetching
                                    const datasetLength = Array.isArray(selectedContactsList) ? selectedContactsList.length : 0
                                    const disableClampFlag = activeKey === 'other_contacts_met' || suspendClamp || datasetFetching || datasetLength <= 1
                                    return (
                                        <HeatFilter
                                            value={heatRange}
                                            onChange={(v) => { try { lastHeatChangeSourceRef.current = 'user' } catch (e) { }; setHeatRange(v) }}
                                            dataMin={0}
                                            dataMax={safeDataMax}
                                            lockMin={safeLockMin}
                                            matchesCount={matchesCount}
                                            bucketCounts={bucketCounts}
                                            noContactCount={selectedNoContactCount}
                                            totalCount={selectedTotalCount}
                                            disableClamp={disableClampFlag}
                                            activeOnly={showActiveOnly}
                                            onActiveOnlyChange={(v: boolean) => setShowActiveOnly(v)}
                                        />
                                    )
                                })()
                            )}
                        </Box>
                    </Box>

                    <Box sx={{ mt: 2 }}>
                        <Box sx={{ p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                <TextField
                                    placeholder="Search contacts, organisations, roles or engagements"
                                    variant="outlined"
                                    size="small"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    sx={{ flex: '1 1 auto', minWidth: 160 }}
                                    InputProps={{
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                {search ? (
                                                    <IconButton size="small" onClick={() => setSearch('')} aria-label="clear search">
                                                        <ClearIcon fontSize="small" />
                                                    </IconButton>
                                                ) : null}
                                            </InputAdornment>
                                        ),
                                    }}
                                />
                                {/* Contextual add button for the currently visible table */}
                                <AppButton colorScheme="purple" onClick={() => {
                                    // choose modal mode based on activeKey
                                    const map: Record<string, string> = {
                                        contacts: 'contact',
                                        recruiters: 'contact',
                                        recruiters_met: 'contact',
                                        other_contacts_met: 'contact',
                                        organisations: 'organisation',
                                        recruitment_organisations: 'organisation',
                                        roles: 'jobrole',
                                        active_roles: 'jobrole',
                                        engagements: 'engagement',
                                        interviews: 'engagement'
                                    }
                                    const mode = map[activeKey] || 'contact'
                                    setQuickCreateMode(mode)
                                    setQuickCreateOpen(true)
                                }} sx={{ whiteSpace: 'nowrap' }}>
                                    {activeKey === 'organisations' || activeKey === 'recruitment_organisations' ? '+ Add Org' : activeKey === 'roles' || activeKey === 'active_roles' ? '+ Add Role' : activeKey === 'engagements' || activeKey === 'interviews' ? '+ Add Engagement' : '+ Add Contact'}
                                </AppButton>
                            </Box>

                            {/* Place the active table inside the same boxed area */}
                            <Box sx={{ mt: 2 }}>
                                <HubMainView activeKey={activeKey} search={search} recruiterRefId={recruiterRefId ?? undefined} sectorFilter={sectorFilter} heatRange={heatRange} onlyIds={contactEngagementIds} hideCreateButton={true} activeOnly={showActiveOnly} />
                            </Box>
                        </Box>
                    </Box>

                    {/* Bottom panel moved inside the search box above */}
                </>
            )}
            <QuickCreateModal
                open={quickCreateOpen}
                mode={quickCreateMode as any}
                onClose={() => setQuickCreateOpen(false)}
                onRequestOpenNested={(mode, payload, onCreated) => {
                    try {
                        topQuickNestedCallbackRef.current = onCreated ?? null
                        setTopQuickNestedMode(mode)
                        setTopQuickNestedEditing(payload ?? null)
                        setTopQuickNestedOpen(true)
                    } catch (e) { }
                }}
                onSuccess={async () => {
                    // invalidate relevant queries so the new item appears in the table
                    try {
                        if (quickCreateMode === 'contact') {
                            await queryClient.invalidateQueries(['contactsList'])
                            await queryClient.invalidateQueries(['contacts'])
                        } else if (quickCreateMode === 'organisation') {
                            await queryClient.invalidateQueries(['organisations'])
                        } else if (quickCreateMode === 'jobrole') {
                            await queryClient.invalidateQueries(['jobroles'])
                        } else if (quickCreateMode === 'engagement') {
                            await queryClient.invalidateQueries(['engagementsAll'])
                            await queryClient.invalidateQueries(['engagementsCount'])
                        }
                    } catch (e) {
                        // ignore
                    }
                    setQuickCreateOpen(false)
                }}
            />
            {topQuickNestedOpen && (
                <QuickCreateModal
                    open={true}
                    mode={topQuickNestedMode}
                    editing={topQuickNestedEditing ?? undefined}
                    onClose={() => { setTopQuickNestedOpen(false); topQuickNestedCallbackRef.current = null; setTopQuickNestedEditing(null); setTopQuickNestedMode(null) }}
                    onSuccess={async (created: any) => {
                        try {
                            if (typeof topQuickNestedCallbackRef.current === 'function') {
                                try { topQuickNestedCallbackRef.current(created) } catch (e) { }
                            }
                        } catch (e) { }
                        setTopQuickNestedOpen(false)
                        topQuickNestedCallbackRef.current = null
                        setTopQuickNestedEditing(null)
                        setTopQuickNestedMode(null)
                    }}
                />
            )}
        </Box>
    )
}
