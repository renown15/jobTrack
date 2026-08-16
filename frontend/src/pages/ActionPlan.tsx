import React, { useEffect, useState, useCallback } from 'react'
// debug traces for test diagnostics
console.debug('TRACE: ActionPlan module loaded')
import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { fetchTasks, createTask, deleteTask, fetchTaskLogs, addTaskLog, deleteTaskLog, updateTaskLog, fetchTaskTargets, addTaskTarget, deleteTaskTarget, fetchReferenceData, fetchAllContacts, fetchLeads, fetchLeadsAll, fetchOrganisations, fetchEventTasks, fetchSectors } from '../api/client'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import DataTable from '../components/DataTable'
import { useContacts } from '../api/hooks/useContacts'
import { useLeads } from '../api/hooks/useLeads'
import type { Task, TaskLog, TaskTarget } from '../api/types'
import Box from '@mui/material/Box'
import { ACCORDION_TITLE_SX, ACCORDION_TITLE_VARIANT } from '../constants/ui'
import Avatar from '@mui/material/Avatar'
import Tooltip from '@mui/material/Tooltip'
import LinkedInIcon from '@mui/icons-material/LinkedIn'

import AppButton from '../components/Shared/AppButton'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import SmartFilter from '../components/Shared/SmartFilter'
import CircularProgress from '@mui/material/CircularProgress'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import IconButton from '@mui/material/IconButton'
import DeleteIcon from '@mui/icons-material/Delete'
import LinkOffIcon from '@mui/icons-material/LinkOff'
import EditIcon from '@mui/icons-material/Edit'
import Alert from '@mui/material/Alert'
import VisibilityIcon from '@mui/icons-material/Visibility'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import FormHelperText from '@mui/material/FormHelperText'
import TaskFormModal from '../components/ActionCanvas/TaskFormModal'
import ActionPlanTasksTable from '../components/ActionCanvas/ActionPlanTasksTable'
import AddUpdateModal from '../components/ActionCanvas/AddUpdateModal'
import Toast from '../components/Shared/Toast'
import ConfirmDialog from '../components/Shared/ConfirmDialog'
import ActionList from '../components/ActionCanvas/ActionList'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import TableBody from '@mui/material/TableBody'
import TableSortLabel from '@mui/material/TableSortLabel'
import TablePagination from '@mui/material/TablePagination'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '../components/Shared/WideDialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import WideDialog from '../components/Shared/WideDialog'
import ContactsTable from '../components/Hub/ContactsTable'
import OrganisationsTable from '../components/Hub/OrganisationsTable'
import EngagementsTable from '../components/Hub/EngagementsTable'

import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

