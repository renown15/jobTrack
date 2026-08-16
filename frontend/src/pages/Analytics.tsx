import React, { useMemo, useState } from 'react'
import { BRAND_PURPLE_LIGHT, BRAND_PURPLE, CONTACT_SHADES, CONTACTS_SHADES, ENGAGEMENT_SHADES, ROLE_SHADES, ACTIVE_ROLES_COLOR, INTERVIEW_SHADES, STACK_FALLBACK, ORG_COLOR } from '../constants/colors'
import { useQuery } from '@tanstack/react-query'
import {
    fetchAnalyticsSummary,
    fetchLeadsSummary,
    fetchLeadsTopCompanies,
    fetchLeadsReviewsByDate,
    fetchEngagementsByMonth,
    fetchTopRecentContacts,
    fetchTopContactsByEngagements,
    fetchAllContacts,
    fetchReferenceData,
} from '../services/analytics'
import { fetchLeadsAll, fetchTasks } from '../api/client'
import { fetchApplicantSettings } from '../api/client'
import { Box, TextField, Typography, Paper, Grid, Tabs, Tab, Accordion, AccordionSummary, AccordionDetails } from '@mui/material'
import AppButton from '../components/Shared/AppButton'
import DatePicker from '../components/Shared/DatePicker'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { ACCORDION_TITLE_SX, ACCORDION_TITLE_VARIANT } from '../constants/ui'
import exportNodesToPdf from '../utils/exportPdf'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import ChartCard from '../components/ChartCard'
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ResponsiveContainer,
    Legend,
    ReferenceLine,
    PieChart,
    Pie,
    Cell,
    ScatterChart,
    Scatter,
    ZAxis,
} from 'recharts'

// Summary cards removed — charts remain

// Build a per-sector summary array suitable for a grouped/stacked bar chart.
// Accepts flexible source keys: contacts_direct, contacts_target, contact_count,
// engagement_count, interview_count, roles_count, application_count, etc.
function buildSectorSummary(items: any[]) {
    const bySector: Record<string, any> = {}
    const arr = Array.isArray(items) ? items : []
    arr.forEach((it: any) => {
        const sector = it.sector || it.sector_name || it.summary || 'Unspecified'
        if (!bySector[sector]) bySector[sector] = { sector, org_count: 0, contacts_direct: 0, contacts_target: 0, contacts_total: 0, engagements: 0, roles: 0, interviews: 0, active_roles: 0 }

        // count this organization once per row
        bySector[sector].org_count += 1

        // contacts
        if (typeof it.contacts_direct === 'number' || typeof it.contacts_target === 'number') {
            bySector[sector].contacts_direct += Number(it.contacts_direct || 0)
            bySector[sector].contacts_target += Number(it.contacts_target || 0)
        } else if (typeof it.contact_count === 'number') {
            // no breakdown provided: put into direct contacts column
            bySector[sector].contacts_direct += Number(it.contact_count || 0)
        }

        // maintain total contacts for charting convenience
        bySector[sector].contacts_total = Number(bySector[sector].contacts_direct || 0) + Number(bySector[sector].contacts_target || 0)

        // engagements
        const engagements = it.engagement_count ?? it.engagements ?? it.engagements_count
        if (typeof engagements === 'number') bySector[sector].engagements += Number(engagements)

        // interviews
        const interviews = it.interview_count ?? it.interviews ?? it.interviews_count
        if (typeof interviews === 'number') bySector[sector].interviews += Number(interviews)

        // roles / applications
        const roles = it.roles_count ?? it.application_count ?? it.applications_count ?? it.jobroles_count
        if (typeof roles === 'number') bySector[sector].roles += Number(roles)

        // active roles (if provided by backend under any plausible key)
        const activeRoles = it.active_roles ?? it.activeRoles ?? it.active_roles_count ?? it.activeRolesCount ?? it.roles_active ?? it.roles_active_count
        if (typeof activeRoles === 'number') bySector[sector].active_roles += Number(activeRoles)
    })
    return Object.values(bySector)
}

// (Removed module-level CustomYAxisTick) - per-chart tick renderer is created inside component so it can access runtime row height

