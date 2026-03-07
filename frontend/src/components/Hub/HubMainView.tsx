import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import ContactsTable from './ContactsTable'
import OrganisationsTable from './OrganisationsTable'
import RolesTable from './RolesTable'
import EngagementsTable from './EngagementsTable'
import MobileContactsList from './MobileContactsList'
import MobileOrganisationsList from './MobileOrganisationsList'
import MobileJobRolesList from './MobileJobRolesList'
import MobileEngagementsList from './MobileEngagementsList'
import MobileDocumentsList from './MobileDocumentsList'
import ResponsiveDataView from '../ResponsiveDataView'
import WideDialog from '../Shared/WideDialog'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Fab from '@mui/material/Fab'
import IconButton from '@mui/material/IconButton'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { useMediaQuery, useTheme } from '@mui/material'
import AppButton from '../Shared/AppButton'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAllContacts, deleteContact, fetchOrganisations, fetchJobRoles, fetchEngagements, deleteOrganisation, deleteJobRole, deleteEngagement, fetchContactTasks, fetchContactDocuments, deleteTask, deleteDocument, fetchDocuments } from '../../api/client'
import QuickCreateModal from './QuickCreateModal'
import DocumentsModal from './DocumentsModal'
import type { Contact } from '../../api/types'

export default function HubMainView({ activeKey, search, recruiterRefId, sectorFilter, heatRange, onlyIds, hideCreateButton, activeOnly }: { activeKey: string; search?: string; recruiterRefId?: number; sectorFilter?: string | null; heatRange?: number[]; onlyIds?: number[]; hideCreateButton?: boolean; activeOnly?: boolean }) {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const theme = useTheme()
    // Use MUI's useMediaQuery with theme breakpoints to detect mobile viewport.
    // This is reactive to resizes and consistent with MUI conventions (md == 900px).
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    // Use standard breakpoint detection only (no developer forcing or debug overlay)
    const [editingContact, setEditingContact] = useState<Contact | null>(null)
    const [editingOrganisation, setEditingOrganisation] = useState<any | null>(null)
    const [editingRole, setEditingRole] = useState<any | null>(null)
    const [editingEngagement, setEditingEngagement] = useState<any | null>(null)
    const [openModal, setOpenModal] = useState(false)
    const [documentsModalOpen, setDocumentsModalOpen] = useState(false)
    const [editingDocument, setEditingDocument] = useState<any | null>(null)

    // Top-level nested quick-create modal state (used when child QuickCreate
    // requests a nested modal to be opened at the top level so it isn't
    // hidden when the requesting modal closes).
    const [topNestedOpen, setTopNestedOpen] = useState(false)
    const [topNestedMode, setTopNestedMode] = useState<any | null>(null)
    const [topNestedEditing, setTopNestedEditing] = useState<any | null>(null)
    const nestedCallbackRef = useRef<((created: any) => void) | null>(null)

    function handleRequestOpenNested(mode: any, payload?: any, onCreated?: (created: any) => void) {
        // Debug: log when a child requests a top-level nested modal
        try {
            // eslint-disable-next-line no-console
            console.debug('HubMainView: handleRequestOpenNested called', { mode, payload })
        } catch (e) { }
        nestedCallbackRef.current = onCreated ?? null
        setTopNestedMode(mode)
        setTopNestedEditing(payload ?? null)
        setTopNestedOpen(true)
    }

    // Modal state for organisation count clicks
    const [countModalOpen, setCountModalOpen] = useState(false)
    const [countModalMode, setCountModalMode] = useState<'contacts' | 'roles' | null>(null)
    const [countModalOrgId, setCountModalOrgId] = useState<number | null>(null)
    const [countModalOrgName, setCountModalOrgName] = useState<string | null>(null)

    // Modal state for contact count clicks (engagements/roles/actions/documents)
    const [contactCountModalOpen, setContactCountModalOpen] = useState(false)
    const [contactCountModalMode, setContactCountModalMode] = useState<'roles' | 'engagements' | 'actions' | 'documents' | null>(null)
    const [contactCountModalContactId, setContactCountModalContactId] = useState<number | null>(null)
    const [contactCountModalContactName, setContactCountModalContactName] = useState<string | null>(null)

    // Fetch all contacts for mobile view (when activeKey is 'contacts')
    const contactsQuery = useQuery(
        ['contactsForMobile', { search, heatRange }],
        () => fetchAllContacts(),
        {
            staleTime: 60000,
            enabled: activeKey === 'contacts' || activeKey === 'recruiters' || activeKey === 'recruiters_met' || activeKey === 'other_contacts_met' || (countModalOpen && countModalMode === 'contacts'),
        }
    )

    // Fetch organisations for mobile view
    const orgsQuery = useQuery(
        ['organisationsForMobile'],
        () => fetchOrganisations(),
        {
            staleTime: 60000,
            enabled: activeKey === 'organisations' || activeKey === 'recruitment_organisations',
        }
    )

    // Fetch roles for mobile view
    const rolesQuery = useQuery(
        ['rolesForMobile'],
        () => fetchJobRoles(),
        {
            staleTime: 60000,
            enabled: activeKey === 'roles' || activeKey === 'active_roles' || (countModalOpen && countModalMode === 'roles') || (contactCountModalOpen && contactCountModalMode === 'roles'),
        }
    )

    // Fetch engagements for mobile view
    const engagementsQuery = useQuery(
        ['engagementsForMobile'],
        () => fetchEngagements(),
        {
            staleTime: 60000,
            enabled: activeKey === 'engagements' || activeKey === 'interviews' || (contactCountModalOpen && contactCountModalMode === 'engagements'),
        }
    )

    // Fetch tasks (actions) for mobile view
    const tasksQuery = useQuery(
        ['tasksForMobile', contactCountModalContactId],
        () => contactCountModalContactId ? fetchContactTasks(contactCountModalContactId) : Promise.resolve([]),
        {
            staleTime: 60000,
            enabled: contactCountModalOpen && contactCountModalMode === 'actions' && contactCountModalContactId != null,
        }
    )

    // Fetch documents for mobile view (contact-specific)
    const documentsQuery = useQuery(
        ['documentsForMobile', contactCountModalContactId],
        () => contactCountModalContactId ? fetchContactDocuments(contactCountModalContactId) : Promise.resolve([]),
        {
            staleTime: 60000,
            enabled: contactCountModalOpen && contactCountModalMode === 'documents' && contactCountModalContactId != null,
        }
    )

    // Fetch all documents for main documents view
    const allDocumentsQuery = useQuery(
        ['allDocuments'],
        () => fetchDocuments(),
        {
            staleTime: 60000,
            enabled: activeKey === 'documents',
        }
    )

    // Refetch queries when modals open
    React.useEffect(() => {
        if (contactCountModalOpen && contactCountModalMode === 'roles') {
            console.log('[BottomPanel] Refetching roles for contact modal')
            rolesQuery.refetch()
        }
    }, [contactCountModalOpen, contactCountModalMode])

    React.useEffect(() => {
        if (contactCountModalOpen && contactCountModalMode === 'engagements') {
            console.log('[BottomPanel] 🔄 REFETCHING ENGAGEMENTS - contactId:', contactCountModalContactId, 'modalOpen:', contactCountModalOpen, 'mode:', contactCountModalMode)
            console.log('[BottomPanel] 🔄 Current engagements data:', engagementsQuery.data?.length, 'engagements')
            engagementsQuery.refetch().then(() => {
                console.log('[BottomPanel] ✅ ENGAGEMENTS REFETCH COMPLETE - now have:', engagementsQuery.data?.length, 'engagements')
            })
        }
    }, [contactCountModalOpen, contactCountModalMode])

    React.useEffect(() => {
        if (countModalOpen && countModalMode === 'contacts') {
            console.log('[BottomPanel] 🔄 REFETCHING CONTACTS - orgId:', countModalOrgId, 'modalOpen:', countModalOpen, 'mode:', countModalMode)
            console.log('[BottomPanel] 🔄 Current contacts data:', contactsQuery.data?.length, 'contacts')
            contactsQuery.refetch().then(() => {
                console.log('[BottomPanel] ✅ CONTACTS REFETCH COMPLETE - now have:', contactsQuery.data?.length, 'contacts')
            })
        }
    }, [countModalOpen, countModalMode])

    React.useEffect(() => {
        if (countModalOpen && countModalMode === 'roles') {
            console.log('[BottomPanel] 🔄 REFETCHING ROLES (ORG) - orgId:', countModalOrgId, 'modalOpen:', countModalOpen, 'mode:', countModalMode)
            console.log('[BottomPanel] 🔄 Current roles data:', rolesQuery.data?.length, 'roles')
            rolesQuery.refetch().then(() => {
                console.log('[BottomPanel] ✅ ROLES (ORG) REFETCH COMPLETE - now have:', rolesQuery.data?.length, 'roles')
            })
        }
    }, [countModalOpen, countModalMode])

    React.useEffect(() => {
        if (contactCountModalOpen && contactCountModalMode === 'actions') {
            console.log('[BottomPanel] 🔄 REFETCHING TASKS - contactId:', contactCountModalContactId)
            tasksQuery.refetch().then(() => {
                console.log('[BottomPanel] ✅ TASKS REFETCH COMPLETE - now have:', tasksQuery.data?.length, 'tasks')
            })
        }
    }, [contactCountModalOpen, contactCountModalMode])

    React.useEffect(() => {
        if (contactCountModalOpen && contactCountModalMode === 'documents') {
            console.log('[BottomPanel] 🔄 REFETCHING DOCUMENTS - contactId:', contactCountModalContactId)
            documentsQuery.refetch().then(() => {
                console.log('[BottomPanel] ✅ DOCUMENTS REFETCH COMPLETE - now have:', documentsQuery.data?.length, 'documents')
            })
        }
    }, [contactCountModalOpen, contactCountModalMode])

    // Filter organisations by sector (for recruitment_organisations vs organisations)
    const filteredOrganisations = React.useMemo(() => {
        let orgs = orgsQuery.data || []
        console.log('[BottomPanel] All organisations:', orgs.length)

        // Apply search filter
        if (search && search.trim()) {
            const searchLower = search.toLowerCase().trim()
            orgs = orgs.filter((org: any) => {
                const name = (org.name || '').toLowerCase()
                const sector = (org.sector_summary || org.sector || '').toLowerCase()
                return name.includes(searchLower) || sector.includes(searchLower)
            })
        }

        // Apply sector filter
        if (sectorFilter && activeKey === 'recruitment_organisations') {
            const sfNorm = String(sectorFilter).toLowerCase().trim()
            console.log('[BottomPanel] Filtering orgs by sector:', sfNorm)
            orgs = orgs.filter((org: any) => {
                const raw = String(org.sector_summary || '').trim()
                const val = raw.toLowerCase()
                if (val === sfNorm) return true
                if (val.includes(sfNorm)) return true
                if (sfNorm.includes('recruit') && val.includes('recruit')) return true
                return false
            })
            console.log('[BottomPanel] Filtered organisations:', orgs.length)
        }

        // If we're showing the main 'Employing organisations' view, exclude recruitment sector orgs
        if (activeKey === 'organisations') {
            const recruitmentSectorString = 'Recruitment & Executive Search'
            const recruitmentSectorAlt = 'Recruitment & Exec Search'
            orgs = orgs.filter((o: any) => {
                const s = String(o.sector_summary || '').trim()
                if (!s) return true // treat blank sector as employing
                const lower = s.toLowerCase()
                return !(lower.includes('recruit') || s === recruitmentSectorString || s === recruitmentSectorAlt)
            })
            console.log('[BottomPanel] After employing filter, organisations:', orgs.length)
        }

        return orgs
    }, [orgsQuery.data, search, sectorFilter, activeKey])

    // Filter roles by status (for active_roles)
    const filteredRoles = React.useMemo(() => {
        let roles = rolesQuery.data || []
        console.log('[BottomPanel] All roles:', roles.length, 'activeKey:', activeKey)

        // Apply search filter
        if (search && search.trim()) {
            const searchLower = search.toLowerCase().trim()
            roles = roles.filter((role: any) => {
                const title = (role.role_title || '').toLowerCase()
                const company = (role.company_name || '').toLowerCase()
                const status = (role.status_name || '').toLowerCase()
                return title.includes(searchLower) || company.includes(searchLower) || status.includes(searchLower)
            })
        }

        if (activeKey === 'active_roles') {
            // Filter to active statuses (Applied, Interview, Yet to apply) - matches Hub.tsx stats card logic
            const activeStatuses = ['applied', 'interview', 'yet to apply']
            roles = roles.filter((role: any) => {
                const status = String(role.status_name || '').toLowerCase()
                return activeStatuses.includes(status)
            })
            console.log('[BottomPanel] Filtered active roles:', roles.length)
        }
        return roles
    }, [rolesQuery.data, search, activeKey])

    // Filter engagements (for interviews)
    const filteredEngagements = React.useMemo(() => {
        let engagements = engagementsQuery.data || []
        console.log('[BottomPanel] All engagements:', engagements.length, 'activeKey:', activeKey)

        // Apply search filter
        if (search && search.trim()) {
            const searchLower = search.toLowerCase().trim()
            engagements = engagements.filter((eng: any) => {
                const contactName = (eng.contact_name || '').toLowerCase()
                const kind = (eng.kind || eng.type || '').toLowerCase()
                const notes = (eng.notes || '').toLowerCase()
                return contactName.includes(searchLower) || kind.includes(searchLower) || notes.includes(searchLower)
            })
        }

        if (activeKey === 'interviews') {
            // Filter to only interview engagements
            engagements = engagements.filter((eng: any) => {
                const kind = String(eng.kind || eng.type || '').toLowerCase()
                return kind.includes('interview')
            })
            console.log('[BottomPanel] Filtered interviews:', engagements.length)
        }
        return engagements
    }, [engagementsQuery.data, search, activeKey])

    // Filter contacts based on search and heat range
    const filteredContacts = React.useMemo(() => {
        let contacts = contactsQuery.data || []

        // Apply search filter
        if (search && search.trim()) {
            const searchLower = search.toLowerCase().trim()
            contacts = contacts.filter((c) => {
                const name = (c.name || `${c.firstname || ''} ${c.lastname || ''}`).toLowerCase()
                const org = (c.current_organization || '').toLowerCase()
                const email = (c.email || '').toLowerCase()
                return name.includes(searchLower) || org.includes(searchLower) || email.includes(searchLower)
            })
        }

        // Apply heat range filter
        if (heatRange && Array.isArray(heatRange) && heatRange.length === 2) {
            const [minDays, maxDays] = heatRange
            const now = Date.now()
            contacts = contacts.filter((c) => {
                if (!c.last_contact_date) return true // Include contacts with no date
                const lastDate = new Date(c.last_contact_date)
                if (isNaN(lastDate.getTime())) return true
                const daysAgo = Math.floor((now - lastDate.getTime()) / (1000 * 60 * 60 * 24))
                return daysAgo >= minDays && daysAgo <= maxDays
            })
        }

        // Apply role type filter for recruiters
        if (activeKey === 'recruiters' || activeKey === 'recruiters_met') {
            contacts = contacts.filter((c) => c.role_type === 'Recruiter')
        }

        // Apply onlyIds filter (for engagement-based views)
        if (onlyIds && onlyIds.length > 0) {
            const idsSet = new Set(onlyIds)
            contacts = contacts.filter((c) => idsSet.has(c.contactid!))
        }

        return contacts
    }, [contactsQuery.data, search, heatRange, activeKey, onlyIds])

    // Determine modal mode based on what's being edited
    const modalMode = React.useMemo(() => {
        if (editingOrganisation) return 'organisation'
        if (editingRole) return 'jobrole'
        if (editingEngagement) return 'engagement'
        return 'contact'
    }, [editingContact, editingOrganisation, editingRole, editingEngagement])

    // Modal handlers for organisation count clicks
    function openOrgCountModal(mode: 'contacts' | 'roles', orgId: number, orgName?: string) {
        setCountModalMode(mode)
        setCountModalOrgId(orgId)
        setCountModalOrgName(orgName || null)
        setCountModalOpen(true)
    }

    function closeCountModal() {
        setCountModalOpen(false)
        setCountModalMode(null)
        setCountModalOrgId(null)
        setCountModalOrgName(null)
    }

    // Modal handlers for contact count clicks (engagements/roles)
    function openContactCountModal(mode: 'roles' | 'engagements' | 'actions' | 'documents', contactId: number, contactName?: string) {
        console.log('[BottomPanel] 🚀 OPENING CONTACT MODAL - mode:', mode, 'contactId:', contactId, 'contactName:', contactName)
        console.log('[BottomPanel] 🚀 Current query states - roles:', rolesQuery.data?.length, 'engagements:', engagementsQuery.data?.length)
        setContactCountModalMode(mode)
        setContactCountModalContactId(contactId)
        setContactCountModalContactName(contactName || null)
        setContactCountModalOpen(true)
    }

    function closeContactCountModal() {
        setContactCountModalOpen(false)
        setContactCountModalMode(null)
        setContactCountModalContactId(null)
        setContactCountModalContactName(null)
    }

    // Action handlers
    const handleEdit = (contact: Contact) => {
        setEditingContact(contact)
        setOpenModal(true)
    }

    const handleDelete = async (contactId: number) => {
        if (!window.confirm('Are you sure you want to delete this contact?')) return
        try {
            await deleteContact(contactId)
            queryClient.invalidateQueries(['contactsList'])
            queryClient.invalidateQueries(['contactsForMobile'])
            queryClient.invalidateQueries(['contactsAllForHeat'])
            queryClient.invalidateQueries(['analyticsSummary'])
        } catch (err) {
            console.error('Delete failed:', err)
            alert('Failed to delete contact')
        }
    }

    const handleEditOrganisation = (orgId: number) => {
        console.log('[BottomPanel] handleEditOrganisation called with orgId:', orgId)
        const org = orgsQuery.data?.find((o: any) => o.orgid === orgId)
        console.log('[BottomPanel] Found organisation:', org)
        if (org) {
            setEditingOrganisation(org)
            setOpenModal(true)
        }
    }

    const handleDeleteOrganisation = async (orgId: number) => {
        console.log('[BottomPanel] handleDeleteOrganisation called with orgId:', orgId)
        if (!window.confirm('Are you sure you want to delete this organisation?')) return
        try {
            await deleteOrganisation(orgId)
            queryClient.invalidateQueries(['organisations'])
            queryClient.invalidateQueries(['organisationsForMobile'])
            queryClient.invalidateQueries(['analyticsSummary'])
        } catch (err) {
            console.error('Delete failed:', err)
            alert('Failed to delete organisation')
        }
    }

    const handleEditRole = (roleId: number) => {
        console.log('[BottomPanel] handleEditRole called with roleId:', roleId)
        const role = rolesQuery.data?.find((r: any) => r.jobid === roleId)
        console.log('[BottomPanel] Found role:', role)
        if (role) {
            setEditingRole(role)
            setOpenModal(true)
        }
    }

    const handleDeleteRole = async (roleId: number) => {
        console.log('[BottomPanel] handleDeleteRole called with roleId:', roleId)
        if (!window.confirm('Are you sure you want to delete this job role?')) return
        try {
            await deleteJobRole(roleId)
            queryClient.invalidateQueries(['jobroles'])
            queryClient.invalidateQueries(['rolesForMobile'])
            queryClient.invalidateQueries(['analyticsSummary'])
        } catch (err) {
            console.error('Delete failed:', err)
            alert('Failed to delete job role')
        }
    }

    const handleEditEngagement = (engagementId: number) => {
        console.log('[BottomPanel] handleEditEngagement called with engagementId:', engagementId)
        const engagement = engagementsQuery.data?.find((e: any) => e.engagementid === engagementId || e.engagementlogid === engagementId)
        console.log('[BottomPanel] Found engagement:', engagement)
        if (engagement) {
            setEditingEngagement(engagement)
            setOpenModal(true)
        }
    }

    const handleDeleteEngagement = async (engagementId: number) => {
        console.log('[BottomPanel] handleDeleteEngagement called with engagementId:', engagementId)
        if (!window.confirm('Are you sure you want to delete this engagement?')) return
        try {
            await deleteEngagement(engagementId)
            queryClient.invalidateQueries(['engagements'])
            queryClient.invalidateQueries(['engagementsForMobile'])
            queryClient.invalidateQueries(['analyticsSummary'])
        } catch (err) {
            console.error('Delete failed:', err)
            alert('Failed to delete engagement')
        }
    }

    const handleEditTask = (taskId: number) => {
        console.log('[BottomPanel] handleEditTask called with taskId:', taskId)
        const task = tasksQuery.data?.find((t: any) => t.taskid === taskId)
        if (task) {
            setEditingContact({ taskid: taskId, ...task } as any)
            setOpenModal(true)
        }
    }

    const handleDeleteTask = async (taskId: number) => {
        console.log('[BottomPanel] handleDeleteTask called with taskId:', taskId)
        if (!window.confirm('Are you sure you want to delete this task?')) return
        try {
            await deleteTask(taskId)
            queryClient.invalidateQueries(['tasksForMobile'])
            tasksQuery.refetch()
        } catch (err) {
            console.error('Delete task failed:', err)
            alert('Failed to delete task')
        }
    }

    const handleEditDocument = (documentId: number) => {
        console.log('[BottomPanel] handleEditDocument called with documentId:', documentId)
        const doc = documentsQuery.data?.find((d: any) => d.documentid === documentId)
        if (doc) {
            setEditingContact({ documentid: documentId, ...doc } as any)
            setOpenModal(true)
        }
    }

    const handleDeleteDocument = async (documentId: number) => {
        console.log('[BottomPanel] handleDeleteDocument called with documentId:', documentId)
        if (!window.confirm('Are you sure you want to delete this document?')) return
        try {
            await deleteDocument(documentId)
            queryClient.invalidateQueries(['documentsForMobile'])
            queryClient.invalidateQueries(['allDocuments'])
            documentsQuery.refetch()
            allDocumentsQuery.refetch()
        } catch (err) {
            console.error('Delete document failed:', err)
            alert('Failed to delete document')
        }
    }

    // Debug: log active panel props
    try {
        // eslint-disable-next-line no-console
        console.debug('[BottomPanel] activeKey, sectorFilter ->', activeKey, sectorFilter)
    } catch (e) { /* ignore */ }

    switch (activeKey) {
        case 'organisations':
        case 'recruitment_organisations':
            return (
                <>
                    <ResponsiveDataView
                        desktopView={<OrganisationsTable search={search} sectorFilter={sectorFilter} hideCreateButton={hideCreateButton} employingOnly={activeKey === 'organisations'} />}
                        mobileView={
                            <>
                                <MobileOrganisationsList
                                    organisations={filteredOrganisations}
                                    loading={orgsQuery.isLoading}
                                    onEdit={handleEditOrganisation}
                                    onDelete={handleDeleteOrganisation}
                                    onContactsClick={(orgId) => {
                                        const org = orgsQuery.data?.find((o: any) => o.orgid === orgId)
                                        openOrgCountModal('contacts', orgId, org?.name)
                                    }}
                                    onRolesClick={(orgId) => {
                                        const org = orgsQuery.data?.find((o: any) => o.orgid === orgId)
                                        openOrgCountModal('roles', orgId, org?.name)
                                    }}
                                />
                                {!hideCreateButton && (
                                    <Fab
                                        color="primary"
                                        aria-label="add organisation"
                                        sx={{ position: 'fixed', bottom: 16, right: 16 }}
                                        onClick={() => {
                                            setEditingOrganisation(null)
                                            setOpenModal(true)
                                        }}
                                    >
                                        <AddIcon />
                                    </Fab>
                                )}
                            </>
                        }
                    />
                    <QuickCreateModal
                        open={openModal}
                        mode={modalMode as any}
                        onRequestOpenNested={handleRequestOpenNested}
                        onClose={() => {
                            setOpenModal(false)
                            setEditingContact(null)
                            setEditingOrganisation(null)
                            setEditingRole(null)
                            setEditingEngagement(null)
                            queryClient.invalidateQueries(['organisations'])
                            queryClient.invalidateQueries(['organisationsForMobile'])
                        }}
                        editing={editingContact || editingOrganisation || editingRole || editingEngagement}
                    />
                    <QuickCreateModal
                        open={topNestedOpen}
                        mode={topNestedMode as any}
                        editing={topNestedEditing}
                        onClose={() => { setTopNestedOpen(false); nestedCallbackRef.current = null }}
                        onSuccess={(created) => { try { if (nestedCallbackRef.current) nestedCallbackRef.current(created) } catch (e) { } nestedCallbackRef.current = null; setTopNestedOpen(false); }}
                    />
                    <WideDialog open={countModalOpen} onClose={closeCountModal} fullWidth maxWidthPx={1400}>
                        <DialogTitle>
                            {countModalOrgName ? `${countModalOrgName} - ${countModalMode === 'contacts' ? 'Contacts' : 'Roles'}` : (countModalMode === 'contacts' ? 'Contacts' : 'Roles')}
                        </DialogTitle>
                        <DialogContent dividers>
                            {countModalMode === 'contacts' ? (
                                <>
                                    <ResponsiveDataView
                                        desktopView={<ContactsTable key={`contacts-${activeKey}`} orgFilterId={countModalOrgId ?? undefined} hideCreateButton inModal activeOnly={activeOnly} />}
                                        mobileView={
                                            <MobileContactsList
                                                contacts={contactsQuery.data?.filter((c: any) => c.current_organization_id === countModalOrgId || c.currentorgid === countModalOrgId) || []}
                                                loading={contactsQuery.isLoading}
                                                heatThresholds={{ warm: 30, cold: 90 }}
                                                onEdit={(contactId) => {
                                                    const contact = contactsQuery.data?.find((c: any) => c.contactid === contactId)
                                                    if (contact) handleEdit(contact)
                                                }}
                                                onDelete={handleDelete}
                                            />
                                        }
                                    />
                                    {isMobile && (
                                        <Fab
                                            color="primary"
                                            aria-label="add contact"
                                            sx={{ position: 'fixed', bottom: 80, right: 16 }}
                                            onClick={() => {
                                                setEditingContact({ currentorgid: countModalOrgId } as any)
                                                setOpenModal(true)
                                            }}
                                        >
                                            <AddIcon />
                                        </Fab>
                                    )}
                                </>
                            ) : countModalMode === 'roles' ? (
                                <>
                                    <ResponsiveDataView
                                        desktopView={<RolesTable orgFilterId={countModalOrgId ?? undefined} hideCreateButton inModal />}
                                        mobileView={
                                            <MobileJobRolesList
                                                roles={rolesQuery.data?.filter((r: any) => r.companyorgid === countModalOrgId) || []}
                                                loading={rolesQuery.isLoading}
                                                onEdit={handleEditRole}
                                                onDelete={handleDeleteRole}
                                            />
                                        }
                                    />
                                    {isMobile && (
                                        <Fab
                                            color="primary"
                                            aria-label="add role"
                                            sx={{ position: 'fixed', bottom: 80, right: 16 }}
                                            onClick={() => {
                                                setEditingRole({ companyorgid: countModalOrgId } as any)
                                                setOpenModal(true)
                                            }}
                                        >
                                            <AddIcon />
                                        </Fab>
                                    )}
                                </>
                            ) : null}
                        </DialogContent>
                        <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                            <AppButton colorScheme="white" onClick={closeCountModal}>Close</AppButton>
                        </DialogActions>
                    </WideDialog>

                </>
            )
        case 'roles':
        case 'active_roles':
            return (
                <>
                    <ResponsiveDataView
                        desktopView={<RolesTable search={search} statusFilter={activeKey === 'active_roles' ? ['applied', 'interview', 'yet to apply'] : undefined} hideCreateButton={hideCreateButton} />}
                        mobileView={
                            <>
                                <MobileJobRolesList roles={filteredRoles} loading={rolesQuery.isLoading} onEdit={handleEditRole} onDelete={handleDeleteRole} />
                                {!hideCreateButton && (
                                    <Fab
                                        color="primary"
                                        aria-label="add role"
                                        sx={{ position: 'fixed', bottom: 16, right: 16 }}
                                        onClick={() => {
                                            setEditingRole(null)
                                            setOpenModal(true)
                                        }}
                                    >
                                        <AddIcon />
                                    </Fab>
                                )}
                            </>
                        }
                    />
                    <QuickCreateModal
                        open={openModal}
                        mode={modalMode as any}
                        onRequestOpenNested={handleRequestOpenNested}
                        onClose={() => {
                            setOpenModal(false)
                            setEditingContact(null)
                            setEditingOrganisation(null)
                            setEditingRole(null)
                            setEditingEngagement(null)
                            queryClient.invalidateQueries(['jobroles'])
                            queryClient.invalidateQueries(['rolesForMobile'])
                        }}
                        editing={editingContact || editingOrganisation || editingRole || editingEngagement}
                    />
                    <QuickCreateModal
                        open={topNestedOpen}
                        mode={topNestedMode as any}
                        editing={topNestedEditing}
                        onClose={() => { setTopNestedOpen(false); nestedCallbackRef.current = null }}
                        onSuccess={(created) => { try { if (nestedCallbackRef.current) nestedCallbackRef.current(created) } catch (e) { } nestedCallbackRef.current = null; setTopNestedOpen(false); }}
                    />
                </>
            )
        case 'engagements':
        case 'interviews':
            return (
                <>
                    <ResponsiveDataView
                        desktopView={<EngagementsTable search={search} showCreate={!hideCreateButton} typeFilter={activeKey === 'interviews' ? ['interview'] : undefined} />}
                        mobileView={
                            <>
                                <MobileEngagementsList engagements={filteredEngagements} loading={engagementsQuery.isLoading} onEdit={handleEditEngagement} onDelete={handleDeleteEngagement} />
                                {!hideCreateButton && (
                                    <Fab
                                        color="primary"
                                        aria-label="add engagement"
                                        sx={{ position: 'fixed', bottom: 16, right: 16 }}
                                        onClick={() => {
                                            setEditingEngagement(null)
                                            setOpenModal(true)
                                        }}
                                    >
                                        <AddIcon />
                                    </Fab>
                                )}
                            </>
                        }
                    />
                    <QuickCreateModal
                        open={openModal}
                        mode={modalMode as any}
                        onRequestOpenNested={handleRequestOpenNested}
                        onClose={() => {
                            setOpenModal(false)
                            setEditingContact(null)
                            setEditingOrganisation(null)
                            setEditingRole(null)
                            setEditingEngagement(null)
                            queryClient.invalidateQueries(['engagements'])
                            queryClient.invalidateQueries(['engagementsForMobile'])
                        }}
                        editing={editingContact || editingOrganisation || editingRole || editingEngagement}
                    />
                    <QuickCreateModal
                        open={topNestedOpen}
                        mode={topNestedMode as any}
                        editing={topNestedEditing}
                        onClose={() => { setTopNestedOpen(false); nestedCallbackRef.current = null }}
                        onSuccess={(created) => { try { if (nestedCallbackRef.current) nestedCallbackRef.current(created) } catch (e) { } nestedCallbackRef.current = null; setTopNestedOpen(false); }}
                    />
                </>
            )
        case 'recruiters':
            return (
                <>
                    <ResponsiveDataView
                        desktopView={<ContactsTable key={`contacts-${activeKey}`} search={search} roleTypeFilterId={recruiterRefId} heatRange={heatRange} hideCreateButton={hideCreateButton} initialSortKey={'last_activity_date'} initialSortDir={'desc'} activeOnly={activeOnly} />}
                        mobileView={
                            <>
                                <MobileContactsList
                                    contacts={filteredContacts}
                                    loading={contactsQuery.isLoading}
                                    heatThresholds={{ warm: 30, cold: 90 }}
                                    onEdit={(contactId) => handleEdit(filteredContacts.find(c => c.contactid === contactId)!)}
                                    onDelete={handleDelete}
                                    onEngagementsClick={(contactId) => {
                                        const contact = filteredContacts.find(c => c.contactid === contactId)
                                        openContactCountModal('engagements', contactId, contact?.name ?? undefined)
                                    }}
                                    onRolesClick={(contactId) => {
                                        const contact = filteredContacts.find(c => c.contactid === contactId)
                                        openContactCountModal('roles', contactId, contact?.name ?? undefined)
                                    }}
                                    onActionsClick={(contactId) => {
                                        const contact = filteredContacts.find(c => c.contactid === contactId); openContactCountModal('actions', contactId, contact?.name ?? undefined)
                                    }}
                                    onDocumentsClick={(contactId) => {
                                        const contact = filteredContacts.find(c => c.contactid === contactId); openContactCountModal('documents', contactId, contact?.name ?? undefined)
                                    }}
                                />
                                {!hideCreateButton && (
                                    <Fab
                                        color="primary"
                                        aria-label="add contact"
                                        sx={{ position: 'fixed', bottom: 16, right: 16 }}
                                        onClick={() => {
                                            setEditingContact(null)
                                            setOpenModal(true)
                                        }}
                                    >
                                        <AddIcon />
                                    </Fab>
                                )}
                            </>
                        }
                    />
                    <QuickCreateModal
                        open={openModal}
                        mode={modalMode as any}
                        onRequestOpenNested={handleRequestOpenNested}
                        onClose={() => {
                            setOpenModal(false)
                            setEditingContact(null)
                            queryClient.invalidateQueries(['contactsList'])
                        }}
                        editing={editingContact}
                    />
                    <QuickCreateModal
                        open={topNestedOpen}
                        mode={topNestedMode as any}
                        editing={topNestedEditing}
                        onClose={() => { setTopNestedOpen(false); nestedCallbackRef.current = null }}
                        onSuccess={(created) => { try { if (nestedCallbackRef.current) nestedCallbackRef.current(created) } catch (e) { } nestedCallbackRef.current = null; setTopNestedOpen(false); }}
                    />
                </>
            )
        case 'recruiters_met':
            return (
                <>
                    <ResponsiveDataView
                        desktopView={<ContactsTable key={`contacts-${activeKey}`} search={search} roleTypeFilterId={recruiterRefId} heatRange={heatRange} onlyIds={onlyIds} hideCreateButton={hideCreateButton} initialSortKey={'last_activity_date'} initialSortDir={'desc'} activeOnly={activeOnly} />}
                        mobileView={
                            <>
                                <MobileContactsList
                                    contacts={filteredContacts}
                                    loading={contactsQuery.isLoading}
                                    heatThresholds={{ warm: 30, cold: 90 }}
                                    onEdit={(contactId) => handleEdit(filteredContacts.find(c => c.contactid === contactId)!)}
                                    onDelete={handleDelete}
                                    onEngagementsClick={(contactId) => {
                                        const contact = filteredContacts.find(c => c.contactid === contactId)
                                        openContactCountModal('engagements', contactId, contact?.name ?? undefined)
                                    }}
                                    onRolesClick={(contactId) => {
                                        const contact = filteredContacts.find(c => c.contactid === contactId)
                                        openContactCountModal('roles', contactId, contact?.name ?? undefined)
                                    }}
                                    onActionsClick={(contactId) => {
                                        const contact = filteredContacts.find(c => c.contactid === contactId); openContactCountModal('actions', contactId, contact?.name ?? undefined)
                                    }}
                                    onDocumentsClick={(contactId) => {
                                        const contact = filteredContacts.find(c => c.contactid === contactId); openContactCountModal('documents', contactId, contact?.name ?? undefined)
                                    }}
                                />
                                {!hideCreateButton && (
                                    <Fab
                                        color="primary"
                                        aria-label="add contact"
                                        sx={{ position: 'fixed', bottom: 16, right: 16 }}
                                        onClick={() => {
                                            setEditingContact(null)
                                            setOpenModal(true)
                                        }}
                                    >
                                        <AddIcon />
                                    </Fab>
                                )}
                            </>
                        }
                    />
                    <QuickCreateModal
                        open={openModal}
                        mode={modalMode as any}
                        onRequestOpenNested={handleRequestOpenNested}
                        onClose={() => {
                            setOpenModal(false)
                            setEditingContact(null)
                            queryClient.invalidateQueries(['contactsList'])
                        }}
                        editing={editingContact}
                    />
                    <QuickCreateModal
                        open={topNestedOpen}
                        mode={topNestedMode as any}
                        editing={topNestedEditing}
                        onClose={() => { setTopNestedOpen(false); nestedCallbackRef.current = null }}
                        onSuccess={(created) => { try { if (nestedCallbackRef.current) nestedCallbackRef.current(created) } catch (e) { } nestedCallbackRef.current = null; setTopNestedOpen(false); }}
                    />
                </>
            )
        case 'other_contacts_met':
            return (
                <>
                    <ResponsiveDataView
                        desktopView={<ContactsTable key={`contacts-${activeKey}`} search={search} heatRange={heatRange} onlyIds={onlyIds} excludeRoleTypeId={recruiterRefId} hideCreateButton={hideCreateButton} initialSortKey={'last_activity_date'} initialSortDir={'desc'} activeOnly={activeOnly} />}
                        mobileView={
                            <>
                                <MobileContactsList
                                    contacts={filteredContacts}
                                    loading={contactsQuery.isLoading}
                                    heatThresholds={{ warm: 30, cold: 90 }}
                                    onEdit={(contactId) => handleEdit(filteredContacts.find(c => c.contactid === contactId)!)}
                                    onDelete={handleDelete}
                                    onEngagementsClick={(contactId) => {
                                        const contact = filteredContacts.find(c => c.contactid === contactId)
                                        openContactCountModal('engagements', contactId, contact?.name ?? undefined)
                                    }}
                                    onRolesClick={(contactId) => {
                                        const contact = filteredContacts.find(c => c.contactid === contactId)
                                        openContactCountModal('roles', contactId, contact?.name ?? undefined)
                                    }}
                                    onActionsClick={(contactId) => {
                                        const contact = filteredContacts.find(c => c.contactid === contactId); openContactCountModal('actions', contactId, contact?.name ?? undefined)
                                    }}
                                    onDocumentsClick={(contactId) => {
                                        const contact = filteredContacts.find(c => c.contactid === contactId); openContactCountModal('documents', contactId, contact?.name ?? undefined)
                                    }}
                                />
                                {!hideCreateButton && (
                                    <Fab
                                        color="primary"
                                        aria-label="add contact"
                                        sx={{ position: 'fixed', bottom: 16, right: 16 }}
                                        onClick={() => {
                                            setEditingContact(null)
                                            setOpenModal(true)
                                        }}
                                    >
                                        <AddIcon />
                                    </Fab>
                                )}
                            </>
                        }
                    />
                    <QuickCreateModal
                        open={openModal}
                        onRequestOpenNested={handleRequestOpenNested}
                        onClose={() => {
                            setOpenModal(false)
                            setEditingContact(null)
                            setEditingOrganisation(null)
                            setEditingRole(null)
                            setEditingEngagement(null)
                            queryClient.invalidateQueries(['contactsList'])
                            queryClient.invalidateQueries(['contactsForMobile'])
                            queryClient.invalidateQueries(['organisations'])
                            queryClient.invalidateQueries(['organisationsForMobile'])
                            queryClient.invalidateQueries(['jobroles'])
                            queryClient.invalidateQueries(['rolesForMobile'])
                            queryClient.invalidateQueries(['engagements'])
                            queryClient.invalidateQueries(['engagementsForMobile'])
                        }}
                        editing={editingContact || editingOrganisation || editingRole || editingEngagement}
                    />
                    <QuickCreateModal
                        open={topNestedOpen}
                        mode={topNestedMode as any}
                        editing={topNestedEditing}
                        onClose={() => { setTopNestedOpen(false); nestedCallbackRef.current = null }}
                        onSuccess={(created) => { try { if (nestedCallbackRef.current) nestedCallbackRef.current(created) } catch (e) { } nestedCallbackRef.current = null; setTopNestedOpen(false); }}
                    />
                </>
            )
        case 'documents':
            return (
                <>
                    <ResponsiveDataView
                        desktopView={
                            <Box sx={{ p: 2 }}>
                                <Typography variant="h6">Documents</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    View documents page for full functionality
                                </Typography>
                            </Box>
                        }
                        mobileView={
                            <MobileDocumentsList
                                documents={allDocumentsQuery.data || []}
                                loading={allDocumentsQuery.isLoading}
                                onDocumentClick={(documentId) => {
                                    const doc = allDocumentsQuery.data?.find((d: any) => d.documentid === documentId)
                                    if (doc) {
                                        setEditingDocument(doc)
                                        setDocumentsModalOpen(true)
                                    }
                                }}
                            />
                        }
                    />
                </>
            )
        case 'contacts':
        default:
            return (
                <>
                    <ResponsiveDataView
                        desktopView={<ContactsTable key={`contacts-${activeKey}`} search={search} heatRange={heatRange} hideCreateButton={hideCreateButton} initialSortKey={'last_activity_date'} initialSortDir={'desc'} activeOnly={activeOnly} />}
                        mobileView={
                            <>
                                <MobileContactsList
                                    contacts={filteredContacts}
                                    loading={contactsQuery.isLoading}
                                    heatThresholds={{ warm: 30, cold: 90 }}
                                    onEdit={(contactId) => handleEdit(filteredContacts.find(c => c.contactid === contactId)!)}
                                    onDelete={handleDelete}
                                    onEngagementsClick={(contactId) => {
                                        const contact = filteredContacts.find(c => c.contactid === contactId)
                                        openContactCountModal('engagements', contactId, contact?.name ?? undefined)
                                    }}
                                    onRolesClick={(contactId) => {
                                        const contact = filteredContacts.find(c => c.contactid === contactId)
                                        openContactCountModal('roles', contactId, contact?.name ?? undefined)
                                    }}
                                    onActionsClick={(contactId) => {
                                        const contact = filteredContacts.find(c => c.contactid === contactId); openContactCountModal('actions', contactId, contact?.name ?? undefined)
                                    }}
                                    onDocumentsClick={(contactId) => {
                                        const contact = filteredContacts.find(c => c.contactid === contactId); openContactCountModal('documents', contactId, contact?.name ?? undefined)
                                    }}
                                />
                                {!hideCreateButton && (
                                    <Fab
                                        color="primary"
                                        aria-label="add contact"
                                        sx={{ position: 'fixed', bottom: 16, right: 16 }}
                                        onClick={() => {
                                            setEditingContact(null)
                                            setOpenModal(true)
                                        }}
                                    >
                                        <AddIcon />
                                    </Fab>
                                )}
                            </>
                        }
                    />
                    <QuickCreateModal
                        open={openModal}
                        mode={modalMode as any}
                        onRequestOpenNested={handleRequestOpenNested}
                        onClose={() => {
                            setOpenModal(false)
                            setEditingContact(null)
                            setEditingOrganisation(null)
                            setEditingRole(null)
                            setEditingEngagement(null)
                            queryClient.invalidateQueries(['contactsList'])
                            queryClient.invalidateQueries(['contactsForMobile'])
                            queryClient.invalidateQueries(['organisations'])
                            queryClient.invalidateQueries(['organisationsForMobile'])
                            queryClient.invalidateQueries(['jobroles'])
                            queryClient.invalidateQueries(['rolesForMobile'])
                            queryClient.invalidateQueries(['engagements'])
                            queryClient.invalidateQueries(['engagementsForMobile'])
                        }}
                        editing={editingContact || editingOrganisation || editingRole || editingEngagement}
                    />
                    <QuickCreateModal
                        open={topNestedOpen}
                        mode={topNestedMode as any}
                        editing={topNestedEditing}
                        onClose={() => { setTopNestedOpen(false); nestedCallbackRef.current = null }}
                        onSuccess={(created) => { try { if (nestedCallbackRef.current) nestedCallbackRef.current(created) } catch (e) { } nestedCallbackRef.current = null; setTopNestedOpen(false); }}
                    />
                    <WideDialog open={contactCountModalOpen} onClose={closeContactCountModal} fullWidth maxWidthPx={1400}>
                        <DialogTitle>
                            {contactCountModalContactName ? `${contactCountModalContactName} - ${contactCountModalMode === 'roles' ? 'Applications' :
                                contactCountModalMode === 'engagements' ? 'Engagements' :
                                    contactCountModalMode === 'actions' ? 'Actions' :
                                        contactCountModalMode === 'documents' ? 'Documents' : ''
                                }` : (
                                contactCountModalMode === 'roles' ? 'Applications' :
                                    contactCountModalMode === 'engagements' ? 'Engagements' :
                                        contactCountModalMode === 'actions' ? 'Actions' :
                                            contactCountModalMode === 'documents' ? 'Documents' : ''
                            )}
                        </DialogTitle>
                        <DialogContent dividers>
                            {contactCountModalMode === 'engagements' ? (
                                <>
                                    {(() => {
                                        const filtered = engagementsQuery.data?.filter((e: any) =>
                                            e.contactid === contactCountModalContactId
                                        ) || []
                                        console.log('[BottomPanel] 📊 RENDERING ENGAGEMENTS MODAL - contactId:', contactCountModalContactId, 'total:', engagementsQuery.data?.length, 'filtered:', filtered.length, 'data:', filtered)
                                        return null
                                    })()}
                                    <ResponsiveDataView
                                        desktopView={<EngagementsTable contactId={contactCountModalContactId ?? undefined} showCreate={!hideCreateButton} />}
                                        mobileView={
                                            <MobileEngagementsList
                                                engagements={engagementsQuery.data?.filter((e: any) =>
                                                    e.contactid === contactCountModalContactId
                                                ) || []}
                                                loading={engagementsQuery.isLoading}
                                                onEdit={handleEditEngagement}
                                                onDelete={handleDeleteEngagement}
                                            />
                                        }
                                    />
                                    {isMobile && (
                                        <Fab
                                            color="primary"
                                            aria-label="add engagement"
                                            sx={{ position: 'fixed', bottom: 80, right: 16 }}
                                            onClick={() => {
                                                setEditingEngagement({ contactid: contactCountModalContactId } as any)
                                                setOpenModal(true)
                                            }}
                                        >
                                            <AddIcon />
                                        </Fab>
                                    )}
                                </>
                            ) : contactCountModalMode === 'roles' ? (
                                <>
                                    {(() => {
                                        const filtered = rolesQuery.data?.filter((r: any) => r.contactid === contactCountModalContactId) || []
                                        console.log('[BottomPanel] 📊 RENDERING ROLES MODAL - contactId:', contactCountModalContactId, 'total:', rolesQuery.data?.length, 'filtered:', filtered.length, 'data:', filtered)
                                        return null
                                    })()}
                                    <ResponsiveDataView
                                        desktopView={<RolesTable contactId={contactCountModalContactId ?? undefined} hideCreateButton />}
                                        mobileView={
                                            <MobileJobRolesList
                                                roles={(() => {
                                                    const filtered = rolesQuery.data?.filter((r: any) => r.contactid === contactCountModalContactId) || []
                                                    console.log('[BottomPanel] 🎯 PASSING ROLES TO COMPONENT - filtered:', filtered.length, 'data:', filtered)
                                                    return filtered
                                                })()}
                                                loading={rolesQuery.isLoading}
                                                onEdit={handleEditRole}
                                                onDelete={handleDeleteRole}
                                            />
                                        }
                                    />
                                    {isMobile && (
                                        <Fab
                                            color="primary"
                                            aria-label="add role"
                                            sx={{ position: 'fixed', bottom: 80, right: 16 }}
                                            onClick={() => {
                                                setEditingRole({ contactid: contactCountModalContactId } as any)
                                                setOpenModal(true)
                                            }}
                                        >
                                            <AddIcon />
                                        </Fab>
                                    )}
                                </>
                            ) : contactCountModalMode === 'actions' ? (
                                <Box sx={{ p: 2, position: 'relative' }}>
                                    {tasksQuery.isLoading ? (
                                        <Typography>Loading...</Typography>
                                    ) : (
                                        <>
                                            {tasksQuery.data && tasksQuery.data.length > 0 ? (
                                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                    {tasksQuery.data.map((task: any) => (
                                                        <Paper key={task.taskid} sx={{ p: 2 }}>
                                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                <Box sx={{ flex: 1 }}>
                                                                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>{task.taskname || task.name}</Typography>
                                                                    {task.duedate && <Typography variant="body2" color="text.secondary">Due: {new Date(task.duedate).toLocaleDateString()}</Typography>}
                                                                    {task.notes && <Typography variant="body2" sx={{ mt: 1 }}>{task.notes}</Typography>}
                                                                </Box>
                                                                <Box>
                                                                    <IconButton size="small" onClick={() => handleEditTask(task.taskid)}><EditIcon fontSize="small" /></IconButton>
                                                                    <IconButton size="small" onClick={() => handleDeleteTask(task.taskid)}><DeleteIcon fontSize="small" /></IconButton>
                                                                </Box>
                                                            </Box>
                                                        </Paper>
                                                    ))}
                                                </Box>
                                            ) : (
                                                <Typography color="text.secondary">No actions found</Typography>
                                            )}
                                            {isMobile && (
                                                <Fab
                                                    color="primary"
                                                    aria-label="add action"
                                                    sx={{ position: 'fixed', bottom: 80, right: 16 }}
                                                    onClick={() => {
                                                        // TODO: Open task create modal with contactId prefilled
                                                        console.log('Add task for contact:', contactCountModalContactId)
                                                    }}
                                                >
                                                    <AddIcon />
                                                </Fab>
                                            )}
                                        </>
                                    )}
                                </Box>
                            ) : contactCountModalMode === 'documents' ? (
                                <Box sx={{ p: 2, position: 'relative' }}>
                                    {documentsQuery.isLoading ? (
                                        <Typography>Loading...</Typography>
                                    ) : (
                                        <>
                                            {documentsQuery.data && documentsQuery.data.length > 0 ? (
                                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                    {documentsQuery.data.map((doc: any) => (
                                                        <Paper key={doc.documentid} sx={{ p: 2 }}>
                                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                <Box sx={{ flex: 1 }}>
                                                                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>{doc.documentname}</Typography>
                                                                    {doc.documentdescription && <Typography variant="body2" sx={{ mt: 1 }}>{doc.documentdescription}</Typography>}
                                                                    {doc.uploaddate && <Typography variant="body2" color="text.secondary">Uploaded: {new Date(doc.uploaddate).toLocaleDateString()}</Typography>}
                                                                </Box>
                                                                <Box>
                                                                    <IconButton size="small" onClick={() => handleEditDocument(doc.documentid)}><EditIcon fontSize="small" /></IconButton>
                                                                    <IconButton size="small" onClick={() => handleDeleteDocument(doc.documentid)}><DeleteIcon fontSize="small" /></IconButton>
                                                                </Box>
                                                            </Box>
                                                        </Paper>
                                                    ))}
                                                </Box>
                                            ) : (
                                                <Typography color="text.secondary">No documents found</Typography>
                                            )}
                                            {isMobile && (
                                                <Fab
                                                    color="primary"
                                                    aria-label="add document"
                                                    sx={{ position: 'fixed', bottom: 80, right: 16 }}
                                                    onClick={() => {
                                                        // TODO: Open document upload modal with contactId prefilled
                                                        console.log('Add document for contact:', contactCountModalContactId)
                                                    }}
                                                >
                                                    <AddIcon />
                                                </Fab>
                                            )}
                                        </>
                                    )}
                                </Box>
                            ) : null}
                        </DialogContent>
                        <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                            <AppButton colorScheme="white" onClick={closeContactCountModal}>Close</AppButton>
                        </DialogActions>
                    </WideDialog>

                    {/* Main view FABs - positioned outside all containers */}
                    {isMobile && activeKey === 'organisations' && (
                        <Fab
                            color="primary"
                            aria-label="add organisation"
                            sx={{ position: 'fixed', bottom: 80, right: 16, zIndex: 1300 }}
                            onClick={() => {
                                setEditingOrganisation(null)
                                setOpenModal(true)
                            }}
                        >
                            <AddIcon />
                        </Fab>
                    )}
                    {isMobile && (activeKey === 'roles' || activeKey === 'active_roles') && (
                        <Fab
                            color="primary"
                            aria-label="add role"
                            sx={{ position: 'fixed', bottom: 80, right: 16, zIndex: 1300 }}
                            onClick={() => {
                                setEditingRole(null)
                                setOpenModal(true)
                            }}
                        >
                            <AddIcon />
                        </Fab>
                    )}
                    {isMobile && (activeKey === 'engagements' || activeKey === 'interviews') && (
                        <Fab
                            color="primary"
                            aria-label="add engagement"
                            sx={{ position: 'fixed', bottom: 80, right: 16, zIndex: 1300 }}
                            onClick={() => {
                                setEditingEngagement(null)
                                setOpenModal(true)
                            }}
                        >
                            <AddIcon />
                        </Fab>
                    )}
                    {isMobile && (activeKey === 'contacts' || activeKey === 'recruiters' || activeKey === 'recruiters_met' || activeKey === 'other_contacts_met') && (
                        <Fab
                            color="primary"
                            aria-label="add contact"
                            sx={{ position: 'fixed', bottom: 80, right: 16, zIndex: 1300 }}
                            onClick={() => {
                                setEditingContact(null)
                                setOpenModal(true)
                            }}
                        >
                            <AddIcon />
                        </Fab>
                    )}

                    {/* Modal FABs for org count modal */}
                    {isMobile && countModalOpen && countModalMode === 'contacts' && (
                        <Fab
                            color="primary"
                            aria-label="add contact"
                            sx={{ position: 'fixed', bottom: 80, right: 16, zIndex: 1300 }}
                            onClick={() => {
                                setEditingContact({ currentorgid: countModalOrgId } as any)
                                setOpenModal(true)
                            }}
                        >
                            <AddIcon />
                        </Fab>
                    )}
                    {isMobile && countModalOpen && countModalMode === 'roles' && (
                        <Fab
                            color="primary"
                            aria-label="add role"
                            sx={{ position: 'fixed', bottom: 80, right: 16, zIndex: 1300 }}
                            onClick={() => {
                                setEditingRole({ companyorgid: countModalOrgId } as any)
                                setOpenModal(true)
                            }}
                        >
                            <AddIcon />
                        </Fab>
                    )}

                    {/* Modal FABs for contact count modal */}
                    {isMobile && contactCountModalOpen && contactCountModalMode === 'engagements' && (
                        <Fab
                            color="primary"
                            aria-label="add engagement"
                            sx={{ position: 'fixed', bottom: 80, right: 16, zIndex: 1300 }}
                            onClick={() => {
                                setEditingEngagement({ contactid: contactCountModalContactId } as any)
                                setOpenModal(true)
                            }}
                        >
                            <AddIcon />
                        </Fab>
                    )}
                    {isMobile && contactCountModalOpen && contactCountModalMode === 'roles' && (
                        <Fab
                            color="primary"
                            aria-label="add role"
                            sx={{ position: 'fixed', bottom: 80, right: 16, zIndex: 1300 }}
                            onClick={() => {
                                setEditingRole({ contactid: contactCountModalContactId } as any)
                                setOpenModal(true)
                            }}
                        >
                            <AddIcon />
                        </Fab>
                    )}
                    {isMobile && contactCountModalOpen && contactCountModalMode === 'actions' && (
                        <Fab
                            color="primary"
                            aria-label="add action"
                            sx={{ position: 'fixed', bottom: 80, right: 16, zIndex: 1300 }}
                            onClick={() => {
                                console.log('[HubMainView] Add action clicked for contact:', contactCountModalContactId)
                            }}
                        >
                            <AddIcon />
                        </Fab>
                    )}
                    {isMobile && contactCountModalOpen && contactCountModalMode === 'documents' && (
                        <Fab
                            color="primary"
                            aria-label="add document"
                            sx={{ position: 'fixed', bottom: 80, right: 16, zIndex: 1300 }}
                            onClick={() => {
                                setEditingDocument(null)
                                setDocumentsModalOpen(true)
                            }}
                        >
                            <AddIcon />
                        </Fab>
                    )}

                    {/* Main documents view FAB */}
                    {isMobile && activeKey === 'documents' && (
                        <Fab
                            color="primary"
                            aria-label="add document"
                            sx={{ position: 'fixed', bottom: 80, right: 16, zIndex: 1300 }}
                            onClick={() => {
                                setEditingDocument(null)
                                setDocumentsModalOpen(true)
                            }}
                        >
                            <AddIcon />
                        </Fab>
                    )}

                    {/* Documents modal */}
                    <DocumentsModal
                        open={documentsModalOpen}
                        onClose={() => {
                            setDocumentsModalOpen(false)
                            setEditingDocument(null)
                        }}
                        onSaved={() => {
                            queryClient.invalidateQueries(['allDocuments'])
                            queryClient.invalidateQueries(['documentsForMobile'])
                            allDocumentsQuery.refetch()
                            documentsQuery.refetch()
                        }}
                        documentId={editingDocument?.documentid}
                        initialData={editingDocument}
                        contactId={contactCountModalContactId}
                    />
                </>
            )
    }
}
