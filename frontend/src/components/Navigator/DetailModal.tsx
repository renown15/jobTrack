import React from 'react'
import { Box, Button, Typography, useMediaQuery, useTheme, Card, CardContent, Stack } from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import WideDialog from '../Shared/WideDialog'
import ContactsTable from '../Hub/ContactsTable'
import EngagementsTable from '../Hub/EngagementsTable'
import RolesTable from '../Hub/RolesTable'
import DataTable from '../DataTable'
import MobileContactsList from '../Hub/MobileContactsList'
import MobileJobRolesList from '../Hub/MobileJobRolesList'
import MobileEngagementsList from '../Hub/MobileEngagementsList'
import QuickCreateModal from '../Hub/QuickCreateModal'
import AppButton from '../Shared/AppButton'
import { deleteContact, deleteEngagement, deleteJobRole } from '../../api/client'

// Map metric keys to entity types
const METRIC_TO_ENTITY: Record<string, string> = {
    'dormant_contacts': 'contacts',
    'active_contacts_not_met': 'contacts',
    'met_no_cv': 'contacts',
    'contacts_you_ve_met_but_not_sent_a_cv': 'contacts',
    'not_checked_in_with': 'contacts',
    'new_contacts_last_month': 'contacts',
    'new_contacts_from_leads_last_month': 'contacts',
    'roles_not_followed_up': 'roles',
    'new_engagements_last_month': 'engagements',
    'meetings_undocumented': 'engagements',
    'networking_events_last_3_months': 'engagements',
    'number_of_action_plans': 'tasks',
    'overdue_action_plans': 'tasks',
    'leads_to_be_reviewed': 'leads'
}

const PREFERRED_COLS_BY_ENTITY: Record<string, string[]> = {
    contacts: ['contactid', 'name', 'firstname', 'lastname', 'jobtitle', 'email', 'telephone', 'created_at'],
    engagements: ['engagementlogid', 'contactid', 'logdate', 'engagementtypeid', 'logentry'],
    roles: ['jobid', 'title', 'companyorgid', 'statusid', 'created_at'],
    tasks: ['taskid', 'description', 'duedate', 'completed', 'applicantid'],
    leads: ['leadid', 'name', 'created_at', 'reviewdate', 'reviewoutcomeid']
}

function formatMetricName(key: string): string {
    if (!key) return ''
    return String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => String(c).toUpperCase())
}

function formatValue(val: any): string {
    if (val == null) return ''
    if (val instanceof Date) return val.toLocaleDateString()
    if (typeof val === 'boolean') return val ? 'Yes' : 'No'
    return String(val)
}

interface DetailModalProps {
    open: boolean
    onClose: () => void
    metric: string | null
    rows: any[]
}