// Simple reusable table with per-column filters and sorting (client-side)
function SimpleFilterableTable({ rows, columns, filters, onFilterChange, sortState, onSortChange, selectable, idKey, selectedIds, onSelectionChange, page, pageSize, onPageChange, onPageSizeChange, total }: {
    rows: any[]
    columns: { key: string; label: string; render?: (row: any) => React.ReactNode; filterType?: 'text' | 'multiselect' | 'datepreset' | 'numericpreset' | 'tristate'; filterOptions?: string[] | 'fromRows' }[]
    filters: Record<string, any>
    onFilterChange: (col: string, value: string) => void
    sortState: { key?: string; dir: 'asc' | 'desc' }
    onSortChange: (key: string) => void
    selectable?: boolean
    idKey?: string
    selectedIds?: Set<number | string>
    onSelectionChange?: (s: Set<number | string>) => void
    page?: number
    pageSize?: number
    onPageChange?: (newPage: number) => void
    onPageSizeChange?: (newSize: number) => void
    total?: number
}) {
    const [localFilter, setLocalFilter] = useState<Record<string, any>>(() => ({ ...(filters || {}) }))

    useEffect(() => {
        // Convert incoming filter strings for multiselect columns into arrays
        const initial: Record<string, any> = { ...(filters || {}) }
        columns.forEach((c) => {
            // For filter types that expect array values, convert incoming comma-separated strings to arrays
            if (c.filterType === 'multiselect' || c.filterType === 'numericpreset' || c.filterType === 'datepreset' || c.filterType === 'tristate') {
                const v = initial[c.key]
                if (v == null) return
                if (Array.isArray(v)) return
                if (typeof v === 'string') {
                    const arr = v.split(',').map((s) => s.trim()).filter((x) => x)
                    initial[c.key] = arr
                }
            }
        })
        setLocalFilter(initial)
    }, [filters, columns])

    const filtered = React.useMemo(() => {
        if (!rows) return []
        return rows.filter((r) => {
            return columns.every((c) => {
                const f = localFilter[c.key]
                if (f == null || f === '') return true

                // handle multiselect-like arrays (generic for many smart filters)
                if (Array.isArray(f)) {
                    if (!f.length) return true
                    const val = r[c.key]
                    // special handling by filterType
                    if (c.filterType === 'datepreset') {
                        // each preset e.g. 'Last 7 days','Last 30 days','Never'
                        return f.some((preset: string) => {
                            if (!preset) return false
                            const v = val
                            if (!v) {
                                return preset.toLowerCase().includes('never')
                            }
                            const d = new Date(v)
                            if (isNaN(d.getTime())) return false
                            const daysAgo = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
                            if (preset.toLowerCase().includes('7')) return daysAgo <= 7
                            if (preset.toLowerCase().includes('30')) return daysAgo <= 30
                            if (preset.toLowerCase().includes('90')) return daysAgo <= 90
                            if (preset.toLowerCase().includes('year')) return daysAgo <= 365
                            return false
                        })
                    }
                    if (c.filterType === 'numericpreset') {
                        // presets like '0', '1-5', '6+'
                        return f.some((preset: string) => {
                            const num = Number(r[c.key] ?? 0)
                            if (preset.includes('-')) {
                                const [a, b] = preset.split('-').map((s) => Number(s.trim()))
                                if (!isNaN(a) && !isNaN(b)) return num >= a && num <= b
                            } else if (preset.includes('+')) {
                                const a = Number(preset.replace('+', '').trim())
                                if (!isNaN(a)) return num >= a
                            } else {
                                const a = Number(preset)
                                if (!isNaN(a)) return num === a
                            }
                            return false
                        })
                    }
                    if (c.filterType === 'tristate') {
                        return f.some((sel: string) => {
                            const v = r[c.key]
                            if (sel === 'Yes') return v === true || v === 1 || String(v).toLowerCase() === 'true' || String(v) === '1'
                            if (sel === 'No') return v === false || v === 0 || String(v).toLowerCase() === 'false' || String(v) === '0'
                            if (sel === 'Unknown') return v == null || v === ''
                            return false
                        })
                    }
                    // default multiselect exact-match (case-insensitive)
                    const val2 = r[c.key]
                    if (val2 == null) return false
                    return f.some((sel: any) => String(val2).toLowerCase() === String(sel).toLowerCase())
                }

                // string filter (substring)
                const fs = String(f).trim().toLowerCase()
                if (!fs) return true
                const val3 = r[c.key]
                if (val3 == null) return false
                return String(val3).toLowerCase().includes(fs)
            })
        })
    }, [rows, columns, localFilter])

    const sorted = React.useMemo(() => {
        if (!sortState || !sortState.key) return filtered
        const key = sortState.key
        const dir = sortState.dir === 'asc' ? 1 : -1
        return [...filtered].sort((a: any, b: any) => {
            const A = a[key]
            const B = b[key]
            if (A == null && B == null) return 0
            if (A == null) return -1 * dir
            if (B == null) return 1 * dir
            if (typeof A === 'number' && typeof B === 'number') return (A - B) * dir
            return String(A).localeCompare(String(B)) * dir
        })
    }, [filtered, sortState])

    // handle select toggle
    const _idKey = idKey || 'id'

    const allIds = sorted.map((r) => r[_idKey]).filter((x) => x != null)

    const isAllSelected = selectable && selectedIds && allIds.length > 0 && allIds.every((id) => selectedIds.has(id))
    const isSomeSelected = selectable && selectedIds && allIds.some((id) => selectedIds.has(id))

    function toggleSelectAll() {
        if (!selectable || !onSelectionChange) return
        const next = new Set(selectedIds ? Array.from(selectedIds) : [])
        if (isAllSelected) {
            // deselect all visible
            allIds.forEach((id) => next.delete(id))
        } else {
            allIds.forEach((id) => { if (id != null) next.add(id) })
        }
        onSelectionChange(next)
    }

    function toggleRow(id: number | string) {
        if (!selectable || !onSelectionChange) return
        const next = new Set(selectedIds ? Array.from(selectedIds) : [])
        if (next.has(id)) next.delete(id)
        else next.add(id)
        onSelectionChange(next)
    }

    // Determine whether any filters are active so we can choose which total to show
    const hasActiveFilters = React.useMemo(() => {
        return Object.keys(localFilter || {}).some((k) => {
            const v = localFilter[k]
            if (v == null) return false
            if (Array.isArray(v)) return v.length > 0
            if (typeof v === 'string') return v.trim() !== ''
            return true
        })
    }, [localFilter])

    // Apply pagination to sorted results if paging props supplied
    const pageIdx = typeof page === 'number' ? page : 0
    const pSize = typeof pageSize === 'number' ? pageSize : 0
    // If the caller passed a `total` (e.g. server-provided grand total), prefer
    // to show that when no filters are active. When filters are active, show
    // the filtered count so the user sees the number of matching rows.
    const totalCount = typeof total === 'number' ? (hasActiveFilters ? sorted.length : total) : sorted.length
    let displayRows = sorted
    if (pSize > 0) {
        const start = pageIdx * pSize
        displayRows = sorted.slice(start, start + pSize)
    }

    return (
        <div style={{ overflowX: 'auto' }}>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        {selectable && (
                            <TableCell>
                                <Checkbox indeterminate={isSomeSelected && !isAllSelected} checked={isAllSelected} onChange={toggleSelectAll} />
                            </TableCell>
                        )}
                        {columns.map((c) => (
                            <TableCell key={c.key}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <TableSortLabel active={sortState?.key === c.key} direction={sortState?.dir || 'asc'} onClick={() => onSortChange(c.key)}>
                                        <strong>{c.label}</strong>
                                    </TableSortLabel>
                                </div>
                                <div style={{ marginTop: 6 }}>
                                    {(c.filterType === 'multiselect' || c.filterType === 'numericpreset' || c.filterType === 'datepreset' || c.filterType === 'tristate') ? (
                                        (() => {
                                            let options: string[] = []
                                            if (c.filterType === 'multiselect') {
                                                if (Array.isArray(c.filterOptions)) options = c.filterOptions as string[]
                                                else if (c.filterOptions === 'fromRows') options = Array.from(new Set(rows.map((r) => (r[c.key] == null ? '' : String(r[c.key]))).filter((x) => x)))
                                            } else if (c.filterType === 'numericpreset') {
                                                const nums = rows.map((r) => Number(r[c.key] ?? 0)).filter((n) => !isNaN(n)).sort((a, b) => a - b)
                                                if (!nums.length) options = ['0']
                                                else {
                                                    const uniq = Array.from(new Set(nums))
                                                    if (uniq.length <= 8 || Math.max(...uniq) <= 8) options = uniq.map((n) => String(n))
                                                    else {
                                                        const q = (p: number) => { const idx = Math.floor(p * (nums.length - 1)); return nums[idx] }
                                                        const q1 = q(0.25)
                                                        const q2 = q(0.5)
                                                        const q3 = q(0.75)
                                                        const max = nums[nums.length - 1]
                                                        const parts: string[] = []
                                                        if (nums.some((n) => n === 0)) parts.push('0')
                                                        const pushRange = (a: number, b: number) => { if (a === b) parts.push(String(a)); else parts.push(`${Math.max(1, Math.round(a))}-${Math.round(b)}`) }
                                                        if (q1 > 0) pushRange(1, q1)
                                                        pushRange(q1 + 1, q2)
                                                        pushRange(q2 + 1, q3)
                                                        if (q3 < max) parts.push(`${Math.round(q3 + 1)}+`)
                                                        options = Array.from(new Set(parts))
                                                    }
                                                }
                                            } else if (c.filterType === 'datepreset') {
                                                options = ['7 days', '30 days', '90 days', '1 year', 'Never']
                                            } else if (c.filterType === 'tristate') {
                                                options = ['Yes', 'No', 'Unknown']
                                            }
                                            const value = Array.isArray(localFilter[c.key]) ? localFilter[c.key] : []

                                            function matchesOtherFilters(row: any) {
                                                return columns.every((c2) => {
                                                    if (c2.key === c.key) return true
                                                    const f = localFilter[c2.key]
                                                    if (f == null || f === '') return true
                                                    if (Array.isArray(f)) {
                                                        if (!f.length) return true
                                                        const val = row[c2.key]
                                                        if (c2.filterType === 'datepreset') {
                                                            return f.some((preset: string) => {
                                                                if (!preset) return false
                                                                const v = val
                                                                if (!v) return preset.toLowerCase().includes('never')
                                                                const d = new Date(v)
                                                                if (isNaN(d.getTime())) return false
                                                                const daysAgo = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
                                                                if (preset.toLowerCase().includes('7')) return daysAgo <= 7
                                                                if (preset.toLowerCase().includes('30')) return daysAgo <= 30
                                                                if (preset.toLowerCase().includes('90')) return daysAgo <= 90
                                                                if (preset.toLowerCase().includes('year')) return daysAgo <= 365
                                                                return false
                                                            })
                                                        }
                                                        if (c2.filterType === 'numericpreset') {
                                                            return f.some((preset: string) => {
                                                                const num = Number(row[c2.key] ?? 0)
                                                                if (preset.includes('-')) {
                                                                    const [a, b] = preset.split('-').map((s) => Number(s.trim()))
                                                                    if (!isNaN(a) && !isNaN(b)) return num >= a && num <= b
                                                                } else if (preset.includes('+')) {
                                                                    const a = Number(preset.replace('+', '').trim())
                                                                    if (!isNaN(a)) return num >= a
                                                                } else {
                                                                    const a = Number(preset)
                                                                    if (!isNaN(a)) return num === a
                                                                }
                                                                return false
                                                            })
                                                        }
                                                        if (c2.filterType === 'tristate') {
                                                            return f.some((sel: string) => {
                                                                const v = row[c2.key]
                                                                if (sel === 'Yes') return v === true || v === 1 || String(v).toLowerCase() === 'true' || String(v) === '1'
                                                                if (sel === 'No') return v === false || v === 0 || String(v).toLowerCase() === 'false' || String(v) === '0'
                                                                if (sel === 'Unknown') return v == null || v === ''
                                                                return false
                                                            })
                                                        }
                                                        const val2 = row[c2.key]
                                                        if (val2 == null) return false
                                                        return f.some((sel: any) => String(val2).toLowerCase() === String(sel).toLowerCase())
                                                    }
                                                    const fs = String(f).trim().toLowerCase()
                                                    if (!fs) return true
                                                    const val3 = row[c2.key]
                                                    if (val3 == null) return false
                                                    return String(val3).toLowerCase().includes(fs)
                                                })
                                            }

                                            const matchCount = rows.filter((r) => matchesOtherFilters(r) && (() => {
                                                const v = r[c.key]
                                                if (v == null) return false
                                                return true
                                            })()).length

                                            return (
                                                <SmartFilter
                                                    options={options}
                                                    value={value}
                                                    onChange={(v: string[]) => { setLocalFilter((s) => ({ ...s, [c.key]: v })); onFilterChange(c.key, v.join(',')) }}
                                                    placeholder="Filter"
                                                    matchCount={matchCount}
                                                    showSelectAll={true}
                                                />
                                            )
                                        })()
                                    ) : (
                                        <TextField size="small" placeholder="Filter" value={localFilter[c.key] || ''} onChange={(e) => { const v = e.target.value; setLocalFilter((s) => ({ ...s, [c.key]: v })); onFilterChange(c.key, v); }} />
                                    )}
                                </div>
                            </TableCell>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {displayRows.map((r, idx) => (
                        <TableRow key={r[_idKey] ?? r.id ?? r.contactid ?? r.orgid ?? idx} hover>
                            {selectable && (
                                <TableCell>
                                    <Checkbox checked={!!(selectedIds && selectedIds.has(r[_idKey]))} onChange={() => toggleRow(r[_idKey])} />
                                </TableCell>
                            )}
                            {columns.map((c) => (
                                <TableCell key={c.key}>{c.render ? c.render(r) : String(r[c.key] ?? '')}</TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {pSize > 0 && (
                <TablePagination
                    component="div"
                    count={totalCount}
                    page={pageIdx}
                    onPageChange={(_, newPage) => onPageChange && onPageChange(newPage)}
                    rowsPerPage={pSize}
                    onRowsPerPageChange={(e) => onPageSizeChange && onPageSizeChange(parseInt(e.target.value, 10))}
                    rowsPerPageOptions={[10, 20, 50]}
                />
            )}
        </div>
    )
}

export default function ActionPlan() {
    const [tasks, setTasks] = useState<Task[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // create form state
    const [name, setName] = useState('')
    const [duedate, setDuedate] = useState<string | null>(null)
    const [applicantid, setApplicantid] = useState<number | ''>('')
    const [submitting, setSubmitting] = useState(false)

    const [logsByTask, setLogsByTask] = useState<Record<number, TaskLog[]>>({})
    const [targetsByTask, setTargetsByTask] = useState<Record<number, TaskTarget[]>>({})
    const [logText, setLogText] = useState<Record<number, string>>({})
    const [targetForm, setTargetForm] = useState<Record<number, { targettype?: number; targetid?: number }>>({})
    const [targetTypes, setTargetTypes] = useState<{ refid: number; refvalue: string }[]>([])
    const [modalOpen, setModalOpen] = useState(false)
    const [editingTask, setEditingTask] = useState<any | null>(null)
    const [toast, setToast] = useState<{ open: boolean; message: string; severity?: any }>({ open: false, message: '' })
    const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<number | null>(null)
    const [confirmDeleteLogId, setConfirmDeleteLogId] = useState<number | null>(null)
    const [confirmDeleteLogTaskId, setConfirmDeleteLogTaskId] = useState<number | null>(null)

    // Targets tab state
    const [activeTargetsTab, setActiveTargetsTab] = useState(0) // 0=Contacts,1=Leads,2=Organisations,3=Sectors
    const [contacts, setContacts] = useState<any[]>([])
    const [leads, setLeads] = useState<any[]>([])
    const [leadsPage, setLeadsPage] = useState(0)
    const [leadsPageSize, setLeadsPageSize] = useState(20)
    const leadsQ = useLeads(leadsPage + 1, leadsPageSize)
    const [orgs, setOrgs] = useState<any[]>([])
    const [sectors, setSectors] = useState<any[]>([])
    const [hideLinked, setHideLinked] = useState(false)
    const [hideInactive, setHideInactive] = useState(false)
    const [loadingTargets, setLoadingTargets] = useState(false)
    const [filters, setFilters] = useState<Record<string, Record<string, string>>>({ contacts: {}, leads: {}, orgs: {}, sectors: {} })
    const [sortBy, setSortBy] = useState<Record<string, { key?: string; dir: 'asc' | 'desc' }>>({ contacts: { dir: 'asc' }, leads: { dir: 'asc' }, orgs: { dir: 'asc' }, sectors: { dir: 'asc' } })
    // selection state for targets tables
    const [contactsSelected, setContactsSelected] = useState<Set<number | string>>(new Set())
    const [leadsSelected, setLeadsSelected] = useState<Set<number | string>>(new Set())
    const [orgsSelected, setOrgsSelected] = useState<Set<number | string>>(new Set())
    const [sectorsSelected, setSectorsSelected] = useState<Set<number | string>>(new Set())

    // paging state for contacts (Hub-style)
    const [contactsPage, setContactsPage] = useState(0) // 0-based for DataTable
    const [contactsPageSize, setContactsPageSize] = useState(20)

    const contactsQ = useContacts(contactsPage + 1, contactsPageSize)

    // prepare contacts with computed heat and linkedin flags similar to Hub ContactsTable
    const preparedContacts = React.useMemo(() => {
        const today = Date.now()
        // normalize contacts source: accept paginated { items: [...] } or plain array
        const raw = contactsQ.data?.items ?? contacts
        const src = Array.isArray(raw) ? raw : ((raw && Array.isArray((raw as any).items)) ? (raw as any).items : [])
        return (src || []).map((row: any) => {
            // compute last contact days
            let daysAgo: number | null = null
            const last = row.last_contact_date
            if (last) {
                const d = new Date(last)
                if (!isNaN(d.getTime())) {
                    daysAgo = Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)))
                }
            }
            const MAX_DAYS = 365
            const capped = daysAgo != null ? Math.min(daysAgo, MAX_DAYS) : MAX_DAYS
            const heatScore = Math.round((1 - capped / MAX_DAYS) * 100)

            const linkedInCandidates = ['islinkedinconnected', 'is_linkedin_connected', 'linkedin_connected', 'linkedInConnected']
            function findLinkedIn(obj: any) {
                if (!obj) return false
                for (const n of linkedInCandidates) {
                    if (Object.prototype.hasOwnProperty.call(obj, n) && obj[n] != null) return (obj[n] === true || obj[n] === 1 || String(obj[n]).toLowerCase() === 'true' || String(obj[n]) === '1')
                }
                const lowered = Object.keys(obj).reduce((acc: any, k: string) => { acc[k.toLowerCase()] = obj[k]; return acc }, {})
                for (const n of linkedInCandidates) {
                    const v = lowered[n.toLowerCase()]
                    if (v !== undefined && v !== null) return (v === true || v === 1 || String(v).toLowerCase() === 'true' || String(v) === '1')
                }
                return false
            }
            const isLinkedIn = findLinkedIn(row)
            const liSort = isLinkedIn ? '0:' : '1:'

            return { ...row, __heat_score: heatScore, __heat_days: daysAgo, __li_sort: liSort, __is_linkedin: isLinkedIn }
        })
    }, [contacts, contactsQ.data, contactsQ.data?.items])

    // prepare full contacts list (for filtering across entire dataset)
    const preparedContactsAll = React.useMemo(() => {
        const today = Date.now()
        const src = contacts || []
        return (src || []).map((row: any) => {
            let daysAgo: number | null = null
            const last = row.last_contact_date
            if (last) {
                const d = new Date(last)
                if (!isNaN(d.getTime())) {
                    daysAgo = Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)))
                }
            }
            const MAX_DAYS = 365
            const capped = daysAgo != null ? Math.min(daysAgo, MAX_DAYS) : MAX_DAYS
            const heatScore = Math.round((1 - capped / MAX_DAYS) * 100)
            const linkedInCandidates = ['islinkedinconnected', 'is_linkedin_connected', 'linkedin_connected', 'linkedInConnected']
            function findLinkedIn(obj: any) {
                if (!obj) return false
                for (const n of linkedInCandidates) {
                    if (Object.prototype.hasOwnProperty.call(obj, n) && obj[n] != null) return (obj[n] === true || obj[n] === 1 || String(obj[n]).toLowerCase() === 'true' || String(obj[n]) === '1')
                }
                const lowered = Object.keys(obj).reduce((acc: any, k: string) => { acc[k.toLowerCase()] = obj[k]; return acc }, {})
                for (const n of linkedInCandidates) {
                    const v = lowered[n.toLowerCase()]
                    if (v !== undefined && v !== null) return (v === true || v === 1 || String(v).toLowerCase() === 'true' || String(v) === '1')
                }
                return false
            }
            const isLinkedIn = findLinkedIn(row)
            const liSort = isLinkedIn ? '0:' : '1:'
            return { ...row, __heat_score: heatScore, __heat_days: daysAgo, __li_sort: liSort, __is_linkedin: isLinkedIn }
        })
    }, [contacts])

    // derive table rows/total for contacts and leads to avoid inline IIFEs in JSX
    const hasFiltersContacts = filters.contacts && Object.keys(filters.contacts).some((k) => {
        const v = (filters.contacts || {})[k]
        return v != null && String(v) !== '' && (!(Array.isArray(v)) || v.length > 0)
    })
    const contactsRows = hasFiltersContacts ? preparedContactsAll : preparedContacts
    const contactsTotal = hasFiltersContacts ? (preparedContactsAll?.length ?? 0) : (contactsQ.data?.total ?? preparedContacts.length)



    const pageItems = leadsQ.data?.items ?? leads
    const hasFiltersLeads = filters.leads && Object.keys(filters.leads).some((k) => { const v = (filters.leads || {})[k]; return v != null && String(v) !== '' && (!(Array.isArray(v)) || v.length > 0) })
    const leadsRows = hasFiltersLeads ? leads : pageItems
    const leadsTotal = hasFiltersLeads ? (leads?.length ?? 0) : (leadsQ.data?.total ?? (pageItems?.length ?? 0))

    // compute sets of ids already linked to any task (based on targetsByTask)
    const linkedSets = React.useMemo(() => {
        const contactRef = findTargetRefId('contact')
        const leadRef = findTargetRefId('lead')
        const orgRef = findTargetRefId('organ') || findTargetRefId('org') || findTargetRefId('organisation')
        const sectorRef = findTargetRefId('sector')
        const contactsSet = new Set<string>()
        const leadsSet = new Set<string>()
        const orgsSet = new Set<string>()
        const sectorsSet = new Set<string>()
        Object.values(targetsByTask || {}).forEach((arr: any[]) => {
            (arr || []).forEach((t: any) => {
                try {
                    if (contactRef && Number(t.targettype) === Number(contactRef)) contactsSet.add(String(t.targetid))
                    else if (leadRef && Number(t.targettype) === Number(leadRef)) leadsSet.add(String(t.targetid))
                    else if (orgRef && Number(t.targettype) === Number(orgRef)) orgsSet.add(String(t.targetid))
                    else if (sectorRef && Number(t.targettype) === Number(sectorRef)) sectorsSet.add(String(t.targetid))
                } catch (e) {
                    // ignore
                }
            })
        })
        return { contactsSet, leadsSet, orgsSet, sectorsSet }
    }, [targetsByTask, targetTypes])

    const contactsRowsForTargets = React.useMemo(() => {
        let rows = Array.isArray(contactsRows) ? contactsRows.slice() : []
        if (hideLinked) {
            rows = rows.filter((r: any) => !linkedSets.contactsSet.has(String(r.contactid)))
        }
        if (hideInactive) {
            rows = rows.filter((row: any) => {
                const contactStatusValue = (row.contact_status_value || row.contact_status || '').toString().toLowerCase()
                const legacyCv = row.latestcvsent
                const isActive = contactStatusValue ? contactStatusValue === 'active' : (legacyCv == null ? true : (legacyCv === true || String(legacyCv).toLowerCase() === 'true' || String(legacyCv) === '1'))
                return Boolean(isActive)
            })
        }
        return rows
    }, [contactsRows, hideLinked, hideInactive, linkedSets])


    // task pick dialog for attaching
    const [taskPickOpen, setTaskPickOpen] = useState(false)
    const [attachContext, setAttachContext] = useState<{ tab: number; all: boolean } | null>(null)
    const [selectedAttachType, setSelectedAttachType] = useState<number | ''>('')

    // remove mapped targets modal
    const [removeModalOpen, setRemoveModalOpen] = useState(false)
    const [removeModalTaskId, setRemoveModalTaskId] = useState<number | null>(null)
    const [removeModalTypeRefid, setRemoveModalTypeRefid] = useState<number | null>(null)
    const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
    // Logs modal state
    const [logsModalOpen, setLogsModalOpen] = useState(false)
    const [logsModalTaskId, setLogsModalTaskId] = useState<number | null>(null)
    const [logsModalLoading, setLogsModalLoading] = useState(false)
    const [logBeingEdited, setLogBeingEdited] = useState<any | null>(null)
    const [addUpdateOpen, setAddUpdateOpen] = useState(false)
    const [addUpdatePayload, setAddUpdatePayload] = useState<{ commentary: string; logdate?: string | null }>({ commentary: '', logdate: undefined })

    const location = useLocation()

    // fallback query for tasks so the picker can populate even when `tasks` state
    // hasn't been loaded into local state yet (e.g. on first open).
    const tasksQ = useQuery(['tasks'], () => fetchTasks(), { staleTime: 60000 })

    useEffect(() => {
        if (!taskPickOpen) return
        // prefer local `tasks` state, otherwise fall back to query data
        if (tasks && tasks.length) setSelectedTaskId(tasks[0].taskid ?? null)
        else if (tasksQ.data && (tasksQ.data as any[]).length) setSelectedTaskId((tasksQ.data as any[])[0].taskid ?? null)
        else setSelectedTaskId(null)
    }, [taskPickOpen, tasks, tasksQ.data])

    useEffect(() => {
        // when opening the task picker, preselect a sensible attach-type based on the active tab
        if (taskPickOpen && attachContext) {
            const tab = attachContext.tab
            if (tab === 0) setSelectedAttachType(findTargetRefId('contact') ?? '')
            else if (tab === 1) setSelectedAttachType(findTargetRefId('lead') ?? '')
            else if (tab === 2) setSelectedAttachType((findTargetRefId('organ') || findTargetRefId('org') || findTargetRefId('organisation')) ?? '')
            else if (tab === 3) setSelectedAttachType(findTargetRefId('sector') ?? '')
        }
    }, [taskPickOpen, attachContext])

    useEffect(() => {
        // Load actions first, then targets so the Actions table appears promptly.
        void (async () => {
            try {
                await load()
            } catch (e) {
                console.error('Initial load failed', e)
            }
            try {
                await loadTargets()
            } catch (e) {
                console.error('Targets load failed', e)
            }
        })()
    }, [])

    // If a `networkEventId` query param is present, ActionPlan should show
    // only the tasks linked to that networking event. We check the URL and
    // adjust `load()` behaviour accordingly inside the load() function.

    // Extracted targets loader so we can control sequencing (load actions first,
    // then load targets). Call `loadTargets()` after `load()` on mount.
    async function loadTargets() {
        setLoadingTargets(true)
        try {
            const [c, lResp, o, s] = await Promise.all([
                fetchAllContacts(),
                // Fetch the full filtered set of LinkedIn leads for action plan.
                // Exclude leads that were promoted and those explicitly marked 'Not Relevant at this Time'.
                // Apply any currently selected sort for leads when present so the
                // returned set is server-side sorted.
                fetchLeadsAll(undefined, undefined, false, true, true, sortBy.leads?.key, sortBy.leads?.dir),
                fetchOrganisations(),
                fetchSectors(),
            ])
            setContacts(c)
            setLeads(lResp || [])
            setOrgs(o || [])
            setSectors(s || [])
        } catch (e) {
            console.error('Failed to load targets', e)
        } finally {
            setLoadingTargets(false)
        }
    }

    // When the leads sort state changes, re-fetch the full leads set server-side
    // sorted according to the new key/dir. Also re-run when the active tab is
    // the Leads tab so visible ordering is updated.
    useEffect(() => {
        async function reloadLeadsSorted() {
            try {
                setLoadingTargets(true)
                const l = await fetchLeadsAll(undefined, undefined, false, true, true, sortBy.leads?.key, sortBy.leads?.dir)
                setLeads(l || [])
            } catch (e) {
                // ignore errors; keep existing leads list
            } finally {
                setLoadingTargets(false)
            }
        }
        // Only trigger if the leads tab is active or if we explicitly changed the leads sort
        if (activeTargetsTab === 1) {
            void reloadLeadsSorted()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sortBy.leads, activeTargetsTab])

    useEffect(() => {
        // load target types (referencedata)
        async function loadTypes() {
            try {
                // use the action_plan_target_type refdata class (seeded in the DB)
                const rd = await fetchReferenceData('action_plan_target_type')
                // endpoint returns objects with refid/refvalue
                setTargetTypes(rd.map((r: any) => ({ refid: r.refid, refvalue: r.refvalue })))
            } catch (e) {
                // ignore
            }
        }
        loadTypes()
    }, [])

    // when targetTypes become available, annotate loaded rows (contacts/leads/orgs)
    useEffect(() => {
        if (!targetTypes || !targetTypes.length) return
        function refIdFor(needle: string) {
            const found = targetTypes.find((tt) => (tt.refvalue || '').toLowerCase().includes(needle))
            return found?.refid ?? null
        }

        const contactRef = refIdFor('contact')
        const leadRef = refIdFor('lead')
        const orgRef = refIdFor('organ') || refIdFor('org') || refIdFor('organisation')

        if (contacts && contacts.length) {
            setContacts((rows) => rows.map((r: any) => ({ ...r, action_plan_target_type: contactRef })))
        }
        if (leads && leads.length) {
            setLeads((rows) => rows.map((r: any) => ({ ...r, action_plan_target_type: leadRef })))
        }
        if (orgs && orgs.length) {
            setOrgs((rows) => rows.map((r: any) => ({ ...r, action_plan_target_type: orgRef })))
        }
        if (sectors && sectors.length) {
            const sectorRef = refIdFor('sector')
            setSectors((rows) => rows.map((r: any) => ({ ...r, action_plan_target_type: sectorRef })))
        }
    }, [targetTypes])

    async function load(showSpinner: boolean = true) {
        if (showSpinner) {
            console.debug('[ActionPlan] load start', { showSpinner })
            setLoading(true)
        } else {
            console.debug('[ActionPlan] background load start', { showSpinner })
        }
        setError(null)
        try {
            const params = new URLSearchParams(location.search)
            const networkEventId = params.get('networkEventId')

            if (networkEventId) {
                // When opening Action Plan for a networking event, fetch the linked tasks
                // then fetch the canonical task rows and filter to those ids so the rest
                // of the UI (targets/logs) can operate on full task objects.
                try {
                    const linked = await fetchEventTasks(Number(networkEventId))
                    const taskIds = (linked || []).map((r: any) => Number(r.taskid)).filter((x: any) => !Number.isNaN(x))
                    const all = await fetchTasks()
                    const filtered = (all || []).filter((t: any) => taskIds.includes(Number(t.taskid)))
                    setTasks(filtered)

                    // fetch targets for each filtered task
                    const mappingEntries = await Promise.all(filtered.map(async (t: any) => {
                        if (!t || !t.taskid) return [t?.taskid ?? null, []] as [number | null, any[]]
                        const targets = await fetchTaskTargets(t.taskid)
                        return [t.taskid, targets] as [number, any[]]
                    }))
                    const map: Record<number, any[]> = {}
                    mappingEntries.forEach((entry) => {
                        const [id, targets] = entry
                        if (id != null) map[id] = targets
                    })
                    setTargetsByTask(map)
                } catch (e) {
                    console.error('Failed to load tasks for network event', e)
                    setError('Failed to load tasks for event')
                }
            } else {
                const res = await fetchTasks()
                setTasks(res)
                // also fetch targets for each task so counts display immediately
                try {
                    const mappingEntries = await Promise.all(res.map(async (t: any) => {
                        if (!t || !t.taskid) return [t?.taskid ?? null, []] as [number | null, any[]]
                        const targets = await fetchTaskTargets(t.taskid)
                        return [t.taskid, targets] as [number, any[]]
                    }))
                    const map: Record<number, any[]> = {}
                    mappingEntries.forEach((entry) => {
                        const [id, targets] = entry
                        if (id != null) map[id] = targets
                    })
                    setTargetsByTask(map)
                } catch (e) {
                    // non-fatal: if fetching targets fails, we'll still show tasks and load targets on expand
                    console.warn('Failed to fetch task targets on load', e)
                }
            }
        } catch (e: any) {
            console.error(e)
            setError('Failed to load tasks')
        } finally {
            if (showSpinner) {
                setLoading(false)
                console.debug('[ActionPlan] load end', { showSpinner })
            } else {
                console.debug('[ActionPlan] background load end', { showSpinner })
            }
        }
    }

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault()
        if (!name.trim()) {
            setError('Name is required')
            return
        }
        setSubmitting(true)
        setError(null)
        try {
            const payload: any = { name: name.trim() }
            if (duedate) payload.duedate = duedate
            if (applicantid !== '') payload.applicantid = Number(applicantid)
            await createTask(payload)
            setName('')
            setDuedate(null)
            setApplicantid('')
            await load(false)
        } catch (e) {
            console.error(e)
            setError('Failed to create task')
        } finally {
            setSubmitting(false)
        }
    }

    async function handleDelete(id?: number) {
        if (!id) return
        try {
            await deleteTask(id)
            await load(false)
        } catch (e) {
            console.error(e)
            setError('Failed to delete task')
        }
    }



    async function handleAddLog(taskId: number) {
        const txt = (logText[taskId] || '').trim()
        if (!txt) return
        // Optimistic UI: append a temporary log immediately for snappy feedback
        const tempId = -Date.now()
        const tempLog = { id: tempId, taskid: taskId, commentary: txt, logdate: new Date().toISOString() }
        setLogsByTask((s) => ({ ...s, [taskId]: [...((s && s[taskId]) || []), tempLog] }))
        setLogText((s) => ({ ...s, [taskId]: '' }))
        try {
            await addTaskLog(taskId, { commentary: txt })
            // replace with server canonical logs
            const logs = await fetchTaskLogs(taskId)
            setLogsByTask((s) => ({ ...s, [taskId]: logs }))
        } catch (e) {
            console.error(e)
            // rollback optimistic update
            setLogsByTask((s) => ({ ...s, [taskId]: (s && s[taskId]) ? s[taskId].filter((l: any) => l.id !== tempId) : [] }))
            setLogText((s) => ({ ...s, [taskId]: txt }))
            setError('Failed to add log')
        }
    }

    async function handleDeleteLog(taskId: number, logId?: number) {
        if (!logId) return
        // Optimistic removal: remove locally first for snappy UI
        const prev = (logsByTask && logsByTask[taskId]) ? logsByTask[taskId] : []
        setLogsByTask((s) => ({ ...s, [taskId]: (s && s[taskId]) ? s[taskId].filter((l: any) => l.id !== logId) : [] }))
        try {
            // only call server for real ids (positive); temporary optimistic ids are negative
            if (logId > 0) {
                await deleteTaskLog(logId)
                const logs = await fetchTaskLogs(taskId)
                setLogsByTask((s) => ({ ...s, [taskId]: logs }))
            }
        } catch (e) {
            console.error(e)
            // rollback
            setLogsByTask((s) => ({ ...s, [taskId]: prev }))
            setError('Failed to delete log')
        }
    }

    async function handleAddTarget(taskId: number) {
        const form = targetForm[taskId]
        if (!form || form.targettype == null || form.targetid == null) {
            setError('Target type and id required')
            return
        }
        try {
            // prevent duplicates: check existing targets for this task
            const existing = targetsByTask[taskId] || []
            if (existing.some((t) => Number(t.targettype) === Number(form.targettype) && String(t.targetid) === String(form.targetid))) {
                setToast({ open: true, message: 'Target already attached to task', severity: 'warning' })
                return
            }
            await addTaskTarget(taskId, { targettype: form.targettype, targetid: form.targetid })
            const targets = await fetchTaskTargets(taskId)
            setTargetsByTask((s) => ({ ...s, [taskId]: targets }))
            // Refresh tasks so any server-side derived counts update
            await load(false)
            setTargetForm((s) => ({ ...s, [taskId]: {} }))
        } catch (e) {
            console.error(e)
            setError('Failed to add target')
        }
    }

    async function handleDeleteTarget(taskId: number, id?: number) {
        if (!id) return
        try {
            await deleteTaskTarget(id)
            const targets = await fetchTaskTargets(taskId)
            setTargetsByTask((s) => ({ ...s, [taskId]: targets }))
            // refresh tasks so counts update
            await load(false)
        } catch (e) {
            console.error(e)
            setError('Failed to delete target')
        }
    }

    // helper to find refid for target types
    function findTargetRefId(needle: string) {
        const found = targetTypes.find((tt) => (tt.refvalue || '').toLowerCase().includes(needle))
        return found?.refid ?? null
    }

    // Attach selected targets to a task (attachContext should be set before opening task picker)
    async function attachSelectedToTask(taskId: number, overrideType?: number | null) {
        if (!attachContext) {
            console.warn('attachSelectedToTask called but attachContext is null')
            setToast({ open: true, message: 'Attach context missing. Please re-open attach dialog.', severity: 'error' })
            return
        }
        const { tab, all } = attachContext
        console.debug('attachSelectedToTask', { taskId, tab, all, contactsSelectedSize: contactsSelected?.size, leadsSelectedSize: leadsSelected?.size, orgsSelectedSize: orgsSelected?.size })
        // gather ids
        let ids: Array<number | string> = []
        if (all) {
            // combine all selected sets
            ids = [...Array.from(contactsSelected), ...Array.from(leadsSelected), ...Array.from(orgsSelected), ...Array.from(sectorsSelected)]
        } else {
            if (tab === 0) ids = Array.from(contactsSelected)
            else if (tab === 1) ids = Array.from(leadsSelected)
            else if (tab === 2) ids = Array.from(orgsSelected)
            else if (tab === 3) ids = Array.from(sectorsSelected)
        }
        if (!ids.length) {
            setToast({ open: true, message: 'No rows selected', severity: 'warning' })
            return
        }

        // determine targettype refids
        const contactRef = findTargetRefId('contact')
        const orgRef = findTargetRefId('organ') || findTargetRefId('org') || findTargetRefId('organisation')
        const leadRef = findTargetRefId('lead')
        const sectorRef = findTargetRefId('sector')

        try {
            // attach each id by guessing its type based on current tab when not 'all'
            console.debug('targetTypes', targetTypes)
            console.debug('refids', { contactRef, leadRef, orgRef })
            // show small sample of arrays to help debugging
            console.debug('contacts sample', contacts.slice(0, 5))
            console.debug('leads sample', leads.slice(0, 5))
            console.debug('orgs sample', orgs.slice(0, 5))
            for (const id of ids) {
                let refid: number | null = null
                if (overrideType != null) {
                    refid = overrideType as number
                } else if (all) {
                    // attempt to detect type by searching id in contacts/leads/orgs arrays
                    const strId = String(id)
                    const findByAnyValue = (arr: any[]) => arr.find((obj) => Object.values(obj || {}).some((v) => String(v) === strId))
                    if (contacts.find((c) => String(c.contactid) === strId) || findByAnyValue(contacts)) refid = contactRef
                    else if (leads.find((l) => String(l.leadid) === strId) || findByAnyValue(leads)) refid = leadRef
                    else if (orgs.find((o) => String(o.orgid) === strId) || findByAnyValue(orgs)) refid = orgRef
                } else {
                    if (tab === 0) refid = contactRef
                    if (tab === 1) refid = leadRef
                    if (tab === 2) refid = orgRef
                    if (tab === 3) refid = sectorRef
                }
                if (!refid) {
                    // More diagnostics: check whether any object contains this id as a value
                    const strId = String(id)
                    const contactMatch = contacts.find((c) => Object.values(c || {}).some((v) => String(v) === strId))
                    const leadMatch = leads.find((l) => Object.values(l || {}).some((v) => String(v) === strId))
                    const orgMatch = orgs.find((o) => Object.values(o || {}).some((v) => String(v) === strId))
                    console.warn('Unable to determine refid for', id, { contactMatch, leadMatch, orgMatch })
                    setToast({ open: true, message: `Could not determine type for selected ID ${id}`, severity: 'warning' })
                    continue
                }
                try {
                    // prevent duplicate attachments
                    const existing = targetsByTask[taskId] || []
                    if (existing.some((t) => Number(t.targettype) === Number(refid) && String(t.targetid) === String(id))) {
                        console.debug('skip already attached', { taskId, id, refid })
                        continue
                    }
                    await addTaskTarget(taskId, { targettype: refid, targetid: Number(id) })
                    console.debug('attached', { taskId, id, refid })
                } catch (e) {
                    console.error('Failed to attach target', { taskId, id, refid, e })
                }
            }
            // refresh targets for the task
            const targs = await fetchTaskTargets(taskId)
            setTargetsByTask((s) => ({ ...s, [taskId]: targs }))
            // refresh tasks list so any server-side counts update
            await load(false)
            // clear selection for the tab(s) we attached from
            if (all) {
                setContactsSelected(new Set())
                setLeadsSelected(new Set())
                setOrgsSelected(new Set())
                setSectorsSelected(new Set())
            } else if (tab === 0) {
                setContactsSelected(new Set())
            } else if (tab === 1) {
                setLeadsSelected(new Set())
            } else if (tab === 2) {
                setOrgsSelected(new Set())
            } else if (tab === 3) {
                setSectorsSelected(new Set())
            }
            setToast({ open: true, message: 'Targets attached', severity: 'success' })
        } catch (e) {
            console.error('Failed to attach targets', e)
            setToast({ open: true, message: 'Failed to attach targets', severity: 'error' })
        } finally {
            setTaskPickOpen(false)
            setAttachContext(null)
        }
    }

    // Remove-mapped-targets modal handlers
    const handleLoadRemoveModalTargets = React.useCallback(async (taskId: number) => {
        try {
            const t = await fetchTaskTargets(taskId)
            setTargetsByTask((s) => ({ ...s, [taskId]: t }))
        } catch (e) {
            console.error(e)
        }
    }, [])

    async function handleRemoveMapping(mappingId: number, taskId: number) {
        try {
            await deleteTaskTarget(mappingId)
            const t = await fetchTaskTargets(taskId)
            setTargetsByTask((s) => ({ ...s, [taskId]: t }))
            // keep modal open and refresh
            await load(false)
        } catch (e) {
            console.error(e)
            setToast({ open: true, message: 'Failed to remove mapping', severity: 'error' })
        }
    }

    // Confirm remove mapping dialog state
    const [removeConfirmOpenLocal, setRemoveConfirmOpenLocal] = React.useState(false)
    const [removeConfirmPayload, setRemoveConfirmPayload] = React.useState<{ mappingId?: number; targetName?: string } | null>(null)

    // Sub-modal for viewing related entities (e.g., engagements / roles) for a contact
    const [subModalOpen, setSubModalOpen] = useState(false)
    const [subModalEntity, setSubModalEntity] = useState<'engagements' | 'roles' | null>(null)
    const [subModalContactId, setSubModalContactId] = useState<number | null>(null)
    // AG Grid pivot view state
    const [agGridLoaded, setAgGridLoaded] = useState(false)
    const [AgGridReactComp, setAgGridReactComp] = useState<any | null>(null)
    const [agGridLoadError, setAgGridLoadError] = useState<string | null>(null)

    function openConfirmRemove(mappingId: number, targetName?: string) {
        setRemoveConfirmPayload({ mappingId, targetName })
        setRemoveConfirmOpenLocal(true)
    }

    async function exportContactsPdf(ids: number[], taskId?: number | null) {
        // fetch full contact data and filter to ids
        try {
            const all = await fetchAllContacts()
            const rows = (all || []).filter((r: any) => ids.includes(Number(r.contactid)))
            // build HTML table
            const container = document.createElement('div')
            container.style.padding = '16px'
            container.style.background = '#fff'
            container.style.color = '#000'
            container.style.fontFamily = 'Arial, Helvetica, sans-serif'
            const title = document.createElement('h2')
            const taskLabel = taskId ? (tasks.find((t) => Number(t.taskid) === Number(taskId))?.name || `#${taskId}`) : ''
            title.innerText = `Contacts${taskLabel ? ` — Task: ${taskLabel}` : ''}`
            container.appendChild(title)
            const table = document.createElement('table')
            table.style.borderCollapse = 'collapse'
            table.style.width = '100%'
            table.style.fontSize = '12px'
            const thead = document.createElement('thead')
            const headRow = document.createElement('tr')
                ;['Name', 'Organisation', 'Title', 'Role', 'Created'].forEach(h => {
                    const th = document.createElement('th')
                    th.innerText = h
                    th.style.border = '1px solid #ddd'
                    th.style.padding = '8px'
                    th.style.textAlign = 'left'
                    th.style.background = '#f5f5f5'
                    headRow.appendChild(th)
                })
            thead.appendChild(headRow)
            table.appendChild(thead)
            const tbody = document.createElement('tbody')
            // build a simple heat visualization based on last contact dates and heat thresholds
            // `warm` and `cold` thresholds need to be visible outside the try block
            let warm = 30
            let cold = 90
            try {
                const daysList: Array<number | null> = (rows || []).map((r: any) => {
                    const last = r.last_contact_date || r.last_engagement || null
                    if (!last) return null
                    const d = new Date(last)
                    if (isNaN(d.getTime())) return null
                    const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)))
                    return days
                })
                const validDays = daysList.filter((d) => d !== null) as number[]
                const maxDays = Math.max(365, validDays.length ? Math.max(...validDays) : 365)

                // fetch thresholds (override defaults if referencedata present)
                try {
                    const ref = await fetchReferenceData('heat_threshold')
                    const items: any[] = ref || []
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
                    // ignore, use defaults
                }
                if (warm >= cold) cold = warm + 30

                // compute counts
                const counts = { hot: 0, warm: 0, cold: 0, never: 0 }
                for (const d of daysList) {
                    if (d == null) counts.never += 1
                    else if (d < warm) counts.hot += 1
                    else if (d < cold) counts.warm += 1
                    else counts.cold += 1
                }

                const segRange = Math.max(1, maxDays)
                const hotW = Math.max(0, Math.min(100, ((Math.max(0, warm - 0)) / segRange) * 100))
                const warmW = Math.max(0, Math.min(100, ((Math.max(0, cold - warm)) / segRange) * 100))
                const coldW = Math.max(0, Math.min(100, ((Math.max(0, segRange - cold)) / segRange) * 100))

                // Heat visualization intentionally omitted for PDF export per request
            } catch (e) { /* ignore heat visualization errors */ }

            for (const r of rows) {
                const tr = document.createElement('tr')
                const name = document.createElement('td')
                name.innerText = r.name || ''
                const org = document.createElement('td')
                org.innerText = r.current_organization || r.currentorg || ''
                const title = document.createElement('td')
                title.innerText = r.currentrole || ''
                const role = document.createElement('td')
                role.innerText = r.role_type || r.role_type_name || r.role || ''

                const created = document.createElement('td')
                created.innerText = r.created_at || ''
                    ;[name, org, title, role, created].forEach(td => { td.style.border = '1px solid #ddd'; td.style.padding = '8px'; tr.appendChild(td) })
                tbody.appendChild(tr)
            }
            table.appendChild(tbody)
            container.appendChild(table)
            document.body.appendChild(container)
            // render to canvas
            const canvas = await html2canvas(container, { scale: 2 })
            const imgData = canvas.toDataURL('image/png')
            const pdf = new jsPDF('p', 'pt', 'a4')
            const pageWidth = pdf.internal.pageSize.getWidth()
            const pageHeight = pdf.internal.pageSize.getHeight()
            const imgProps = (pdf as any).getImageProperties(imgData)
            const imgWidth = pageWidth
            const imgHeight = (imgProps.height * imgWidth) / imgProps.width
            let heightLeft = imgHeight
            let position = 0
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
            heightLeft -= pageHeight
            while (heightLeft > 0) {
                position = heightLeft - imgHeight
                pdf.addPage()
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
                heightLeft -= pageHeight
            }
            const fileName = `targets_contacts${taskId ? `_task_${taskId}` : ''}.pdf`
            pdf.save(fileName)
            document.body.removeChild(container)
        } catch (e) {
            console.error('exportContactsPdf error', e)
            throw e
        }
    }

    async function exportOrganisationsPdf(ids: number[], taskId?: number | null) {
        try {
            const all = await fetchOrganisations()
            const rows = (all || []).filter((r: any) => ids.includes(Number(r.orgid)))
            const container = document.createElement('div')
            container.style.padding = '16px'
            container.style.background = '#fff'
            container.style.color = '#000'
            container.style.fontFamily = 'Arial, Helvetica, sans-serif'
            const title = document.createElement('h2')
            const taskLabel = taskId ? (tasks.find((t) => Number(t.taskid) === Number(taskId))?.name || `#${taskId}`) : ''
            title.innerText = `Organisations${taskLabel ? ` — Task: ${taskLabel}` : ''}`
            container.appendChild(title)
            const table = document.createElement('table')
            table.style.borderCollapse = 'collapse'
            table.style.width = '100%'
            table.style.fontSize = '12px'
            const thead = document.createElement('thead')
            const headRow = document.createElement('tr')
                ;['Name', 'Sector', 'Contacts', 'Created'].forEach(h => {
                    const th = document.createElement('th')
                    th.innerText = h
                    th.style.border = '1px solid #ddd'
                    th.style.padding = '8px'
                    th.style.textAlign = 'left'
                    th.style.background = '#f5f5f5'
                    headRow.appendChild(th)
                })
            thead.appendChild(headRow)
            table.appendChild(thead)
            const tbody = document.createElement('tbody')
            for (const r of rows) {
                const tr = document.createElement('tr')
                const name = document.createElement('td')
                name.innerText = r.name || ''
                const sector = document.createElement('td')
                sector.innerText = r.sector_summary || ''
                const contactsCount = document.createElement('td')
                contactsCount.innerText = String(r.contacts_count ?? '')
                const created = document.createElement('td')
                created.innerText = r.created_at || ''
                    ;[name, sector, contactsCount, created].forEach(td => { td.style.border = '1px solid #ddd'; td.style.padding = '8px'; tr.appendChild(td) })
                tbody.appendChild(tr)
            }
            table.appendChild(tbody)
            container.appendChild(table)
            document.body.appendChild(container)
            const canvas = await html2canvas(container, { scale: 2 })
            const imgData = canvas.toDataURL('image/png')
            const pdf = new jsPDF('p', 'pt', 'a4')
            const pageWidth = pdf.internal.pageSize.getWidth()
            const pageHeight = pdf.internal.pageSize.getHeight()
            const imgProps = (pdf as any).getImageProperties(imgData)
            const imgWidth = pageWidth
            const imgHeight = (imgProps.height * imgWidth) / imgProps.width
            let heightLeft = imgHeight
            let position = 0
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
            heightLeft -= pageHeight
            while (heightLeft > 0) {
                position = heightLeft - imgHeight
                pdf.addPage()
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
                heightLeft -= pageHeight
            }
            const fileName = `targets_organisations${taskId ? `_task_${taskId}` : ''}.pdf`
            pdf.save(fileName)
            document.body.removeChild(container)
        } catch (e) {
            console.error('exportOrganisationsPdf error', e)
            throw e
        }
    }

    // Logs modal helpers
    const openLogsModalForTask = React.useCallback(async (taskId: number) => {
        // Open modal and show cached logs immediately if present, then refresh in background
        setLogsModalTaskId(taskId)
        setLogsModalOpen(true)
        // Show cached logs immediately (or empty array) and always refresh in background.
        const cached = logsByTask[taskId] || []
        // ensure there is something to render instantly
        setLogsByTask((s) => ({ ...s, [taskId]: cached }))
        // hide spinner; we'll refresh in background and update when ready
        setLogsModalLoading(false)
            ; (async () => {
                try {
                    const logs = await fetchTaskLogs(taskId)
                    setLogsByTask((s) => ({ ...s, [taskId]: logs }))
                } catch (e) {
                    console.error('Failed to load logs for modal', e)
                    // only surface toast if we had no cached data before
                    if (!cached || !cached.length) setToast({ open: true, message: 'Failed to load logs', severity: 'error' })
                }
            })()
    }, [logsByTask])

    function closeLogsModal() {
        setLogsModalOpen(false)
        setLogsModalTaskId(null)
        setLogBeingEdited(null)
    }

    function openAddUpdateModal(initial?: { commentary?: string; logdate?: string | null }, editing?: any) {
        setLogBeingEdited(editing || null)
        setAddUpdatePayload({ commentary: initial?.commentary || '', logdate: initial?.logdate || undefined })
        setAddUpdateOpen(true)
    }

    function closeAddUpdateModal() {
        setAddUpdateOpen(false)
        setLogBeingEdited(null)
        setAddUpdatePayload({ commentary: '', logdate: undefined })
    }

    // Stable handlers passed to ActionPlanTasksTable to avoid re-creating
    // function props on every render which can cause unnecessary re-renders
    const handleTableEdit = React.useCallback((t: any) => {
        setEditingTask(t)
        setModalOpen(true)
    }, [])

    const handleTableDelete = React.useCallback((t: any) => {
        setConfirmDeleteTaskId(t?.taskid ?? null)
    }, [])

    const handleTableOpenTargets = React.useCallback(async (taskId: number, typeRefId: number | null) => {
        setRemoveModalTaskId(taskId)
        setRemoveModalTypeRefid(typeRefId ?? null)
        if (taskId) await handleLoadRemoveModalTargets(taskId)
        setRemoveModalOpen(true)
    }, [handleLoadRemoveModalTargets])

    const handleTableOpenLogs = React.useCallback(async (taskId: number) => {
        if (taskId != null) await openLogsModalForTask(taskId)
    }, [openLogsModalForTask])

    // save handler called from AddUpdateModal; payload contains commentary/logdate
    async function handleSaveAddUpdate(payload: { commentary: string; logdate?: string | null }) {
        const taskId = logsModalTaskId
        if (!taskId) return
        try {
            if (logBeingEdited && logBeingEdited.id) {
                // update
                await updateTaskLog(logBeingEdited.id, { commentary: payload.commentary, logdate: payload.logdate ?? null })
            } else {
                // create (optimistic): insert temporary log and allow child to close
                const txt = (payload.commentary || '').trim()
                const tempId = -Date.now()
                const tempLog = { id: tempId, taskid: taskId, commentary: txt, logdate: payload.logdate ?? new Date().toISOString() }
                setLogsByTask((s) => ({ ...s, [taskId]: [...((s && s[taskId]) || []), tempLog] }))
                await addTaskLog(taskId, { commentary: payload.commentary, logdate: payload.logdate ?? null })
            }
            // refresh logs immediately; run full load() in background so the
            // modal caller can close without waiting for the whole table to
            // refresh.
            const logs = await fetchTaskLogs(taskId)
            setLogsByTask((s) => ({ ...s, [taskId]: logs }))
            // fire-and-forget reload of the main data (do not show spinner)
            load(false).catch((err) => console.error('Background reload failed', err))
        } catch (e) {
            console.error('Failed to save log', e)
            setToast({ open: true, message: 'Failed to save log', severity: 'error' })
        }
    }

    async function handleDeleteLogFromModal(logId?: number) {
        const taskId = logsModalTaskId
        if (!taskId || !logId) return
        // Optimistic removal: remove locally first
        const prev = (logsByTask && logsByTask[taskId]) ? logsByTask[taskId] : []
        setLogsByTask((s) => ({ ...s, [taskId]: (s && s[taskId]) ? s[taskId].filter((l: any) => l.id !== logId) : [] }))
        try {
            if (logId > 0) {
                await deleteTaskLog(logId)
                const logs = await fetchTaskLogs(taskId)
                setLogsByTask((s) => ({ ...s, [taskId]: logs }))
            }
            // reload main data in background so UI remains responsive
            load(false).catch((err) => console.error('Background reload failed', err))
        } catch (e) {
            console.error('Failed to delete log', e)
            // rollback
            setLogsByTask((s) => ({ ...s, [taskId]: prev }))
            setToast({ open: true, message: 'Failed to delete log', severity: 'error' })
        }
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>Action Plan</h2>
            </div>

            {/* main loading spinner intentionally removed — keep `loading` state for background refreshes */}

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <TaskFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingTask(null) }} initialTask={editingTask ?? undefined} onSaved={(t) => { setToast({ open: true, message: editingTask ? 'Task updated' : 'Task created', severity: 'success' }); load(false); setEditingTask(null) }} />

            {/* Task picker dialog used to choose which task to attach selected targets to */}
            <Dialog open={taskPickOpen} onClose={() => setTaskPickOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>{attachContext && attachContext.all ? 'Attach all selected to task' : 'Attach selected to task'}</DialogTitle>
                <DialogContent sx={{ maxHeight: '60vh', overflow: 'auto' }}>
                    <FormControl fullWidth sx={{ mt: 1 }}>
                        <InputLabel id="task-pick-label">Task</InputLabel>
                        <Select labelId="task-pick-label" value={selectedTaskId ?? ''} label="Task" onChange={(e: any) => setSelectedTaskId(Number(e.target.value))}>
                            {tasks.map((tt) => (
                                <MenuItem key={tt.taskid} value={tt.taskid}>{tt.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    {/* Target type is selected automatically based on the active tab; no editable control shown here. */}
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                    <AppButton colorScheme="white" onClick={() => setTaskPickOpen(false)}>Cancel</AppButton>
                    <AppButton colorScheme="purple" onClick={async () => { if (selectedTaskId) await attachSelectedToTask(selectedTaskId, selectedAttachType || null) }} disabled={!selectedTaskId}>Attach</AppButton>
                </DialogActions>
            </Dialog>

            {/* Remove mapped targets modal (historic behaviour: delegate to inner tables with extraActionRender) */}
            <WideDialog open={removeModalOpen} onClose={() => setRemoveModalOpen(false)} fullWidth maxWidth="md" fitToContent maxWidthPx={Math.floor(typeof window !== 'undefined' ? window.innerWidth * 1.5 : 1600)}>
                <DialogTitle><span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>Manage targets</span></DialogTitle>
                <DialogContent>
                    <div style={{ display: 'inline-block' }}>
                        <Typography variant="body2" sx={{ mb: 1 }}>{(() => {
                            if (!removeModalTaskId) return 'Manage targets'
                            const task = tasks.find((x) => x.taskid === removeModalTaskId)
                            const taskLabel = task ? (task.name || `#${removeModalTaskId}`) : `#${removeModalTaskId}`
                            if (!removeModalTypeRefid) return (<span>Manage targets for task <strong>{taskLabel}</strong></span>)
                            const tt = targetTypes.find((t) => t.refid === removeModalTypeRefid)
                            const pluralize = (s: string) => (s.endsWith('s') ? s : `${s}s`)
                            const typeLabel = tt ? pluralize(tt.refvalue) : String(removeModalTypeRefid)
                            return (<span>Manage target {typeLabel} for task: <strong>{taskLabel}</strong></span>)
                        })()}</Typography>
                        {(() => {
                            if (!removeModalTaskId) return null
                            const contactRefId = findTargetRefId('contact')
                            const orgRefId = findTargetRefId('organ') || findTargetRefId('org') || findTargetRefId('organisation')
                            const filteredTargets = (targetsByTask[removeModalTaskId] || []).filter((x: any) => !removeModalTypeRefid || x.targettype === removeModalTypeRefid)

                            // Contacts: render explicit table rows (no injected extraActionRender)
                            const leadRefId = findTargetRefId('lead')
                            const sectorRefId = findTargetRefId('sector')

                            if (removeModalTypeRefid && Number(removeModalTypeRefid) === Number(contactRefId)) {
                                const ids = filteredTargets.map((t: any) => Number(t.targetid))
                                return (
                                    <div>
                                        <ContactsTable inModal onlyIds={ids} hideCreateButton />
                                    </div>
                                )
                            }

                            // Organisations: explicit table
                            if (removeModalTypeRefid && Number(removeModalTypeRefid) === Number(orgRefId)) {
                                const ids = filteredTargets.map((t: any) => Number(t.targetid))
                                return (
                                    <div>
                                        <OrganisationsTable inModal onlyIds={ids} hideCreateButton />
                                    </div>
                                )
                            }

                            // Leads: explicit table (use lead name/company)
                            if (removeModalTypeRefid && Number(removeModalTypeRefid) === Number(leadRefId)) {
                                return (
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell><strong>Name</strong></TableCell>
                                                <TableCell><strong>Company</strong></TableCell>
                                                <TableCell><strong>Date added</strong></TableCell>
                                                <TableCell align="right"></TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {filteredTargets.map((m: any) => {
                                                const l = leads.find((x: any) => String(x.leadid) === String(m.targetid))
                                                const name = l ? (l.name || `Lead #${m.targetid}`) : `Lead #${m.targetid}`
                                                const company = l ? (l.company || '') : ''
                                                let dateOnly = ''
                                                try { if (m.created_at) { const d = new Date(m.created_at); if (!isNaN(d.getTime())) dateOnly = d.toISOString().slice(0, 10); else dateOnly = String(m.created_at).split(' ')[0] } } catch (e) { dateOnly = m.created_at || '' }
                                                return (
                                                    <TableRow key={m.id}>
                                                        <TableCell>{name}</TableCell>
                                                        <TableCell>{company}</TableCell>
                                                        <TableCell>{dateOnly || '—'}</TableCell>
                                                        <TableCell align="right"><IconButton size="small" onClick={() => openConfirmRemove(Number(m.id), String(name))} title="Unlink"><LinkOffIcon fontSize="small" /></IconButton></TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                )
                            }

                            // Sectors: explicit table
                            if (removeModalTypeRefid && Number(removeModalTypeRefid) === Number(sectorRefId)) {
                                return (
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell><strong>Sector</strong></TableCell>
                                                <TableCell><strong>Date added</strong></TableCell>
                                                <TableCell align="right"></TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {filteredTargets.map((m: any) => {
                                                const s = sectors.find((x: any) => String(x.id ?? x.sectorid ?? x.sector_id) === String(m.targetid))
                                                const name = s ? (s.name || s.sector || `Sector #${m.targetid}`) : `Sector #${m.targetid}`
                                                let dateOnly = ''
                                                try { if (m.created_at) { const d = new Date(m.created_at); if (!isNaN(d.getTime())) dateOnly = d.toISOString().slice(0, 10); else dateOnly = String(m.created_at).split(' ')[0] } } catch (e) { dateOnly = m.created_at || '' }
                                                return (
                                                    <TableRow key={m.id}>
                                                        <TableCell>{name}</TableCell>
                                                        <TableCell>{dateOnly || '—'}</TableCell>
                                                        <TableCell align="right"><IconButton size="small" onClick={() => openConfirmRemove(Number(m.id), String(name))} title="Unlink"><LinkOffIcon fontSize="small" /></IconButton></TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                )
                            }

                            // fallback simple list for other types (show human names where possible)
                            return (
                                <div style={{ padding: 12 }}>
                                    {filteredTargets.length === 0 ? (
                                        <Typography variant="body2">No targets mapped to this task.</Typography>
                                    ) : (
                                        filteredTargets.map((tg: any, idx: number) => {
                                            const typeName = (targetTypes || []).find((tt: any) => Number(tt.refid) === Number(tg.targettype))?.refvalue || String(tg.targettype)
                                            // Prefer any name fields on the mapping before lookup
                                            let displayName: string = String((tg.targetname || tg.name || tg.displayname || tg.target_label || tg.label || tg.targetid || tg.target) || '')
                                            try {
                                                const tType = Number(tg.targettype)
                                                if (contactRefId && tType === Number(contactRefId)) {
                                                    const c = contacts.find((x: any) => String(x.contactid) === String(tg.targetid) || Object.values(x || {}).some((v) => String(v) === String(tg.targetid)))
                                                    displayName = c ? (c.displayname || c.name || `${c.firstname || ''} ${c.lastname || ''}`.trim() || `Contact #${tg.targetid}`) : `Contact #${tg.targetid}`
                                                } else if (leadRefId && tType === Number(leadRefId)) {
                                                    const l = leads.find((x: any) => String(x.leadid) === String(tg.targetid) || Object.values(x || {}).some((v) => String(v) === String(tg.targetid)))
                                                    displayName = l ? (l.name || `Lead #${tg.targetid}`) : `Lead #${tg.targetid}`
                                                } else if (orgRefId && tType === Number(orgRefId)) {
                                                    const o = orgs.find((x: any) => String(x.orgid) === String(tg.targetid) || Object.values(x || {}).some((v) => String(v) === String(tg.targetid)))
                                                    displayName = o ? (o.name || o.orgname || `Org #${tg.targetid}`) : `Org #${tg.targetid}`
                                                } else if (sectorRefId && tType === Number(sectorRefId)) {
                                                    const s = sectors.find((x: any) => String(x.id ?? x.sectorid ?? x.sector_id) === String(tg.targetid))
                                                    displayName = s ? (s.name || s.sector || `Sector #${tg.targetid}`) : `Sector #${tg.targetid}`
                                                }
                                            } catch (e) {
                                                // ignore and fall back to id
                                            }
                                            return (
                                                <div key={idx} style={{ padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                                                    <Typography variant="body2"><strong>{typeName}</strong>: {displayName}</Typography>
                                                    <div style={{ marginTop: 6 }}>
                                                        <IconButton size="small" onClick={() => openConfirmRemove(Number(tg.id), String(displayName))} title="Unlink"><LinkOffIcon fontSize="small" /></IconButton>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            )
                        })()}
                    </div>
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                    <AppButton colorScheme="white" onClick={() => setRemoveModalOpen(false)}>Close</AppButton>
                </DialogActions>
            </WideDialog>
            {/* Logs modal: list, edit, delete logs for a task */}
            <WideDialog open={logsModalOpen} onClose={() => closeLogsModal()} fullWidth maxWidth="md" fitToContent>
                <DialogTitle>{(() => {
                    const t = tasks.find((x) => Number(x?.taskid) === Number(logsModalTaskId))
                    const label = t?.name || (logsModalTaskId != null ? `#${logsModalTaskId}` : '')
                    return `Activity logs for ${label}`
                })()}</DialogTitle>
                <DialogContent>
                    {logsModalLoading && <Box display="flex" justifyContent="center" my={2}><CircularProgress size={24} /></Box>}
                    {!logsModalLoading && (
                        <div>
                            <div style={{ display: 'inline-block' }}>
                                <Table size="small" style={{ tableLayout: 'auto', width: 'auto' }}>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell style={{ width: 'auto' }}><strong>Update</strong></TableCell>
                                            <TableCell style={{ width: 120, maxWidth: 160 }}><strong>Date</strong></TableCell>
                                            <TableCell align="right" style={{ width: 100, maxWidth: 140 }}></TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {(logsByTask[logsModalTaskId ?? 0] || []).map((l: any) => (
                                            <TableRow key={l.id}>
                                                <TableCell style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.commentary}</TableCell>
                                                <TableCell style={{ width: 120, maxWidth: 160 }}>{l.logdate ? (() => { try { const d = new Date(l.logdate); return isNaN(d.getTime()) ? l.logdate : d.toISOString().slice(0, 10) } catch (e) { return l.logdate } })() : '—'}</TableCell>
                                                <TableCell align="right" style={{ width: 100, maxWidth: 140 }}>
                                                    <IconButton size="small" aria-label={`Edit log ${l.id}`} onClick={() => openAddUpdateModal({ commentary: l.commentary, logdate: l.logdate }, l)}><EditIcon fontSize="small" /></IconButton>
                                                    <IconButton size="small" aria-label={`Delete log ${l.id}`} onClick={() => { setConfirmDeleteLogTaskId(logsModalTaskId ?? null); setConfirmDeleteLogId(l.id) }}><DeleteIcon fontSize="small" /></IconButton>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                    <AppButton colorScheme="purple" onClick={() => { openAddUpdateModal(); }}>Add Update</AppButton>
                    <AppButton colorScheme="white" onClick={() => closeLogsModal()}>Close</AppButton>
                </DialogActions>
            </WideDialog>

            {/* Add / Edit Update modal (moved to separate component to isolate typing state) */}
            <React.Suspense fallback={null}>
                {/* lazy render the modal component to keep initial render light */}
                <AddUpdateModal open={addUpdateOpen} initial={addUpdatePayload} editing={logBeingEdited} onClose={() => closeAddUpdateModal()} onSave={handleSaveAddUpdate} />
            </React.Suspense>
            <Toast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((s) => ({ ...s, open: false }))} />
            <ConfirmDialog
                open={!!confirmDeleteTaskId}
                title="Delete task"
                description={(() => {
                    try {
                        if (!confirmDeleteTaskId) return 'Are you sure you want to delete this task?'
                        const t = tasks.find((x) => Number(x.taskid) === Number(confirmDeleteTaskId))
                        const label = t ? (t.name || `#${confirmDeleteTaskId}`) : `#${confirmDeleteTaskId}`
                        return `Are you sure you want to delete task ${label}?`
                    } catch (e) {
                        return 'Are you sure you want to delete this task?'
                    }
                })()}
                onConfirm={async () => {
                    if (confirmDeleteTaskId) {
                        try {
                            await deleteTask(confirmDeleteTaskId)
                            setToast({ open: true, message: 'Task deleted', severity: 'success' })
                            await load(false)
                        } catch (e) {
                            setToast({ open: true, message: 'Failed to delete task', severity: 'error' })
                        } finally {
                            setConfirmDeleteTaskId(null)
                        }
                    }
                }}
                onClose={() => setConfirmDeleteTaskId(null)}
            />

            <ConfirmDialog
                open={!!confirmDeleteLogId}
                title="Delete update"
                description="Are you sure you want to delete this update? This cannot be undone."
                onConfirm={async () => {
                    if (confirmDeleteLogTaskId && confirmDeleteLogId) {
                        try {
                            await handleDeleteLogFromModal(confirmDeleteLogId)
                            setToast({ open: true, message: 'Update deleted', severity: 'success' })
                        } catch (e) {
                            setToast({ open: true, message: 'Failed to delete update', severity: 'error' })
                        } finally {
                            setConfirmDeleteLogId(null)
                            setConfirmDeleteLogTaskId(null)
                        }
                    } else {
                        setConfirmDeleteLogId(null)
                        setConfirmDeleteLogTaskId(null)
                    }
                }}
                onClose={() => { setConfirmDeleteLogId(null); setConfirmDeleteLogTaskId(null) }}
            />

            {/* Removed empty-state message per design: no placeholder when there are no tasks */}

            <ActionList
                tasks={tasks}
                targetsByTask={targetsByTask}
                targetTypes={targetTypes}
                logsByTask={logsByTask}
                onEdit={handleTableEdit}
                onDelete={handleTableDelete}
                onOpenTargets={handleTableOpenTargets}
                onOpenLogs={handleTableOpenLogs}
                onAdd={() => { setEditingTask(null); setModalOpen(true) }}
            />
            {/* Pivot view removed: AG Grid dependency removed to simplify build */}
            <Accordion sx={{ mt: 3, mb: 2 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant={ACCORDION_TITLE_VARIANT as any} sx={ACCORDION_TITLE_SX}>Contacts Pivot</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Box sx={{ p: 2 }}>
                        <Typography>Pivot view removed — AG Grid has been removed from this build. Use the Contacts or Reports views instead.</Typography>
                    </Box>
                </AccordionDetails>
            </Accordion>

            {/* Targets tabbed section: Contacts | Linkedin Leads | Organisations */}
            <Accordion defaultExpanded sx={{ mt: 3, mb: 2 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <Typography variant={ACCORDION_TITLE_VARIANT as any} sx={ACCORDION_TITLE_SX}>Targets</Typography>
                    </div>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0 }}>
                    <Tabs value={activeTargetsTab} onChange={(_, v) => setActiveTargetsTab(v)} sx={{ mt: 1 }}>
                        <Tab label={`Contacts (${contactsQ.data?.total ?? contacts.length})`} />
                        <Tab label={`LinkedIn Leads (${leads.length})`} />
                        <Tab label={`Organisations (${orgs.length})`} />
                        <Tab label={`Sectors (${sectors.length})`} />
                    </Tabs>

                    <div style={{ marginTop: 12, padding: 16, borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                            <FormControlLabel
                                control={<Switch size="small" checked={hideLinked} onChange={(e) => setHideLinked(e.target.checked)} />}
                                label={`Hide ${activeTargetsTab === 0 ? 'contacts' : activeTargetsTab === 1 ? 'LinkedIn leads' : activeTargetsTab === 2 ? 'organisations' : 'sectors'} already linked to a task`}
                            />
                            {activeTargetsTab === 0 && (
                                <FormControlLabel
                                    control={<Switch size="small" checked={hideInactive} onChange={(e) => setHideInactive(e.target.checked)} />}
                                    label={`Hide Inactive Contacts`}
                                />
                            )}
                            <AppButton
                                colorScheme="purple"
                                onClick={() => { setAttachContext({ tab: activeTargetsTab, all: true }); setTaskPickOpen(true) }}
                                disabled={((contactsSelected?.size || 0) + (leadsSelected?.size || 0) + (orgsSelected?.size || 0) + (sectorsSelected?.size || 0)) === 0}
                            >
                                Add all selected
                            </AppButton>
                            <AppButton size="small" colorScheme="white" onClick={() => {
                                // clear filters for all targets tables (contacts, leads, orgs)
                                setFilters((s) => ({ ...s, contacts: {}, leads: {}, orgs: {}, sectors: {} }))
                            }}>
                                Clear filters
                            </AppButton>
                        </div>

                        {loadingTargets && <Box display="flex" justifyContent="center" my={2}><CircularProgress size={24} /></Box>}

                        {/* Contacts tab */}
                        {activeTargetsTab === 0 && (
                            <div>
                                <SimpleFilterableTable
                                    rows={contactsRowsForTargets}
                                    columns={[
                                        {
                                            key: '__heat_score', label: 'Heat', filterType: 'numericpreset', render: (row: any) => (
                                                <Tooltip title={row.__heat_days != null ? `-${row.__heat_days} days` : 'Never contacted'}>
                                                    <div style={{ width: 80, height: 10, background: '#eee', borderRadius: 4 }} aria-label="heat">
                                                        <div style={{ width: `${row.__heat_score ?? 0}%`, height: '100%', background: (row.__heat_days != null ? (row.__heat_days < 30 ? '#e53935' : row.__heat_days < 90 ? '#fb8c00' : '#9e69ff') : '#9e9e9e'), borderRadius: 4 }} />
                                                    </div>
                                                </Tooltip>
                                            )
                                        },
                                        { key: 'current_organization', label: 'Organisation', filterType: 'multiselect', filterOptions: 'fromRows' },
                                        { key: 'role_type', label: 'Role', filterType: 'multiselect', filterOptions: 'fromRows' },
                                        { key: 'current_org_sector', label: 'Sector', filterType: 'multiselect', filterOptions: 'fromRows', render: (r: any) => (<span>{r.current_org_sector ?? ''}</span>) },
                                        {
                                            key: 'name', label: 'Name', filterType: 'multiselect', filterOptions: 'fromRows', render: (row: any) => (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {row.avatar_url ? (
                                                        <Avatar src={row.avatar_url} alt={row.name || ''} sx={{ width: 28, height: 28, fontSize: 16 }} />
                                                    ) : (
                                                        <Avatar sx={{ width: 28, height: 28, fontSize: 16 }}>{(row.name || '').charAt(0).toUpperCase()}</Avatar>
                                                    )}
                                                    <span>{row.name}</span>
                                                </span>
                                            )
                                        },
                                        { key: 'currentrole', label: 'Title', filterType: 'multiselect', filterOptions: 'fromRows' },
                                        {
                                            key: '__is_linkedin', label: 'LinkedIn', filterType: 'tristate', render: (row: any) => {
                                                const linkedInFlags = [row.islinkedinconnected, row.is_linkedin_connected, row.linkedin_connected, row.linkedInConnected]
                                                const isLinkedIn = linkedInFlags.some((v) => v === true || v === 1 || String(v).toLowerCase() === 'true' || String(v) === '1')
                                                const handleClick = () => {
                                                    const q = encodeURIComponent(String(row.name || ''))
                                                    window.open(`https://www.linkedin.com/search/results/people/?keywords=${q}`, '_blank')
                                                }
                                                return (
                                                    <Box sx={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', pl: '16px' }}>
                                                        <Tooltip title={isLinkedIn ? 'Open search' : 'Search LinkedIn'}>
                                                            <IconButton size="small" onClick={handleClick} sx={{ padding: 0 }}>
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
                                        },
                                        // Next Step moved to ActionPlan tasks; column removed from contacts table
                                        { key: 'documents_count', label: 'Documents', filterType: 'numericpreset', render: (r: any) => (<span>{r.documents_count ?? 0}</span>) },
                                        { key: 'roles_count', label: 'Roles', filterType: 'numericpreset', render: (r: any) => (<span>{r.roles_count ?? 0}</span>) },
                                        { key: 'engagement_count', label: 'Engagements', filterType: 'numericpreset', render: (r: any) => (<span>{r.engagement_count ?? 0}</span>) },
                                        { key: 'first_contact_date', label: 'First Contact', filterType: 'datepreset', render: (r: any) => (<span>{r.first_contact_date ?? ''}</span>) },
                                        { key: 'last_contact_date', label: 'Last Contact', filterType: 'datepreset', render: (r: any) => (<span>{r.last_contact_date ?? ''}</span>) },
                                    ]}
                                    filters={filters.contacts}
                                    onFilterChange={(col, v) => setFilters((s) => ({ ...s, contacts: { ...(s.contacts || {}), [col]: v } }))}
                                    sortState={sortBy.contacts}
                                    onSortChange={(k) => setSortBy((s) => ({ ...s, contacts: { key: k, dir: s.contacts && s.contacts.key === k && s.contacts.dir === 'asc' ? 'desc' : 'asc' } }))}
                                    selectable
                                    idKey="contactid"
                                    selectedIds={contactsSelected}
                                    onSelectionChange={(s) => setContactsSelected(s as Set<number | string>)}
                                    page={contactsPage}
                                    pageSize={contactsPageSize}
                                    onPageChange={(p) => setContactsPage(p)}
                                    onPageSizeChange={(s) => { setContactsPageSize(s); setContactsPage(0) }}
                                    total={contactsTotal}
                                />
                            </div>
                        )}

                        {/* Leads tab */}
                        {activeTargetsTab === 1 && (
                            <div>
                                <SimpleFilterableTable
                                    rows={hideLinked ? (leadsRows || []).filter((r: any) => !linkedSets.leadsSet.has(String(r.leadid))) : (leadsRows || [])}
                                    columns={[{ key: 'name', label: 'Name' }, { key: 'company', label: 'Company', filterType: 'multiselect', filterOptions: 'fromRows' }, { key: 'position', label: 'Position', filterType: 'multiselect', filterOptions: 'fromRows' }]}
                                    filters={filters.leads}
                                    onFilterChange={(col, v) => setFilters((s) => ({ ...s, leads: { ...(s.leads || {}), [col]: v } }))}
                                    sortState={sortBy.leads}
                                    onSortChange={(k) => setSortBy((s) => ({ ...s, leads: { key: k, dir: s.leads && s.leads.key === k && s.leads.dir === 'asc' ? 'desc' : 'asc' } }))}
                                    selectable
                                    idKey="leadid"
                                    selectedIds={leadsSelected}
                                    onSelectionChange={(s) => setLeadsSelected(s as Set<number | string>)}
                                    page={leadsPage}
                                    pageSize={leadsPageSize}
                                    onPageChange={(p) => setLeadsPage(p)}
                                    onPageSizeChange={(s) => { setLeadsPageSize(s); setLeadsPage(0) }}
                                    total={leadsTotal}
                                />
                            </div>
                        )}

                        {/* Orgs tab */}
                        {activeTargetsTab === 2 && (
                            <div>
                                <SimpleFilterableTable
                                    rows={hideLinked ? (orgs || []).filter((r: any) => !linkedSets.orgsSet.has(String(r.orgid))) : orgs}
                                    columns={[
                                        { key: 'name', label: 'Name', filterType: 'multiselect', filterOptions: 'fromRows', render: (r: any) => (<span>{r.name}</span>) },
                                        { key: 'sector_summary', label: 'Sector', filterType: 'multiselect', filterOptions: 'fromRows', render: (r: any) => (<span>{r.sector_summary ?? r.sector ?? ''}</span>) }
                                    ]}
                                    filters={filters.orgs}
                                    onFilterChange={(col, v) => setFilters((s) => ({ ...s, orgs: { ...(s.orgs || {}), [col]: v } }))}
                                    sortState={sortBy.orgs}
                                    onSortChange={(k) => setSortBy((s) => ({ ...s, orgs: { key: k, dir: s.orgs && s.orgs.key === k && s.orgs.dir === 'asc' ? 'desc' : 'asc' } }))}
                                    selectable
                                    idKey="orgid"
                                    selectedIds={orgsSelected}
                                    onSelectionChange={(s) => setOrgsSelected(s as Set<number | string>)}
                                />
                            </div>
                        )}

                        {/* Sectors tab */}
                        {activeTargetsTab === 3 && (
                            <div>
                                <SimpleFilterableTable
                                    rows={hideLinked ? (sectors || []).filter((r: any) => !linkedSets.sectorsSet.has(String(r.sectorid))) : sectors}
                                    columns={[
                                        { key: 'summary', label: 'Sector', filterType: 'multiselect', filterOptions: 'fromRows' },
                                        { key: 'description', label: 'Description' }
                                    ]}
                                    filters={filters.sectors}
                                    onFilterChange={(col, v) => setFilters((s) => ({ ...s, sectors: { ...(s.sectors || {}), [col]: v } }))}
                                    sortState={sortBy.sectors}
                                    onSortChange={(k) => setSortBy((s) => ({ ...s, sectors: { key: k, dir: s.sectors && s.sectors.key === k && s.sectors.dir === 'asc' ? 'desc' : 'asc' } }))}
                                    selectable
                                    idKey="sectorid"
                                    selectedIds={sectorsSelected}
                                    onSelectionChange={(s) => setSectorsSelected(s as Set<number | string>)}
                                />
                            </div>
                        )}
                    </div>
                </AccordionDetails>
            </Accordion>
        </div>
    )
}
