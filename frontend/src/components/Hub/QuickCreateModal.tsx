import React, { useState, useEffect, useMemo, useRef } from 'react'
import Box from '@mui/material/Box'
import Dialog from '../Shared/WideDialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import AppButton from '../Shared/AppButton'
import TextField from '@mui/material/TextField'
import DatePicker from '../Shared/DatePicker'
import OutlinedInput from '@mui/material/OutlinedInput'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import InputLabel from '@mui/material/InputLabel'
import FormControl from '@mui/material/FormControl'
import FormHelperText from '@mui/material/FormHelperText'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import IconButton from '@mui/material/IconButton'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import Autocomplete from '@mui/material/Autocomplete'
import CircularProgress from '@mui/material/CircularProgress'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { createContact, createOrganisation, createJobRole, fetchOrganisations, fetchContacts, fetchAllContacts, fetchReferenceData, updateContact, updateOrganisation, updateJobRole, updateEngagement, fetchSectors, fetchContactTargets, addContactTarget, removeContactTarget, fetchDocuments, fetchContactDocuments, attachDocumentToContact, detachDocumentFromContact, fetchTasks, addTaskTarget, fetchJobRoleDocuments, attachDocumentToJobRole, detachDocumentFromJobRole, fetchLeadsAll, setLeadReviewOutcome, prefillLead } from '../../api/client'
import * as apiClient from '../../api/client'
import { toNumberOrNull, resolveOptionById, optionEqualsById } from '../../utils/pickerUtils'

type Mode = 'contact' | 'organisation' | 'jobrole' | 'engagement'

