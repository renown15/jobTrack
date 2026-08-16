import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import DataTable from '../DataTable'
import { fetchJobRoles, fetchAllContacts, fetchOrganisations } from '../../api/client'
import { sortArray } from '../../utils/sort'
import Box from '@mui/material/Box'
import AppButton from '../Shared/AppButton'
import IconButton from '@mui/material/IconButton'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { deleteJobRole } from '../../api/client'
import ConfirmDialog from '../Shared/ConfirmDialog'
import Toast from '../Shared/Toast'
import QuickCreateModal from './QuickCreateModal'

export default function RolesTable({ search, contactId, statusFilter, orgFilterId, onlyIds, inModal, hideCreateButton }: { search?: string, contactId?: number, statusFilter?: string[], orgFilterId?: number, onlyIds?: number[], inModal?: boolean, hideCreateButton?: boolean }) {
    const [page, setPage] = useState(0)
    const initialPageSize = inModal ? 10 : 20
    const [pageSize, setPageSize] = useState(initialPageSize)
    const [openCreate, setOpenCreate] = useState(false)

    const q = useQuery(['jobroles', contactId], () => fetchJobRoles(contactId), { staleTime: 60000 })
    const orgsQ = useQuery(['organisations'], () => fetchOrganisations(), { staleTime: 60000 })
    const qc = useQueryClient()
    let all = q.data ?? []
    // Debug: log incoming jobroles and organisations caches and query client state
    try { console.debug('RolesTable: initial jobroles', { contactId, jobrolesCount: Array.isArray(q.data) ? q.data.length : 0 }) } catch (e) { }
    try { console.debug('RolesTable: organisations cache', { orgsCount: Array.isArray(orgsQ.data) ? orgsQ.data.length : 0 }) } catch (e) { }
    try {
        // Log top-level query keys and a small sample of each jobroles query
        const allQueries = (qc as any).getQueryCache().getAll()
        const keys = allQueries.map((qq: any) => qq.queryKey)
        try { console.debug('RolesTable: QueryClient keys', { keysCount: keys.length, keys: keys.slice(0, 50) }) } catch (e) { }
        try {
            const jobrolesSamples: any[] = []
            allQueries.forEach((qq: any) => {
                try {
                    if (Array.isArray(qq.queryKey) && qq.queryKey[0] === 'jobroles') {
                        const sample = qc.getQueryData(qq.queryKey)
                        jobrolesSamples.push({ key: qq.queryKey, sample: Array.isArray(sample) ? sample.slice(0, 3) : sample })
                    }
                } catch (e) { /* ignore per-query */ }
            })
            try { console.debug('RolesTable: jobroles query samples', { jobrolesSamples }) } catch (e) { }
        } catch (e) { }
    } catch (e) { /* ignore */ }
    // Prefer canonical organisation name from organisations cache when available
    try {
        const orgsList = orgsQ.data ?? []
        if (Array.isArray(all) && Array.isArray(orgsList) && orgsList.length) {
            const before = (all || []).slice(0, 3)
            const missingOrgs: any[] = []
            const nameMismatches: any[] = []
            let matched = 0
            all = (all || []).map((r: any) => {
                try {
                    const orgId = Number(r.companyorgid ?? r.company_org_id ?? r.companyorg)
                    if (!orgId) {
                        // no org id to match
                        return r
                    }
                    const match = orgsList.find((o: any) => Number(o.orgid) === orgId)
                    if (match && match.name) {
                        matched++
                        if (String(r.company_name || '').trim() !== String(match.name || '').trim()) {
                            nameMismatches.push({ jobid: r.jobid ?? r.jobID, before: r.company_name, after: match.name })
                        }
                        return { ...r, company_name: match.name }
                    }
                    // record missing mapping for later inspection
                    missingOrgs.push({ jobid: r.jobid ?? r.jobID, companyorgid: orgId, company_name: r.company_name })
                } catch (e) { /* ignore per-row errors */ }
                return r
            })
            try { console.debug('RolesTable: reconciled jobroles company_name from organisations', { before, after: (all || []).slice(0, 3), matched, missingCount: missingOrgs.length, missingSample: missingOrgs.slice(0, 3), nameMismatches: nameMismatches.slice(0, 3) }) } catch (e) { }
        }
    } catch (e) { /* ignore */ }

    // Log when jobroles or organisations update so we can trace refreshes
    React.useEffect(() => {
        try { console.debug('RolesTable: q.data changed', { contactId, jobrolesCount: Array.isArray(q.data) ? q.data.length : 0 }) } catch (e) { }
    }, [q.data, contactId])
    React.useEffect(() => {
        try { console.debug('RolesTable: orgsQ.data changed', { orgsCount: Array.isArray(orgsQ.data) ? orgsQ.data.length : 0 }) } catch (e) { }
    }, [orgsQ.data])
    if (onlyIds && Array.isArray(onlyIds) && onlyIds.length > 0) {
        const idSet = new Set(onlyIds.map((i) => Number(i)))
        all = (all || []).filter((r: any) => idSet.has(Number(r?.jobid || r?.jobID || 0)))
    }
    const [sortKey, setSortKey] = useState<string | null>('applicationdate')
    const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>('desc')

    const filtered = React.useMemo(() => {
        let base = all
        // apply status filter first if provided
        if (statusFilter && statusFilter.length > 0) {
            const allowed = new Set(statusFilter.map((s) => String(s).toLowerCase()))
            base = base.filter((r: any) => allowed.has(String(r.status_name || '').toLowerCase()))
        }
        // apply organisation filter if provided
        if (orgFilterId != null) {
            base = base.filter((r: any) => Number(r.companyorgid) === Number(orgFilterId))
        }
        if (!search || !search.trim()) return base
        const s = search.trim().toLowerCase()
        return base.filter((r: any) => {
            return (
                (r.rolename && String(r.rolename).toLowerCase().includes(s)) ||
                (r.contact_name && String(r.contact_name).toLowerCase().includes(s)) ||
                (r.company_name && String(r.company_name).toLowerCase().includes(s)) ||
                (r.status_name && String(r.status_name).toLowerCase().includes(s))
            )
        })
    }, [all, search, statusFilter])

    const sorted = React.useMemo(() => sortArray(filtered, sortKey, sortDir), [filtered, sortKey, sortDir])
    const total = sorted.length
    const start = page * pageSize
    const items = sorted.slice(start, start + pageSize)

    const columns: any[] = [
        { key: 'rolename', label: 'Role' },
        { key: 'contact_name', label: 'Contact' },
        { key: 'company_name', label: 'Company' },
        { key: 'source_name', label: 'Source' },
        { key: 'applicationdate', label: 'Application Date' },
        { key: 'status_name', label: 'Status' },
    ]
    columns.push({
        key: 'actions', label: 'Actions', render: (row: any) => (
            <>
                <IconButton size="small" aria-label={`Edit role ${row.jobid}`} onClick={() => handleEdit(row)}><EditIcon fontSize="small" /></IconButton>
                <IconButton size="small" aria-label={`Delete role ${row.jobid}`} onClick={() => handleDelete(row)}><DeleteIcon fontSize="small" /></IconButton>
            </>
        )
    })

    const [editingRow, setEditingRow] = useState<any | null>(null)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [confirmRow, setConfirmRow] = useState<any | null>(null)
    const [toastOpen, setToastOpen] = useState(false)
    const [toastMsg, setToastMsg] = useState('')
    const [toastSeverity, setToastSeverity] = useState<'success' | 'error' | 'info' | 'warning'>('success')

    function handleEdit(row: any) {
        setEditingRow(row)
        setOpenCreate(true)
    }

    function handleDelete(row: any) {
        setConfirmRow(row)
        setConfirmOpen(true)
    }

    async function confirmDelete() {
        const row = confirmRow
        if (!row || !row.jobid) return
        try {
            await deleteJobRole(Number(row.jobid))
            q.refetch()
            setToastMsg('Job role deleted')
            setToastSeverity('success')
            setToastOpen(true)
        } catch (err: any) {
            console.error('Delete jobrole failed', err)
            setToastMsg('Failed to delete job role: ' + String(err?.message || err))
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
                    <AppButton colorScheme="purple" onClick={async () => {
                        try {
                            // If this RolesTable was opened for a specific contact, prefill the create form
                            if (contactId) {
                                const list = await fetchAllContacts()
                                const contact = (list || []).find((c: any) => Number(c.contactid) === Number(contactId))
                                const prefill: any = { contactid: Number(contactId) }
                                // Try several shapes for current org id
                                const orgId = contact?.currentorgid ?? contact?.current_org_id ?? contact?.currentorgid ?? contact?.currentorg ?? null
                                if (orgId != null) prefill.companyorgid = Number(orgId)
                                setEditingRow(prefill)
                            } else {
                                setEditingRow(null)
                            }
                        } catch (e) {
                            // ignore and open blank create form
                            setEditingRow(null)
                        } finally {
                            setOpenCreate(true)
                        }
                    }}>+ Add Role</AppButton>
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
            <QuickCreateModal open={openCreate} onClose={() => { setOpenCreate(false); setEditingRow(null) }} mode="jobrole" editing={editingRow} />
            <ConfirmDialog
                open={confirmOpen}
                title="Delete job role"
                description={confirmRow ? `Delete role ${confirmRow.rolename}?` : ''}
                onConfirm={confirmDelete}
                onClose={() => setConfirmOpen(false)}
            />
            <Toast open={toastOpen} message={toastMsg} severity={toastSeverity} onClose={() => setToastOpen(false)} />
        </Box>
    )
}