export default function Analytics() {
    // Default date range: last 12 months (include current month)
    const today = new Date()
    const defaultStartDate = (() => {
        const d = new Date(today.getFullYear(), today.getMonth() - 11, 1)
        return d.toISOString().slice(0, 10)
    })()
    const defaultEndDate = (() => {
        // use today's date as the upper bound
        return today.toISOString().slice(0, 10)
    })()

    const [startDate, setStartDate] = useState<string>(defaultStartDate)
    const [endDate, setEndDate] = useState<string>(defaultEndDate)
    const [analyticsTab, setAnalyticsTab] = useState<number>(0)
    const [exportingPdf, setExportingPdf] = useState<boolean>(false)
    // refs for chart cards to avoid querying the document
    const bubbleRef = React.useRef<HTMLDivElement | null>(null)
    const leadsTopRef = React.useRef<HTMLDivElement | null>(null)
    const leadsReviewsRef = React.useRef<HTMLDivElement | null>(null)
    const sectorRef = React.useRef<HTMLDivElement | null>(null)
    const cumulativeContactsRef = React.useRef<HTMLDivElement | null>(null)
    const engagementsPerMonthRef = React.useRef<HTMLDivElement | null>(null)
    const cumulativeEngagementsRef = React.useRef<HTMLDivElement | null>(null)
    const rolesPerMonthRef = React.useRef<HTMLDivElement | null>(null)
    const cumulativeRolesRef = React.useRef<HTMLDivElement | null>(null)

    // simple summary chart: no measured heights or custom ticks

    const { data, isLoading, refetch } = useQuery(['analyticsSummary', startDate, endDate], () => fetchAnalyticsSummary({ from_date: startDate || undefined, to_date: endDate || undefined }), {
        staleTime: 60_000,
    })

    // Debug: log raw API payloads when developing to help diagnose empty charts
    React.useEffect(() => {
        // eslint-disable-next-line no-console
        console.debug('[Analytics] summary data', data)
    }, [data])

    const { data: leadsData } = useQuery(['leadsSummary'], () => fetchLeadsSummary(), { staleTime: 60_000 })
    React.useEffect(() => { console.debug('[Analytics] leadsSummary', leadsData) }, [leadsData])
    const { data: leadsTopCompanies } = useQuery(['leadsTopCompanies'], () => fetchLeadsTopCompanies(10), { staleTime: 60_000 })
    React.useEffect(() => { console.debug('[Analytics] leadsTopCompanies', leadsTopCompanies) }, [leadsTopCompanies])
    const { data: leadsReviewsByDate } = useQuery(['leadsReviewsByDate', startDate, endDate], () => fetchLeadsReviewsByDate(startDate || undefined, endDate || undefined), { staleTime: 60_000 })
    React.useEffect(() => { console.debug('[Analytics] leadsReviewsByDate', leadsReviewsByDate) }, [leadsReviewsByDate])
    // Fetch all leads (unpaginated) so we can build LinkedIn-specific charts
    const { data: leadsAll } = useQuery(['leadsAll'], () => fetchLeadsAll(), { staleTime: 60_000 })
    React.useEffect(() => { console.debug('[Analytics] leadsAll', leadsAll) }, [leadsAll])

    // Fetch tasks for Action Plan analytics
    const { data: tasksData } = useQuery(['tasksForAnalytics'], () => fetchTasks(), { staleTime: 60_000 })
    React.useEffect(() => { console.debug('[Analytics] tasksData', tasksData) }, [tasksData])

    // Fetch applicant settings so we can access searchStartDate for LinkedIn chart colouring
    const { data: applicantSettings } = useQuery(['applicantSettings'], () => fetchApplicantSettings(), { staleTime: 60_000 })
    React.useEffect(() => { console.debug('[Analytics] applicantSettings', applicantSettings) }, [applicantSettings])

    // If the server returns available min/max dates, use them to initialise the pickers so the default
    // load includes all available data.
    React.useEffect(() => {
        if (!data) return
        // server provides min_date/max_date at top-level — only override defaults
        // if server range is narrower than our default range and the user hasn't changed the pickers.
        const min = data.min_date || data.minDate || null
        const max = data.max_date || data.maxDate || null
        try {
            if (min) {
                // if server min is after our defaultStartDate and user hasn't changed startDate, use server min
                if (!startDate || startDate === defaultStartDate) {
                    if (new Date(min) > new Date(defaultStartDate)) setStartDate(min)
                }
            }
            if (max) {
                if (!endDate || endDate === defaultEndDate) {
                    if (new Date(max) < new Date(defaultEndDate)) setEndDate(max)
                }
            }
        } catch (e) {
            // ignore parse errors
        }
    }, [data])

    const topOrgs = data?.topHiringOrgs || { labels: [], values: [], details: [] }
    const cumulativeContacts = data?.cumulativeContacts || { labels: [], values: [] }
    const cumulativeEngagements = data?.cumulativeEngagements || { labels: [], values: [] }
    const cumulativeInterviews = data?.cumulativeInterviews || { labels: [], values: [] }
    const orgsBySector = data?.organizationsBySector || []
    const rawSummary: any = data?.summary || {}
    // Normalize backend casing (support snake_case and camelCase)
    const summary = {
        total_contacts: rawSummary.total_contacts ?? rawSummary.totalContacts ?? 0,
        total_engagements: rawSummary.total_engagements ?? rawSummary.totalEngagements ?? 0,
        total_interviews: rawSummary.total_interviews ?? rawSummary.totalInterviews ?? 0,
        total_applications: rawSummary.total_applications ?? rawSummary.totalApplications ?? 0,
        engagement_rate: rawSummary.engagement_rate ?? rawSummary.engagementRate ?? 0,
        interview_rate: rawSummary.interview_rate ?? rawSummary.interviewRate ?? 0,
    }

    const topOrgsData = useMemo(() => (topOrgs.labels || []).map((lab: string, i: number) => ({ name: lab, value: topOrgs.values?.[i] ?? 0 })), [topOrgs])

    // helper to format YYYY-MM to mmm-yy
    const formatMonthLabel = (label?: string) => {
        if (!label) return ''
        // expecting YYYY-MM or YYYY-MM-DD
        const [y, m] = label.split('-')
        const month = Number(m) - 1
        if (Number.isNaN(month) || !y) return label
        const date = new Date(Number(y), month, 1)
        return date.toLocaleString('en-US', { month: 'short' }) + '-' + String(y).slice(2)
    }

    const buildCumulativeData = (labels?: string[], values?: number[]) => (labels || []).map((lab: string, i: number) => ({ name: formatMonthLabel(lab), value: values?.[i] ?? 0 }))
    // Generate a consistent month axis for all cumulative charts based on the selected date range
    function generateMonthRange(start: string, end: string) {
        const res: string[] = []
        try {
            // Parse YYYY-MM or YYYY-MM-DD safely and avoid Date parsing/timezone issues
            const [sy, sm] = (String(start || '')).split('-').map((v) => Number(v))
            const [ey, em] = (String(end || '')).split('-').map((v) => Number(v))
            if (!sy || !sm || !ey || !em) return res
            let y = sy
            let m = sm - 1
            const endY = ey
            const endM = em - 1
            while (y < endY || (y === endY && m <= endM)) {
                // Format YYYY-MM without creating timezone-sensitive Date-to-ISO conversions
                res.push(`${y}-${String(m + 1).padStart(2, '0')}`)
                m += 1
                if (m > 11) {
                    m = 0
                    y += 1
                }
            }
        } catch (e) {
            // fall back to empty
        }
        return res
    }

    function fillCumulativeSeries(months: string[], labels?: string[], values?: number[]) {
        const map: Record<string, number> = {}
        for (let i = 0; i < (labels || []).length; i++) {
            map[String(labels?.[i] || '')] = Number(values?.[i] ?? 0)
        }
        const out: { name: string; value: number }[] = []
        let last = 0
        for (const m of months) {
            if (m in map) {
                last = map[m]
            }
            out.push({ name: formatMonthLabel(m), value: last })
        }
        return out
    }

    const monthsAxis = useMemo(() => generateMonthRange(startDate || defaultStartDate, endDate || defaultEndDate), [startDate, endDate])

    const contactsBarData = useMemo(() => fillCumulativeSeries(monthsAxis, cumulativeContacts.labels, cumulativeContacts.values), [monthsAxis, cumulativeContacts])
    const engagementsBarData = useMemo(() => fillCumulativeSeries(monthsAxis, cumulativeEngagements.labels, cumulativeEngagements.values), [monthsAxis, cumulativeEngagements])
    const interviewsBarData = useMemo(() => fillCumulativeSeries(monthsAxis, cumulativeInterviews.labels, cumulativeInterviews.values), [monthsAxis, cumulativeInterviews])
    const rolesSource = data?.cumulativeRoles || data?.cumulativeApplications || data?.cumulativeJobroles || null
    // For roles, ensure we have a continuous monthly series across the selected date range

    const rolesBarData = useMemo(() => {
        if (!rolesSource) return []
        const labels = rolesSource.labels || []
        const values = rolesSource.values || []
        // Prefer to align the roles chart with the contacts chart month axis when available
        const months = (cumulativeContacts && Array.isArray(cumulativeContacts.labels) && cumulativeContacts.labels.length > 0)
            ? cumulativeContacts.labels
            : generateMonthRange(startDate || defaultStartDate, endDate || defaultEndDate)
        // map labels to values
        const map: Record<string, number> = {}
        for (let i = 0; i < (labels || []).length; i++) {
            map[String(labels[i] || '')] = Number(values?.[i] ?? 0)
        }
        return months.map((m: string) => ({ name: formatMonthLabel(m), value: map[m] ?? 0 }))
    }, [rolesSource, startDate, endDate, cumulativeContacts])

    // New: cumulative roles by source (stacked) provided by backend as monthly cumulative totals per source
    const cumulativeRolesBySourceSource = data?.cumulativeRolesBySource || []
    const roleSourceTypes = useMemo<string[]>(() => Array.from(new Set((cumulativeRolesBySourceSource || []).map((r: any) => r.source))).filter(Boolean) as string[], [cumulativeRolesBySourceSource])
    const cumulativeRolesSourceMap = useMemo(() => {
        const m: Record<string, Record<string, number>> = {}
        for (const r of cumulativeRolesBySourceSource || []) {
            const month = (r.month || '').slice(0, 7)
            const src = r.source || 'Unknown'
            m[src] = m[src] || {}
            m[src][month] = Number(r.cumulative_total || 0)
        }
        return m
    }, [cumulativeRolesBySourceSource])

    const rolesStackedData = useMemo(() => {
        const months = monthsAxis || []
        const sources = roleSourceTypes || []
        const last: Record<string, number> = {}
        return months.map(m => {
            const obj: any = { name: formatMonthLabel(m) }
            for (const s of sources) {
                const val = cumulativeRolesSourceMap[s]?.[m]
                if (typeof val === 'number') {
                    last[s] = val
                }
                obj[s] = last[s] ?? 0
            }
            return obj
        })
    }, [monthsAxis, roleSourceTypes, cumulativeRolesSourceMap])

    const { data: engagementsByMonth } = useQuery(['analytics.engagementsByMonth', startDate, endDate], () => fetchEngagementsByMonth(startDate || undefined, endDate || undefined), { staleTime: 60_000 })
    React.useEffect(() => { console.debug('[Analytics] engagementsByMonth', engagementsByMonth) }, [engagementsByMonth])
    // Fetch top recent contacts but focus on 'Discussion' engagement kind (only people we've had discussions with)
    const { data: topRecentContacts } = useQuery(['analytics.topRecentContacts', 'Discussion'], () => fetchTopRecentContacts('Discussion'), { staleTime: 60_000 })
    React.useEffect(() => { console.debug('[Analytics] topRecentContacts', topRecentContacts) }, [topRecentContacts])
    const { data: topContactsByEngagements } = useQuery(['analytics.topContactsByEngagements'], () => fetchTopContactsByEngagements(), { staleTime: 60_000 })
    React.useEffect(() => { console.debug('[Analytics] topContactsByEngagements', topContactsByEngagements) }, [topContactsByEngagements])
    const { data: allContacts } = useQuery(['contacts.all', startDate, endDate], () => fetchAllContacts(undefined, undefined, startDate, endDate), { staleTime: 60_000 })
    React.useEffect(() => { console.debug('[Analytics] allContacts', allContacts) }, [allContacts])

    // fetch heat threshold refdata so bubble colours match the Hub heat filter
    const { data: heatThreshRef } = useQuery(['refdata', 'heat_threshold'], () => fetchReferenceData('heat_threshold'), { staleTime: 60_000 })

    const heatThresholds = React.useMemo(() => {
        let warm = 30
        let cold = 90
        try {
            const items: any[] = heatThreshRef || []
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
    }, [heatThreshRef])

    const HEAT_COLORS = React.useMemo(() => ({ hot: '#e53935', warm: '#fb8c00', cold: '#42a5f5' }), [])

    const engagementsPerMonthSource = engagementsByMonth || []
    const engagementsPerMonth = useMemo(() => ({ labels: (engagementsPerMonthSource || []).map((r: any) => (r.month || '').slice(0, 7)), values: (engagementsPerMonthSource || []).map((r: any) => Number(r.cnt || 0)) }), [engagementsPerMonthSource])
    // Monthly engagements broken down by kind (stacked per month)
    const monthlyEngagementsByTypeSource = data?.monthlyEngagementsByType || []
    const engagementKindsMonthly = useMemo<string[]>(() => Array.from(new Set((monthlyEngagementsByTypeSource || []).map((r: any) => r.kind))).filter(Boolean) as string[], [monthlyEngagementsByTypeSource])
    const monthlyEngagementKindMap = useMemo(() => {
        const m: Record<string, Record<string, number>> = {}
        for (const r of monthlyEngagementsByTypeSource || []) {
            const month = (r.month || '').slice(0, 7)
            const kind = r.kind || 'Unknown'
            m[kind] = m[kind] || {}
            m[kind][month] = Number(r.count || r.cnt || 0)
        }
        return m
    }, [monthlyEngagementsByTypeSource])

    const engagementsMonthlyStackedData = useMemo(() => {
        const months = monthsAxis || []
        const kinds = engagementKindsMonthly || []
        return months.map(m => {
            const obj: any = { name: formatMonthLabel(m) }
            for (const k of kinds) {
                obj[k] = monthlyEngagementKindMap[k]?.[m] ?? 0
            }
            return obj
        })
    }, [monthsAxis, engagementKindsMonthly, monthlyEngagementKindMap])
    // Roles per month, broken down by status (stacked)
    const monthlyRolesByStatusSource = data?.monthlyRolesByStatus || []
    const roleStatusesMonthly = useMemo<string[]>(() => Array.from(new Set((monthlyRolesByStatusSource || []).map((r: any) => r.status))).filter(Boolean) as string[], [monthlyRolesByStatusSource])
    const monthlyRolesStatusMap = useMemo(() => {
        const m: Record<string, Record<string, number>> = {}
        for (const r of monthlyRolesByStatusSource || []) {
            const month = (r.month || '').slice(0, 7)
            const status = r.status || 'Unknown'
            m[status] = m[status] || {}
            m[status][month] = Number(r.count || r.cnt || 0)
        }
        return m
    }, [monthlyRolesByStatusSource])

    const rolesMonthlyStackedData = useMemo(() => {
        const months = monthsAxis || []
        const statuses = roleStatusesMonthly || []
        return months.map(m => {
            const obj: any = { name: formatMonthLabel(m) }
            for (const s of statuses) {
                obj[s] = monthlyRolesStatusMap[s]?.[m] ?? 0
            }
            return obj
        })
    }, [monthsAxis, roleStatusesMonthly, monthlyRolesStatusMap])
    const topContactsByEngagementsData = useMemo(() => (topContactsByEngagements || []).map((r: any) => ({ name: r.name, value: Number(r.engagements || r.cnt || 0) })), [topContactsByEngagements])

    // Bubble plot data: X = days since last contact, Y = engagements, Z = bubble size based on roles
    // Tooltip component for scatter bubbles
    function BubbleTooltip({ active, payload }: any) {
        if (!active || !payload || !payload.length) return null
        const p = payload[0].payload || {}
        const last = p.last ? new Date(p.last) : null
        return (
            <Paper sx={{ p: 1 }}>
                <Typography variant="subtitle2">{p.name || 'Contact'}</Typography>
                <Typography variant="caption">Roles: {p.roles ?? 0}</Typography>
                <br />
                <Typography variant="caption">Engagements: {p.y ?? 0}</Typography>
                <br />
                <Typography variant="caption">Days since last contact: {typeof p.x === 'number' ? p.x : '—'}</Typography>
                <br />
                <Typography variant="caption">Last: {last ? last.toLocaleDateString() : 'No date'}</Typography>
            </Paper>
        )
    }

    const contactsBubbleData = useMemo(() => {
        const base = 6
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
        const msPerDay = 1000 * 60 * 60 * 24
        // compute a sensible max X value from the date picker window; fall back to 365 days
        const maxDaysFromPicker = startDate ? Math.max(30, Math.ceil((todayStart - new Date(startDate).getTime()) / msPerDay)) : 365
        const clampMax = Math.min(3650, Math.max(30, maxDaysFromPicker))
        const src = allContacts || []
        // compute days for contacts with a valid last date
        const validDays = src.map((c: any) => {
            const last = c.last_contact_date || c.last_engagement || null
            if (!last) return null
            return Math.max(0, Math.floor((todayStart - new Date(last).getTime()) / msPerDay))
        }).filter((d: any) => d !== null) as number[]
        const maxValidDays = validDays.length ? Math.min(Math.max(...validDays), clampMax) : clampMax
        return src.map((c: any) => {
            const last = c.last_contact_date || c.last_engagement || null
            const computed = last ? Math.max(0, Math.floor((todayStart - new Date(last).getTime()) / msPerDay)) : maxValidDays
            const days = Math.min(computed, clampMax)
            const rolesRaw = c.roles_count ?? c.roles ?? 0
            const roles = Number.isFinite(Number(rolesRaw)) ? Number(rolesRaw) : 0
            const z = base * Math.pow(2, Math.max(0, roles))
            // determine heat bucket colour for this contact (match Hub: hot < warm, warm < cold)
            let heat = 'cold'
            if (typeof days === 'number') {
                if (days < heatThresholds.warm) heat = 'hot'
                else if (days < heatThresholds.cold) heat = 'warm'
                else heat = 'cold'
            }
            const colour = HEAT_COLORS[heat as keyof typeof HEAT_COLORS] || HEAT_COLORS.cold
            let yval = c.engagement_count ?? c.engagements ?? 0
            yval = Number.isFinite(Number(yval)) ? Number(yval) : 0
            return { name: c.name || '(no name)', x: days, y: yval, z, roles, last, days, colour }
        })
    }, [allContacts, today, startDate, heatThresholds, HEAT_COLORS])
    const engagementsByTypeSource = data?.engagementsByType || []
    const engagementsByTypeTotal = (engagementsByTypeSource || []).reduce((s: number, r: any) => s + (Number(r.count) || 0), 0)
    const engagementsByTypeData = (engagementsByTypeSource || []).map((r: any) => ({ name: r.kind || r.name || 'Unknown', value: Number(r.count || 0) }))
    const PIE_COLORS = [BRAND_PURPLE_LIGHT, ENGAGEMENT_SHADES[2] || '#64b5f6', '#ce93d8', INTERVIEW_SHADES[2] || '#80cbc4', '#ff8a65', '#9fa8da', '#a5d6a7']

    // Small reusable chart box for monthly bar charts — renders inside ChartCard
    function ChartBox({ title, labels, values, color, data }: { title: string; labels?: string[]; values?: number[]; color?: string; data?: { name: string; value: number }[] }) {
        const dataToRender = data ?? buildCumulativeData(labels, values)
        return (
            <ChartCard title={title}>
                <div style={{ width: '100%', height: 160 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dataToRender} margin={{ left: 8, right: 8, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" interval={0} angle={-45} textAnchor="end" height={50} tick={{ fontSize: 11 }} />
                            <YAxis domain={[0, 'dataMax']} />
                            <Tooltip />
                            <Bar dataKey="value" fill={color || BRAND_PURPLE_LIGHT} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </ChartCard>
        )
    }

    // stacked-data useMemo declarations moved below where roleTypes/engagementKinds
    // and their source maps are created to avoid accessing uninitialized consts

    const bubbleData = useMemo(() => orgsBySector.map((it: any) => ({
        name: it.name,
        x: it.engagement_count ?? 0,
        y: it.contact_count ?? 0,
        z: it.interview_count ?? 0,
    })), [orgsBySector])

    // sectorSummary is memoized below; see module-level helper buildSectorSummary for implementation

    // Sort sectors by total volume (descending). Ensure recruitment sector appears last
    const sectorSummary = useMemo(() => {
        const arr = buildSectorSummary(orgsBySector) || []
        // compute a simple volume metric per sector
        const withVolume = arr.map((s: any) => ({
            ...s,
            _volume: (Number(s.contacts_direct || 0) + Number(s.contacts_target || 0) + Number(s.engagements || 0) + Number(s.interviews || 0) + Number(s.roles || 0))
        }))

        // extract recruitment sector (case-insensitive match) to place at end
        const recruitIndex = withVolume.findIndex((s: any) => (s.sector || '').toLowerCase().includes('recruit'))
        const recruit = recruitIndex >= 0 ? withVolume.splice(recruitIndex, 1)[0] : null

        // sort remaining by descending volume
        withVolume.sort((a: any, b: any) => (b._volume || 0) - (a._volume || 0))

        if (recruit) withVolume.push(recruit)
        return withVolume
    }, [orgsBySector])

    // Prepare data for stacked cumulative charts (contacts by role, engagements by type)
    const cumulativeContactsByRoleSource = data?.cumulativeContactsByRole || []
    const cumulativeEngagementsByTypeSource = data?.cumulativeEngagementsByType || []

    const roleTypes = useMemo<string[]>(() => Array.from(new Set((cumulativeContactsByRoleSource || []).map((r: any) => r.role_type))).filter(Boolean) as string[], [cumulativeContactsByRoleSource])
    const engagementKinds = useMemo<string[]>(() => Array.from(new Set((cumulativeEngagementsByTypeSource || []).map((r: any) => r.kind))).filter(Boolean) as string[], [cumulativeEngagementsByTypeSource])

    // Build maps: role -> month -> cumulative_total and kind -> month -> cumulative_total
    const cumulativeContactsRoleMap = useMemo(() => {
        const m: Record<string, Record<string, number>> = {}
        for (const r of cumulativeContactsByRoleSource || []) {
            const month = (r.month || '').slice(0, 7)
            const role = r.role_type || 'Unknown'
            m[role] = m[role] || {}
            m[role][month] = Number(r.cumulative_total || 0)
        }
        return m
    }, [cumulativeContactsByRoleSource])

    const cumulativeEngagementKindMap = useMemo(() => {
        const m: Record<string, Record<string, number>> = {}
        for (const r of cumulativeEngagementsByTypeSource || []) {
            const month = (r.month || '').slice(0, 7)
            const kind = r.kind || 'Unknown'
            m[kind] = m[kind] || {}
            m[kind][month] = Number(r.cumulative_total || 0)
        }
        return m
    }, [cumulativeEngagementsByTypeSource])

    // Build stacked data for cumulative contacts by role (moved here to avoid TDZ)
    const contactsStackedData = useMemo(() => {
        const months = monthsAxis || []
        const roles = roleTypes || []
        // carry-forward last seen cumulative value per role so gaps don't reset to zero
        const last: Record<string, number> = {}
        return months.map(m => {
            const obj: any = { name: formatMonthLabel(m) }
            for (const r of roles) {
                const val = cumulativeContactsRoleMap[r]?.[m]
                if (typeof val === 'number') {
                    last[r] = val
                }
                obj[r] = last[r] ?? 0
            }
            return obj
        })
    }, [monthsAxis, roleTypes, cumulativeContactsRoleMap])

    // Contacts per month (derived from cumulative contacts). If backend provides cumulativeContacts.labels/values
    // we compute monthly new contacts by differencing the cumulative series to display a per-month bar chart.
    const contactsPerMonthData = useMemo(() => {
        try {
            const months = monthsAxis || []
            const labels = cumulativeContacts.labels || []
            const values = cumulativeContacts.values || []
            // Map label -> cumulative value
            const map: Record<string, number> = {}
            for (let i = 0; i < (labels || []).length; i++) map[String(labels[i] || '')] = Number(values?.[i] ?? 0)

            const out: { name: string; value: number }[] = []
            let prev = 0
            for (const m of months) {
                const cum = map[m] ?? prev
                const monthly = Math.max(0, (cum - prev))
                out.push({ name: formatMonthLabel(m), value: monthly })
                prev = cum
            }
            return out
        } catch (e) {
            return []
        }
    }, [monthsAxis, cumulativeContacts])

    // Interviews per month (derived from cumulative interviews)
    const interviewsPerMonthData = useMemo(() => {
        try {
            const months = monthsAxis || []
            const labels = cumulativeInterviews.labels || []
            const values = cumulativeInterviews.values || []
            const map: Record<string, number> = {}
            for (let i = 0; i < (labels || []).length; i++) map[String(labels[i] || '')] = Number(values?.[i] ?? 0)

            const out: { name: string; value: number }[] = []
            let prev = 0
            for (const m of months) {
                const cum = map[m] ?? prev
                const monthly = Math.max(0, (cum - prev))
                out.push({ name: formatMonthLabel(m), value: monthly })
                prev = cum
            }
            return out
        } catch (e) {
            return []
        }
    }, [monthsAxis, cumulativeInterviews])

    // Monthly contacts broken down by contact role type (stacked). We derive this by differencing
    // the cumulativeContactsByRoleSource (which provides cumulative totals per role per month).
    const monthlyContactsByRoleStackedData = useMemo(() => {
        try {
            const months = monthsAxis || []
            const roles = roleTypes || []
            // For each role, build a map month->cumulative
            const cumMap = cumulativeContactsRoleMap || {}

            // We'll build an array of objects { name: formattedMonth, [role1]: val, [role2]: val, ... }
            const lastPerRole: Record<string, number> = {}
            const out: any[] = []

            for (const m of months) {
                const obj: any = { name: formatMonthLabel(m) }
                for (const r of roles) {
                    const cum = Number(cumMap[r]?.[m] ?? lastPerRole[r] ?? 0)
                    const prev = Number(lastPerRole[r] ?? 0)
                    const monthly = Math.max(0, cum - prev)
                    obj[r] = monthly
                    lastPerRole[r] = cum
                }
                out.push(obj)
            }
            return out
        } catch (e) {
            return []
        }
    }, [monthsAxis, roleTypes, cumulativeContactsRoleMap])

    // Build stacked data for cumulative engagements by kind (moved here to avoid TDZ)
    const engagementsStackedData = useMemo(() => {
        const months = monthsAxis || []
        const kinds = engagementKinds || []
        const last: Record<string, number> = {}
        return months.map(m => {
            const obj: any = { name: formatMonthLabel(m) }
            for (const k of kinds) {
                const val = cumulativeEngagementKindMap[k]?.[m]
                if (typeof val === 'number') {
                    last[k] = val
                }
                obj[k] = last[k] ?? 0
            }
            return obj
        })
    }, [monthsAxis, engagementKinds, cumulativeEngagementKindMap])

    // Dev-only: log sector summary so we can debug missing sectors (remove in production)
    React.useEffect(() => {
        if (process.env.NODE_ENV !== 'production') {
            try {
                // Normalize common misspellings for easier visual scanning
                const normalized = (sectorSummary || []).map((s: any) => ({ ...s, sector: (String(s.sector || '')).replace(/^Telcoms$/i, 'Telecoms') }))
                // eslint-disable-next-line no-console
                console.debug('Analytics sectorSummary (preview):', normalized.slice(0, 40))
            } catch (e) {
                // ignore
            }
        }
    }, [sectorSummary])

    // Compute chart height so categories are spaced out when there are many sectors
    const sectorChartHeight = Math.max(520, (sectorSummary?.length || 0) * 48)

    // no custom tick renderer or measured layout - use the default category Y axis

    return (
        <Box>
            <h2 style={{ margin: 0 }}>Analytics Studio</h2>
            {/* Top region: date pickers, KPI panels and summary chart inside an accordion */}
            <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant={ACCORDION_TITLE_VARIANT as any} sx={ACCORDION_TITLE_SX}>JobTrack Analytics</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Box style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
                        <Box style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
                            <Box style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <DatePicker label="Start date" value={startDate || null} onChange={(v) => setStartDate(v || '')} />
                                <DatePicker label="End date" value={endDate || null} onChange={(v) => setEndDate(v || '')} />
                                <AppButton
                                    variant="outlined"
                                    colorScheme="white"
                                    onClick={() => {
                                        const min = data?.min_date ?? data?.minDate ?? null
                                        const max = data?.max_date ?? data?.maxDate ?? null
                                        setStartDate(min || defaultStartDate)
                                        setEndDate(max || defaultEndDate)
                                        try { refetch() } catch (e) { /* ignore */ }
                                    }}
                                    disabled={isLoading}
                                    sx={{ height: 40 }}
                                    aria-label="Reset dates to maximum available range"
                                >
                                    Reset
                                </AppButton>
                                <AppButton colorScheme="purple" onClick={() => refetch()} disabled={isLoading} sx={{ height: 40 }}>
                                    Refresh
                                </AppButton>
                            </Box>

                            <Box sx={{ marginLeft: 'auto' }}>
                                <AppButton
                                    colorScheme="purple"
                                    onClick={async () => {
                                        setExportingPdf(true)
                                        try {
                                            const nodes = [
                                                bubbleRef.current,
                                                leadsTopRef.current,
                                                leadsReviewsRef.current,
                                                sectorRef.current,
                                                cumulativeContactsRef.current,
                                                engagementsPerMonthRef.current,
                                                cumulativeEngagementsRef.current,
                                                rolesPerMonthRef.current,
                                                cumulativeRolesRef.current,
                                            ].filter(Boolean) as HTMLElement[]
                                            if (nodes.length === 0) { alert('No chart elements found to export.'); return }
                                            await exportNodesToPdf(nodes)
                                        } catch (err) {
                                            // eslint-disable-next-line no-console
                                            console.error('Export PDF failed', err)
                                            alert('Export failed. See console for details.')
                                        } finally {
                                            setExportingPdf(false)
                                        }
                                    }}
                                    disabled={exportingPdf}
                                    sx={{ height: 40 }}
                                    aria-label="Export analytics to PDF"
                                    endIcon={<PictureAsPdfIcon />}
                                >
                                    Export
                                </AppButton>
                            </Box>
                        </Box>

                        {/* KPI cards removed by design — charts below provide visual summaries. */}
                    </Box>
                </AccordionDetails>
            </Accordion>

            {/* Leads charts: Top companies and Reviews by date */}
            <Box>
                <Tabs value={analyticsTab} onChange={(_, v) => setAnalyticsTab(v)} sx={{ mb: 1 }}>
                    <Tab label="Active" />
                    <Tab label="LinkedIn Leads" />
                    <Tab label="Action Plan Tasks" />
                </Tabs>

                {/* Active tab: main charts (bubble, etc.) */}
                {analyticsTab === 0 && (
                    <>
                        <Box style={{ width: '100%', marginTop: 12 }}>
                            <ChartCard ref={bubbleRef} title={"Contacts: engagements vs days since last contact"}>
                                <div style={{ width: '100%', height: 280 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ScatterChart>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis type="number" dataKey="x" name="Days since last contact" tick={{ fontSize: 11 }} />
                                            <YAxis type="number" dataKey="y" name="Engagements" tick={{ fontSize: 11 }} />
                                            <ZAxis dataKey="z" range={[40, 400]} />
                                            <Tooltip content={<BubbleTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                                            <Scatter data={contactsBubbleData} >
                                                {(contactsBubbleData || []).map((d: any, i: number) => (
                                                    <Cell key={`cell-tabs-${i}`} fill={d.colour || BRAND_PURPLE} />
                                                ))}
                                            </Scatter>
                                        </ScatterChart>
                                    </ResponsiveContainer>
                                </div>
                            </ChartCard>
                        </Box>
                    </>
                )}

                {/* LinkedIn Leads tab: monthly and cumulative charts */}
                {analyticsTab === 1 && (
                    <div>
                        <Box style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <ChartCard ref={leadsTopRef} title={"LinkedIn Contacts — Monthly"} sx={{ mb: 1 }}>
                                <div style={{ width: '100%', height: 320, marginBottom: 6 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        {(() => {
                                            const all = Array.isArray(leadsAll) ? leadsAll : []
                                            const linkedin = all.filter((r: any) => r.linkedin_url || (!r.linkedin_url && (r.position || r.company)))
                                            if (linkedin.length === 0) return (<BarChart data={[]} />)

                                            let minDate: string | null = null
                                            for (const r of linkedin) {
                                                const d = r.connected_on || r.created_at || r.reviewdate
                                                if (!d) continue
                                                try { const iso = (new Date(d)).toISOString().slice(0, 10); if (!minDate || iso < minDate) minDate = iso } catch (e) { }
                                            }
                                            const start = minDate || defaultStartDate
                                            const end = defaultEndDate
                                            const months = generateMonthRange(start.slice(0, 7), end.slice(0, 7))

                                            const counts: Record<string, number> = {}
                                            for (const r of linkedin) {
                                                const d = r.connected_on || r.created_at || r.reviewdate
                                                if (!d) continue
                                                try { const iso = (new Date(d)).toISOString().slice(0, 10); const month = iso.slice(0, 7); counts[month] = (counts[month] || 0) + 1 } catch (e) { }
                                            }

                                            const searchStartRaw = applicantSettings?.searchStartDate || applicantSettings?.searchstartdate || null
                                            const searchStartMonth = searchStartRaw ? String(searchStartRaw).slice(0, 7) : null

                                            const chartData = months.map((m: string) => ({ name: formatMonthLabel(m), value: counts[m] || 0, afterSearchStart: searchStartMonth ? (m > searchStartMonth) : false }))

                                            // Debug: log month flags for colouring
                                            // eslint-disable-next-line no-console
                                            console.debug('[Analytics] LinkedIn monthly chart', { searchStartMonth, months, flags: chartData.map((c: any) => ({ name: c.name, after: c.afterSearchStart })) })

                                            let running = 0
                                            const cumulativeData = months.map((m: string) => { running += counts[m] || 0; return { name: formatMonthLabel(m), value: running, afterSearchStart: searchStartMonth ? (m > searchStartMonth) : false } })

                                            // Debug: log cumulative month flags for colouring
                                            // eslint-disable-next-line no-console
                                            console.debug('[Analytics] LinkedIn cumulative chart', { searchStartMonth, months, flags: cumulativeData.map((c: any) => ({ name: c.name, after: c.afterSearchStart })) })

                                            const maxLabels = 8
                                            const labelInterval = chartData.length > maxLabels ? Math.ceil(chartData.length / maxLabels) : 0

                                            return (
                                                <BarChart data={chartData} margin={{ left: 8, right: 8, bottom: 20 }}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="name" interval={labelInterval} angle={-45} textAnchor="end" height={40} tick={{ fontSize: 14 }} />
                                                    <YAxis />
                                                    <Tooltip />
                                                    {/* Visual marker for applicant search start month */}
                                                    {searchStartMonth && months.includes(searchStartMonth) && (
                                                        <ReferenceLine x={formatMonthLabel(searchStartMonth)} stroke={BRAND_PURPLE} strokeWidth={2} strokeOpacity={0.6} ifOverflow="extendDomain" />
                                                    )}
                                                    <Bar dataKey="value">
                                                        {(chartData || []).map((entry: any, i: number) => (
                                                            <Cell key={`cell-linkedin-${i}`} fill={entry.afterSearchStart ? BRAND_PURPLE_LIGHT : BRAND_PURPLE} />
                                                        ))}
                                                    </Bar>
                                                    <Legend payload={[{ value: 'Before search start', type: 'square', color: BRAND_PURPLE }, { value: 'After search start', type: 'square', color: BRAND_PURPLE_LIGHT }]} />
                                                </BarChart>
                                            )
                                        })()}
                                    </ResponsiveContainer>
                                </div>
                            </ChartCard>

                            <ChartCard title={"LinkedIn Contacts — Cumulative"} sx={{ mb: 1 }}>
                                <div style={{ width: '100%', height: 320, marginBottom: 6 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        {(() => {
                                            const all = Array.isArray(leadsAll) ? leadsAll : []
                                            const linkedin = all.filter((r: any) => r.linkedin_url || (!r.linkedin_url && (r.position || r.company)))
                                            if (linkedin.length === 0) return <BarChart data={[]} />

                                            let minDate: string | null = null
                                            for (const r of linkedin) { const d = r.connected_on || r.created_at || r.reviewdate; if (!d) continue; try { const iso = (new Date(d)).toISOString().slice(0, 10); if (!minDate || iso < minDate) minDate = iso } catch (e) { } }
                                            const start = minDate || defaultStartDate
                                            const end = defaultEndDate
                                            const months = generateMonthRange(start.slice(0, 7), end.slice(0, 7))

                                            const counts: Record<string, number> = {}
                                            for (const r of linkedin) { const d = r.connected_on || r.created_at || r.reviewdate; if (!d) continue; try { const iso = (new Date(d)).toISOString().slice(0, 10); const month = iso.slice(0, 7); counts[month] = (counts[month] || 0) + 1 } catch (e) { } }

                                            const searchStartRaw = applicantSettings?.searchStartDate || applicantSettings?.searchstartdate || null
                                            const searchStartMonth = searchStartRaw ? String(searchStartRaw).slice(0, 7) : null

                                            let running = 0
                                            const cumulativeData = months.map((m: string) => { running += counts[m] || 0; return { name: formatMonthLabel(m), value: running, afterSearchStart: searchStartMonth ? (m > searchStartMonth) : false } })

                                            const maxLabels = 8
                                            const labelInterval = cumulativeData.length > maxLabels ? Math.ceil(cumulativeData.length / maxLabels) : 0

                                            return (
                                                <BarChart data={cumulativeData} margin={{ left: 8, right: 8, bottom: 20 }}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="name" interval={labelInterval} angle={-45} textAnchor="end" height={40} tick={{ fontSize: 14 }} />
                                                    <YAxis />
                                                    <Tooltip />
                                                    {/* Visual marker for applicant search start month */}
                                                    {searchStartMonth && months.includes(searchStartMonth) && (
                                                        <ReferenceLine x={formatMonthLabel(searchStartMonth)} stroke={BRAND_PURPLE} strokeWidth={2} strokeOpacity={0.6} ifOverflow="extendDomain" />
                                                    )}
                                                    <Bar dataKey="value">
                                                        {(cumulativeData || []).map((entry: any, i: number) => (
                                                            <Cell key={`cell-linkedin-cum-${i}`} fill={entry.afterSearchStart ? BRAND_PURPLE_LIGHT : BRAND_PURPLE} />
                                                        ))}
                                                    </Bar>
                                                    <Legend payload={[{ value: 'Before search start', type: 'square', color: BRAND_PURPLE }, { value: 'After search start', type: 'square', color: BRAND_PURPLE_LIGHT }]} />
                                                </BarChart>
                                            )
                                        })()}
                                    </ResponsiveContainer>
                                </div>
                            </ChartCard>
                        </Box>
                        {/* Scrollable company-by-month bubble chart: companies on Y, months on X */}
                        <Box style={{ width: '100%', marginTop: 12 }}>
                            <ChartCard title={"Top companies by lead count (Top 25)"} sx={{ mb: 1 }}>
                                <div style={{ width: '100%' }}>
                                    {(() => {
                                        const all = Array.isArray(leadsAll) ? leadsAll : []
                                        if (all.length === 0) return <div style={{ padding: 12 }}>No leads available</div>

                                        const companyName = (r: any) => (r.company || r.company_name || r.employer || r.org || r.companyName || r.linkedin_company || 'Unknown')
                                        const counts: Record<string, number> = {}
                                        for (const r of all) {
                                            const name = String(companyName(r) || 'Unknown')
                                            counts[name] = (counts[name] || 0) + 1
                                        }

                                        const companies = Object.entries(counts)
                                            .map(([name, value]) => ({ name, value }))
                                            .sort((a, b) => b.value - a.value)
                                            .slice(0, 25)

                                        if (!companies.length) return <div style={{ padding: 12 }}>No companies found</div>

                                        // Prepare data for log scale: replace any zero with a small positive value
                                        const prepared = companies.map(c => ({ ...c, value_for_scale: c.value === 0 ? 0.1 : c.value }))

                                        function TopCompaniesTooltip({ active, payload }: any) {
                                            if (!active || !payload || !payload.length) return null
                                            const row = payload[0].payload || {}
                                            return (
                                                <Paper sx={{ p: 1 }}>
                                                    <Typography variant="subtitle2">{row.name}</Typography>
                                                    <Typography variant="caption">Leads: {Number(row.value || 0)}</Typography>
                                                </Paper>
                                            )
                                        }

                                        return (
                                            <div style={{ width: '100%', height: 320 }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={prepared} margin={{ left: 8, right: 24, bottom: 80, top: 20 }}>
                                                        <CartesianGrid strokeDasharray="3 3" />
                                                        <XAxis dataKey="name" interval={0} angle={-45} textAnchor="end" height={80} tick={{ fontSize: 11 }} />
                                                        <YAxis scale="log" domain={["dataMin", "dataMax"]} allowDataOverflow={false} />
                                                        <Tooltip content={<TopCompaniesTooltip />} />
                                                        <Bar dataKey="value_for_scale" fill={BRAND_PURPLE} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        )
                                    })()}
                                </div>
                            </ChartCard>
                        </Box>
                    </div>
                )}

                {/* Action Plan Tasks tab */}
                {analyticsTab === 2 && (
                    <div>
                        <Box style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <ChartCard title={"Tasks by due month"} sx={{ mb: 1 }}>
                                <div style={{ width: '100%', height: 320 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        {(() => {
                                            // simple grouping of tasks by due month
                                            const tasks = Array.isArray(tasksData) ? tasksData : []
                                            if (!tasks.length) return <BarChart data={[]} />
                                            const counts: Record<string, number> = {}
                                            for (const t of tasks) {
                                                const d = t.duedate || t.created_at || null
                                                let key = 'No due date'
                                                if (d) {
                                                    try { key = (new Date(String(d))).toISOString().slice(0, 7) } catch (e) { key = 'No due date' }
                                                }
                                                counts[key] = (counts[key] || 0) + 1
                                            }
                                            const entries = Object.keys(counts).sort().map(k => ({ name: k === 'No due date' ? k : formatMonthLabel(k), value: counts[k] }))
                                            return (
                                                <BarChart data={entries} margin={{ left: 8, right: 8, bottom: 20 }}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} />
                                                    <YAxis />
                                                    <Tooltip />
                                                    <Bar dataKey="value" fill={BRAND_PURPLE} />
                                                </BarChart>
                                            )
                                        })()}
                                    </ResponsiveContainer>
                                </div>
                            </ChartCard>

                            <ChartCard title={"Recent tasks"} sx={{ mb: 1 }}>
                                <div style={{ padding: 12 }}>
                                    {(!tasksData || tasksData.length === 0) ? (
                                        <div>No tasks available</div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {tasksData.slice(0, 10).map((t: any) => (
                                                <Paper key={t.taskid} sx={{ p: 1 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                                                        <div style={{ color: '#666' }}>{t.duedate ? (new Date(String(t.duedate))).toLocaleDateString() : (t.created_at ? (new Date(String(t.created_at))).toLocaleDateString() : '—')}</div>
                                                    </div>
                                                </Paper>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </ChartCard>
                        </Box>
                    </div>
                )}
            </Box>

            {analyticsTab === 0 && (
                <>
                    {/* Sector summary chart: organizations, contacts, engagements, roles, interviews by sector (outside accordion) */}
                    <Box style={{ width: '100%', marginTop: 12 }}>
                        <ChartCard ref={sectorRef} title={"By Sector: Organisations, Contacts, Engagements, Roles and Interviews"} sx={{ mb: 1 }}>
                            <div style={{ width: 'calc(100% + 16px)', height: sectorChartHeight, marginTop: 8, marginLeft: '-8px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart layout="vertical" data={sectorSummary} margin={{ top: 20, right: 24, left: 60, bottom: 20 }} barCategoryGap={'40%'} barGap={6}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis type="number" />
                                        <YAxis dataKey="sector" type="category" width={160} tick={{ fontSize: 12 }} />
                                        <Tooltip />
                                        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                                        <Bar dataKey="org_count" name="Orgs" fill={ORG_COLOR} barSize={18} />
                                        <Bar dataKey="contacts_total" name="Contacts" fill={BRAND_PURPLE} barSize={18} />
                                        <Bar dataKey="engagements" name="Engagements" fill={ENGAGEMENT_SHADES[2] || STACK_FALLBACK[1]} barSize={14} />
                                        <Bar dataKey="roles" name="Roles" fill={ROLE_SHADES[2] || STACK_FALLBACK[2]} barSize={14} />
                                        <Bar dataKey="active_roles" name="Active roles" fill={ACTIVE_ROLES_COLOR} barSize={14} />
                                        <Bar dataKey="interviews" name="Interviews" fill={INTERVIEW_SHADES[2] || STACK_FALLBACK[3]} barSize={14} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </ChartCard>
                    </Box>

                    {/* Detailed analysis region: cumulative monthly charts */}
                    <Box style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                        {/* Row 1: Cumulative contacts (left) and Cumulative interviews (right) */}
                        <div>
                            <ChartCard ref={engagementsPerMonthRef} title={"Engagements per month"}>
                                <div style={{ width: '100%', height: 160 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={engagementsMonthlyStackedData} margin={{ left: 8, right: 8, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" interval={0} angle={-45} textAnchor="end" height={50} tick={{ fontSize: 11 }} />
                                            <YAxis />
                                            <Tooltip />
                                            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                                            {engagementKindsMonthly && engagementKindsMonthly.map((k: string, i: number) => (
                                                <Bar key={k} dataKey={k} stackId="em" fill={ENGAGEMENT_SHADES[i % ENGAGEMENT_SHADES.length] || STACK_FALLBACK[i % STACK_FALLBACK.length]} />
                                            ))}
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </ChartCard>
                        </div>

                        <div>
                            <ChartCard ref={cumulativeEngagementsRef} title={"Cumulative engagements"}>
                                <div style={{ width: '100%', height: 160 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={engagementsStackedData} margin={{ left: 8, right: 8, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" interval={0} angle={-45} textAnchor="end" height={50} tick={{ fontSize: 11 }} />
                                            <YAxis domain={[0, 'dataMax']} />
                                            <Tooltip />
                                            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                                            {engagementKinds && engagementKinds.map((k: string, i: number) => (
                                                <Bar key={k} dataKey={k} stackId="b" fill={ENGAGEMENT_SHADES[i % ENGAGEMENT_SHADES.length] || STACK_FALLBACK[(i + (roleTypes?.length || 0)) % STACK_FALLBACK.length]} />
                                            ))}
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </ChartCard>
                        </div>

                        {/* Row 3: Roles per month | Cumulative roles (swapped) */}
                        <div>
                            <ChartCard ref={rolesPerMonthRef} title={"Roles per month"}>
                                <div style={{ width: '100%', height: 160 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={rolesMonthlyStackedData} margin={{ left: 8, right: 8, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" interval={0} angle={-45} textAnchor="end" height={50} tick={{ fontSize: 11 }} />
                                            <YAxis />
                                            <Tooltip />
                                            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                                            {roleStatusesMonthly && roleStatusesMonthly.map((s: string, i: number) => (
                                                <Bar key={s} dataKey={s} stackId="rs" fill={ROLE_SHADES[i % ROLE_SHADES.length] || STACK_FALLBACK[i % STACK_FALLBACK.length]} />
                                            ))}
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </ChartCard>
                        </div>

                        <div>
                            <ChartCard ref={cumulativeRolesRef} title={"Cumulative roles"}>
                                <div style={{ width: '100%', height: 160 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={rolesStackedData} margin={{ left: 8, right: 8, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" interval={0} angle={-45} textAnchor="end" height={50} tick={{ fontSize: 11 }} />
                                            <YAxis domain={[0, 'dataMax']} />
                                            <Tooltip />
                                            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                                            {roleSourceTypes && roleSourceTypes.map((s: string, i: number) => (
                                                <Bar key={s} dataKey={s} stackId="r" fill={ROLE_SHADES[i % ROLE_SHADES.length] || STACK_FALLBACK[i % STACK_FALLBACK.length]} />
                                            ))}
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </ChartCard>
                        </div>

                        {/* New row: Contacts per month (left) and Cumulative contacts (right) */}
                        <div>
                            <ChartCard ref={engagementsPerMonthRef} title={"Contacts per month by role"}>
                                <div style={{ width: '100%', height: 160 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={monthlyContactsByRoleStackedData} margin={{ left: 8, right: 8, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" interval={0} angle={-45} textAnchor="end" height={50} tick={{ fontSize: 11 }} />
                                            <YAxis />
                                            <Tooltip />
                                            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                                            {roleTypes && roleTypes.map((r: string, i: number) => (
                                                <Bar key={r} dataKey={r} stackId="cr" fill={CONTACTS_SHADES[i % CONTACTS_SHADES.length] || STACK_FALLBACK[i % STACK_FALLBACK.length]} />
                                            ))}
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </ChartCard>
                        </div>

                        <div>
                            <ChartCard ref={cumulativeContactsRef} title={"Cumulative contacts by role"}>
                                <div style={{ width: '100%', height: 160 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={contactsStackedData} margin={{ left: 8, right: 8, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" interval={0} angle={-45} textAnchor="end" height={50} tick={{ fontSize: 11 }} />
                                            <YAxis domain={[0, 'dataMax']} />
                                            <Tooltip />
                                            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                                            {roleTypes && roleTypes.map((r: string, i: number) => (
                                                <Bar key={r} dataKey={r} stackId="crcum" fill={CONTACTS_SHADES[i % CONTACTS_SHADES.length] || STACK_FALLBACK[i % STACK_FALLBACK.length]} />
                                            ))}
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </ChartCard>
                        </div>

                        {/* New row: Interviews per month (left) and Cumulative interviews (right) */}
                        <div>
                            <ChartCard ref={engagementsPerMonthRef} title={"Interviews per month"}>
                                <div style={{ width: '100%', height: 160 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={interviewsPerMonthData} margin={{ left: 8, right: 8, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" interval={0} angle={-45} textAnchor="end" height={50} tick={{ fontSize: 11 }} />
                                            <YAxis />
                                            <Tooltip />
                                            <Bar dataKey="value" fill={INTERVIEW_SHADES[2] || STACK_FALLBACK[3]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </ChartCard>
                        </div>

                        <div>
                            <ChartCard ref={cumulativeEngagementsRef} title={"Cumulative interviews"}>
                                <div style={{ width: '100%', height: 160 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={interviewsBarData} margin={{ left: 8, right: 8, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" interval={0} angle={-45} textAnchor="end" height={50} tick={{ fontSize: 11 }} />
                                            <YAxis domain={[0, 'dataMax']} />
                                            <Tooltip />
                                            <Bar dataKey="value" fill={INTERVIEW_SHADES[2] || STACK_FALLBACK[3]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </ChartCard>
                        </div>

                        {/* Removed bottom full-width cumulative interviews (now displayed beside contacts) */}
                    </Box>

                </>
            )}

            {/* Engagements & Contacts section removed per user request */}
        </Box>
    )
}