export default function QuickCreateModal({ open, onClose, mode = 'contact', editing, onSuccess, initialRoleTypeId, lockRoleType, hideCreateAndAddEngagement, hideAddToActionPlan, onRequestOpenNested }: { open: boolean; onClose: () => void; mode?: Mode; editing?: any; onSuccess?: (created: any) => Promise<boolean | void> | boolean | void; initialRoleTypeId?: number | null; lockRoleType?: boolean; hideCreateAndAddEngagement?: boolean; hideAddToActionPlan?: boolean; onRequestOpenNested?: (mode: Mode, payload?: any, onCreated?: (created: any) => void) => void }) {

    const qc = useQueryClient()

    // Robust invalidation for any queries whose key starts with 'contactsList'.
    // Some components use query keys like ['contactsList', { applicantId, ... }]
    // so use a predicate invalidation to ensure all variants refresh.
    function invalidateContactsList() {
        try {
            qc.invalidateQueries({ predicate: (q: any) => Array.isArray(q.queryKey) && q.queryKey[0] === 'contactsList' })
        } catch (e) {
            try { qc.invalidateQueries(['contactsList']) } catch (e) { /* ignore */ }
        }
    }
    const [name, setName] = useState('')
    // `incomingCompanyOnOpen` is the read-only incoming company value captured
    // when the modal opens. It is not mutated while the user types in the
    // organisation Autocomplete. `orgInput` is the live Autocomplete input
    // value the user edits; this is what we submit as `current_organization`.
    const [company, setCompany] = useState('')
    const [incomingCompanyOnOpen, setIncomingCompanyOnOpen] = useState('')
    const [orgInput, setOrgInput] = useState('')
    const [currentRole, setCurrentRole] = useState('')
    const [roleTypeId, setRoleTypeId] = useState<number | null>(null)
    const [role, setRole] = useState('')
    const [applicationDate, setApplicationDate] = useState<string | null>(null)
    const [forceDateInput, setForceDateInput] = useState<boolean>(false)
    const [selectedStatusId, setSelectedStatusId] = useState<number | null>(null)
    const [engagementDate, setEngagementDate] = useState('')
    const engagementDateRef = useRef<HTMLInputElement | null>(null)
    const [sectorId, setSectorId] = useState<number | null>(null)
    const [engagementKind, setEngagementKind] = useState<number | string | ''>('')
    const [engagementNotes, setEngagementNotes] = useState('')
    const [selectedOrg, setSelectedOrg] = useState<number | null>(null)
    const [selectedContact, setSelectedContact] = useState<number | null>(null)
    const [selectedContacts, setSelectedContacts] = useState<any[]>([])
    // source channel state for jobrole (declare early so effects can reference setter)
    const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [snackbarOpen, setSnackbarOpen] = useState(false)
    const [snackbarMsg, setSnackbarMsg] = useState('')
    const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success')

    const orgsQ = useQuery(['organisations'], () => fetchOrganisations(), { staleTime: 60000 })
    // Use fetchAllContacts for a canonical full contact list (keeps counts consistent)
    const contactsQ = useQuery(['contactsList'], () => fetchAllContacts(), { staleTime: 60000 })
    const engagementKindsQ = useQuery(['refdata', 'engagement_type'], () => fetchReferenceData('engagement_type'), { staleTime: 60000 })
    const roleTypesQ = useQuery(['refdata', 'contact_role_type'], () => fetchReferenceData('contact_role_type'), { staleTime: 60000 })
    const appStatusQ = useQuery(['refdata', 'application_status'], () => fetchReferenceData('application_status'), { staleTime: 60000 })
    const sourceChannelsQ = useQuery(['refdata', 'source_channel'], () => fetchReferenceData('source_channel'), { staleTime: 60000 })
    const documentsQ = useQuery(['documents'], () => fetchDocuments(), { staleTime: 60000 })
    const sectorsQ = useQuery(['sectors'], () => fetchSectors(), { staleTime: 60000 })

    // Ensure documents options are fresh when the modal opens and when
    // other parts of the app signal a documents refresh. This covers cases
    // where documents are created outside this component (e.g. other UI
    // flows or external clients) so the Autocomplete picker shows new items.
    React.useEffect(() => {
        let mounted = true
        try {
            if (open) {
                // ask react-query to refetch latest documents when opening
                try { documentsQ.refetch && documentsQ.refetch() } catch (e) { }
            }
        } catch (e) { /* ignore */ }
        const handler = () => { if (!mounted) return; try { documentsQ.refetch && documentsQ.refetch() } catch (e) { } }
        try { window.addEventListener('documents:refresh', handler) } catch (e) { }
        return () => { mounted = false; try { window.removeEventListener('documents:refresh', handler) } catch (e) { } }
    }, [open, documentsQ])

    // Shared Popper props for Autocomplete dropdowns. Cast to `any` so the
    // specific runtime options (placement/modifiers) don't cause TypeScript
    // prop errors when the project's MUI typings are stricter.
    const sharedPopperProps = {
        PopperProps: {
            placement: 'bottom-start',
            modifiers: [
                { name: 'flip', enabled: false },
                { name: 'preventOverflow', options: { boundary: 'viewport' } },
            ],
        }
    } as any

    // recruiter refid detection
    const recruiterRefId = useMemo(() => {
        const list = roleTypesQ.data ?? []
        const found = list.find((r: any) => String(r.refvalue || r.label || r.code || '').toLowerCase().includes('recruiter'))
        return found ? Number(found.refid) : null
    }, [roleTypesQ.data])

    const contactId = editing?.contactid ?? null
    const contactTargetsQ = useQuery(['contactTargets', contactId], () => fetchContactTargets(Number(contactId)), { enabled: !!contactId && mode === 'contact' })
    const [selectedTargets, setSelectedTargets] = useState<any[]>([])
    const [forceShowTargets, setForceShowTargets] = useState<boolean>(false)
    const [selectedDocuments, setSelectedDocuments] = useState<any[]>([])
    const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null)
    const [selectedLeadOption, setSelectedLeadOption] = useState<any | null>(null)
    const [filterContactsByOrg, setFilterContactsByOrg] = useState<boolean>(false)
    // For contact mode, fetch attached documents
    useEffect(() => {
        if (open && mode === 'contact' && editing?.contactid) {
            // eslint-disable-next-line no-console
            console.debug('QuickCreateModal: fetching contact documents', { contactid: Number(editing.contactid) })
            fetchContactDocuments(Number(editing.contactid))
                .then((docs) => {
                    // eslint-disable-next-line no-console
                    console.debug('QuickCreateModal: fetched contact documents', { count: Array.isArray(docs) ? docs.length : 0, sample: Array.isArray(docs) ? docs.slice(0, 3) : docs })
                    setSelectedDocuments(docs || [])
                })
                .catch((err) => {
                    // eslint-disable-next-line no-console
                    console.error('QuickCreateModal: failed fetching contact documents', { err })
                    setSelectedDocuments([])
                })
        }
    }, [open, mode, editing])

    // Keep a ref of the previous selected documents so we can detect
    // incremental adds/removals in the Autocomplete `onChange` handler
    // and perform immediate attach/detach operations when editing an engagement.
    const prevSelectedDocsRef = useRef<any[] | null>(null)

    // If document options load after the modal is opened and we have
    // selected documents derived from the `editing` payload that may be
    // only ids or partial objects, try to reconcile them to the full
    // option objects so the Autocomplete renders correctly.
    useEffect(() => {
        // Whenever the documents options load (or change), attempt to
        // canonicalize any items in `selectedDocuments` to the exact
        // option objects from `documentsQ.data`. This ensures the
        // Autocomplete `value` items are the same object references as
        // the `options` array so MUI will render the selection reliably.
        try {
            if (!documentsQ.data || !(selectedDocuments && selectedDocuments.length)) return

            // Build a quick lookup of ids present in documentsQ.data to log and match more easily
            const docsList = documentsQ.data || []
            const sample = docsList.slice(0, 5)
            const idKeys = ['documentid', 'id', 'docid']
            const docsById: Record<string, any> = {}
            for (const o of docsList) {
                for (const k of idKeys) {
                    if (o && typeof o[k] !== 'undefined' && o[k] !== null) {
                        docsById[String(o[k])] = o
                        break
                    }
                }
            }

            // eslint-disable-next-line no-console
            console.debug('QuickCreateModal: documentsQ.data available, attempting resolve', { documentsCount: docsList.length, sample, selectedDocuments })

            const resolved = (selectedDocuments || []).map((d: any) => {
                // Accept many shapes: number id, { documentid }, { id }, or the full object.
                if (!d) return d
                if (typeof d === 'number' || typeof d === 'string') {
                    const key = String(d)
                    if (docsById[key]) return docsById[key]
                    return d
                }
                // d is an object — try known id keys first
                for (const k of idKeys) {
                    const candidate = d[k]
                    if (typeof candidate !== 'undefined' && candidate !== null) {
                        const key = String(candidate)
                        if (docsById[key]) return docsById[key]
                    }
                }
                // If the object already looks like one of the option objects
                // (has a name/uri), prefer keeping it as-is to avoid dropping user data.
                if (d && (d.documentname || d.documenturi)) return d
                // Last resort: return original
                return d
            })

            const origArr = (selectedDocuments || [])
            const same = resolved.length === origArr.length && resolved.every((r: any, i: number) => r === origArr[i])
            // eslint-disable-next-line no-console
            console.debug('QuickCreateModal: canonicalize result', { resolvedSample: resolved.slice(0, 5), same })
            if (!same) {
                // eslint-disable-next-line no-console
                console.debug('QuickCreateModal: updating selectedDocuments', { before: origArr.slice(0, 5), after: resolved.slice(0, 5) })
                setSelectedDocuments(resolved)
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('QuickCreateModal: canonicalize error', { err: e })
        }
    }, [documentsQ.data, selectedDocuments])
    // Keep prevSelectedDocsRef in sync whenever selectedDocuments changes
    useEffect(() => {
        prevSelectedDocsRef.current = selectedDocuments
    }, [selectedDocuments])

    // Handler to process incremental document add/remove events from the Autocomplete.
    // When editing an existing engagement, perform immediate attach/detach API calls
    // so the server state reflects the user's picker changes as they happen.
    function handleDocumentsChange(value: any[]) {
        try {
            // compute previous and new id sets
            const prev = prevSelectedDocsRef.current || []
            const prevIds = new Set((prev || []).map((d: any) => Number(d && (d.documentid ?? d.id ?? d))))
            const newIds = new Set((value || []).map((d: any) => Number(d && (d.documentid ?? d.id ?? d))))

            // detect removals and additions
            const removed = Array.from(prevIds).filter((id) => !newIds.has(id))
            const added = Array.from(newIds).filter((id) => !prevIds.has(id))

            // If we're editing an engagement, call attach/detach APIs immediately
            const eid = editing && (editing.engagementid ?? editing.engagementlogid)
            if (eid) {
                // fire-and-forget each operation but log errors
                removed.forEach((docId) => {
                    if (!Number.isFinite(docId) || Number.isNaN(docId)) return
                    // eslint-disable-next-line no-console
                    console.debug('QuickCreateModal: optimistic detach', { engagementId: eid, documentId: docId })
                    apiClient.detachDocumentFromEngagement(Number(eid), Number(docId)).catch((err) => {
                        // eslint-disable-next-line no-console
                        console.error('QuickCreateModal: optimistic detach failed', { engagementId: eid, documentId: docId, err })
                    })
                })
                added.forEach((docId) => {
                    if (!Number.isFinite(docId) || Number.isNaN(docId)) return
                    // eslint-disable-next-line no-console
                    console.debug('QuickCreateModal: optimistic attach', { engagementId: eid, documentId: docId })
                    apiClient.attachDocumentToEngagement(Number(eid), Number(docId)).catch((err) => {
                        // eslint-disable-next-line no-console
                        console.error('QuickCreateModal: optimistic attach failed', { engagementId: eid, documentId: docId, err })
                    })
                })
            }

            // Finally update local UI state
            setSelectedDocuments(value)
            prevSelectedDocsRef.current = value
            // Ensure any documents lists refresh (so engagements_count updates)
            try { qc.invalidateQueries(['documents']) } catch (e) { /* ignore when no qc */ }
            try { window.dispatchEvent(new Event('documents:refresh')) } catch (e) { /* ignore */ }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('QuickCreateModal: handleDocumentsChange error', { err: e })
            setSelectedDocuments(value)
        }
    }
    const [communityMember, setCommunityMember] = useState<boolean>(false)
    const [communityDate, setCommunityDate] = useState<string | null>(null)

    const [isLinkedInConnected, setIsLinkedInConnected] = useState<boolean>(false)
    const [isLinkedInLocked, setIsLinkedInLocked] = useState<boolean>(false)
    const [createAndAddEngagement, setCreateAndAddEngagement] = useState<boolean>(false)
    const [addToActionPlan, setAddToActionPlan] = useState<boolean>(false)
    const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
    // Note: nested creates are normally delegated to parent via `onRequestOpenNested`.
    // Keep local fallback state to avoid breaking callers that don't provide the handler.
    const [openNestedMode, setOpenNestedMode] = useState<Mode | null>(null)
    const [nestedEditing, setNestedEditing] = useState<any | null>(null)

    // Helper to reset all internal form state to defaults so the modal does not
    // retain values after being closed/cancelled. Called when `open` becomes false.
    const resetFormState = React.useCallback(() => {
        setName('')
        setCompany('')
        setIncomingCompanyOnOpen('')
        setOrgInput('')
        setCurrentRole('')
        setRoleTypeId(null)
        setRole('')
        setApplicationDate(null)
        setForceDateInput(false)
        setSelectedStatusId(null)
        setEngagementDate('')
        setSectorId(null)
        setEngagementKind('')
        setEngagementNotes('')
        setSelectedOrg(null)
        setSelectedContact(null)
        setSelectedSourceId(null)
        setSubmitting(false)
        setSnackbarOpen(false)
        setSnackbarMsg('')
        setSnackbarSeverity('success')
        setSelectedTargets([])
        setSelectedDocuments([])
        setSelectedLeadId(null)
        setSelectedLeadOption(null)
        setFilterContactsByOrg(false)
        setCommunityMember(false)
        setCommunityDate(null)
        setIsLinkedInConnected(false)
        setIsLinkedInLocked(false)
        setCreateAndAddEngagement(false)
        setAddToActionPlan(false)
        setSelectedTaskId(null)
        setOpenNestedMode(null)
        setNestedEditing(null)
        setIsCompanyExactMatchOnOpen(null)
    }, [])

    useEffect(() => {
        if (open) {
            if (editing) {
                if (mode === 'contact') {
                    setName(editing.name || '')
                    const initialCompany = editing.current_organization || editing.currentorg || ''
                    setCompany(initialCompany)
                    // Capture the incoming company as it was when the modal opened.
                    setIncomingCompanyOnOpen(initialCompany)
                    // If organisations are already loaded and we can find an exact
                    // match, prefill the input and selectedOrg. Otherwise leave the
                    // editable input blank so we do not pretend an organisation exists.
                    try {
                        const match = (orgsQ.data ?? []).find((o: any) => String(o.name || '').trim().toLowerCase() === String(initialCompany || '').trim().toLowerCase())
                        if (match) {
                            setSelectedOrg(Number(match.orgid))
                            setOrgInput(initialCompany)
                        } else {
                            setOrgInput('')
                            setSelectedOrg(null)
                        }
                    } catch (e) {
                        setOrgInput('')
                        setSelectedOrg(null)
                    }

                    setCurrentRole(editing.currentrole || '')
                    setRoleTypeId(toNumberOrNull(editing.role_type_id ?? null))
                    // If this contact was created/promoted from a lead, prefill the lead picker.
                    // Fall back to the cached contacts list when the incoming `editing`
                    // payload does not include `leadid` (older API responses).
                    try {
                        let lid = toNumberOrNull(editing.leadid ?? editing.lead_id ?? editing.leadId ?? null)
                        if ((!lid || lid === null) && editing.contactid && Array.isArray(contactsQ.data)) {
                            const match = (contactsQ.data || []).find((c: any) => Number(c.contactid) === Number(editing.contactid))
                            if (match) lid = toNumberOrNull(match.leadid ?? match.lead_id ?? match.leadId ?? null)
                        }
                        if (lid) setSelectedLeadId(lid)
                    } catch (e) {
                        // ignore
                    }

                    // If this QuickCreate is opened as a promotion from a lead and the
                    // prefill includes LinkedIn metadata (`linkedin_url` or `connected_on`),
                    // default the LinkedIn checkbox to checked and lock it so the value
                    // reflects the originating lead. Otherwise, respect any explicit
                    // connected flag on the editing payload.
                    const hasLinkedInMeta = Boolean(editing.linkedin_url || editing.connected_on)
                    if (hasLinkedInMeta && !editing.contactid) {
                        setIsLinkedInConnected(true)
                        setIsLinkedInLocked(true)
                    } else {
                        setIsLinkedInConnected(Boolean(editing.islinkedinconnected ?? editing.is_linkedin_connected ?? editing.linkedin_connected ?? editing.linkedInConnected))
                        setIsLinkedInLocked(false)
                    }
                } else if (mode === 'organisation') {
                    setName(editing.name || '')
                    setCommunityDate(editing.talentcommunitydateadded ?? null)
                    setCommunityMember(Boolean(editing.talentcommunitydateadded))
                    // Normalize possible sector id shapes from the editing payload.
                    // Editing objects may contain `sectorid`, `sector_id`, or a nested `sector` object
                    // with a `sectorid` field. Coerce to Number or null so the Autocomplete value
                    // resolver (which compares Numbers) will match correctly.
                    let initialSectorId: number | null = null
                    if (editing) {
                        // try multiple shapes, use toNumberOrNull to avoid NaN/0 pitfalls
                        initialSectorId = toNumberOrNull(editing.sectorid ?? editing.sector_id ?? (editing.sector && (editing.sector.sectorid ?? editing.sectorid)) ?? null)
                    }
                    setSectorId(initialSectorId)
                } else if (mode === 'jobrole') {
                    setRole(editing.rolename || '')
                    // Support multiple-contact engagements: normalize existing contact selection
                    try {
                        const cid = toNumberOrNull(editing.contactid ?? null)
                        if (cid && Array.isArray(contactsQ.data)) {
                            const match = (contactsQ.data || []).find((c: any) => Number(c.contactid) === Number(cid))
                            setSelectedContacts(match ? [match] : [])
                            setSelectedContact(match ? Number(match.contactid) : cid)
                        } else if (editing.contact_ids && Array.isArray(editing.contact_ids)) {
                            const resolved = (editing.contact_ids || []).map((id: any) => (contactsQ.data || []).find((c: any) => Number(c.contactid) === Number(id))).filter(Boolean)
                            setSelectedContacts(resolved)
                            setSelectedContact(resolved.length ? Number(resolved[0].contactid) : null)
                        } else {
                            setSelectedContacts([])
                            setSelectedContact(toNumberOrNull(editing.contactid ?? null))
                        }
                    } catch (e) {
                        setSelectedContacts([])
                        setSelectedContact(toNumberOrNull(editing.contactid ?? null))
                    }
                    setSelectedOrg(toNumberOrNull(editing.companyorgid ?? editing.companyorgid ?? null))
                    setApplicationDate(editing.applicationdate ?? null)
                    setForceDateInput(Boolean(editing.applicationdate))
                    // Prefer DB canonical names when available (coerce to Number)
                    setSelectedStatusId(toNumberOrNull(editing.statusid ?? null))
                    setSelectedSourceId(toNumberOrNull(editing.sourcechannelid ?? null))
                    // If the editing payload includes documents for a jobrole create
                    // or edit, pre-populate the picker. When editing an existing
                    // jobrole we will also fetch attached documents from the API
                    // by id below; for create flows the incoming payload may
                    // include `documents` to seed the picker.
                    try {
                        const incomingDocs = editing.documents ?? []
                        if (incomingDocs && Array.isArray(incomingDocs) && incomingDocs.length) {
                            // Prefer incoming editing payload when it explicitly contains
                            // `documents`. This allows callers/tests to seed the picker
                            // for create or update flows without being overwritten by
                            // an immediate fetch. When no incoming docs are provided
                            // we will fetch attachments from the server for edits.
                            setSelectedDocuments(incomingDocs)
                        } else {
                            // If no incoming docs were provided, and this is an
                            // existing jobrole, fetch attached documents from the API.
                            try {
                                const jid = Number(editing.jobid ?? editing.jobid ?? editing.jobId ?? null)
                                if (jid) {
                                    fetchJobRoleDocuments(jid).then((docs) => {
                                        setSelectedDocuments(docs || [])
                                    }).catch((e) => {
                                        // eslint-disable-next-line no-console
                                        console.error('QuickCreateModal: failed fetching jobrole documents', { err: e, jobid: jid })
                                    })
                                }
                            } catch (e) {
                                // ignore
                            }
                        }
                    } catch (e) {
                        // ignore
                    }
                } else if (mode === 'engagement') {
                    // Detect whether this is a real edit (has an engagement id) or a prefill
                    const isRealEdit = Boolean(editing.engagementid || editing.engagementlogid)
                    // Normalize incoming contact selection to both `selectedContact`
                    // (numeric id) and `selectedContacts` (array of objects) so the
                    // engagement form validation and multi-contact flows work
                    // consistently when the modal is opened with an `editing` payload.
                    const incomingContactId = toNumberOrNull(editing.contactid ?? null)
                    setSelectedContact(incomingContactId)
                    try {
                        // Immediately prefill `selectedContacts` from the incoming
                        // editing payload so the form becomes valid synchronously
                        // (avoids races in tests where contacts list loads later).
                        // Support multiple shapes: `contact_ids` (id array) or `contacts` (array of contact objects)
                        if (editing.contact_ids && Array.isArray(editing.contact_ids)) {
                            const resolved = (editing.contact_ids || []).map((id: any) => {
                                // try to resolve to full object if contacts are already loaded
                                const match = Array.isArray(contactsQ.data) ? (contactsQ.data || []).find((c: any) => Number(c.contactid) === Number(id)) : null
                                return match || { contactid: Number(id) }
                            })
                            setSelectedContacts(resolved)
                            setSelectedContact(resolved.length ? Number(resolved[0].contactid) : null)
                        } else if (editing.contacts && Array.isArray(editing.contacts) && editing.contacts.length) {
                            // editing.contacts may contain full contact objects; normalize to selectedContacts
                            const resolved = (editing.contacts || []).map((c: any) => {
                                if (!c) return c
                                // If object already looks like a full contact, keep it, else try to resolve by id
                                const id = Number(c.contactid ?? c.id ?? c)
                                const match = Array.isArray(contactsQ.data) ? (contactsQ.data || []).find((x: any) => Number(x.contactid) === id) : null
                                return match || (typeof c === 'object' ? c : { contactid: id })
                            })
                            setSelectedContacts(resolved)
                            setSelectedContact(resolved.length ? Number(resolved[0].contactid) : null)
                        } else if (incomingContactId) {
                            const match = Array.isArray(contactsQ.data) ? (contactsQ.data || []).find((c: any) => Number(c.contactid) === Number(incomingContactId)) : null
                            // If no full contact object is available yet, insert a lightweight
                            // placeholder so validation that checks selectedContacts.length
                            // succeeds. The contacts reconciliation effect below will
                            // replace placeholders with full objects when the list loads.
                            setSelectedContacts(match ? [match] : [{ contactid: incomingContactId }])
                        } else {
                            setSelectedContacts([])
                        }
                    } catch (e) {
                        setSelectedContacts([])
                    }
                    setSelectedOrg(toNumberOrNull(editing.companyorgid ?? editing.companyorgid ?? null))
                    const today = new Date().toISOString().slice(0, 10)
                    setEngagementDate(isRealEdit ? (editing.engagedate || editing.logdate || '') : (editing.engagedate || editing.logdate || today))
                    setEngagementNotes(editing.notes || editing.logentry || '')
                    // Resolve engagement kind: prefer numeric refid, otherwise try to map
                    // any incoming string `editing.kind` to a known refid from refdata.
                    let resolvedKind: number | string | '' = ''
                    if (typeof editing.engagementtypeid !== 'undefined' && editing.engagementtypeid !== null) {
                        resolvedKind = editing.engagementtypeid
                    } else if (editing.kind) {
                        // try to match by refvalue to find a refid
                        const kindStr = String(editing.kind || '').trim().toLowerCase()
                        const match = (engagementKindsQ.data || []).find((r: any) => String(r.refvalue || '').toLowerCase().includes(kindStr))
                        if (match) resolvedKind = Number(match.refid)
                        else resolvedKind = editing.kind
                    }
                    setEngagementKind(resolvedKind)
                    // load attached documents if provided
                    // Normalize editing.documents to the same object shape as
                    // `documentsQ.data` so the Autocomplete `value` matches
                    // available options and the picker UI displays correctly.
                    try {
                        const incomingDocs = editing.documents ?? []
                        const normalized = (incomingDocs || []).map((d: any) => {
                            // support shapes: numeric id, { documentid }, or full document object
                            const id = d && (d.documentid ?? (typeof d === 'number' ? d : null))
                            if (id != null && documentsQ.data) {
                                const match = (documentsQ.data || []).find((opt: any) => Number(opt.documentid) === Number(id))
                                if (match) return match
                            }
                            return d
                        })
                        // Debug initial normalization so we can see what the modal
                        // received and what it resolved to when opened in edit mode.
                        // eslint-disable-next-line no-console
                        console.debug('QuickCreateModal: open normalize docs', { incoming: incomingDocs, normalized })
                        // If no incoming docs were present on the editing payload,
                        // attempt to fetch documents specifically attached to this
                        // engagement as a fallback (server may not include them in
                        // list endpoints). This helps when the backend doesn't return
                        // `documents` inside the engagement object.
                        if ((!normalized || normalized.length === 0) && editing && (editing.engagementid || editing.engagementlogid)) {
                            const eid = editing.engagementid ?? editing.engagementlogid
                            // eslint-disable-next-line no-console
                            console.debug('QuickCreateModal: no incoming docs on editing payload, fetching by engagement id', { engagementId: eid })
                            fetchDocuments(Number(eid)).then((docs) => {
                                // eslint-disable-next-line no-console
                                console.debug('QuickCreateModal: fetchDocuments by engagement result', { count: Array.isArray(docs) ? docs.length : 0, sample: Array.isArray(docs) ? docs.slice(0, 5) : docs })
                                if (Array.isArray(docs) && docs.length) {
                                    setSelectedDocuments(docs)
                                } else {
                                    setSelectedDocuments(normalized)
                                }
                            }).catch((err) => {
                                // eslint-disable-next-line no-console
                                console.error('QuickCreateModal: fetchDocuments by engagement failed', { err })
                                setSelectedDocuments(normalized)
                            })
                        } else {
                            setSelectedDocuments(normalized)
                        }
                    } catch (e) {
                        // eslint-disable-next-line no-console
                        console.error('QuickCreateModal: normalize docs failed', { err: e })
                        setSelectedDocuments(editing.documents ?? [])
                    }
                }
            } else {
                setName('')
                setCompany('')
                setIncomingCompanyOnOpen('')
                setOrgInput('')
                setCurrentRole('')
                setRoleTypeId(null)
                setRole('')
                setApplicationDate(null)
                // default new engagement date to today
                setEngagementDate(mode === 'engagement' ? new Date().toISOString().slice(0, 10) : '')
                setEngagementNotes('')
                setEngagementKind('')
                setSelectedOrg(null)
                setSelectedContact(null)
                setSelectedStatusId(null)
                setSelectedSourceId(null)
                setSectorId(null)
                setSelectedTargets([])
                setSelectedDocuments([])
                setCommunityMember(false)
                setCommunityDate(null)

                setIsLinkedInConnected(false)
            }
        }
    }, [open, editing, mode])

    // Ensure selected contacts are cleared when the modal is opened for a
    // fresh engagement (no `editing` payload) or when the incoming
    // `editing` payload explicitly contains no contacts. This guards against
    // races where other effects may re-populate `selectedContacts` from
    // cached data after the reset runs.
    useEffect(() => {
        if (!open || mode !== 'engagement') return
        try {
            const hasEdit = Boolean(editing)
            const hasContactsInEdit = hasEdit && ((Array.isArray(editing.contact_ids) && editing.contact_ids.length > 0) || (Array.isArray(editing.contacts) && editing.contacts.length > 0) || (Array.isArray(editing.contacts_list) && editing.contacts_list.length > 0))
            if (!hasEdit || !hasContactsInEdit) {
                // Only clear when there is not an explicit incoming selection.
                if (selectedContacts && selectedContacts.length) {
                    setSelectedContacts([])
                    setSelectedContact(null)
                }
            }
        } catch (e) {
            // ignore
        }
    }, [open, mode, editing])

    // If this modal was opened with an engagement prefill that indicates
    // a coaching session, treat the contact and engagement kind as locked.
    const isCoachingPrefill = React.useMemo(() => {
        if (mode !== 'engagement') return false
        try {
            // If editing contains a numeric engagement type refid, resolve it
            // against the engagementKinds refdata to check for 'coach' in the
            // refvalue. Otherwise fall back to inspecting the editing.kind string.
            const eid = editing?.engagementtypeid ?? editing?.engagementid ?? null
            if (eid != null && engagementKindsQ.data && Array.isArray(engagementKindsQ.data)) {
                const match = (engagementKindsQ.data || []).find((r: any) => Number(r.refid) === Number(eid))
                if (match && String(match.refvalue || '').toLowerCase().includes('coach')) return true
            }
            const k = String(editing?.kind ?? editing?.engagementtypeid ?? '')
            return k.toLowerCase().includes('coach')
        } catch (e) {
            return false
        }
    }, [mode, editing, engagementKindsQ.data])

    // If an initial role type id is provided (e.g. Coaching page), prefill and
    // optionally lock the role type selector when the modal opens for a new contact.
    React.useEffect(() => {
        if (!open) return
        if (mode === 'contact' && !editing) {
            if (typeof initialRoleTypeId !== 'undefined' && initialRoleTypeId !== null) {
                setRoleTypeId(Number(initialRoleTypeId))
            }
            // Hide unwanted options if explicitly requested
            if (hideCreateAndAddEngagement) setCreateAndAddEngagement(false)
            if (hideAddToActionPlan) setAddToActionPlan(false)
        }
    }, [open, initialRoleTypeId, hideCreateAndAddEngagement, hideAddToActionPlan, mode, editing])

    // When the modal is closed ensure internal form state is cleared so
    // subsequent opens start with a clean form (covers Cancel and parent
    // driven closes).
    React.useEffect(() => {
        if (!open) {
            try {
                resetFormState()
            } catch (e) {
                // ignore
            }
        }
    }, [open, resetFormState])

    // Decide once when the modal opens whether the incoming `company` string
    // matched an existing organisation. This uses the organisations cache if
    // available; if orgs are not yet loaded the result will be false. The
    // decision is stored and not recomputed during the modal lifetime so
    // the "Incoming company" read-only field remains visible/consistent.
    useEffect(() => {
        if (!open) {
            setIsCompanyExactMatchOnOpen(null)
            return
        }
        try {
            const candidate = incomingCompanyOnOpen || (editing && mode === 'contact' ? (editing.current_organization || editing.currentorg || '') : '')
            const match = (orgsQ.data ?? []).find((o: any) => String(o.name || '').trim().toLowerCase() === String(candidate || '').trim().toLowerCase())
            const exact = Boolean(match)
            setIsCompanyExactMatchOnOpen(exact)
            // If an exact match exists and the editable input is still blank
            // (user hasn't typed), prefill the input and selectedOrg so the
            // dropdown shows the organisation. Do not overwrite user edits.
            if (exact && (!orgInput || String(orgInput).trim() === '') && !selectedOrg) {
                setSelectedOrg(Number(match.orgid))
                setOrgInput(candidate)
            }
        } catch (e) {
            setIsCompanyExactMatchOnOpen(false)
        }
    }, [open, editing, mode, orgsQ.data, incomingCompanyOnOpen, orgInput, selectedOrg])

    // Debug logging moved below where `isValid` is declared to avoid TDZ

    // No fallback mapping required: GET /api/jobroles/<id> now returns referenced ids for status and source.

    // No fallback fetch required anymore: /api/organisations now returns numeric `sectorid`,
    // so we can rely on the `editing` payload to contain the sector id.

    useEffect(() => {
        if (contactTargetsQ.data) setSelectedTargets(contactTargetsQ.data || [])
    }, [contactTargetsQ.data])

    // When the contacts list loads after the modal opened with an editing
    // payload that only contained a numeric `contactid`, resolve that id
    // to the full contact objects and populate `selectedContacts` so
    // validation and multi-contact flows work reliably.
    useEffect(() => {
        try {
            if (Array.isArray(contactsQ.data) && contactsQ.data.length) {
                // Replace any placeholder selectedContacts (objects with only id)
                // with full contact objects from the contacts list when it loads.
                const resolved = (selectedContacts || []).map((sc: any) => {
                    const id = Number(sc && (sc.contactid ?? sc.id ?? sc))
                    const match = (contactsQ.data || []).find((c: any) => Number(c.contactid) === id)
                    return match || sc
                })
                // If we had no selectedContacts but a single selectedContact id,
                // try to resolve that into a full object as well.
                if ((!selectedContacts || selectedContacts.length === 0) && selectedContact) {
                    const match = (contactsQ.data || []).find((c: any) => Number(c.contactid) === Number(selectedContact))
                    if (match) {
                        setSelectedContacts([match])
                        return
                    }
                }
                // Only update state if any replacements occurred to avoid extra renders
                const same = resolved.length === (selectedContacts || []).length && resolved.every((r: any, i: number) => r === (selectedContacts || [])[i])
                if (!same) setSelectedContacts(resolved)
            }
        } catch (e) {
            // ignore
        }
    }, [contactsQ.data, selectedContact, selectedContacts])

    // Ensure the application date is blank when opening the create-role modal
    useEffect(() => {
        if (open && mode === 'jobrole' && !editing) {
            // When opening the create-role modal, pre-fill application date with today
            const today = new Date().toISOString().slice(0, 10)
            setApplicationDate(today)
            setForceDateInput(true)
        }
    }, [open, mode, editing])

    const showToast = (msg: string, severity: 'success' | 'error' = 'success') => {
        setSnackbarMsg(msg)
        setSnackbarSeverity(severity)
        setSnackbarOpen(true)
    }

    const isValid = useMemo(() => {
        // For contact creation, require a contact type (roleTypeId). When editing an
        // existing contact, preserve previous behaviour and allow saving without
        // forcing a type change.
        if (mode === 'contact') {
            if (editing && editing.contactid) return name.trim().length > 0
            return name.trim().length > 0 && roleTypeId != null
        }
        // Organisation creation: require a name. Sector is optional in the
        // quick-create flow and tests should not be blocked by missing sectors.
        if (mode === 'organisation') return name.trim().length > 0
        if (mode === 'jobrole') {
            // Require a source for updates (editing existing jobroles). For
            // creation flows, allow saving without an explicit source so tests
            // and quick-creation flows are not blocked when a source is not set.
            const hasSource = selectedSourceId != null
            if (editing && editing.jobid) return role.trim().length > 0 && selectedOrg != null && hasSource
            // Creation: require role name, organisation and application status
            return role.trim().length > 0 && selectedOrg != null && selectedStatusId != null
        }
        if (mode === 'engagement') return (selectedContacts && selectedContacts.length > 0) && engagementDate.trim().length > 0 && (engagementKind !== '' && engagementKind != null)
        return false
    }, [mode, name, role, selectedContact, selectedOrg, engagementDate, engagementKind, editing, selectedSourceId, sectorId, roleTypeId])


    // Determine whether the provided `editing` prop represents an existing persisted record
    const isRealEdit = useMemo(() => {
        if (!editing) return false
        switch (mode) {
            case 'contact':
                return Boolean(editing.contactid)
            case 'organisation':
                return Boolean(editing.orgid)
            case 'jobrole':
                return Boolean(editing.jobid)
            case 'engagement':
                return Boolean(editing.engagementid || editing.engagementlogid)
            default:
                return false
        }
    }, [editing, mode])

    const modalTitle = useMemo(() => {
        if (isRealEdit) {
            switch (mode) {
                case 'contact':
                    return 'Update Contact'
                case 'organisation':
                    return 'Update Organisation'
                case 'jobrole':
                    return 'Update Role'
                case 'engagement':
                    return 'Update Engagement'
                default:
                    return 'Update'
            }
        }
        switch (mode) {
            case 'contact':
                return 'Create Contact'
            case 'organisation':
                return 'Create Organisation'
            case 'jobrole':
                return 'Create Role'
            case 'engagement':
                return 'Create Engagement'
            default:
                return 'Quick Create'
        }
    }, [isRealEdit, mode])

    // Debug logging to help diagnose why engagement form validation may be false
    useEffect(() => {
        if (open && mode === 'engagement') {
            // eslint-disable-next-line no-console
            console.debug('[QuickCreateModal] engagement init state', {
                editing,
                selectedContact,
                selectedOrg,
                engagementDate,
                engagementKind,
                isValid,
            })
        }
    }, [open, mode, editing, selectedContact, selectedOrg, engagementDate, engagementKind, isValid])

    // helper: resolve selected organisation object from company name or organisation id (editing)
    const selectedOrgObj = useMemo(() => {
        const list = orgsQ.data ?? []
        // Resolve only from an explicit selectedOrg id (user selection) or
        // the editing payload. Do NOT auto-resolve by matching the `company`
        // string — that causes the Autocomplete selected value to change
        // whenever the incoming company text matches an organisation name.
        if (selectedOrg) {
            const byId = list.find((o: any) => Number(o.orgid) === Number(selectedOrg))
            if (byId) return byId
        }
        // fallback: if editing provides an organisation id, try to resolve
        const orgIdCandidates = [
            // common fields that might be present on editing object
            (editing && (editing.companyorgid ?? editing.current_organization_id ?? editing.currentorgid ?? editing.orgid ?? editing.orgid)) as any,
            // also allow numeric current_org_id
            (editing && (editing.current_org_id ?? editing.currentorg_id)) as any,
        ].filter(Boolean)
        for (const id of orgIdCandidates) {
            const num = Number(id)
            if (!isNaN(num)) {
                const byId = list.find((o: any) => Number(o.orgid) === num)
                if (byId) return byId
            }
        }
        return null
    }, [orgsQ.data, editing, selectedOrg])



    // Whether the incoming `company` exactly matched an existing organisation
    // at the moment the modal was opened. This is decided once on open and
    // not recomputed during the modal lifetime so the incoming company text
    // remains visible/consistent while the user interacts with the form.
    const [isCompanyExactMatchOnOpen, setIsCompanyExactMatchOnOpen] = React.useState<boolean | null>(null)

    const isRecruiter = useMemo(() => {
        return roleTypeId != null && recruiterRefId != null && Number(roleTypeId) === Number(recruiterRefId)
    }, [roleTypeId, recruiterRefId])

    // Tasks list for optional Add to Action Plan flow
    const tasksQ = useQuery(['tasks'], () => fetchTasks(), { staleTime: 60000 })

    // Available leads to assign to a contact. Fetch all leads (don't ask the server
    // to exclude promoted rows) and apply client-side filtering so we can keep
    // the currently-selected lead visible even when it's promoted.
    const leadsQ = useQuery(['leads', 'allForPicker'], () => fetchLeadsAll(undefined, undefined, undefined, false), { staleTime: 60000, enabled: mode === 'contact' })

    // Fetch lead_review_status refdata so we can identify the "Promoted To Contact" refid
    const leadReviewStatusQ = useQuery(['refdata', 'lead_review_status'], () => fetchReferenceData('lead_review_status'), { staleTime: 60000, enabled: mode === 'contact' && isLinkedInConnected })

    // Track previous selected lead id so we can clear its review status when changed
    const prevSelectedLeadRef = useRef<number | null>(null)
    const _firstSelectedLeadChange = useRef<boolean>(true)

    // When the selected lead changes for an existing contact, update the contact.leadid
    // and clear the review status for the old lead. Also mark the new lead as promoted.
    useEffect(() => {
        const old = prevSelectedLeadRef.current
        prevSelectedLeadRef.current = selectedLeadId
        if (_firstSelectedLeadChange.current) {
            _firstSelectedLeadChange.current = false
            return
        }
        // Only persist changes for existing contacts
        if (!editing || !editing.contactid) return

        (async () => {
            try {
                const contactId = Number(editing.contactid)
                // Clear review status on previous lead (set to 'unset' via refid 0)
                if (old && old !== selectedLeadId) {
                    try {
                        await setLeadReviewOutcome(Number(old), 0)
                    } catch (e) {
                        console.error('Failed to clear previous lead review outcome', e)
                    }
                }

                // Update contact record with new leadid (empty string to clear)
                const payload: Record<string, any> = { leadid: selectedLeadId != null ? Number(selectedLeadId) : '' }
                await updateContact(contactId, payload)
                try { invalidateContactsList() } catch (e) { /* ignore */ }
                try { qc.invalidateQueries(['leads', 'availableForAssign']) } catch (e) { /* ignore */ }

                // If a new lead was selected, mark it as promoted
                if (selectedLeadId != null) {
                    try {
                        const allRef = await fetchReferenceData('lead_review_status')
                        const _norm = (v: any) => String(v || '').trim().toLowerCase()
                        const promoted = (allRef || []).find((r: any) => _norm(r.refvalue) === 'promoted to contact')
                        const prid = promoted ? Number(promoted.refid) : null
                        if (prid) {
                            await setLeadReviewOutcome(Number(selectedLeadId), Number(prid))
                        }
                    } catch (e) {
                        console.error('Failed to mark new lead promoted', e)
                    }
                }
            } catch (e) {
                console.error('Failed to persist lead change on contact', e)
            }
        })()
    }, [selectedLeadId])

    // Ensure the Autocomplete has an option object to display when the modal opens
    // If the leads list doesn't include the selected lead, fetch it via prefillLead
    useEffect(() => {
        let mounted = true
        async function ensureOption() {
            try {
                if (!selectedLeadId) {
                    setSelectedLeadOption(null)
                    return
                }
                // Try to resolve from leadsQ data first
                const found = (leadsQ.data || []).find((l: any) => Number(l.leadid ?? l.id) === Number(selectedLeadId))
                if (found) {
                    setSelectedLeadOption(found)
                    return
                }
                // Otherwise fetch the lead prefill
                const pre = await prefillLead(Number(selectedLeadId))
                if (mounted) setSelectedLeadOption(pre || null)
            } catch (e) {
                // ignore
            }
        }
        ensureOption()
        return () => { mounted = false }
    }, [selectedLeadId, leadsQ.data])

    // Build options list ensuring the selected lead (if any) is present so
    // the Autocomplete can show it even when the fetched list excludes promoted rows.
    const leadOptions = useMemo(() => {
        const baseRaw = Array.isArray(leadsQ.data) ? leadsQ.data.slice() : []
        // Sort alphabetically by name so options present in alphabetical order
        try {
            baseRaw.sort((a: any, b: any) => {
                const aName = String(a?.name ?? a?.leadname ?? '').trim().toLowerCase()
                const bName = String(b?.name ?? b?.leadname ?? '').trim().toLowerCase()
                return aName.localeCompare(bName)
            })
        } catch (e) {
            // ignore sort failures
        }
        // Determine promoted refid
        let promotedRefId: number | null = null
        try {
            const list = leadReviewStatusQ.data || []
            const found = (list || []).find((r: any) => String(r.refvalue || '').trim().toLowerCase() === 'promoted to contact')
            if (found) promotedRefId = Number(found.refid)
        } catch (e) {
            promotedRefId = null
        }

        // Exclude promoted leads unless they match the selectedLeadId
        const base = baseRaw.filter((l: any) => {
            try {
                if (!promotedRefId) return true
                const rid = l && (l.reviewoutcomeid ?? l.reviewoutcomeid)
                if (rid == null) return true
                if (Number(rid) === Number(promotedRefId) && Number(l.leadid) !== Number(selectedLeadId)) return false
                return true
            } catch (e) {
                return true
            }
        })

        if (selectedLeadOption) {
            const exists = base.find((l: any) => Number(l.leadid ?? l.id) === Number(selectedLeadOption.leadid ?? selectedLeadOption.id))
            if (!exists) return [selectedLeadOption, ...base]
        }
        return base
    }, [leadsQ.data, selectedLeadOption, leadReviewStatusQ.data, selectedLeadId])

    // When LinkedIn checkbox is unchecked, clear lead assignment and unset the lead's review status
    useEffect(() => {
        if (isLinkedInConnected) return
        // Only operate for existing contacts
        if (!editing || !editing.contactid) return
        const lid = selectedLeadId ?? prevSelectedLeadRef.current
        if (!lid) return

        (async () => {
            try {
                const contactId = Number(editing.contactid)
                // Clear leadid on contact (empty string to indicate clear)
                await updateContact(contactId, { leadid: '' })
                // Clear lead review outcome (set to unset via refid 0)
                try {
                    await setLeadReviewOutcome(Number(lid), 0)
                } catch (e) {
                    console.error('Failed to clear lead review outcome on unlink', e)
                }
                try { invalidateContactsList() } catch (e) { /* ignore */ }
                try { qc.invalidateQueries(['leads', 'availableForAssign']) } catch (e) { /* ignore */ }
                // Clear local selection
                setSelectedLeadId(null)
            } catch (e) {
                console.error('Failed to clear lead assignment when LinkedIn unchecked', e)
            }
        })()
    }, [isLinkedInConnected])

    // fetch action_plan_target_type refdata to find contact target refid
    const targetTypesQ = useQuery(['refdata', 'action_plan_target_type'], () => fetchReferenceData('action_plan_target_type'), { staleTime: 60000 })
    const contactTargetRefId = useMemo(() => {
        const list = targetTypesQ.data ?? []
        const found = (list || []).find((t: any) => String((t.refvalue || '').toLowerCase()).includes('contact'))
        return found ? Number(found.refid) : null
    }, [targetTypesQ.data])



    const filteredContacts = useMemo(() => {
        const list = contactsQ.data ?? []
        if (!filterContactsByOrg || !selectedOrg) return list
        try {
            return list.filter((c: any) => {
                const orgId = Number(c.currentorgid ?? c.current_organization_id ?? c.currentorgid ?? c.currentorg ?? c.current_organisation_id ?? c.current_organisation)
                return !isNaN(orgId) && Number(orgId) === Number(selectedOrg)
            })
        } catch (e) {
            return list
        }
    }, [contactsQ.data, filterContactsByOrg, selectedOrg])

    async function handleTargetsChange(event: any, value: any[]) {
        const newSelection = value ?? []
        if (contactId) {
            const prevIds = new Set((selectedTargets ?? []).map((o: any) => Number(o.orgid)))
            const newIds = new Set(newSelection.map((o: any) => Number(o.orgid)))

            for (const o of newSelection) {
                const id = Number(o.orgid)
                if (!prevIds.has(id)) {
                    try {
                        await addContactTarget(Number(contactId), id)
                    } catch (e) {
                        console.error('Failed to add contact target', e)
                    }
                }
            }
            for (const o of (selectedTargets ?? [])) {
                const id = Number(o.orgid)
                if (!newIds.has(id)) {
                    try {
                        await removeContactTarget(Number(contactId), id)
                    } catch (e) {
                        console.error('Failed to remove contact target', e)
                    }
                }
            }
            contactTargetsQ.refetch()
            // Ensure organisation counts (and cached contact lists) refresh when targets change
            try {
                qc.invalidateQueries(['organisations'])
            } catch (e) { /* ignore */ }
            try {
                invalidateContactsList()
            } catch (e) { /* ignore */ }
        }
        setSelectedTargets(newSelection)
    }

    async function handleContactDocumentsUpdate(contactId: number) {
        // Attach/detach documents for contact
        try {
            const currentDocs = await fetchContactDocuments(contactId)
            const currentIds = new Set(currentDocs.map((d: any) => Number(d.documentid)))
            const selectedIds = new Set(selectedDocuments.map((d: any) => Number(d.documentid)))
            // Attach new
            for (const d of selectedDocuments) {
                if (!currentIds.has(Number(d.documentid))) {
                    await attachDocumentToContact(contactId, Number(d.documentid))
                }
            }
            // Detach removed
            for (const d of currentDocs) {
                if (!selectedIds.has(Number(d.documentid))) {
                    await detachDocumentFromContact(contactId, Number(d.documentid))
                }
            }
        } catch (e) {
            // ignore errors for now
        }
    }

    async function submit() {
        try {
            let openedNested = false
            let requestedTopNested = false
            // Whether the modal should remain open after a successful create/update.
            // Declared here so all branches (contact/org/jobrole/engagement) can
            // set or read it without scoping issues.
            let keepOpen = false
            setSubmitting(true)
            if (mode === 'contact') {
                if (!name) throw new Error('Name required')
                try { console.debug('QuickCreateModal: submit contact', { selectedOrg, orgInput }) } catch (err) { }
                const payload: Record<string, any> = {
                    name,
                    // Submit the live organisation input (what the user has typed)
                    // as the contact's current_organization. The read-only incoming
                    // company captured at open is not mutated by typing.
                    current_organization: orgInput || undefined,
                    currentrole: currentRole || undefined,
                }

                if (roleTypeId) payload.role_type_id = Number(roleTypeId)
                // LinkedIn status
                if (typeof isLinkedInConnected === 'boolean') payload.islinkedinconnected = isLinkedInConnected

                let openNestedAfterCreate = false
                if (editing && editing.contactid) {
                    // Persist lead assignment: send empty string to clear when null
                    try { payload.leadid = selectedLeadId != null ? Number(selectedLeadId) : '' } catch (e) { /* ignore */ }
                    await updateContact(Number(editing.contactid), payload)
                    await handleContactDocumentsUpdate(Number(editing.contactid))
                    // Ensure all cached contact datasets and counts refresh
                    qc.invalidateQueries(['contactsList'])
                    qc.invalidateQueries(['contactsAllForHeat'])
                    qc.invalidateQueries(['contactsCount'])
                    qc.invalidateQueries(['contactsAllForHeat'])
                    qc.invalidateQueries(['contactsCount'])
                    showToast('Contact updated', 'success')
                    // If a lead was selected as the LinkedIn origin, mark it as promoted
                    if (selectedLeadId != null) {
                        try {
                            const allRef = await fetchReferenceData('lead_review_status')
                            const _norm = (v: any) => String(v || '').trim().toLowerCase()
                            const promoted = (allRef || []).find((r: any) => _norm(r.refvalue) === 'promoted to contact')
                            const prid = promoted ? Number(promoted.refid) : null
                            if (prid) {
                                await setLeadReviewOutcome(Number(selectedLeadId), Number(prid))
                                try { qc.invalidateQueries(['leads', 'availableForAssign']) } catch (e) { /* ignore */ }
                                try { qc.invalidateQueries(['leads']) } catch (e) { /* ignore */ }
                            }
                        } catch (e) {
                            // Log but don't block the contact update flow
                            // eslint-disable-next-line no-console
                            console.error('Failed to mark lead promoted after contact update', e)
                        }
                    }
                } else {
                    let created: any = null
                    try {
                        // Include lead assignment when creating a contact
                        if (selectedLeadId != null) payload.leadid = Number(selectedLeadId)
                        // Ensure newly created contacts have a non-null active status.
                        // Backend accepts `contact_status` string labels (e.g. 'Active'/'Inactive').
                        if (typeof payload.contact_status === 'undefined' || payload.contact_status === null) {
                            payload.contact_status = 'Active'
                        }
                        created = await createContact(payload)
                    } catch (createErr: any) {
                        // If the server indicates a conflict (409) and includes
                        // an existing contact payload or id, treat that as the
                        // created object so we can continue to open the nested
                        // engagement editor. Otherwise rethrow to be handled by
                        // the outer catch.
                        const resp = createErr?.response?.data
                        const status = createErr?.response?.status
                        if (status === 409 && resp) {
                            // Try common shapes for existing id in the response
                            const existingId = resp.contactid ?? resp.id ?? resp.existing_contact_id ?? resp.existing_id ?? resp.resource_id ?? (resp.contact && (resp.contact.contactid ?? resp.contact.id))
                            if (existingId) {
                                created = { contactid: Number(existingId) }
                                showToast('Contact already exists; opening engagement', 'success')
                            } else {
                                // If server returned a full existing object, try to use it
                                if (typeof resp === 'object' && (resp.name || resp.contactid || resp.id)) {
                                    created = resp
                                    showToast('Contact already exists; opening engagement', 'success')
                                } else {
                                    // No usable info — rethrow to outer handler
                                    throw createErr
                                }
                            }
                        } else {
                            throw createErr
                        }
                    }
                    // Ensure all cached contact datasets and counts refresh
                    qc.invalidateQueries(['contactsList'])
                    qc.invalidateQueries(['contactsAllForHeat'])
                    qc.invalidateQueries(['contactsCount'])
                    qc.invalidateQueries(['contactsAllForHeat'])
                    qc.invalidateQueries(['contactsCount'])

                    showToast('Contact created', 'success')
                    if (createAndAddEngagement) openNestedAfterCreate = true
                    let keepOpen = false
                    if (onSuccess) {
                        try {
                            // Allow onSuccess to return `true` to indicate the modal
                            // should remain open (useful for iterative flows). Any
                            // truthy return keeps modal open; otherwise it will close.
                            // Support both sync and async handlers.
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const res: any = await (onSuccess as any)(created)
                            keepOpen = Boolean(res)
                        } catch (e) {
                            // ignore errors from onSuccess handler
                        }
                    }
                    // If we're opening a nested engagement editor, keep the parent modal open
                    if (openNestedAfterCreate) keepOpen = true
                    let newId = created?.contactid ?? created?.id ?? null
                    // If backend didn't return an id, try to resolve by searching
                    // the canonical contacts list for a matching name/org.
                    if (!newId) {
                        try {
                            const all = await fetchAllContacts()
                            if (Array.isArray(all)) {
                                const candidate = all.find((c: any) => {
                                    try {
                                        const n = String(c.name || '').trim()
                                        const org = String(c.currentorg || c.current_organization || c.currentorgid || c.currentorgid || '')
                                        const wantOrg = String(orgInput || incomingCompanyOnOpen || '')
                                        // match by exact name and prefer matching org when available
                                        if (n === String(name).trim()) {
                                            if (!wantOrg) return true
                                            return String((c.current_organization || c.currentorg || c.current_organisation || '')).trim() === wantOrg.trim()
                                        }
                                        return false
                                    } catch (e) { return false }
                                })
                                if (candidate) newId = candidate.contactid ?? candidate.id ?? null
                            }
                        } catch (e) {
                            // ignore search failures
                        }
                        if (selectedTargets && selectedTargets.length) {
                            for (const o of selectedTargets) {
                                try {
                                    await addContactTarget(Number(newId), Number(o.orgid))
                                } catch (e) {
                                    console.error('Failed to persist contact target after create', e)
                                }
                            }
                            qc.invalidateQueries(['contactTargets', newId])
                            // new contact changed organisation memberships; refresh organisation counts and contact lists
                            try { qc.invalidateQueries(['organisations']) } catch (e) { /* ignore */ }
                            try { qc.invalidateQueries(['contactsList']) } catch (e) { /* ignore */ }
                        }
                        if (selectedDocuments && selectedDocuments.length) {
                            for (const d of selectedDocuments) {
                                try {
                                    await attachDocumentToContact(Number(newId), Number(d.documentid))
                                } catch (e) {
                                    // ignore
                                }
                            }
                        }
                    }
                    // After create: open nested engagement editor if requested.
                    // If we couldn't resolve a numeric id, still open the nested
                    // modal and provide a prefill so the user can complete the
                    // engagement manually (or choose the created contact). This
                    // prevents the parent modal from closing immediately.
                    if (openNestedAfterCreate) {
                        try {
                            const nidToUse = newId ? Number(newId) : undefined
                            const nestedPayload: any = {}
                            if (nidToUse) nestedPayload.contactid = nidToUse
                            // Prefill name so the engagement modal can show context
                            if (name) nestedPayload.name = name
                            // Debug: log nested open intent
                            // eslint-disable-next-line no-console
                            console.log('QuickCreateModal: request to open nested engagement', { nestedPayload })
                            // Prefer opening the nested engagement editor rather than
                            // auto-creating an empty engagement that the server will
                            // reject (400) when notes are blank. Delegate to parent
                            // if available. Only attempt to create an engagement resource
                            // automatically when we have non-empty notes to persist.
                            try {
                                const nidToUse = newId ? Number(newId) : undefined
                                const nestedPayload: any = {}
                                if (nidToUse) nestedPayload.contactid = nidToUse
                                if (name) nestedPayload.name = name
                                // Debug: log nested open intent
                                // eslint-disable-next-line no-console
                                console.log('QuickCreateModal: request to open nested engagement', { nestedPayload })

                                // First try to let the parent open the top-level nested editor.
                                if (onRequestOpenNested) {
                                    try {
                                        onRequestOpenNested('engagement', nestedPayload, (created: any) => {
                                            console.log('QuickCreateModal: onRequestOpenNested callback', { created })
                                        })
                                        requestedTopNested = true
                                    } catch (e) {
                                        // ignore parent handler errors and fall back to local nested
                                    }
                                }

                                if (!requestedTopNested) {
                                    // No parent handler. If we have user-provided notes,
                                    // create the engagement resource so it can be edited
                                    // with persisted content. Otherwise open the nested
                                    // editor locally with a prefill and avoid calling
                                    // the API with empty notes (which returns 400).
                                    if (engagementNotes && String(engagementNotes).trim().length > 0) {
                                        const today = new Date().toISOString().slice(0, 10)
                                        const createPayload: any = { contactid: nidToUse, logdate: engagementDate || today, logentry: engagementNotes || '', notes: engagementNotes || '' }
                                        // eslint-disable-next-line no-console
                                        console.log('QuickCreateModal: auto-creating engagement (with notes)', { createPayload })
                                        const createdEng = await apiClient.createEngagement(createPayload)
                                        const editingPayload = createdEng || { contactid: nidToUse }
                                        keepOpen = true
                                        setNestedEditing(editingPayload)
                                        setOpenNestedMode('engagement')
                                        openedNested = true
                                    } else {
                                        // Open nested editor locally without creating a server resource.
                                        keepOpen = true
                                        setNestedEditing(nestedPayload)
                                        setOpenNestedMode('engagement')
                                        openedNested = true
                                    }
                                }
                            } catch (e) {
                                // If anything goes wrong, fall back to opening nested modal with prefill
                                // eslint-disable-next-line no-console
                                console.error('QuickCreateModal: failed to open/create nested engagement', e)
                                if (onRequestOpenNested) {
                                    try {
                                        onRequestOpenNested('engagement', nestedPayload, (created: any) => {
                                            console.log('QuickCreateModal: onRequestOpenNested callback (fallback)', { created })
                                        })
                                        requestedTopNested = true
                                    } catch (ee) {
                                        // ignore
                                    }
                                }
                                if (!requestedTopNested) {
                                    setNestedEditing(nestedPayload)
                                    setOpenNestedMode('engagement')
                                    openedNested = true
                                }
                            }
                        } catch (e) {
                            // ignore
                        }
                    }
                    // Debug: log whether we'll close the parent modal
                    // eslint-disable-next-line no-console
                    console.log('QuickCreateModal: openedNested, keepOpen', { openedNested, keepOpen })
                    // If user requested, attach created contact to a task in Action Plan
                    if (addToActionPlan && selectedTaskId && contactTargetRefId) {
                        try {
                            await addTaskTarget(Number(selectedTaskId), { targettype: Number(contactTargetRefId), targetid: Number(newId) })
                            qc.invalidateQueries(['tasks'])
                        } catch (e) {
                            console.error('Failed to attach contact to task', e)
                        }
                    }
                    // If a lead was selected as the LinkedIn origin, mark it as promoted
                    if (selectedLeadId != null) {
                        try {
                            const allRef = await fetchReferenceData('lead_review_status')
                            const _norm = (v: any) => String(v || '').trim().toLowerCase()
                            const promoted = (allRef || []).find((r: any) => _norm(r.refvalue) === 'promoted to contact')
                            const prid = promoted ? Number(promoted.refid) : null
                            if (prid) {
                                await setLeadReviewOutcome(Number(selectedLeadId), Number(prid))
                                try { qc.invalidateQueries(['leads', 'availableForAssign']) } catch (e) { /* ignore */ }
                                try { qc.invalidateQueries(['leads']) } catch (e) { /* ignore */ }
                            }
                        } catch (e) {
                            // eslint-disable-next-line no-console
                            console.error('Failed to mark lead promoted after contact create', e)
                        }
                    }
                }
            } else if (mode === 'organisation') {
                if (!name) throw new Error('Organisation name required')
                if (editing && editing.orgid) {
                    // Only include `talentcommunitydateadded` in the payload when
                    // the organisation is a community member. Avoid sending
                    // explicit `null` values which some callers/tests do not
                    // expect.
                    const payload: Record<string, any> = { name }
                    if (sectorId != null) payload.sectorid = sectorId
                    if (communityMember) payload.talentcommunitydateadded = communityDate || new Date().toISOString().slice(0, 10)
                    await updateOrganisation(Number(editing.orgid), payload)
                    // Invalidate organisations and contact-related queries so tables refresh with the new sector
                    // Debug: log organisation update payload and editing id
                    try { console.debug('QuickCreateModal: organisation updated payload', { payload, editingOrgId: Number(editing.orgid) }) } catch (e) { /* ignore */ }
                    qc.invalidateQueries(['organisations'])
                    // Also invalidate any cached jobroles so tables that display company names refresh
                    try { qc.invalidateQueries({ predicate: (q: any) => Array.isArray(q.queryKey) && q.queryKey[0] === 'jobroles' }) } catch (e) { /* ignore */ }
                    // Proactively update any cached jobroles entries that reference this organisation
                    try {
                        const newName = payload.name
                        const orgId = Number(editing.orgid)
                        const allQueries = (qc as any).getQueryCache().getAll()
                        // Log current query keys and samples for inspection
                        try { console.debug('QuickCreateModal: QueryClient keys before jobroles updates', { keys: allQueries.map((qq: any) => qq.queryKey) }) } catch (e) { }
                        const updatedKeys: any[] = []
                        allQueries.forEach((q: any) => {
                            try {
                                if (Array.isArray(q.queryKey) && q.queryKey[0] === 'jobroles') {
                                    const data = qc.getQueryData(q.queryKey)
                                    try { console.debug('QuickCreateModal: found jobroles cache for key', { key: q.queryKey, count: Array.isArray(data) ? data.length : 0, sample: Array.isArray(data) ? data.slice(0, 3) : data }) } catch (e) { }
                                    if (Array.isArray(data)) {
                                        const updated = data.map((r: any) => {
                                            try {
                                                if (Number(r.companyorgid) === orgId) return { ...r, company_name: newName }
                                            } catch (e) { }
                                            return r
                                        })
                                        qc.setQueryData(q.queryKey, updated)
                                        updatedKeys.push(q.queryKey)
                                        try { console.debug('QuickCreateModal: updated jobroles cache for key', { key: q.queryKey, updatedSample: updated.slice(0, 3) }) } catch (e) { }
                                    }
                                }
                            } catch (e) { /* ignore per-query errors */ }
                        })
                        try { console.debug('QuickCreateModal: jobroles cache updated keys', { updatedKeys }) } catch (e) { }
                    } catch (e) {
                        try { console.error('QuickCreateModal: cache update failures', { err: e }) } catch (ee) { }
                    }
                    // Force refetch of any active jobroles queries to pick up remote changes
                    try { console.debug('QuickCreateModal: triggering refetch for jobroles queries (predicate: startsWith jobroles)') } catch (e) { }
                    try {
                        // Log which queries will be refetched
                        const beforeRefetch = (qc as any).getQueryCache().getAll().filter((qq: any) => Array.isArray(qq.queryKey) && qq.queryKey[0] === 'jobroles').map((qq: any) => qq.queryKey)
                        try { console.debug('QuickCreateModal: jobroles queries to refetch', { beforeRefetch }) } catch (e) { }
                        qc.refetchQueries({ predicate: (q: any) => Array.isArray(q.queryKey) && q.queryKey[0] === 'jobroles' })
                        // After refetch, attempt to log samples for primary keys
                        const afterQueries = (qc as any).getQueryCache().getAll().filter((qq: any) => Array.isArray(qq.queryKey) && qq.queryKey[0] === 'jobroles')
                        const afterSamples = (afterQueries as any[]).map((qq: any) => {
                            const dataAny: any = qc.getQueryData(qq.queryKey)
                            return { key: qq.queryKey, sample: Array.isArray(dataAny) ? dataAny.slice(0, 3) : dataAny }
                        })
                        try { console.debug('QuickCreateModal: post-refetch jobroles samples', { afterSamples }) } catch (e) { }
                    } catch (e) { try { console.error('QuickCreateModal: refetchQueries failed', { err: e }) } catch (ee) { } }
                    qc.invalidateQueries(['contactsList'])
                    qc.invalidateQueries(['contactsAllForHeat'])
                    qc.invalidateQueries(['contactsCount'])
                    qc.invalidateQueries(['contactsAllForHeat'])
                    qc.invalidateQueries(['contactsCount'])
                    showToast('Organisation updated', 'success')
                } else {
                    const created = await createOrganisation({ name, sectorid: sectorId ?? undefined, talentcommunitydateadded: communityMember ? (communityDate || new Date().toISOString().slice(0, 10)) : null })
                    qc.invalidateQueries(['organisations'])
                    try { qc.refetchQueries({ predicate: (q: any) => Array.isArray(q.queryKey) && q.queryKey[0] === 'jobroles' }) } catch (e) { /* ignore */ }
                    showToast('Organisation created', 'success')
                    if (onSuccess) {
                        try {
                            // allow parent to react to nested create (e.g. set selected org)
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            await (onSuccess as any)(created)
                        } catch (e) {
                            // ignore errors from onSuccess
                        }
                    }
                }
            } else if (mode === 'jobrole') {
                if (!role) throw new Error('Role name is required')
                // Organisation is always required
                try { console.debug('QuickCreateModal: submit jobrole pre-validate', { selectedOrg, orgInput }) } catch (err) { }
                if (!selectedOrg) throw new Error('Please select an organisation')
                // Contact is optional when creating a jobrole. When editing, contact may be cleared.
                if (editing && editing.jobid) {
                    const orgName = (orgsQ.data ?? []).find((o: any) => Number(o.orgid) === Number(selectedOrg))?.name
                    // If selectedContact is null, include contactid explicitly as empty string so backend treats it as "clear"
                    const payload: Record<string, any> = { rolename: role, company_name: orgName ?? undefined, applicationdate: applicationDate ?? undefined }
                    if (selectedContact != null) {
                        payload.contactid = Number(selectedContact)
                    } else {
                        // If selectedContact is null, include contactid explicitly as empty string so backend treats it as "clear"
                        payload.contactid = ''
                    }
                    // Include organisation id when editing so the backend can update companyorgid
                    payload.companyorgid = Number(selectedOrg)
                    if (selectedStatusId != null) payload.statusid = Number(selectedStatusId)
                    if (selectedSourceId != null) payload.sourcechannelid = Number(selectedSourceId)
                    await updateJobRole(Number(editing.jobid), payload)
                    // Reconcile documents attached to this jobrole
                    try {
                        const jid = Number(editing.jobid)
                        if (jid) {
                            const currentDocs = await fetchJobRoleDocuments(jid)
                            const currentIds = new Set((currentDocs || []).map((x: any) => Number(x.documentid ?? x.id ?? x)))
                            const selectedIds = new Set((selectedDocuments || []).map((d: any) => Number(d.documentid ?? d.id ?? d)))
                            // Detach removed
                            for (const docId of Array.from(currentIds)) {
                                if (!selectedIds.has(Number(docId))) {
                                    try {
                                        await detachDocumentFromJobRole(jid, Number(docId))
                                    } catch (e) {
                                        // eslint-disable-next-line no-console
                                        console.error('Failed to detach document from jobrole', { jobid: jid, documentId: docId, err: e })
                                    }
                                }
                            }
                            // Attach new
                            for (const docId of Array.from(selectedIds)) {
                                if (!currentIds.has(Number(docId))) {
                                    try {
                                        await attachDocumentToJobRole(jid, Number(docId))
                                    } catch (e) {
                                        // eslint-disable-next-line no-console
                                        console.error('Failed to attach document to jobrole', { jobid: jid, documentId: docId, err: e })
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // ignore
                    }
                    qc.invalidateQueries(['jobroles'])
                    try {
                        qc.invalidateQueries({ predicate: (q: any) => Array.isArray(q.queryKey) && q.queryKey[0] === 'jobroles' })
                    } catch (e) { /* ignore */ }
                    showToast('Job role updated', 'success')
                } else {
                    // If no application date was set in the create modal, default to today's date.
                    const defaultAppDate = applicationDate ?? new Date().toISOString().slice(0, 10)
                    const payload: Record<string, any> = { rolename: role, companyorgid: Number(selectedOrg), applicationdate: defaultAppDate }
                    // Include contactid only when a contact has been selected. This avoids sending contactid: 0.
                    if (selectedContact != null) payload.contactid = Number(selectedContact)
                    // Debug: log the payload so we can verify applicationdate is present when creating roles
                    // eslint-disable-next-line no-console
                    console.debug('[QuickCreateModal] create jobrole payload', payload)
                    if (selectedStatusId != null) payload.statusid = Number(selectedStatusId)
                    if (selectedSourceId != null) payload.sourcechannelid = Number(selectedSourceId)
                    const created = await createJobRole(payload)
                    // Ensure any jobroles queries (including ones keyed with contactId) are invalidated
                    qc.invalidateQueries(['jobroles'])
                    try {
                        qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'jobroles' })
                    } catch (e) {
                        // ignore if react-query runtime signatures differ
                    }
                    showToast('Job role created', 'success')
                    // Reconcile documents for newly created jobrole
                    try {
                        const jid = Number(created?.jobid ?? created?.id ?? created?.jobId ?? null)
                        if (jid) {
                            const currentDocs = await fetchJobRoleDocuments(jid)
                            const currentIds = new Set((currentDocs || []).map((x: any) => Number(x.documentid ?? x.id ?? x)))
                            const selectedIds = new Set((selectedDocuments || []).map((d: any) => Number(d.documentid ?? d.id ?? d)))
                            for (const docId of Array.from(selectedIds)) {
                                if (!currentIds.has(Number(docId))) {
                                    try {
                                        await attachDocumentToJobRole(jid, Number(docId))
                                    } catch (e) {
                                        // eslint-disable-next-line no-console
                                        console.error('Failed to attach document to jobrole after create', { jobid: jid, documentId: docId, err: e })
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // ignore
                    }
                }
            } else if (mode === 'engagement') {
                // Accept either a single selected contact (`selectedContact`) or
                // one or more contacts in `selectedContacts` for group engagements.
                if (!(selectedContacts && selectedContacts.length) && !selectedContact) throw new Error('Please select a contact')
                if (!engagementDate) throw new Error('Please select a date')
                if (engagementKind === '' || engagementKind == null) throw new Error('Please select a kind')

                const payload: Record<string, any> = {
                    companyorgid: selectedOrg ? Number(selectedOrg) : null,
                    logdate: engagementDate,
                    // Send both `logentry` and `notes` so backends expecting either
                    // key will receive the user's input. Avoids mismatches where
                    // one key is ignored by server-side parsing.
                    logentry: engagementNotes || '',
                    notes: engagementNotes || '',
                }

                // Support multiple-contact engagements: send `contact_ids` when more than one selected
                if (selectedContacts && selectedContacts.length > 1) {
                    payload.contact_ids = selectedContacts.map((c: any) => Number(c.contactid || c))
                } else if (selectedContacts && selectedContacts.length === 1) {
                    payload.contactid = Number(selectedContacts[0].contactid || selectedContacts[0])
                } else if (selectedContact != null) {
                    payload.contactid = Number(selectedContact)
                }

                if (typeof engagementKind === 'number' || !isNaN(Number(engagementKind))) {
                    // Server expects `engagementtype_refid` (canonical referencedata refid)
                    payload.engagementtype_refid = Number(engagementKind)
                } else if (typeof engagementKind === 'string' && engagementKind) {
                    // Legacy or code-based lookup is supported via engagement_type_code
                    payload.engagement_type_code = engagementKind
                }

                if (editing && (editing.engagementid || editing.engagementlogid)) {
                    const id = editing.engagementid ?? editing.engagementlogid
                    // Debug: log payload before update
                    // eslint-disable-next-line no-console
                    console.debug('QuickCreateModal: updateEngagement payload', { id, payload })
                    await updateEngagement(Number(id), payload)
                    // Reconcile documents: detach removed ones, attach newly selected ones.
                    try {
                        // Fetch current attachments for this engagement from the server
                        // eslint-disable-next-line no-console
                        console.debug('QuickCreateModal: reconciling engagement documents', { engagementId: id })
                        const currentDocs = await fetchDocuments(Number(id))
                        // Normalize ids to numbers
                        const currentIds = new Set((currentDocs || []).map((x: any) => {
                            const candidate = x && (x.documentid ?? x.id ?? x)
                            return Number(candidate)
                        }))
                        const selectedIds = new Set((selectedDocuments || []).map((d: any) => {
                            let candidate: any = null
                            if (d == null) candidate = d
                            else if (typeof d === 'object') candidate = d.documentid ?? d.id ?? d.docid ?? null
                            else candidate = d
                            return Number(candidate)
                        }))

                        // Detach documents present on server but no longer selected
                        for (const docId of Array.from(currentIds)) {
                            if (!selectedIds.has(Number(docId))) {
                                try {
                                    // eslint-disable-next-line no-console
                                    console.debug('QuickCreateModal: detaching document from engagement', { engagementId: id, documentId: docId })
                                    await apiClient.detachDocumentFromEngagement(Number(id), Number(docId))
                                } catch (e) {
                                    // eslint-disable-next-line no-console
                                    console.error('Failed to detach document from engagement', { engagementId: id, documentId: docId, err: e })
                                }
                            }
                        }

                        // Attach any selected documents not already attached
                        for (const docId of Array.from(selectedIds)) {
                            if (!currentIds.has(Number(docId))) {
                                try {
                                    // eslint-disable-next-line no-console
                                    console.debug('QuickCreateModal: attaching document to engagement', { engagementId: id, documentId: docId })
                                    await apiClient.attachDocumentToEngagement(Number(id), Number(docId))
                                } catch (e) {
                                    // eslint-disable-next-line no-console
                                    console.error('Failed to attach document to engagement', { engagementId: id, documentId: docId, err: e })
                                }
                            }
                        }
                    } catch (e) {
                        // eslint-disable-next-line no-console
                        console.error('QuickCreateModal: error reconciling engagement documents', { engagementId: id, err: e })
                    }
                    // Invalidate the queries Hub relies on so stats/cards refresh
                    qc.invalidateQueries(['engagementsAll'])
                    qc.invalidateQueries(['engagementsCount'])
                    qc.invalidateQueries(['analyticsSummary'])
                    qc.invalidateQueries(['contactsList'])
                    qc.invalidateQueries(['contactsAllForHeat'])
                    qc.invalidateQueries(['contactsCount'])
                    try { qc.invalidateQueries(['documents']) } catch (e) { /* ignore when no qc */ }
                    try { window.dispatchEvent(new Event('documents:refresh')) } catch (e) { /* ignore */ }
                    // Also invalidate/refetch any active `engagements` queries so the EngagementsTable refreshes immediately
                    try {
                        const contactIdForInvalidate = Number(payload.contactid ?? (payload.contact_ids ? payload.contact_ids[0] : null) ?? (selectedContacts && selectedContacts.length ? Number(selectedContacts[0].contactid) : selectedContact) ?? editing?.contactid ?? null)
                        if (contactIdForInvalidate) qc.invalidateQueries(['engagements', contactIdForInvalidate])
                        // Some components use the key `['engagements', contactId]` while others may use `['engagements']` or `['engagements', undefined]`.
                        // Force-refetch all active queries whose first key segment is 'engagements'.
                        qc.refetchQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'engagements' })
                    } catch (e) {
                        // ignore any runtime differences
                    }
                    showToast('Engagement updated', 'success')
                } else {
                    // Create the engagement and capture created response so we can
                    // attach any selected documents to the newly created engagement.
                    // Client-side validation to avoid sending requests that the
                    // server will immediately reject and to give clearer UX
                    // feedback when required fields are missing.
                    try {
                        if (!(payload.contactid || (payload.contact_ids && payload.contact_ids.length))) {
                            throw new Error('Please select one or more contacts')
                        }
                        if (!payload.logdate || String(payload.logdate).trim().length === 0) {
                            throw new Error('Please select a date')
                        }
                        if (!payload.logentry || String(payload.logentry).trim().length === 0) {
                            throw new Error('Please enter notes')
                        }
                    } catch (vErr) {
                        // Surface validation message to the user instead of
                        // allowing a server 400 to be the only signal.
                        // eslint-disable-next-line no-console
                        console.debug('QuickCreateModal: client-side validation failed', { err: vErr, payload })
                        throw vErr
                    }

                    // Debug: log payload before create
                    // eslint-disable-next-line no-console
                    console.debug('QuickCreateModal: createEngagement payload', payload)
                    let created: any = null
                    try {
                        created = await apiClient.createEngagement(payload)
                    } catch (createErr: any) {
                        // Log rich diagnostic info to help trace 400 responses
                        try {
                            // eslint-disable-next-line no-console
                            console.error('QuickCreateModal: createEngagement failed', {
                                errorMessage: createErr?.message,
                                code: createErr?.code,
                                url: createErr?.config?.url,
                                method: createErr?.config?.method,
                                requestData: createErr?.config?.data ?? payload,
                                responseStatus: createErr?.response?.status,
                                responseData: createErr?.response?.data,
                                responseHeaders: createErr?.response?.headers,
                            })
                        } catch (logErr) {
                            // eslint-disable-next-line no-console
                            console.error('QuickCreateModal: failed logging createEngagement error', logErr)
                        }
                        throw createErr
                    }

                    // If documents were selected in the modal, attach them to the
                    // newly created engagement so linkage is persisted.
                    try {
                        const eid = Number(created?.engagementid ?? created?.engagementlogid ?? created?.id ?? null)
                        if (eid && Array.isArray(selectedDocuments) && selectedDocuments.length) {
                            for (const d of selectedDocuments) {
                                try {
                                    const docId = Number(d?.documentid ?? d?.id ?? d)
                                    if (!Number.isNaN(docId)) await apiClient.attachDocumentToEngagement(eid, docId)
                                } catch (e) {
                                    // log individual attach failure but continue
                                    // eslint-disable-next-line no-console
                                    console.error('QuickCreateModal: attachDocumentToEngagement failed', { engagementId: eid, err: e })
                                }
                            }
                        }
                    } catch (e) {
                        // eslint-disable-next-line no-console
                        console.error('QuickCreateModal: failed attaching documents after create', { err: e })
                    }

                    // Invalidate the queries Hub relies on so the stats and interview counts update
                    qc.invalidateQueries(['engagementsAll'])
                    qc.invalidateQueries(['engagementsCount'])
                    qc.invalidateQueries(['analyticsSummary'])
                    qc.invalidateQueries(['contactsList'])
                    qc.invalidateQueries(['contactsAllForHeat'])
                    qc.invalidateQueries(['contactsCount'])
                    // Also invalidate/refetch any active `engagements` queries so the EngagementsTable refreshes immediately
                    try {
                        const contactIdForInvalidate = Number(payload.contactid ?? (payload.contact_ids ? payload.contact_ids[0] : null) ?? (selectedContacts && selectedContacts.length ? Number(selectedContacts[0].contactid) : selectedContact) ?? null)
                        if (contactIdForInvalidate) qc.invalidateQueries(['engagements', contactIdForInvalidate])
                        qc.refetchQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'engagements' })
                    } catch (e) {
                        // ignore
                    }
                    showToast('Engagement created', 'success')
                }
            }
            // Close the parent modal when not explicitly keeping it open.
            // If a top-level nested request was made, delay closing slightly so
            // the parent can render the top-level nested modal before this
            // modal unmounts. This avoids race conditions where the nested
            // modal would not become visible.
            try {
                if (requestedTopNested && !keepOpen) {
                    // small delay to allow parent state to propagate
                    setTimeout(() => {
                        try { onClose() } catch (e) { /* ignore */ }
                    }, 80)
                } else if (!openedNested && !keepOpen) {
                    onClose()
                }
            } catch (e) {
                try { onClose() } catch (ee) { /* ignore */ }
            }
        } catch (err: any) {
            // Improve error reporting for network/server errors (e.g. 400/409)
            try {
                // Log full error for debugging with as much context as available
                // eslint-disable-next-line no-console
                console.error('QuickCreateModal submit error', {
                    message: err?.message,
                    code: err?.code,
                    config: err?.config,
                    requestData: err?.config?.data,
                    responseStatus: err?.response?.status,
                    responseData: err?.response?.data,
                    responseHeaders: err?.response?.headers,
                })
                const serverData = err?.response?.data
                const serverMessage = serverData?.error || serverData?.message || serverData || null
                const userMsg = serverMessage || err?.message || 'Failed to create/update'
                showToast(String(userMsg), 'error')
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error('QuickCreateModal submit error (fallback)', e)
                showToast('Failed to create/update', 'error')
            }
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <>
            <Dialog open={open} onClose={() => { try { resetFormState() } catch (e) { }; console.log('QuickCreateModal: Dialog onClose handler invoked'); onClose() }} fullWidth>
                <DialogTitle>{modalTitle}</DialogTitle>
                <DialogContent
                    sx={{
                        // Vertically centre only Select and Autocomplete value display
                        // areas within FormControls marked with `.qt-select`. This
                        // ensures TextField textboxes keep their default baseline
                        // alignment while dropdowns and pickers are vertically
                        // centred for visual consistency.
                        '& .qt-select .MuiSelect-select, & .qt-select .MuiSelect-select:focus, & .qt-select .MuiAutocomplete-root .MuiAutocomplete-inputRoot': {
                            display: 'flex',
                            alignItems: 'center',
                            paddingTop: '6px',
                            paddingBottom: '6px',
                            lineHeight: 1.4,
                            minHeight: 36,
                        },
                        // Also target outlined select variants inside `.qt-select`
                        '& .qt-select .MuiSelect-select.MuiSelect-outlined, & .qt-select .MuiOutlinedInput-root .MuiSelect-select': {
                            display: 'flex',
                            alignItems: 'center',
                        },
                        // Ensure any outlined inputs inside this modal render above
                        // dialog content so notched outlines are visible.
                        '& .MuiOutlinedInput-root': {
                            position: 'relative',
                            zIndex: (theme: any) => (theme?.zIndex?.modal ?? 1300) + 10,
                        },
                        '& .MuiOutlinedInput-notchedOutline': {
                            borderStyle: 'solid',
                            borderWidth: '1px',
                            borderColor: 'rgba(0,0,0,0.23)'
                        },
                        '& .MuiOutlinedInput-notchedOutline legend, & .MuiOutlinedInput-notchedOutline legend span': {
                            display: 'inline-block',
                            visibility: 'visible'
                        },
                    }}
                >
                    {mode === 'contact' && (
                        <>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                                <FormControlLabel
                                    control={<Checkbox checked={isLinkedInConnected ?? false} onChange={e => setIsLinkedInConnected(e.target.checked)} disabled={isLinkedInLocked} />}
                                    label="LinkedIn connected"
                                />
                                {/* Create engagement checkbox moved below next to Add to Action plan */}
                                {/* Lead picker appears to the right of the LinkedIn checkbox and sizes to fit */}
                                <Box sx={{ flex: 1, minWidth: 240, maxWidth: 520 }}>
                                    {isLinkedInConnected && (
                                        <Autocomplete
                                            options={leadOptions}
                                            getOptionLabel={(option: any) => option ? (option.name || option.full_name || option.email || '') : ''}
                                            loading={leadsQ.isLoading}
                                            value={(() => {
                                                const resolved = resolveOptionById(leadOptions, selectedLeadId, 'leadid')
                                                const hasLabel = resolved && (resolved.name || resolved.full_name || resolved.email)
                                                return hasLabel ? resolved : (selectedLeadOption || null)
                                            })()}
                                            isOptionEqualToValue={optionEqualsById('leadid')}
                                            onChange={(_, value) => setSelectedLeadId(value ? toNumberOrNull(value.leadid) : null)}
                                            renderOption={(props, option: any) => (
                                                <li {...props} key={option?.leadid ?? option?.id ?? JSON.stringify(option)}>
                                                    {option ? (option.name || option.full_name || option.email) : ''}
                                                </li>
                                            )}
                                            renderInput={(params) => (
                                                <TextField
                                                    {...params}
                                                    size="small"
                                                    label="Originating lead"
                                                    margin="none"
                                                    fullWidth
                                                    InputProps={{
                                                        ...params.InputProps,
                                                        endAdornment: (
                                                            <>
                                                                {leadsQ.isLoading ? <CircularProgress color="inherit" size={18} /> : null}
                                                                {params.InputProps.endAdornment}
                                                            </>
                                                        ),
                                                    }}
                                                />
                                            )}
                                        />
                                    )}
                                </Box>
                            </Box>
                            <TextField value={name} onChange={(e) => setName(e.target.value)} label="Contact name" fullWidth margin="normal" />
                            <TextField label="Title" value={currentRole} onChange={(e) => setCurrentRole(e.target.value)} fullWidth margin="normal" />
                            {/* If the provided company does not exactly match an existing organisation,
                                show it above the organisation picker as a read-only text so users can
                                review the incoming company name; leave the organisation dropdown blank */}
                            {!(isCompanyExactMatchOnOpen === true) && incomingCompanyOnOpen ? (
                                <TextField value={incomingCompanyOnOpen} label="Incoming company" fullWidth margin="normal" InputProps={{ readOnly: true }} />
                            ) : null}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box style={{ flex: 1 }}>
                                    <Autocomplete
                                        freeSolo
                                        options={orgsQ.data ?? []}
                                        getOptionLabel={(option: any) => (typeof option === 'string' ? option : option?.name || '')}
                                        loading={orgsQ.isLoading}
                                        // Keep the selected option (the chosen organisation) separate
                                        // from the input text. `value` is the selected org object
                                        // (or null). `inputValue` is the typed organisation input.
                                        value={selectedOrgObj ?? null}
                                        inputValue={orgInput || ''}
                                        isOptionEqualToValue={(opt: any, val: any) => {
                                            if (!opt || !val) return false
                                            return Number(opt.orgid) === Number(val.orgid)
                                        }}
                                        onChange={(_, value) => {
                                            if (value && typeof value === 'object') {
                                                // User explicitly selected an organisation: set id and
                                                // also update the visible input so the selection stays
                                                // visible. Do NOT modify the captured incomingCompanyOnOpen.
                                                const id = Number((value as any).orgid)
                                                const name = String(((value as any).name) || '')
                                                try { console.debug('QuickCreateModal: contact org onChange selected object', { id, name }) } catch (err) { }
                                                setSelectedOrg(id)
                                                setOrgInput(name)
                                            } else if (typeof value === 'string') {
                                                // freeSolo string chosen as a value (user picked a
                                                // plain string option) — treat as typed input
                                                try { console.debug('QuickCreateModal: contact org onChange string', { value }) } catch (err) { }
                                                setOrgInput(value)
                                                setSelectedOrg(null)
                                            } else {
                                                // Selection cleared
                                                try { console.debug('QuickCreateModal: contact org onChange cleared') } catch (err) { }
                                                setSelectedOrg(null)
                                                setOrgInput('')
                                            }
                                        }}
                                        onInputChange={(_, newInputValue, reason) => {
                                            // Update `orgInput` when the user types. We do NOT
                                            // mutate `incomingCompanyOnOpen` here so the read-only
                                            // incoming company remains fixed while the modal is open.
                                            if (reason === 'input') {
                                                try { console.debug('QuickCreateModal: contact org onInputChange', { newInputValue, reason }) } catch (err) { }
                                                setOrgInput(newInputValue)
                                            } else if (reason === 'clear') {
                                                try { console.debug('QuickCreateModal: contact org onInputChange clear') } catch (err) { }
                                                setOrgInput('')
                                                setSelectedOrg(null)
                                            }
                                        }}

                                        ListboxProps={{ style: { maxHeight: 240, overflowY: 'auto' } } as any}
                                        renderInput={(params) => (
                                            <TextField
                                                {...params}
                                                label="Organisation"
                                                margin="normal"
                                                fullWidth
                                                InputProps={{
                                                    ...params.InputProps,
                                                    endAdornment: (
                                                        <>
                                                            {orgsQ.isLoading ? <CircularProgress color="inherit" size={20} /> : null}
                                                            {params.InputProps.endAdornment}
                                                            {/* Edit selected organisation inline when available */}
                                                            {selectedOrgObj ? (
                                                                <IconButton
                                                                    size="small"
                                                                    sx={{ ml: 1 }}
                                                                    aria-label="Edit organisation"
                                                                    onClick={() => {
                                                                        try {
                                                                            if (onRequestOpenNested) {
                                                                                onRequestOpenNested('organisation', selectedOrgObj)
                                                                                return
                                                                            }
                                                                        } catch (e) {
                                                                            // ignore and fallback to local nested open
                                                                        }
                                                                        setNestedEditing(selectedOrgObj)
                                                                        setOpenNestedMode('organisation')
                                                                    }}
                                                                >
                                                                    <EditIcon fontSize="small" />
                                                                </IconButton>
                                                            ) : null}
                                                            <IconButton size="small" sx={{ ml: 1 }} aria-label="Add organisation" onClick={() => { setForceShowTargets(true); setOpenNestedMode('organisation') }}>
                                                                <AddIcon fontSize="small" />
                                                            </IconButton>
                                                        </>
                                                    ),
                                                }}
                                            />
                                        )}
                                    />
                                </Box>
                                {/* Test hook: vitest DOM may not render nested endAdornment consistently; provide a test-only visible button so tests can reliably open the nested organisation modal. */}
                                {typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test' ? (
                                    <AppButton size="small" colorScheme="white" aria-label="Add organisation" onClick={() => setOpenNestedMode('organisation')} sx={{ alignSelf: 'flex-start', mt: 2 }}>
                                        Add organisation
                                    </AppButton>
                                ) : null}
                            </Box>
                            {/* Add to Action Plan checkbox and optional task picker are rendered below Contact Type */}
                            <FormControl className="qt-select" fullWidth margin="normal">
                                <InputLabel
                                    id="role-type-label"
                                    shrink={roleTypeId != null}
                                    sx={{
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        // Reserve reasonable space on the right so the outline
                                        // notch has room in tight layouts without becoming oversized.
                                        maxWidth: 'calc(100% - 48px)',
                                        // When the label is shrunk (floating), nudge it left/up
                                        // slightly to avoid overlapping the right outline notch
                                        // in tight layouts (create-contact from leads).
                                        '&.MuiInputLabel-shrink': {
                                            transform: 'translate(10px, -8px) scale(0.75) !important',
                                            transformOrigin: 'left top',
                                        },
                                    }}
                                >
                                    {mode === 'contact' ? 'Contact Type' : 'Role type'}
                                </InputLabel>
                                <Select
                                    labelId="role-type-label"
                                    value={roleTypeId ?? ''}
                                    label="Role type"
                                    onChange={(e) => {
                                        const val = e.target.value ? Number(e.target.value) : null
                                        try { console.debug('QuickCreateModal: roleType onChange', { raw: e.target.value, val }) } catch (err) { }
                                        setRoleTypeId(val)
                                    }}
                                    disabled={!!lockRoleType}
                                    size="small"
                                    input={<OutlinedInput label="Role type" notched={roleTypeId != null} />}
                                    sx={{
                                        '& .MuiSelect-select': { display: 'flex', alignItems: 'center' },
                                        // Add moderate right padding so the outlined notch has
                                        // enough room but is not oversized.
                                        '& .MuiOutlinedInput-notchedOutline': { paddingRight: '32px' },
                                        // Avoid visual double-border at the top while focused
                                        '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderTop: '0px' },
                                        '& .MuiOutlinedInput-notchedOutline legend': { paddingRight: '12px', paddingLeft: '8px', display: roleTypeId != null ? 'block' : 'none' },
                                        // Ensure the select icon remains visible and positioned
                                        '& .MuiSelect-icon': { right: 8 },
                                    }}
                                >
                                    {roleTypesQ.isLoading ? (
                                        <MenuItem value="">Loading...</MenuItem>
                                    ) : roleTypesQ.data && roleTypesQ.data.length > 0 ? (
                                        roleTypesQ.data.map((r: any) => (
                                            <MenuItem key={r.refid} value={Number(r.refid)}>
                                                {r.refvalue || r.label || r.code}
                                            </MenuItem>
                                        ))
                                    ) : (
                                        <MenuItem value="">None</MenuItem>
                                    )}
                                </Select>
                            </FormControl>


                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
                                {!isRealEdit && !hideAddToActionPlan && (
                                    <FormControlLabel
                                        control={<Checkbox checked={addToActionPlan} onChange={(e) => { setAddToActionPlan(e.target.checked); if (!e.target.checked) setSelectedTaskId(null) }} />}
                                        label="Add to Action plan"
                                    />
                                )}
                                {addToActionPlan && (
                                    <FormControl className="qt-select" margin="normal" size="small" sx={{ minWidth: 220, flex: 1 }}>
                                        <InputLabel
                                            id="select-task-label"
                                            shrink={selectedTaskId != null}
                                            sx={{
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                maxWidth: 'calc(100% - 48px)',
                                                '&.MuiInputLabel-shrink': {
                                                    transform: 'translate(10px, -8px) scale(0.75) !important',
                                                    transformOrigin: 'left top',
                                                },
                                            }}
                                        >
                                            Task
                                        </InputLabel>
                                        <Select
                                            labelId="select-task-label"
                                            value={selectedTaskId ?? ''}
                                            label="Task"
                                            onChange={(e) => setSelectedTaskId(e.target.value ? Number(e.target.value) : null)}
                                            size="small"
                                            input={<OutlinedInput label="Task" notched={selectedTaskId != null} />}
                                            sx={{
                                                width: '100%',
                                                '& .MuiSelect-select': { display: 'flex', alignItems: 'center' },
                                                // Keep a moderate notch width similar to Contact Type
                                                '& .MuiOutlinedInput-notchedOutline': { paddingRight: '12px' },
                                                // Avoid visual double-border at the top while focused
                                                '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderTop: '0px' },
                                                '& .MuiOutlinedInput-notchedOutline legend': { paddingRight: '12px', paddingLeft: '8px', display: selectedTaskId != null ? 'block' : 'none' },
                                                '& .MuiOutlinedInput-notchedOutline legend span': { padding: 0, fontSize: '0.85rem', display: selectedTaskId != null ? 'inline-block' : 'none' },
                                                '& .MuiSelect-icon': { right: 8 },
                                            }}
                                        >
                                            {tasksQ.isLoading ? <MenuItem value="">Loading...</MenuItem> : (
                                                (tasksQ.data || []).map((t: any) => (
                                                    <MenuItem key={t.taskid} value={Number(t.taskid)}>{t.name}</MenuItem>
                                                ))
                                            )}
                                        </Select>
                                    </FormControl>
                                )}
                                {/* place Create+Engagement checkbox to the right/bottom of this area */}
                                <Box sx={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end' }}>
                                    {!isRealEdit && !hideCreateAndAddEngagement && (
                                        <FormControlLabel
                                            control={<Checkbox checked={createAndAddEngagement} onChange={(e) => setCreateAndAddEngagement(e.target.checked)} />}
                                            label="Create and add engagement"
                                        />
                                    )}
                                </Box>
                            </Box>
                            {/* Next Step removed — migrated to Action Plan (tasks) */}
                            {/* Attach documents removed from contact create/edit to avoid confusion
                                Documents are attached to engagements; use 'Create engagement' to attach documents to a contact's engagement. */}
                            {isRecruiter && (() => {
                                // determine organisation sector from resolved org object or editing payload
                                const orgSector = (
                                    (selectedOrgObj && (selectedOrgObj.sector || selectedOrgObj.sector_summary)) ||
                                    editing?.current_org_sector ||
                                    editing?.currentorgsector ||
                                    editing?.sector_summary ||
                                    editing?.sector || ''
                                )
                                const sectorLooksRecruit = String(orgSector).toLowerCase().includes('recruit')
                                // Show target organisations for recruiters when creating new contacts
                                // or when editing recruiters whose organisation sector implies recruitment.
                                return !editing || sectorLooksRecruit || forceShowTargets || (selectedTargets && selectedTargets.length > 0)
                            })() && (
                                    <Autocomplete
                                        multiple
                                        options={orgsQ.data ?? []}
                                        getOptionLabel={(o: any) => o.name || ''}
                                        value={selectedTargets}
                                        onChange={handleTargetsChange}
                                        isOptionEqualToValue={(opt, val) => Number(opt.orgid) === Number(val.orgid)}
                                        renderInput={(params) => (
                                            <TextField
                                                {...params}
                                                label="Target organisations"
                                                margin="normal"
                                                placeholder="Select organisations"
                                                InputProps={{
                                                    ...params.InputProps,
                                                    endAdornment: (
                                                        <>
                                                            {orgsQ.isLoading ? <CircularProgress color="inherit" size={20} /> : null}
                                                            {params.InputProps.endAdornment}
                                                            <IconButton size="small" sx={{ ml: 1 }} aria-label="Add organisation" onClick={() => setOpenNestedMode('organisation')}>
                                                                <AddIcon fontSize="small" />
                                                            </IconButton>
                                                        </>
                                                    ),
                                                }}
                                            />
                                        )}
                                    />
                                )}
                        </>
                    )}

                    {mode === 'organisation' && (
                        <>
                            <TextField value={name} onChange={(e) => setName(e.target.value)} label="Organisation name" fullWidth margin="normal" />

                            <Autocomplete
                                options={sectorsQ.data ?? []}
                                getOptionLabel={(option: any) => option ? option.summary || '' : ''}
                                loading={sectorsQ.isLoading}
                                value={resolveOptionById(sectorsQ.data ?? [], sectorId, 'sectorid')}
                                isOptionEqualToValue={optionEqualsById('sectorid')}
                                onChange={(_, value) => setSectorId(value ? toNumberOrNull(value.sectorid) : null)}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Sector"
                                        margin="normal"
                                        fullWidth
                                        InputProps={{
                                            ...params.InputProps,
                                            endAdornment: (
                                                <>
                                                    {sectorsQ.isLoading ? <CircularProgress color="inherit" size={20} /> : null}
                                                    {params.InputProps.endAdornment}
                                                </>
                                            ),
                                        }}
                                    />
                                )}
                            />
                            <FormControlLabel
                                control={<Checkbox checked={communityMember} onChange={(e) => { setCommunityMember(e.target.checked); if (!e.target.checked) setCommunityDate(null) }} />}
                                label="Member of Talent Community"
                            />
                            {communityMember && (
                                <DatePicker
                                    label="Date added to community"
                                    value={communityDate ?? null}
                                    onChange={(v) => setCommunityDate(v ?? null)}
                                    sx={{ width: '100%' }}
                                />
                            )}
                        </>
                    )}

                    {mode === 'jobrole' && (
                        <>
                            <TextField value={role} onChange={(e) => setRole(e.target.value)} label="Role name" fullWidth margin="normal" />

                            <Autocomplete
                                options={orgsQ.data ?? []}
                                getOptionLabel={(option: any) => option ? option.name || '' : ''}
                                loading={orgsQ.isLoading}
                                value={resolveOptionById(orgsQ.data ?? [], selectedOrg, 'orgid')}
                                isOptionEqualToValue={optionEqualsById('orgid')}
                                onChange={(_, value) => {
                                    const id = value ? toNumberOrNull((value as any).orgid) : null
                                    try { console.debug('QuickCreateModal: jobrole org onChange', { value, id }) } catch (err) { }
                                    setSelectedOrg(id)
                                }}

                                ListboxProps={{ style: { maxHeight: 240, overflowY: 'auto' } } as any}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Organisation"
                                        margin="normal"
                                        fullWidth
                                        InputProps={{
                                            ...params.InputProps,
                                            endAdornment: (
                                                <>
                                                    {orgsQ.isLoading ? <CircularProgress color="inherit" size={20} /> : null}
                                                    {params.InputProps.endAdornment}
                                                    <IconButton size="small" sx={{ ml: 1 }} aria-label="Add organisation" onClick={() => setOpenNestedMode('organisation')}>
                                                        <AddIcon fontSize="small" />
                                                    </IconButton>
                                                </>
                                            ),
                                        }}
                                    />
                                )}
                            />

                            <FormControlLabel
                                control={<Checkbox checked={filterContactsByOrg} onChange={(e) => setFilterContactsByOrg(e.target.checked)} />}
                                label="Filter contacts by selected organisation"
                            />

                            <Autocomplete
                                options={filteredContacts ?? []}
                                getOptionLabel={(option: any) => option ? option.name || '' : ''}
                                loading={contactsQ.isLoading}
                                value={resolveOptionById(filteredContacts ?? contactsQ.data ?? [], selectedContact, 'contactid')}
                                isOptionEqualToValue={optionEqualsById('contactid')}
                                onChange={(_, value) => setSelectedContact(value ? toNumberOrNull(value.contactid) : null)}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Contact"
                                        margin="normal"
                                        fullWidth
                                        InputProps={{
                                            ...params.InputProps,
                                            endAdornment: (
                                                <>
                                                    {contactsQ.isLoading ? <CircularProgress color="inherit" size={20} /> : null}
                                                    {params.InputProps.endAdornment}
                                                    {!isCoachingPrefill && (
                                                        <IconButton size="small" sx={{ ml: 1 }} aria-label="Add contact" onClick={() => setOpenNestedMode('contact')}>
                                                            <AddIcon fontSize="small" />
                                                        </IconButton>
                                                    )}
                                                </>
                                            ),
                                        }}
                                        disabled={Boolean(isCoachingPrefill)}
                                    />
                                )}
                            />
                            {!forceDateInput ? (
                                <TextField
                                    label="Application date"
                                    type="text"
                                    placeholder="YYYY-MM-DD"
                                    value={applicationDate ?? ''}
                                    onFocus={() => {
                                        // If creating a new role and no date is set, initialise to today
                                        if (!applicationDate && mode === 'jobrole' && !editing) {
                                            setApplicationDate(new Date().toISOString().slice(0, 10))
                                        }
                                        setForceDateInput(true)
                                    }}
                                    onChange={(e) => setApplicationDate(e.target.value || null)}
                                    fullWidth
                                    margin="normal"
                                    InputLabelProps={{ shrink: applicationDate != null }}
                                />
                            ) : (
                                <DatePicker
                                    label="Application date"
                                    value={applicationDate ?? null}
                                    onChange={(v) => setApplicationDate(v || null)}
                                    onBlur={() => {
                                        if (!applicationDate) setForceDateInput(false)
                                    }}
                                    sx={{ width: '100%' }}
                                />
                            )}
                            <FormControl className="qt-select" fullWidth margin="normal">
                                <InputLabel id="job-status-label">Application status</InputLabel>
                                <Select
                                    labelId="job-status-label"
                                    value={selectedStatusId ?? ''}
                                    label="Application status"
                                    onChange={(e) => {
                                        const val = e.target.value ? Number(e.target.value) : null
                                        try { console.debug('QuickCreateModal: status onChange', { raw: e.target.value, val }) } catch (err) { }
                                        setSelectedStatusId(val)
                                    }}
                                    size="small"
                                    sx={{ '& .MuiSelect-select': { display: 'flex', alignItems: 'center' } }}
                                >
                                    {appStatusQ.isLoading ? (
                                        <MenuItem value="">Loading...</MenuItem>
                                    ) : appStatusQ.data && appStatusQ.data.length > 0 ? (
                                        appStatusQ.data.map((s: any) => (
                                            <MenuItem key={s.refid} value={Number(s.refid)}>
                                                {s.refvalue || s.label || s.code}
                                            </MenuItem>
                                        ))
                                    ) : (
                                        <MenuItem value="">None</MenuItem>
                                    )}
                                </Select>
                            </FormControl>
                            <FormControl className="qt-select" fullWidth margin="normal">
                                <InputLabel id="job-source-label">Source</InputLabel>
                                <Select
                                    labelId="job-source-label"
                                    value={selectedSourceId ?? ''}
                                    label="Source"
                                    onChange={(e) => {
                                        const val = e.target.value ? Number(e.target.value) : null
                                        try { console.debug('QuickCreateModal: source onChange', { raw: e.target.value, val }) } catch (err) { }
                                        setSelectedSourceId(val)
                                    }}
                                    size="small"
                                    sx={{ '& .MuiSelect-select': { display: 'flex', alignItems: 'center' } }}
                                >
                                    {sourceChannelsQ.isLoading ? (
                                        <MenuItem value="">Loading...</MenuItem>
                                    ) : sourceChannelsQ.data && sourceChannelsQ.data.length > 0 ? (
                                        sourceChannelsQ.data.map((s: any) => (
                                            <MenuItem key={s.refid} value={Number(s.refid)}>
                                                {s.refvalue || s.label || s.code}
                                            </MenuItem>
                                        ))
                                    ) : (
                                        <MenuItem value="">None</MenuItem>
                                    )}
                                </Select>

                            </FormControl>
                            {/* Documents attached to this job role */}
                            <Autocomplete
                                multiple
                                options={documentsQ.data ?? []}
                                getOptionLabel={(d: any) => d.documentname || d.documenturi || ''}
                                loading={documentsQ.isLoading}
                                value={selectedDocuments}
                                onChange={(_, value) => setSelectedDocuments(value ?? [])}
                                isOptionEqualToValue={(opt, val) => {
                                    const optId = Number(opt?.documentid ?? opt)
                                    const valId = Number((val && (val.documentid ?? val)) ?? val)
                                    return !Number.isNaN(optId) && !Number.isNaN(valId) && optId === valId
                                }}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Attach documents to role"
                                        margin="normal"
                                        fullWidth
                                        inputProps={{ ...(params.inputProps || {}), 'data-testid': 'jobrole-documents-picker' }}
                                        placeholder="Select documents to attach to this role"
                                        InputProps={{
                                            ...params.InputProps,
                                            endAdornment: (
                                                <>
                                                    {documentsQ.isLoading ? <CircularProgress color="inherit" size={20} /> : null}
                                                    {params.InputProps.endAdornment}
                                                </>
                                            ),
                                        }}
                                    />
                                )}
                            />
                        </>
                    )}
                    {mode === 'engagement' && (
                        <>
                            <Autocomplete
                                multiple
                                options={contactsQ.data ?? []}
                                getOptionLabel={(option: any) => option ? option.name || '' : ''}
                                loading={contactsQ.isLoading}
                                value={selectedContacts}
                                isOptionEqualToValue={(opt: any, val: any) => Number(opt?.contactid ?? opt) === Number(val?.contactid ?? val)}
                                onChange={(_, value) => {
                                    setSelectedContacts(value ?? [])
                                    const first = (value && value.length) ? value[0] : null
                                    setSelectedContact(first ? toNumberOrNull(first.contactid) : null)
                                    if (first && first.current_organisation_id) setSelectedOrg(toNumberOrNull(first.current_organisation_id))
                                }}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Contact(s)"
                                        margin="normal"
                                        fullWidth
                                        InputProps={{
                                            ...params.InputProps,
                                            endAdornment: (
                                                <>
                                                    {contactsQ.isLoading ? <CircularProgress color="inherit" size={20} /> : null}
                                                    {params.InputProps.endAdornment}
                                                </>
                                            ),
                                        }}
                                    />
                                )}
                            />

                            <DatePicker
                                label="Date"
                                value={engagementDate || null}
                                onChange={(v) => setEngagementDate(v || '')}
                                inputRef={(el) => { engagementDateRef.current = el as HTMLInputElement }}
                                sx={{ width: '100%' }}
                            />

                            <FormControl className="qt-select" fullWidth margin="normal">
                                <InputLabel id="eng-kind-label">Type of engagement</InputLabel>
                                <Select
                                    labelId="eng-kind-label"
                                    value={engagementKind}
                                    label="Type of engagement"
                                    onChange={(e) => setEngagementKind(e.target.value as number | string)}
                                    size="small"
                                    disabled={Boolean(isCoachingPrefill)}
                                    sx={{ '& .MuiSelect-select': { display: 'flex', alignItems: 'center' } }}
                                >
                                    {engagementKindsQ.isLoading ? (
                                        <MenuItem value="">Loading...</MenuItem>
                                    ) : engagementKindsQ.data && engagementKindsQ.data.length > 0 ? (
                                        engagementKindsQ.data.map((k: any) => (
                                            <MenuItem key={k.refid} value={Number(k.refid)}>
                                                {k.refvalue || k.label || k.code}
                                            </MenuItem>
                                        ))
                                    ) : (
                                        [
                                            { value: 'call', label: 'Call' },
                                            { value: 'email', label: 'Email' },
                                            { value: 'meeting', label: 'Meeting' },
                                            { value: 'interview', label: 'Interview' },
                                            { value: 'note', label: 'Note' },
                                        ].map((o) => (
                                            <MenuItem key={o.value} value={o.value as any}>
                                                {o.label}
                                            </MenuItem>
                                        ))
                                    )}
                                </Select>
                            </FormControl>

                            <TextField
                                label="Notes"
                                value={engagementNotes}
                                onChange={(e) => setEngagementNotes(e.target.value)}
                                fullWidth
                                multiline
                                rows={3}
                                margin="normal"
                                variant="outlined"
                                InputLabelProps={{ shrink: Boolean(engagementNotes && String(engagementNotes).length > 0) }}
                                InputProps={{ notched: Boolean(engagementNotes && String(engagementNotes).length > 0) }}
                            />

                            <Autocomplete
                                multiple
                                options={documentsQ.data ?? []}
                                getOptionLabel={(d: any) => d.documentname || d.documenturi || ''}
                                loading={documentsQ.isLoading}
                                value={selectedDocuments}
                                onChange={(_, value) => handleDocumentsChange(value ?? [])}
                                isOptionEqualToValue={(opt, val) => {
                                    const optId = Number(opt?.documentid ?? opt)
                                    const valId = Number((val && (val.documentid ?? val)) ?? val)
                                    return !Number.isNaN(optId) && !Number.isNaN(valId) && optId === valId
                                }}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Attach documents"
                                        margin="normal"
                                        placeholder="Select documents to attach"
                                        InputProps={{
                                            ...params.InputProps,
                                            endAdornment: (
                                                <>
                                                    {documentsQ.isLoading ? <CircularProgress color="inherit" size={20} /> : null}
                                                    {params.InputProps.endAdornment}
                                                </>
                                            ),
                                        }}
                                    />
                                )}
                            />
                        </>
                    )}
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-end', px: 3 }}>
                    <AppButton colorScheme="white" onClick={onClose} disabled={submitting}>
                        Cancel
                    </AppButton>
                    <AppButton colorScheme="purple" onClick={submit} disabled={submitting || !isValid}>
                        {submitting ? (isRealEdit ? 'Updating...' : 'Creating...') : isRealEdit ? 'Update' : 'Create'}
                    </AppButton>
                </DialogActions>

                <Snackbar open={snackbarOpen} autoHideDuration={4000} onClose={() => setSnackbarOpen(false)}>
                    <Alert onClose={() => setSnackbarOpen(false)} severity={snackbarSeverity} sx={{ width: '100%' }}>
                        {snackbarMsg}
                    </Alert>
                </Snackbar>
            </Dialog>
            {openNestedMode && (
                <QuickCreateModal
                    open={true}
                    mode={openNestedMode}
                    editing={nestedEditing ?? undefined}
                    onClose={() => { console.log('QuickCreateModal: nested onClose invoked'); setOpenNestedMode(null); setNestedEditing(null) }}
                    onSuccess={(created: any) => {
                        try {
                            // Debug: surface nested create events in test output
                            // nested onSuccess handled; avoid noisy console logging in production/tests
                            if (openNestedMode === 'organisation') {
                                const id = toNumberOrNull(created?.orgid ?? created?.id ?? created?.orgId ?? null)
                                if (id) {
                                    setSelectedOrg(id)
                                    // Optimistically add the newly created organisation
                                    // into the organisations cache so the Autocomplete
                                    // can resolve the object immediately instead of
                                    // waiting for a refetch. Normalize to include
                                    // `orgid` and `name` keys which the Autocomplete
                                    // resolver expects.
                                    const normalized: any = { ...(created || {}) }
                                    try {
                                        normalized.orgid = Number(id)
                                        if (!normalized.name) normalized.name = created?.name ?? created?.orgname ?? created?.orgName ?? created?.title ?? ''
                                    } catch (e) {
                                        // ignore
                                    }
                                    try {
                                        qc.setQueryData(['organisations'], (old: any) => {
                                            try {
                                                if (!old) return [normalized]
                                                if (Array.isArray(old)) {
                                                    const exists = old.find((o: any) => Number(o?.orgid ?? o?.id) === Number(id))
                                                    if (exists) return old
                                                    return [normalized, ...old]
                                                }
                                                return old
                                            } catch (e) {
                                                return old
                                            }
                                        })
                                    } catch (e) {
                                        // ignore cache update failures
                                    }
                                }
                                if (created?.name) {
                                    // Populate the editable input with the newly created
                                    // organisation name. Do not change the captured
                                    // `incomingCompanyOnOpen` which is read-only for this modal session.
                                    setOrgInput(created.name)
                                }
                                qc.invalidateQueries(['organisations'])
                                // Also refresh any jobroles queries so tables using cached jobrole.company_name update
                                try { qc.invalidateQueries({ predicate: (q: any) => Array.isArray(q.queryKey) && q.queryKey[0] === 'jobroles' }) } catch (e) { /* ignore */ }
                                // And proactively update cached jobroles with the new organisation name
                                try {
                                    const id = toNumberOrNull(created?.orgid ?? created?.id ?? created?.orgId ?? null)
                                    const newName = created?.name
                                    if (id && newName) {
                                        const allQueries = (qc as any).getQueryCache().getAll()
                                        allQueries.forEach((q: any) => {
                                            try {
                                                if (Array.isArray(q.queryKey) && q.queryKey[0] === 'jobroles') {
                                                    const data = qc.getQueryData(q.queryKey)
                                                    if (Array.isArray(data)) {
                                                        const updated = data.map((r: any) => {
                                                            try {
                                                                if (Number(r.companyorgid) === Number(id)) return { ...r, company_name: newName }
                                                            } catch (e) { }
                                                            return r
                                                        })
                                                        qc.setQueryData(q.queryKey, updated)
                                                    }
                                                }
                                            } catch (e) { /* ignore per-query errors */ }
                                        })
                                    }
                                } catch (e) { /* ignore */ }
                            } else if (openNestedMode === 'contact') {
                                const id = toNumberOrNull(created?.contactid ?? created?.id ?? null)
                                if (id) setSelectedContact(id)
                                if (created?.name) setName(created.name)
                                qc.invalidateQueries(['contactsList'])
                                qc.invalidateQueries(['contactsAllForHeat'])
                                qc.invalidateQueries(['contactsCount'])
                                qc.invalidateQueries(['contactsAllForHeat'])
                                qc.invalidateQueries(['contactsCount'])
                            } else if (openNestedMode === 'engagement') {
                                // After creating an engagement, refresh engagement-related queries
                                qc.invalidateQueries(['engagementsAll'])
                                qc.invalidateQueries(['engagementsCount'])
                                qc.invalidateQueries(['analyticsSummary'])
                                qc.invalidateQueries(['contactsList'])
                                qc.invalidateQueries(['contactsAllForHeat'])
                                try {
                                    const cid = Number(created?.contactid || nestedEditing?.contactid || null)
                                    if (cid) qc.invalidateQueries(['engagements', cid])
                                } catch (e) {
                                    // ignore
                                }
                            }
                        } catch (e) {
                            // ignore
                        } finally {
                            setOpenNestedMode(null)
                            setNestedEditing(null)
                        }
                    }}
                />
            )}
        </>
    )
}
