import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import DataTable from '../DataTable'
import { fetchOrganisations, fetchJobRoles } from '../../api/client'
import { sortArray } from '../../utils/sort'
import Box from '@mui/material/Box'
import AppButton from '../Shared/AppButton'
import IconButton from '@mui/material/IconButton'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import PeopleAltIcon from '@mui/icons-material/PeopleAlt'
import QuickCreateModal from './QuickCreateModal'
import RolesTable from './RolesTable'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import WideDialog from '../Shared/WideDialog'
import ContactsTable from './ContactsTable'
import { deleteOrganisation } from '../../api/client'
import ConfirmDialog from '../Shared/ConfirmDialog'
import Toast from '../Shared/Toast'

export default function OrganisationsTable({ search, sectorFilter, heatRange, hideCreateButton, employingOnly, onlyIds, extraActionRender, inModal }: { search?: string; sectorFilter?: string | null; heatRange?: number[]; hideCreateButton?: boolean; employingOnly?: boolean; onlyIds?: number[]; extraActionRender?: (row: any) => React.ReactNode; inModal?: boolean }) {
    const [page, setPage] = useState(0)
    const [pageSize, setPageSize] = useState(20)
    const [openCreate, setOpenCreate] = useState(false)

    const q = useQuery(['organisations'], () => fetchOrganisations(), { staleTime: 60000 })
    let all = q.data ?? []
    // If caller provided onlyIds, restrict to those organisation ids
    // Treat an explicit empty array as "no rows" rather than "no filter".
    if (Array.isArray(onlyIds)) {
        if (onlyIds.length > 0) {
            const idSet = new Set(onlyIds.map((i) => Number(i)))
            all = (all || []).filter((r: any) => idSet.has(Number(r?.orgid || 0)))
        } else {
            all = []
        }
    }
    const rolesQ = useQuery(['jobroles'], () => fetchJobRoles(), { staleTime: 60000 })
    const allRoles = rolesQ.data ?? []
    const [sortKey, setSortKey] = useState<string | null>('name')
    const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>('asc')

    // Debug: log incoming sectorFilter and total org count
    React.useEffect(() => {
        try {
            // eslint-disable-next-line no-console
            console.debug('[OrganisationsTable] sectorFilter ->', sectorFilter, 'all.length ->', (all || []).length)
        } catch (e) { /* ignore */ }
    }, [sectorFilter, all])

    const filtered = React.useMemo(() => {
        let list = all
        // If parent requested employing-only view, exclude recruitment sector organisations
        if (employingOnly) {
            const recruitmentSectorString = 'Recruitment & Executive Search'
            const recruitmentSectorAlt = 'Recruitment & Exec Search'
            list = list.filter((o: any) => {
                const s = String(o.sector_summary || '').trim()
                if (!s) return true
                const lower = s.toLowerCase()
                return !(lower.includes('recruit') || s === recruitmentSectorString || s === recruitmentSectorAlt)
            })
        }
        // apply sector filter from prop if present
        if (sectorFilter) {
            const sfNorm = String(sectorFilter).toLowerCase().trim()
            list = list.filter((r: any) => {
                const raw = String(r.sector_summary || '').trim()
                const val = raw.toLowerCase()
                // Exact match (case-insensitive) or contains the filter
                if (val === sfNorm) return true
                if (val.includes(sfNorm)) return true
                // If the requested filter is recruitment-related, match any sector containing 'recruit'
                if (sfNorm.includes('recruit') && val.includes('recruit')) return true
                return false
            })
        }
        if (!search || !search.trim()) return list
        const s = search.trim().toLowerCase()
        return list.filter((r: any) => {
            return (
                (r.name && String(r.name).toLowerCase().includes(s)) ||
                (r.sector_summary && String(r.sector_summary).toLowerCase().includes(s))
            )
        })
    }, [all, search, sectorFilter])

    // Prepare rows with a computed '__community_sort' key so the table can sort by community
    const prepared = React.useMemo(() => {
        return filtered.map((row: any) => {
            // reuse the same detection logic as the renderer
            const dateCandidates = [
                'talentcommunitydateadded',
                'talent_community_date_added',
                'talentCommunityDateAdded',
                'talent_community_date',
            ]
            const boolCandidates = [
                'talentcommunitymember',
                'membership_of_talent_community',
                'is_talent_community_member',
            ]

            function findFieldValue(obj: any, names: string[]) {
                if (!obj) return undefined
                for (const n of names) {
                    if (Object.prototype.hasOwnProperty.call(obj, n) && obj[n] != null) return obj[n]
                }
                const lowered = Object.keys(obj).reduce((acc: any, k: string) => {
                    acc[k.toLowerCase()] = obj[k]
                    return acc
                }, {})
                for (const n of names) {
                    const v = lowered[n.toLowerCase()]
                    if (v !== undefined && v !== null) return v
                }
                return undefined
            }

            const dateVal = findFieldValue(row, dateCandidates)
            const dateStr = dateVal == null ? '' : String(dateVal).trim()
            const hasValidDate = dateStr !== '' && dateStr.toLowerCase() !== 'nan' && dateStr !== '0000-00-00' && !isNaN(Date.parse(dateStr))

            let boolVal = false
            if (!hasValidDate) {
                const b = findFieldValue(row, boolCandidates)
                if (b !== undefined && b !== null) {
                    boolVal = (b === true || b === 1 || String(b).toLowerCase() === 'true' || String(b) === '1')
                }
            }

            let sortKeyVal: string
            if (hasValidDate) {
                // put dated members first, using ISO date for lexicographic ordering among them
                sortKeyVal = `0:${dateStr}`
            } else if (boolVal) {
                // boolean-only members next
                sortKeyVal = '1:'
            } else {
                // non-members last
                sortKeyVal = '2:'
            }

            return { ...row, __community_sort: sortKeyVal }
        })
    }, [filtered])

    const sorted = React.useMemo(() => sortArray(prepared, sortKey, sortDir), [prepared, sortKey, sortDir])
    const total = sorted.length
    const start = page * pageSize
    const items = sorted.slice(start, start + pageSize)

    const columns: any[] = [
        { key: 'name', label: 'Name' },
        {
            // use a computed sort key so the community column can be sorted
            key: '__community_sort', label: 'Community', render: (row: any) => {
                // Accept either a date or a boolean marker for community membership.
                // Field names returned by the API may vary in case (camelCase vs snake_case).
                // Property access in JS is case-sensitive, so we attempt a case-insensitive
                // lookup: first check the candidate names as-is, then fallback to comparing
                // lowercase keys.
                const dateCandidates = [
                    'talentcommunitydateadded',
                    'talent_community_date_added',
                    'talentCommunityDateAdded',
                    'talent_community_date',
                ]
                const boolCandidates = [
                    'talentcommunitymember',
                    'membership_of_talent_community',
                    'is_talent_community_member',
                ]

                function findFieldValue(obj: any, names: string[]) {
                    if (!obj) return undefined
                    // exact match first
                    for (const n of names) {
                        if (Object.prototype.hasOwnProperty.call(obj, n) && obj[n] != null) return obj[n]
                    }
                    // case-insensitive fallback
                    const lowered = Object.keys(obj).reduce((acc: any, k: string) => {
                        acc[k.toLowerCase()] = obj[k]
                        return acc
                    }, {})
                    for (const n of names) {
                        const v = lowered[n.toLowerCase()]
                        if (v !== undefined && v !== null) return v
                    }
                    return undefined
                }

                const dateVal = findFieldValue(row, dateCandidates)
                const dateStr = dateVal == null ? '' : String(dateVal).trim()
                const hasValidDate = dateStr !== '' && dateStr.toLowerCase() !== 'nan' && dateStr !== '0000-00-00' && !isNaN(Date.parse(dateStr))

                let boolVal = false
                if (!hasValidDate) {
                    const b = findFieldValue(row, boolCandidates)
                    if (b !== undefined && b !== null) {
                        boolVal = (b === true || b === 1 || String(b).toLowerCase() === 'true' || String(b) === '1')
                    }
                }

                // (removed dev debug logging)

                if (hasValidDate) return <PeopleAltIcon color="primary" titleAccess={`Community member since ${dateStr}`} />
                if (boolVal) return <PeopleAltIcon color="primary" titleAccess={`Community member`} />
                return <span />
            }
        },
        { key: 'sector_summary', label: 'Sector' },
        {
            key: 'contacts_count', label: 'Contacts', render: (row: any) => (
                <AppButton size="small" colorScheme="white" onClick={() => openContactsModal(row)}>{row.contacts_count ?? 0}</AppButton>
            )
        },
        {
            key: 'roles_count', label: 'Roles', render: (row: any) => {
                const count = allRoles.filter((r: any) => Number(r.companyorgid) === Number(row.orgid)).length
                return <AppButton size="small" colorScheme="white" onClick={() => openRolesModal(row)}>{count}</AppButton>
            }
        },
    ]

    // Created column (use canonical `created_at` provided by backend)
    columns.push({ key: 'created_at', label: 'Created', render: (row: any) => (<span>{row.created_at ?? ''}</span>) })

    // Note: render any injected extraActionRender inside the Actions column
    // so its controls appear at the end of each row rather than as a
    // separate intermediate column.

    // actions column
    columns.push({
        key: 'actions', label: 'Actions', render: (row: any) => (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
                <IconButton size="small" aria-label={`Edit organisation ${row.orgid}`} onClick={() => handleEdit(row)}><EditIcon fontSize="small" /></IconButton>
                {!inModal ? <IconButton size="small" aria-label={`Delete organisation ${row.orgid}`} onClick={() => handleDelete(row)}><DeleteIcon fontSize="small" /></IconButton> : null}
                {typeof (extraActionRender as any) === 'function' ? <div style={{ display: 'flex', alignItems: 'center' }}>{(extraActionRender as any)(row)}</div> : null}
            </div>
        )
    })

    const [editingRow, setEditingRow] = useState<any | null>(null)
    const [contactsModalOpen, setContactsModalOpen] = useState(false)
    const [contactsModalOrg, setContactsModalOrg] = useState<any | null>(null)
    const [rolesModalOpen, setRolesModalOpen] = useState(false)
    const [rolesModalOrg, setRolesModalOrg] = useState<any | null>(null)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [confirmRow, setConfirmRow] = useState<any | null>(null)
    const [toastOpen, setToastOpen] = useState(false)
    const [toastMsg, setToastMsg] = useState('')
    const [toastSeverity, setToastSeverity] = useState<'success' | 'error' | 'info' | 'warning'>('success')

    // Guarded numeric ids to avoid accidental NaN when object exists but id missing
    const contactsOrgId = contactsModalOrg && contactsModalOrg.orgid != null && !Number.isNaN(Number(contactsModalOrg.orgid))
        ? Number(contactsModalOrg.orgid)
        : undefined
    const rolesOrgId = rolesModalOrg && rolesModalOrg.orgid != null && !Number.isNaN(Number(rolesModalOrg.orgid))
        ? Number(rolesModalOrg.orgid)
        : undefined

    // Debug: log modal org object and the numeric id we compute for filtering
    React.useEffect(() => {
        try {
            // eslint-disable-next-line no-console
            console.debug('[OrganisationsTable] contactsModalOrg change:', { contactsModalOrg, contactsOrgId })
        } catch (e) { /* ignore */ }
    }, [contactsModalOrg, contactsOrgId])

    function handleEdit(row: any) {
        setEditingRow(row)
        setOpenCreate(true)
    }

    function handleDelete(row: any) {
        setConfirmRow(row)
        setConfirmOpen(true)
    }

    function openContactsModal(row: any) {
        setContactsModalOrg(row)
        setContactsModalOpen(true)
    }

    function openRolesModal(row: any) {
        setRolesModalOrg(row)
        setRolesModalOpen(true)
    }

    async function confirmDelete() {
        const row = confirmRow
        if (!row || !row.orgid) return
        try {
            await deleteOrganisation(Number(row.orgid))
            q.refetch()
            setToastMsg('Organisation deleted')
            setToastSeverity('success')
            setToastOpen(true)
        } catch (err: any) {
            console.error('Delete organisation failed', err)
            const details = err?.response?.data?.details ? JSON.stringify(err.response.data.details) : String(err?.message || err)
            setToastMsg('Failed to delete organisation: ' + details)
            setToastSeverity('error')
            setToastOpen(true)
        } finally {
            setConfirmOpen(false)
            setConfirmRow(null)
        }
    }

    return (
        <Box>
            {!hideCreateButton && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                    <AppButton colorScheme="purple" onClick={() => setOpenCreate(true)}>+ Add Org</AppButton>
                </Box>
            )}
            <DataTable
                columns={columns}
                rows={items}
                total={total}
                page={page}
                pageSize={pageSize}
                onPageChange={(p) => setPage(p)}
                onPageSizeChange={(s) => { setPageSize(s); setPage(0) }}
                sortKey={sortKey ?? undefined}
                sortDirection={sortDir ?? undefined}
                onSortChange={(key, dir) => { setSortKey(key); setSortDir(dir); setPage(0) }}
            />
            <QuickCreateModal open={openCreate} onClose={() => { setOpenCreate(false); setEditingRow(null) }} mode="organisation" editing={editingRow} />
            <WideDialog open={contactsModalOpen} onClose={() => setContactsModalOpen(false)} fullWidth fitToContent>
                <DialogTitle>Contacts for {contactsModalOrg ? contactsModalOrg.name : ''}</DialogTitle>
                <DialogContent dividers>
                    <Box sx={{ mb: 2 }}>
                        <strong>Employed contacts</strong>
                        <div style={{ minWidth: 'min(1200px, 95vw)' }}>
                            {/* @ts-ignore */}
                            <ContactsTable orgFilterId={contactsOrgId} contactOrgMode="employed" inModal hideCreateButton />
                        </div>
                    </Box>
                    <Box sx={{ mt: 3 }}>
                        <strong>Targeting / hiring for this organisation</strong>
                        <div style={{ minWidth: 'min(1200px, 95vw)' }}>
                            {/* @ts-ignore */}
                            <ContactsTable orgFilterId={contactsOrgId} contactOrgMode="targeting" inModal hideCreateButton />
                        </div>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                    <AppButton colorScheme="white" onClick={() => setContactsModalOpen(false)}>Close</AppButton>
                </DialogActions>
            </WideDialog>
            <WideDialog open={rolesModalOpen} onClose={() => setRolesModalOpen(false)} fullWidth fitToContent>
                <DialogTitle>Roles for {rolesModalOrg ? rolesModalOrg.name : ''}</DialogTitle>
                <DialogContent dividers>
                    {/* @ts-ignore */}
                    <RolesTable orgFilterId={rolesOrgId} />
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                    <AppButton colorScheme="white" onClick={() => setRolesModalOpen(false)}>Close</AppButton>
                </DialogActions>
            </WideDialog>
            <ConfirmDialog
                open={confirmOpen}
                title="Delete organisation"
                description={confirmRow ? `Delete ${confirmRow.name}? This cannot be undone.` : ''}
                onConfirm={confirmDelete}
                onClose={() => setConfirmOpen(false)}
            />
            <Toast open={toastOpen} message={toastMsg} severity={toastSeverity} onClose={() => setToastOpen(false)} />
        </Box>
    )
}