export function DetailModal({ open, onClose, metric, rows }: DetailModalProps) {
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const queryClient = useQueryClient()
    const [createModalOpen, setCreateModalOpen] = React.useState(false)
    const [editingItem, setEditingItem] = React.useState<any | null>(null)

    // Sub-modal state for drill-down views
    const [subModalOpen, setSubModalOpen] = React.useState(false)
    const [subModalEntity, setSubModalEntity] = React.useState<'engagements' | 'roles' | 'contacts' | null>(null)
    const [subModalContactId, setSubModalContactId] = React.useState<number | null>(null)
    const [subModalOrgId, setSubModalOrgId] = React.useState<number | null>(null)

    if (!rows || rows.length === 0) {
        return (
            <WideDialog open={open} onClose={onClose} fullWidth maxWidthPx={800} fullScreen={isMobile}>
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6" sx={{ mb: 1 }}>
                        Metric detail — {formatMetricName(metric || '')}
                    </Typography>
                    <Typography>No detail rows available</Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button onClick={onClose}>Close</Button>
                    </Box>
                </Box>
            </WideDialog>
        )
    }

    const first = rows[0] || {}
    const entity = metric ? METRIC_TO_ENTITY[metric] || null : null

    // Determine columns to show
    let cols: string[] = []
    if (entity && PREFERRED_COLS_BY_ENTITY[entity]) {
        cols = PREFERRED_COLS_BY_ENTITY[entity].filter((c) =>
            Object.prototype.hasOwnProperty.call(first, c)
        )
    }
    if (!cols || cols.length === 0) {
        cols = Object.keys(first).slice(0, 12)
    }

    // For known entities, use the existing Hub tables
    if (entity === 'contacts') {
        const ids = rows
            .map((r: any) => Number(r.contactid || r.id || r.contact_id || 0))
            .filter((n: number) => n > 0)

        // On mobile, show cards instead of table
        if (isMobile) {
            return (
                <>
                    <WideDialog open={open} onClose={onClose} fullWidth maxWidthPx={560} fullScreen>
                        <Box sx={{ p: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="h6">
                                    {formatMetricName(metric || '')}
                                </Typography>
                                <AppButton colorScheme="purple" onClick={() => setCreateModalOpen(true)} size="small">
                                    + Add Contact
                                </AppButton>
                            </Box>
                            <MobileContactsList
                                contacts={rows}
                                loading={false}
                                onEdit={(contactId) => {
                                    const contact = rows.find(r => r.contactid === contactId)
                                    if (contact) {
                                        setEditingItem(contact)
                                        setCreateModalOpen(true)
                                    }
                                }}
                                onDelete={async (contactId) => {
                                    if (!window.confirm('Delete this contact?')) return
                                    try {
                                        await deleteContact(contactId)
                                        queryClient.invalidateQueries(['contactsList'])
                                        queryClient.invalidateQueries(['contactsForMobile'])
                                        onClose()
                                    } catch (err) {
                                        console.error('Delete failed:', err)
                                        alert('Failed to delete contact')
                                    }
                                }}
                                onEngagementsClick={(contactId) => {
                                    setSubModalContactId(contactId)
                                    setSubModalEntity('engagements')
                                    setSubModalOpen(true)
                                }}
                                onRolesClick={(contactId) => {
                                    setSubModalContactId(contactId)
                                    setSubModalEntity('roles')
                                    setSubModalOpen(true)
                                }}
                            />
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                                <Button onClick={onClose}>Close</Button>
                            </Box>
                        </Box>
                    </WideDialog>
                    <QuickCreateModal
                        open={createModalOpen}
                        mode="contact"
                        onClose={() => {
                            setCreateModalOpen(false)
                            setEditingItem(null)
                            queryClient.invalidateQueries(['contactsList'])
                            queryClient.invalidateQueries(['contactsForMobile'])
                        }}
                        editing={editingItem}
                    />
                </>
            )
        }

        // Desktop: use Hub table
        return (
            <WideDialog open={open} onClose={onClose} fullWidth maxWidthPx={1100}>
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6" sx={{ mb: 1 }}>
                        Metric detail — {formatMetricName(metric || '')}
                    </Typography>
                    <ContactsTable search={''} onlyIds={ids} inModal={true} />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button onClick={onClose}>Close</Button>
                    </Box>
                </Box>
            </WideDialog>
        )
    }

    if (entity === 'engagements') {
        const ids = rows
            .map((r: any) => Number(r.engagementlogid || r.engagementid || r.id || 0))
            .filter((n: number) => n > 0)

        // On mobile, show cards instead of table
        if (isMobile) {
            return (
                <>
                    <WideDialog open={open} onClose={onClose} fullWidth maxWidthPx={560} fullScreen>
                        <Box sx={{ p: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="h6">
                                    {formatMetricName(metric || '')}
                                </Typography>
                                <AppButton colorScheme="purple" onClick={() => setCreateModalOpen(true)} size="small">
                                    + Add Engagement
                                </AppButton>
                            </Box>
                            <MobileEngagementsList
                                engagements={rows}
                                loading={false}
                                onEdit={(engagementId) => {
                                    const engagement = rows.find(r => (r.engagementid || r.engagementlogid) === engagementId)
                                    if (engagement) {
                                        setEditingItem(engagement)
                                        setCreateModalOpen(true)
                                    }
                                }}
                                onDelete={async (engagementId) => {
                                    if (!window.confirm('Delete this engagement?')) return
                                    try {
                                        await deleteEngagement(engagementId)
                                        queryClient.invalidateQueries(['engagements'])
                                        queryClient.invalidateQueries(['engagementsForMobile'])
                                        onClose()
                                    } catch (err) {
                                        console.error('Delete failed:', err)
                                        alert('Failed to delete engagement')
                                    }
                                }}
                            />
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                                <Button onClick={onClose}>Close</Button>
                            </Box>
                        </Box>
                    </WideDialog>
                    <QuickCreateModal
                        open={createModalOpen}
                        mode="engagement"
                        onClose={() => {
                            setCreateModalOpen(false)
                            setEditingItem(null)
                            queryClient.invalidateQueries(['engagements'])
                            queryClient.invalidateQueries(['engagementsForMobile'])
                        }}
                        editing={editingItem}
                    />
                </>
            )
        }

        // Desktop: use Hub table
        return (
            <WideDialog open={open} onClose={onClose} fullWidth maxWidthPx={1100}>
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6" sx={{ mb: 1 }}>
                        Metric detail — {formatMetricName(metric || '')}
                    </Typography>
                    <EngagementsTable search={''} onlyIds={ids} inModal={true} />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button onClick={onClose}>Close</Button>
                    </Box>
                </Box>
            </WideDialog>
        )
    }

    if (entity === 'roles') {
        const ids = rows
            .map((r: any) => Number(r.jobid || r.jobID || r.id || 0))
            .filter((n: number) => n > 0)

        // On mobile, show cards instead of table
        if (isMobile) {
            return (
                <>
                    <WideDialog open={open} onClose={onClose} fullWidth maxWidthPx={560} fullScreen>
                        <Box sx={{ p: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="h6">
                                    {formatMetricName(metric || '')}
                                </Typography>
                                <AppButton colorScheme="purple" onClick={() => setCreateModalOpen(true)} size="small">
                                    + Add Role
                                </AppButton>
                            </Box>
                            <MobileJobRolesList
                                roles={rows}
                                loading={false}
                                onEdit={(roleId) => {
                                    const role = rows.find(r => (r.jobid || r.jobID) === roleId)
                                    if (role) {
                                        setEditingItem(role)
                                        setCreateModalOpen(true)
                                    }
                                }}
                                onDelete={async (roleId) => {
                                    if (!window.confirm('Delete this job role?')) return
                                    try {
                                        await deleteJobRole(roleId)
                                        queryClient.invalidateQueries(['jobroles'])
                                        queryClient.invalidateQueries(['rolesForMobile'])
                                        onClose()
                                    } catch (err) {
                                        console.error('Delete failed:', err)
                                        alert('Failed to delete job role')
                                    }
                                }}
                            />
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                                <Button onClick={onClose}>Close</Button>
                            </Box>
                        </Box>
                    </WideDialog>
                    <QuickCreateModal
                        open={createModalOpen}
                        mode="jobrole"
                        onClose={() => {
                            setCreateModalOpen(false)
                            setEditingItem(null)
                            queryClient.invalidateQueries(['jobroles'])
                            queryClient.invalidateQueries(['rolesForMobile'])
                        }}
                        editing={editingItem}
                    />
                </>
            )
        }

        // Desktop: use Hub table
        return (
            <WideDialog open={open} onClose={onClose} fullWidth maxWidthPx={1100}>
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6" sx={{ mb: 1 }}>
                        Metric detail — {formatMetricName(metric || '')}
                    </Typography>
                    <RolesTable search={''} onlyIds={ids} inModal={true} />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button onClick={onClose}>Close</Button>
                    </Box>
                </Box>
            </WideDialog>
        )
    }

    // Generic fallback: use cards on mobile, DataTable on desktop
    if (isMobile) {
        return (
            <WideDialog open={open} onClose={onClose} fullWidth maxWidthPx={560} fullScreen>
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        Metric detail — {formatMetricName(metric || '')}
                    </Typography>
                    <Stack spacing={2}>
                        {rows.map((row: any, idx: number) => (
                            <Card key={idx} variant="outlined">
                                <CardContent>
                                    {cols.map((col) => (
                                        <Box key={col} sx={{ mb: 1 }}>
                                            <Typography variant="caption" color="text.secondary">
                                                {col}
                                            </Typography>
                                            <Typography variant="body2">
                                                {formatValue(row[col])}
                                            </Typography>
                                        </Box>
                                    ))}
                                </CardContent>
                            </Card>
                        ))}
                    </Stack>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button onClick={onClose}>Close</Button>
                    </Box>
                </Box>
            </WideDialog>
        )
    }

    // Desktop: use DataTable
    const columns = cols.map((k) => ({ key: k, label: String(k) }))

    return (
        <>
            <WideDialog open={open} onClose={onClose} fullWidth maxWidthPx={1100}>
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6" sx={{ mb: 1 }}>
                        Metric detail — {formatMetricName(metric || '')}
                    </Typography>
                    <DataTable
                        columns={columns}
                        rows={rows}
                        total={rows.length}
                        page={0}
                        pageSize={Math.max(10, Math.min(50, rows.length))}
                        onPageChange={() => { }}
                        onPageSizeChange={() => { }}
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button onClick={onClose}>Close</Button>
                    </Box>
                </Box>
            </WideDialog>

            {/* Sub-modal for drill-down (engagements, roles, contacts for an org) */}
            {subModalOpen && subModalEntity === 'engagements' && subModalContactId && (
                <WideDialog open={subModalOpen} onClose={() => setSubModalOpen(false)} fullWidth maxWidthPx={900} fullScreen>
                    <Box sx={{ p: 2 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>
                            Engagements
                        </Typography>
                        <EngagementsTable contactId={subModalContactId} inModal={true} />
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                            <Button onClick={() => setSubModalOpen(false)}>Close</Button>
                        </Box>
                    </Box>
                </WideDialog>
            )}

            {subModalOpen && subModalEntity === 'roles' && subModalContactId && (
                <WideDialog open={subModalOpen} onClose={() => setSubModalOpen(false)} fullWidth maxWidthPx={900} fullScreen>
                    <Box sx={{ p: 2 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>
                            Job Applications
                        </Typography>
                        <RolesTable contactId={subModalContactId} inModal={true} />
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                            <Button onClick={() => setSubModalOpen(false)}>Close</Button>
                        </Box>
                    </Box>
                </WideDialog>
            )}

            {subModalOpen && subModalEntity === 'contacts' && subModalOrgId && (
                <WideDialog open={subModalOpen} onClose={() => setSubModalOpen(false)} fullWidth maxWidthPx={900} fullScreen>
                    <Box sx={{ p: 2 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>
                            Contacts
                        </Typography>
                        <ContactsTable orgFilterId={subModalOrgId} inModal={true} />
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                            <Button onClick={() => setSubModalOpen(false)}>Close</Button>
                        </Box>
                    </Box>
                </WideDialog>
            )}
        </>
    )
}
