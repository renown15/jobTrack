import React, { useState } from 'react'
import { useContacts } from '../api/hooks/useContacts'
import DataTable from '../components/DataTable'
import ResponsiveDataView from '../components/ResponsiveDataView'
import MobileContactsList from '../components/Hub/MobileContactsList'
import type { Contact } from '../api/types'
import CircularProgress from '@mui/material/CircularProgress'
import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'
import IconButton from '@mui/material/IconButton'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { BRAND_PURPLE } from '../constants/colors'

// Simple page-level grouped engagements UI used by tests. This mirrors the collapsed
// behaviour in `ContactsTable` but kept lightweight for the page view tests.
export default function Contacts() {
    // UI uses 0-based pages; API uses 1-based pages
    const [page, setPage] = useState(0)
    const [pageSize, setPageSize] = useState(20)

    const { data, isLoading, isError, error } = useContacts(page + 1, pageSize)

    const rows: Contact[] = data?.items ?? []
    const total = data?.total ?? 0

    const [engagementsExpanded, setEngagementsExpanded] = useState(false)

    const columns = [
        { key: 'contactid', label: 'ID' },
        { key: 'firstname', label: 'First name' },
        { key: 'lastname', label: 'Last name' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        {
            key: 'engagement_count',
            label: (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span>Engagements</span>
                    <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); setEngagementsExpanded(!engagementsExpanded) }}
                        aria-label="Expand engagements"
                        sx={{ bgcolor: BRAND_PURPLE, color: '#fff', '&:hover': { bgcolor: BRAND_PURPLE }, width: 32, height: 32, padding: '6px', borderRadius: '50%' }}
                    >
                        <ExpandMoreIcon fontSize="small" />
                    </IconButton>
                </Box>
            ),
            render: (row: any) => {
                const count = row.engagement_count ?? 0
                const first = row.first_contact_date
                const last = row.last_activity_date ?? row.last_contact_date
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{count}</span>
                        {engagementsExpanded && (
                            <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem', color: 'rgba(0,0,0,0.7)' }}>
                                <span>First: {first ?? '—'}</span>
                                <span>Last: {last ?? '—'}</span>
                            </div>
                        )}
                    </div>
                )
            }
        }
    ]

    return (
        <div>
            <h2>Contacts</h2>

            {isLoading && (
                <Box display="flex" justifyContent="center" my={4}>
                    <CircularProgress />
                </Box>
            )}

            {isError && <Alert severity="error">{error?.message ?? 'Failed to load contacts'}</Alert>}

            {!isLoading && !isError && (
                <ResponsiveDataView
                    desktopView={<DataTable<Contact>
                        columns={columns}
                        rows={rows}
                        total={total}
                        page={page}
                        pageSize={pageSize}
                        sortKey={'last_activity_date'}
                        sortDirection={'desc'}
                        onPageChange={(p) => setPage(p)}
                        onPageSizeChange={(s) => {
                            setPageSize(s)
                            setPage(0)
                        }}
                    />}
                    mobileView={<MobileContactsList contacts={rows} loading={isLoading} />}
                    breakpoint="md"
                />
            )}
        </div>
    )
}
