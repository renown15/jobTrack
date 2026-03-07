import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import DataTable from '../DataTable'
import { fetchEngagements } from '../../api/client'
import { sortArray } from '../../utils/sort'
import Box from '@mui/material/Box'
import ResponsiveDataView from '../ResponsiveDataView'
import MobileEngagementsList from './MobileEngagementsList'
import AppButton from '../Shared/AppButton'
import IconButton from '@mui/material/IconButton'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import { deleteEngagement } from '../../api/client'
import QuickCreateModal from './QuickCreateModal'
import ConfirmDialog from '../Shared/ConfirmDialog'
import Toast from '../Shared/Toast'

export default function EngagementsTable({ search, contactId, typeFilter, onlyIds, inModal, createLabel, onCreate, createEditing, showCreate = true, noWrapper = false, requireContact = false }: { search?: string, contactId?: number, typeFilter?: string[], onlyIds?: number[], inModal?: boolean, createLabel?: string, onCreate?: () => void, createEditing?: any, showCreate?: boolean, noWrapper?: boolean, requireContact?: boolean }) {
    const [page, setPage] = useState(0)
    const initialPageSize = inModal ? 10 : 20
    const [pageSize, setPageSize] = useState(initialPageSize)
    const [openCreate, setOpenCreate] = useState(false)

    // Fetch list of engagements; allow server-side filtering by contactId when provided
    const q = useQuery(['engagements', contactId, requireContact], () => {
        if (requireContact && (contactId == null || contactId === 0)) return Promise.resolve([])
        return fetchEngagements(contactId)
    }, { staleTime: 60000 })
    React.useEffect(() => { }, [q.isLoading, q.data])
    const queryClient = useQueryClient()
    let all = q.data ?? []
    if (onlyIds && Array.isArray(onlyIds) && onlyIds.length > 0) {
        const idSet = new Set(onlyIds.map((i) => Number(i)))
        all = (all || []).filter((r: any) => idSet.has(Number(r?.engagementid || r?.engagementlogid || 0)))
    }
    // Normalize engagement rows so UI can display multiple contacts when provided
    const allWithContactNames = (all || []).map((r: any) => {
        const contacts = r.contacts || r.contacts_list || r.contact_list || null
        const contactName = contacts && Array.isArray(contacts) && contacts.length > 0
            ? contacts.map((c: any) => c && (c.name || c.contact_name || c.contactname) ? (c.name || c.contact_name || c.contactname) : String(c)).join(', ')
            : (r.contact_name || r.contactname || '')
        return { ...r, contact_name: contactName }
    })
    const [sortKey, setSortKey] = useState<string | null>('engagedate')
    const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>('desc')

    const [editingRow, setEditingRow] = useState<any | null>(null)
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [confirmRow, setConfirmRow] = useState<any | null>(null)
    const [toastOpen, setToastOpen] = useState(false)
    const [toastMsg, setToastMsg] = useState('')
    const [toastSeverity, setToastSeverity] = useState<'success' | 'error' | 'info' | 'warning'>('success')

    const filtered = React.useMemo(() => {
        let base = allWithContactNames
        // apply type filter first if provided
        if (typeFilter && typeFilter.length > 0) {
            const allowed = new Set(typeFilter.map((t) => String(t).toLowerCase()))
            base = base.filter((r: any) => allowed.has(String(r.kind || r.type || '').toLowerCase()))
        }
        if (!search || !search.trim()) return base
        const s = search.trim().toLowerCase()
        return base.filter((r: any) => {
            // Top-level matches (group label, company, notes, kind)
            const topMatch = (
                (r.contact_name && String(r.contact_name).toLowerCase().includes(s)) ||
                (r.company_name && String(r.company_name).toLowerCase().includes(s)) ||
                (r.notes && String(r.notes).toLowerCase().includes(s)) ||
                (r.kind && String(r.kind).toLowerCase().includes(s))
            )

            if (topMatch) return true

            // If this engagement represents a group, check each child contact for matches
            const contacts = r.contacts || r.contacts_list || r.contact_list || null
            if (Array.isArray(contacts) && contacts.length > 0) {
                for (const c of contacts) {
                    try {
                        const childName = c && (c.name || c.contact_name || c.contactname) ? (c.name || c.contact_name || c.contactname) : String(c || '')
                        if (childName && String(childName).toLowerCase().includes(s)) return true

                        const contactOrg = (c && (
                            c.company_name || c.companyname || c.org_name || c.org || c.organisation ||
                            c.companyorgid || c.company_org_id || c.orgid ||
                            c.current_organization || c.currentorg ||
                            (c.company && (c.company.name || c.company.company_name)) ||
                            (c.organisation_obj && c.organisation_obj.name)
                        )) || ''
                        if (contactOrg && String(contactOrg).toLowerCase().includes(s)) return true
                    } catch (e) {
                        // ignore per-contact errors and continue
                    }
                }
            }

            return false
        })
    }, [allWithContactNames, search, typeFilter])

    const sorted = React.useMemo(() => sortArray(filtered, sortKey, sortDir), [filtered, sortKey, sortDir])
    const total = sorted.length
    const start = page * pageSize
    const items = sorted.slice(start, start + pageSize)
    // Build display rows with grouping support: when an engagement has multiple
    // contacts (r.contacts), present a single group row that can expand to
    // show individual contact rows. When a search is active, automatically
    // expand groups that have matching children and only show matching child
    // rows (or all children if the group label itself matches).
    const itemsForTable = [] as any[]
    const s = search && search.trim() ? search.trim().toLowerCase() : ''
    for (const r of items) {
        const contacts = r.contacts || r.contacts_list || r.contact_list || null
        const contactArray = Array.isArray(contacts) ? contacts : null
        // processing engagement (logging removed)
        if (contactArray && contactArray.length > 1) {
            // determine a stable group key and label
            const engagementId = Number(r.engagementid ?? r.engagementlogid ?? 0)
            // Ensure group key is unique per engagement to avoid duplicate summary rows
            const baseKey = r.contactgroupname || r.groupname || `grp:${(contactArray.map((c: any) => Number(c.contactid || c)).sort((a: any, b: any) => a - b).join('-'))}`
            const key = `${String(baseKey)}:${engagementId}`
            // Build a comma-delimited list of member names and truncate to 25
            // characters with an ellipsis if too long. Prefer a generated name
            // from members rather than any stored group name so the table shows
            // the actual members inline.
            const memberNames = contactArray.map((c: any) => c && (c.name || c.contact_name || c.contactname) ? (c.name || c.contact_name || c.contactname) : String(c)).join(', ')
            const truncated = memberNames.length > 50 ? memberNames.slice(0, 50) + '...' : memberNames
            // Prefer an explicit stored group name when present; otherwise fall
            // back to the generated member list so tests and legacy data that
            // rely on `contactgroupname` continue to work.
            const label = (r.contactgroupname && String(r.contactgroupname).trim() !== '') ? String(r.contactgroupname) : (truncated || r.groupname || `Group: ${memberNames}`)
            // summary/group row should not display an organisation in the Organisation column
            const groupRow = { ...r, contact_name: label, company_name: '', __is_group: true, __group_key: String(key) }
            // Determine whether search hits group label or any child rows
            const groupLabelMatches = s ? String(label).toLowerCase().includes(s) : false
            const childMatches: any[] = []
            if (s) {
                for (const c of contactArray) {
                    const childName = c && (c.name || c.contact_name || c.contactname) ? (c.name || c.contact_name || c.contactname) : String(c)
                    const contactOrg = (c && (
                        c.company_name || c.companyname || c.org_name || c.org || c.organisation ||
                        c.companyorgid || c.company_org_id || c.orgid ||
                        c.current_organization || c.currentorg ||
                        (c.company && (c.company.name || c.company.company_name)) ||
                        (c.organisation_obj && c.organisation_obj.name)
                    )) || r.company_name || r.companyname || ''
                    const notes = r.notes || r.log_entry || ''
                    const kind = r.kind || r.type || ''
                    const matches = (
                        (childName && String(childName).toLowerCase().includes(s)) ||
                        (contactOrg && String(contactOrg).toLowerCase().includes(s)) ||
                        (notes && String(notes).toLowerCase().includes(s)) ||
                        (kind && String(kind).toLowerCase().includes(s))
                    )
                    if (matches) childMatches.push({ c, contactOrg })
                }
            }

            // Include the group row if searching (and matches) or always when not searching
            if (!s || groupLabelMatches || childMatches.length > 0) {
                // groupRow computed (logging removed)
                itemsForTable.push(groupRow)
                const shouldExpand = groupLabelMatches || !!childMatches.length || Boolean(expandedGroups[String(key)])
                if (shouldExpand) {
                    const childrenToShow = (groupLabelMatches || !s) ? contactArray : childMatches.map((m: any) => m.c)
                    for (const c of (childrenToShow || [])) {
                        const contactOrg = (c && (
                            c.company_name || c.companyname || c.org_name || c.org || c.organisation ||
                            c.companyorgid || c.company_org_id || c.orgid ||
                            c.current_organization || c.currentorg ||
                            (c.company && (c.company.name || c.company.company_name)) ||
                            (c.organisation_obj && c.organisation_obj.name)
                        )) || r.company_name || r.companyname || ''
                        const child = { ...r, contactid: (c && (c.contactid || c.contact_id || c.id)) || undefined, contact_name: c && (c.name || c.contact_name || c.contactname) ? (c.name || c.contact_name || c.contactname) : String(c), company_name: contactOrg, __is_child: true, __parent_key: String(key) }
                        itemsForTable.push(child)
                    }
                }
            }
        } else {
            itemsForTable.push({ ...r, contact_name: r.contact_name })
        }
    }
    // itemsForTable built (logging removed)

    const columns: any[] = [
        {
            key: 'contact_name', label: 'Contact', render: (row: any) => {
                if (row && row.__is_group) {
                    return (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, pl: 1, pr: 1, borderRadius: 1 }}>
                            <IconButton size="small" aria-label={`toggle group ${row.__group_key}`} onClick={() => {
                                const k = String(row.__group_key)
                                // toggleGroup click (logging removed)
                                setExpandedGroups(prev => ({ ...prev, [k]: !prev[k] }))
                            }}>
                                {expandedGroups[String(row.__group_key)] ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
                            </IconButton>
                            <Box component="span" sx={{ fontWeight: 500 }}>{row.contact_name}</Box>
                        </Box>
                    )
                }
                // child rows should be indented slightly
                if (row && row.__is_child) {
                    return (
                        <Box sx={{ pl: 4 }}>
                            {row.contact_name}
                        </Box>
                    )
                }
                return row.contact_name
            }
        },
        // Use Organisation label to match Contacts table and prefer a compact width so Notes can expand
        { key: 'company_name', label: 'Organisation', shrinkToHeader: true, width: 180 },
        // Narrow Date column and give its space to Type for better readability
        { key: 'engagedate', label: 'Date', width: 96, render: (row: any) => (row && row.__is_child) ? '' : (row?.engagedate ?? '') },
        // Narrow Type slightly and give extra room to Notes
        { key: 'kind', label: 'Type', width: 200, render: (row: any) => (row && row.__is_child) ? '' : (row?.kind ?? '') },
        // Allow Notes to take remaining space (do not shrink to header) — give a larger preferred width so it expands
        { key: 'notes', label: 'Notes', width: 420, render: (row: any) => (row && row.__is_child) ? '' : (row?.notes ?? '') },
    ]

    columns.push({
        key: 'actions', label: 'Actions', render: (row: any) => {
            // Do not render action buttons for per-contact child rows
            if (row && row.__is_child) return null
            return (
                <>
                    {/* For group rows we still allow edit/delete of the engagement */}
                    <IconButton size="small" aria-label={`Edit engagement ${row.engagementid ?? row.engagementlogid}`} onClick={() => handleEdit(row)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" aria-label={`Delete engagement ${row.engagementid ?? row.engagementlogid}`} onClick={() => handleDelete(row)}><DeleteIcon fontSize="small" /></IconButton>
                </>
            )
        }
    })

    function handleEdit(row: any) {
        // Ensure the editing payload is set before opening the modal. In some
        // environments the modal may read `editing` on open; schedule opening
        // on the next RAF tick so the child receives the updated prop.
        setEditingRow(row)
        try {
            // Use a microtask delay so React has a chance to flush the
            // `editingRow` state before the modal reads the prop. `rAF`
            // can be throttled in some environments; `setTimeout(..., 0)`
            // is more reliable for this sequencing.
            window.setTimeout(() => setOpenCreate(true), 0)
        } catch (e) {
            setOpenCreate(true)
        }
        // end handleEdit
    }

    function handleDelete(row: any) {
        setConfirmRow(row)
        setConfirmOpen(true)
    }

    async function confirmDelete() {
        const row = confirmRow
        if (!row) return
        const id = Number(row.engagementid ?? row.engagementlogid)
        if (!id) return
        try {
            await deleteEngagement(id)
            q.refetch()
            // Invalidate Hub-level caches so summary/stats/cards update
            try {
                queryClient.invalidateQueries(['engagementsAll'])
                queryClient.invalidateQueries(['engagementsCount'])
                queryClient.invalidateQueries(['analyticsSummary'])
            } catch (e) {
                // ignore invalidation errors
            }
            setToastMsg('Engagement deleted')
            setToastSeverity('success')
            setToastOpen(true)
        } catch (err: any) {
            console.error('Failed to delete engagement', err)
            setToastMsg('Failed to delete engagement: ' + String(err?.message || err))
            setToastSeverity('error')
            setToastOpen(true)
        } finally {
            setConfirmOpen(false)
            setConfirmRow(null)
        }
    }

    // itemsForTable length computed (logging removed)

    const content = (
        <>
            {showCreate ? (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                    <AppButton colorScheme="purple" onClick={() => { if (onCreate) onCreate(); else setOpenCreate(true) }}>{createLabel ?? '+ Add Engagement'}</AppButton>
                </Box>
            ) : null}
            <DataTable
                columns={columns}
                rows={itemsForTable}
                total={total}
                page={page}
                pageSize={pageSize}
                onPageChange={(p) => setPage(p)}
                onPageSizeChange={(s) => { setPageSize(s); setPage(0) }}
                sortKey={sortKey ?? undefined}
                sortDirection={sortDir ?? undefined}
                onSortChange={(key, dir) => { setSortKey(key); setSortDir(dir); setPage(0) }}
            />
            {/* Always include the QuickCreateModal so editing an engagement works
                even when the parent has hidden the Create button via `showCreate=false`.
                The modal will only open when `openCreate` is true. */}
            <QuickCreateModal
                open={openCreate}
                onClose={() => { setOpenCreate(false); setEditingRow(null) }}
                mode="engagement"
                editing={editingRow ?? (createEditing ? createEditing : (contactId ? { contactid: contactId } : null))}
            />
            <ConfirmDialog
                open={confirmOpen}
                title="Delete engagement"
                description={(() => {
                    if (!confirmRow) return ''
                    const raw = confirmRow.logdate || confirmRow.engagedate || ''
                    // Normalize and trim off any time component. Support ISO and spaced formats.
                    try {
                        if (!raw) return ''
                        // If raw already looks like YYYY-MM-DD, return as-is
                        const simpleMatch = raw.match(/^(\d{4}-\d{2}-\d{2})$/)
                        if (simpleMatch) return `Delete engagement on ${simpleMatch[1]}?`
                        // If contains 'T' (ISO), take date part before 'T'
                        if (String(raw).includes('T')) {
                            const d = String(raw).split('T')[0]
                            return `Delete engagement on ${d}?`
                        }
                        // If contains space between date and time, take first token
                        if (String(raw).includes(' ')) {
                            const d = String(raw).split(' ')[0]
                            return `Delete engagement on ${d}?`
                        }
                        // Fallback: try parsing as Date and format to YYYY-MM-DD
                        const parsed = new Date(raw)
                        if (!isNaN(parsed.getTime())) {
                            const iso = parsed.toISOString().slice(0, 10)
                            return `Delete engagement on ${iso}?`
                        }
                        // Last resort, return raw
                        return `Delete engagement on ${raw}?`
                    } catch (e) {
                        return ''
                    }
                })()}
                onConfirm={confirmDelete}
                onClose={() => setConfirmOpen(false)}
            />
            <Toast open={toastOpen} message={toastMsg} severity={toastSeverity} onClose={() => setToastOpen(false)} />
        </>
    )

    if (noWrapper) return content

    // On non-noWrapper usage, prefer to render a mobile-optimized list on small viewports
    return (
        <ResponsiveDataView
            desktopView={<Box>{content}</Box>}
            mobileView={<MobileEngagementsList engagements={allWithContactNames} loading={q.isLoading} onEdit={(id: number) => {
                const row = (all || []).find((r: any) => Number(r.engagementid ?? r.engagementlogid ?? 0) === Number(id))
                if (row) handleEdit(row)
            }} onDelete={(id: number) => {
                const row = (all || []).find((r: any) => Number(r.engagementid ?? r.engagementlogid ?? 0) === Number(id))
                if (row) handleDelete(row)
            }} />}
            breakpoint="md"
        />
    )
}
