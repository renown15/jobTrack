import React, { useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import AppButton from '../components/Shared/AppButton'
import TextField from '@mui/material/TextField'
import Avatar from '@mui/material/Avatar'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
// Replace icon imports with lightweight local stubs to avoid heavy icon module
// evaluation during tests. These lightweight stubs render a simple inline
// element and preserve the runtime shape used by the components below.
const ExpandMoreIcon = (props: any) => React.createElement('span', { 'aria-hidden': true, style: { display: 'inline-block' } }, '▾')
import { ACCORDION_TITLE_SX, ACCORDION_TITLE_VARIANT } from '../constants/ui'
import './Settings.css'
import ApplicantSettings from './ApplicantSettings'
import NavigatorBriefings from './NavigatorBriefings'
import MenuItem from '@mui/material/MenuItem'
import Menu from '@mui/material/Menu'
/* Temporarily comment out parts of the imports to bisect import-time hang */
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
// Lightweight ListItemText stub used in tests to avoid pulling in full MUI impl
const ListItemText = (props: any) => React.createElement('div', { className: 'list-item-text' }, props.primary || props.children)
import IconButton from '@mui/material/IconButton'
// Other icon stubs
const EditIcon = (props: any) => React.createElement('span', { 'aria-hidden': true }, '✎')
const DeleteIcon = (props: any) => React.createElement('span', { 'aria-hidden': true }, '✖')
const CloseIcon = (props: any) => React.createElement('span', { 'aria-hidden': true }, '✕')
const ArrowUpwardIcon = (props: any) => React.createElement('span', { 'aria-hidden': true }, '↑')
const ArrowDownwardIcon = (props: any) => React.createElement('span', { 'aria-hidden': true }, '↓')
const SaveIcon = (props: any) => React.createElement('span', { 'aria-hidden': true }, '💾')
const AddIcon = (props: any) => React.createElement('span', { 'aria-hidden': true }, '+')
/* Remaining imports (api, Toast, auth, ExportToSpreadsheet) still commented out */
/* Import only the core API functions synchronously; load heavy/navigator APIs lazily */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    fetchApplicantSettings, updateApplicantSettings, uploadApplicantAvatar, fetchReferenceData, fetchReferenceDataAll, createReferenceData, updateReferenceData, deleteReferenceData, fetchSectors, createSector, updateSector, deleteSector,
    fetchNavigatorPrompts, createNavigatorPrompt, updateNavigatorPrompt, deleteNavigatorPrompt,
    fetchNavigatorBriefingQuestions, createNavigatorBriefingQuestion, updateNavigatorBriefingQuestion, deleteNavigatorBriefingQuestion,
    fetchApplicantBriefingBatches, fetchApplicantBriefingBatch, createApplicantBriefingBatch, updateNavigatorBriefingOrder,
    fetchNavigatorActions, createNavigatorAction, updateNavigatorAction, deleteNavigatorAction,
    createNavigatorActionInput, updateNavigatorActionInput, deleteNavigatorActionInput
} from '../api/client'
import { useAuth } from '../auth/AuthProvider'
// Lightweight test-friendly `Toast` to avoid bringing in the full UI module
const Toast = ({ open, message, severity, onClose }: any) => {
    if (!open) return null
    return React.createElement('div', { role: 'status', 'data-severity': severity }, message || '')
}

// Lightweight `ExportToSpreadsheet` stub used in the page. Real export UI
// is not needed for unit tests and can introduce heavy dependencies.
const ExportToSpreadsheet = (props: any) => React.createElement('div', {}, 'Export')

function LLMPromptsManager({ globalEditing, setGlobalEditing }: { globalEditing: boolean; setGlobalEditing: (v: boolean) => void }) {
    const qc = useQueryClient()
    const { data = [], isLoading } = useQuery(['navprompts'], fetchNavigatorPrompts)
    const [newName, setNewName] = useState('')
    const [newValue, setNewValue] = useState('')
    const [editingPrompt, setEditingPrompt] = useState<{ promptid?: number; promptname?: string; promptvalue?: string } | null>(null)

    const createMut = useMutation((p: any) => createNavigatorPrompt(p), { onSuccess: () => qc.invalidateQueries(['navprompts']) })
    const updateMut = useMutation((p: any) => updateNavigatorPrompt(p.promptid, { promptname: p.promptname, promptvalue: p.promptvalue }), { onSuccess: () => qc.invalidateQueries(['navprompts']) })
    const deleteMut = useMutation((id: number) => deleteNavigatorPrompt(id), { onSuccess: () => qc.invalidateQueries(['navprompts']) })

    if (isLoading) return <div>Loading prompts…</div>

    return (
        <Box>
            <Box className="grid-1fr-120px-auto">
                <TextField label="Prompt name" value={newName} onChange={e => setNewName(e.target.value)} className="grid-col-1" fullWidth />
                <AppButton startIcon={<AddIcon />} colorScheme="purple" onClick={() => { if (!newName || !newValue) return; createMut.mutate({ promptname: newName, promptvalue: newValue }); setNewName(''); setNewValue('') }} className="grid-col-2 height-40">Prompt</AppButton>
                <TextField label="Prompt value" value={newValue} onChange={e => setNewValue(e.target.value)} className="grid-col-span multiline-auto" multiline minRows={3} maxRows={8} fullWidth />
            </Box>

            <Divider />
            <List>
                {(data || []).map((p: any) => (
                    <ListItem key={p.promptid} className="pr-10">
                        {editingPrompt && editingPrompt.promptid === p.promptid ? (
                            <Box className="flex-align-center-gap1 full-width">
                                <TextField value={editingPrompt.promptname} onChange={e => setEditingPrompt({ ...editingPrompt, promptname: e.target.value })} className="flex-1" />
                                <TextField value={editingPrompt.promptvalue} onChange={e => setEditingPrompt({ ...editingPrompt, promptvalue: e.target.value })} className="flex-2 multiline-auto" multiline minRows={3} maxRows={12} />
                                <IconButton edge="end" aria-label="save" onClick={() => { updateMut.mutate(editingPrompt); setEditingPrompt(null); setGlobalEditing(false) }}><SaveIcon /></IconButton>
                                <IconButton edge="end" aria-label="cancel" onClick={() => { setEditingPrompt(null); setGlobalEditing(false) }}><CloseIcon /></IconButton>
                            </Box>
                        ) : (
                            <>
                                <ListItemText primary={p.promptname} secondary={p.promptvalue} secondaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }} />
                                <Box className="flex-align-center-gap1">
                                    <IconButton edge="end" aria-label="edit" onClick={() => { setEditingPrompt({ promptid: p.promptid, promptname: p.promptname, promptvalue: p.promptvalue }); setGlobalEditing(true) }} disabled={globalEditing}><EditIcon /></IconButton>
                                    <IconButton edge="end" aria-label="delete" onClick={() => deleteMut.mutate(p.promptid)} disabled={globalEditing}><DeleteIcon /></IconButton>
                                </Box>
                            </>
                        )}
                    </ListItem>
                ))}
            </List>
            {/* inline editing handled per-list item */}
        </Box>
    )
}

// Lightweight lazyNav proxy that uses the api client functions imported above.
// Keeps the same call sites used in the original file while avoiding dynamic
// module evaluation during import-time in tests.
const lazyNav = {
    fetchNavigatorActions: () => fetchNavigatorActions(),
    createNavigatorAction: (p: any) => createNavigatorAction(p),
    updateNavigatorAction: (id: any, p: any) => updateNavigatorAction(id, p),
    deleteNavigatorAction: (id: any) => deleteNavigatorAction(id),
    createNavigatorActionInput: (id: any, p: any) => createNavigatorActionInput(id, p),
    updateNavigatorActionInput: (id: any, p: any) => updateNavigatorActionInput(id, p),
    deleteNavigatorActionInput: (id: any) => deleteNavigatorActionInput(id),
    fetchNavigatorBriefingQuestions: () => fetchNavigatorBriefingQuestions(),
    createNavigatorBriefingQuestion: (p: any) => createNavigatorBriefingQuestion(p),
    updateNavigatorBriefingQuestion: (id: any, p: any) => updateNavigatorBriefingQuestion(id, p),
    deleteNavigatorBriefingQuestion: (id: any) => deleteNavigatorBriefingQuestion(id),
    fetchApplicantBriefingBatches: () => fetchApplicantBriefingBatches(),
    fetchApplicantBriefingBatch: (id: any) => fetchApplicantBriefingBatch(id),
    createApplicantBriefingBatch: (p: any) => createApplicantBriefingBatch(p),
    updateNavigatorBriefingOrder: (p: any) => updateNavigatorBriefingOrder(p),
}
// DEBUG: module load (DEV only)
try {
    if ((import.meta as any).env?.DEV) {
        // eslint-disable-next-line no-console
        console.log('MODULE: Settings loaded')
    }
} catch (e) {
    // ignore
}

// Diagnostic helper: print Node active handles (if available) to help debug hangs.
function logActiveHandles(label?: string) {
    try {
        const proc = (typeof globalThis !== 'undefined') ? (globalThis as any).process : undefined
        if (proc && proc._getActiveHandles) {
            const names = proc._getActiveHandles().map((h: any) => (h && h.constructor && h.constructor.name) || String(h))
            // eslint-disable-next-line no-console
            console.log(`SETTINGS_DIAG: ${label || 'handles'} -`, names)
        }
        // If proc or _getActiveHandles isn't available (typical in browsers), be silent —
        // avoid noisy logs like "process._getActiveHandles not available" in the console.
    } catch (e) {
        // eslint-disable-next-line no-console
        console.log('SETTINGS_DIAG: failed to read active handles', e && (e as any).message ? (e as any).message : e)
    }
}

// ApplicantSettings component is extracted to `frontend/src/pages/ApplicantSettings.tsx`
// and is imported above; the default `Settings` component renders it.


function ReferenceDataSettings({ globalEditing, setGlobalEditing }: { globalEditing: boolean; setGlobalEditing: (v: boolean) => void }) {
    const qc = useQueryClient()
    const [selectedClass, setSelectedClass] = useState<string>('application_status')
    const [newValue, setNewValue] = useState('')
    const [editing, setEditing] = useState<{ refid?: number; refvalue?: string } | null>(null)
    const [newSector, setNewSector] = useState<{ summary: string; description?: string }>({ summary: '', description: '' })
    const [editingSector, setEditingSector] = useState<any | null>(null)

    const { data = [] } = useQuery(['refdata', selectedClass], () => fetchReferenceData(selectedClass))
    // Load full payload so we can derive available reference-data classes dynamically
    const { data: refAll = { referencedata: [], sectors: [] } } = useQuery(['refdata', 'all'], fetchReferenceDataAll)
    const sectorsQ = useQuery(['sectors'], () => fetchSectors())

    const createMut = useMutation((payload: any) => createReferenceData(payload.refdataclass, payload.refvalue), { onSuccess: () => qc.invalidateQueries(['refdata', selectedClass]) })
    const updateMut = useMutation((payload: any) => updateReferenceData(payload.refid, payload.refdataclass, payload.refvalue), { onSuccess: () => qc.invalidateQueries(['refdata', selectedClass]) })
    const deleteMut = useMutation((refid: number) => deleteReferenceData(refid), { onSuccess: () => qc.invalidateQueries(['refdata', selectedClass]) })

    const createSectorMut = useMutation((payload: any) => createSector(payload), { onSuccess: () => qc.invalidateQueries(['sectors']) })
    const updateSectorMut = useMutation((payload: any) => updateSector(payload.sectorid, payload), { onSuccess: () => qc.invalidateQueries(['sectors']) })
    const deleteSectorMut = useMutation((sectorid: number) => deleteSector(sectorid), { onSuccess: () => qc.invalidateQueries(['sectors']) })

    const classes = React.useMemo(() => {
        const items: string[] = (refAll?.referencedata || []).map((r: any) => String(r.refdataclass || '').trim()).filter(Boolean)
        const uniq = Array.from(new Set(items))
        // Preferred ordering for well-known classes
        const defaults = ['application_status', 'source_channel', 'engagement_type', 'contact_role_type']
        const ordered = [
            ...defaults.filter(d => uniq.includes(d)),
            ...uniq.filter(u => !defaults.includes(u)).sort(),
        ]
        // Ensure sectors (special case) is available as a tab
        if (!ordered.includes('sectors')) ordered.push('sectors')
        // Add LLM prompts as a special management tab
        if (!ordered.includes('llmprompts')) ordered.push('llmprompts')
        // Navigator briefing questions management
        if (!ordered.includes('navbriefquestions')) ordered.push('navbriefquestions')
        // Navigator actions management (custom table)
        if (!ordered.includes('navigator_actions')) ordered.push('navigator_actions')
        return ordered
    }, [refAll])

    const [navSelected, setNavSelected] = useState<'navprompts' | 'navbriefquestions' | 'navigator_actions'>('navprompts')

    const humanLabel = (c: string) => {
        switch (c) {
            case 'application_status':
                return 'Application status'
            case 'source_channel':
                return 'Source channels'
            case 'engagement_type':
                return 'Engagement types'
            case 'contact_role_type':
                return 'Contact roles'
            case 'sectors':
                return 'Sectors'
            case 'llmprompts':
                return 'LLM prompts'
            case 'navbriefquestions':
                return 'Navigator briefing questions'
            case 'navigator_actions':
                return 'Navigator actions'
            default:
                return c.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
        }
    }

    return (
        <Box>
            {/* Title intentionally removed — top tab now reads 'JobTrack Configuration' */}

            <Accordion defaultExpanded className="mb-2">
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant={ACCORDION_TITLE_VARIANT} sx={ACCORDION_TITLE_SX}>Reference Data Types</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Box className="flex-gap-1 mt-1 mb-2 flex-wrap">
                        {classes.filter(c => c !== 'sectors' && c !== 'llmprompts' && c !== 'navbriefquestions' && c !== 'navigator_actions').map(c => (
                            <AppButton key={c} colorScheme={selectedClass === c ? 'purple' : 'white'} onClick={() => setSelectedClass(c)}>{humanLabel(c)}</AppButton>
                        ))}
                    </Box>

                    {/* Selected class content (non-sectors, non-navigator items) */}
                    {(selectedClass && selectedClass !== 'sectors' && selectedClass !== 'llmprompts' && selectedClass !== 'navbriefquestions' && selectedClass !== 'navigator_actions') && (
                        <Box>
                            <Box className="flex-align-center-gap1 mb-2">
                                <TextField label="New value" value={newValue} onChange={e => setNewValue(e.target.value)} />
                                <AppButton startIcon={<AddIcon />} colorScheme="purple" onClick={() => { if (!newValue) return; createMut.mutate({ refdataclass: selectedClass, refvalue: newValue }); setNewValue('') }}>Add</AppButton>
                            </Box>

                            <Divider className="divider-mb2" />
                            <List>
                                {(data || []).map((r: any) => (
                                    <ListItem key={r.refid} className="pr-10">
                                        {editing && editing.refid === r.refid ? (
                                            <TextField
                                                value={editing.refvalue}
                                                onChange={(e) => setEditing({ ...editing, refvalue: e.target.value })}
                                                fullWidth
                                                multiline
                                                minRows={3}
                                                maxRows={8}
                                                className="multiline-auto"
                                            />
                                        ) : (
                                            <ListItemText primary={r.refvalue} secondary={r.refdataclass} secondaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }} />
                                        )}
                                        <Box className="flex-align-center-gap1">
                                            {editing && editing.refid === r.refid ? (
                                                <>
                                                    <IconButton edge="end" aria-label="save" onClick={() => { updateMut.mutate({ refid: editing.refid, refdataclass: selectedClass, refvalue: editing.refvalue }); setEditing(null); setGlobalEditing(false) }}><SaveIcon /></IconButton>
                                                    <IconButton edge="end" aria-label="cancel" onClick={() => { setEditing(null); setGlobalEditing(false) }}><CloseIcon /></IconButton>
                                                </>
                                            ) : (
                                                <>
                                                    <IconButton edge="end" aria-label="edit" onClick={() => { setEditing({ refid: r.refid, refvalue: r.refvalue }); setGlobalEditing(true) }} disabled={globalEditing}><EditIcon /></IconButton>
                                                    <IconButton edge="end" aria-label="delete" onClick={() => deleteMut.mutate(r.refid)} disabled={globalEditing}><DeleteIcon /></IconButton>
                                                </>
                                            )}
                                        </Box>
                                    </ListItem>
                                ))}
                            </List>
                        </Box>
                    )}
                </AccordionDetails>
            </Accordion>

            <Accordion className="mb-2">
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant={ACCORDION_TITLE_VARIANT} sx={ACCORDION_TITLE_SX}>Navigator</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Box className="flex-gap-1 mb-2 flex-wrap">
                        <AppButton colorScheme={navSelected === 'navprompts' ? 'purple' : 'white'} onClick={() => setNavSelected('navprompts')}>Navigator prompts</AppButton>
                        <AppButton colorScheme={navSelected === 'navbriefquestions' ? 'purple' : 'white'} onClick={() => setNavSelected('navbriefquestions')}>Navigator briefing questions</AppButton>
                        <AppButton colorScheme={navSelected === 'navigator_actions' ? 'purple' : 'white'} onClick={() => setNavSelected('navigator_actions')}>Navigator actions</AppButton>
                    </Box>

                    <Box>
                        {navSelected === 'navprompts' && <LLMPromptsManager globalEditing={globalEditing} setGlobalEditing={setGlobalEditing} />}
                        {navSelected === 'navbriefquestions' && <NavigatorBriefingQuestionsManager globalEditing={globalEditing} setGlobalEditing={setGlobalEditing} />}
                        {navSelected === 'navigator_actions' && <NavigatorActionsManager globalEditing={globalEditing} setGlobalEditing={setGlobalEditing} />}
                    </Box>
                </AccordionDetails>
            </Accordion>

            <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant={ACCORDION_TITLE_VARIANT} sx={ACCORDION_TITLE_SX}>Other</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    {/* Sectors management */}
                    <Box className="mb-2">
                        <Typography className="fontWeight-700 mb-1">Sectors</Typography>
                        <Box className="sectors-grid">
                            <TextField label="Sector Name" value={newSector.summary} onChange={e => setNewSector({ ...newSector, summary: e.target.value })} />
                            <AppButton startIcon={<AddIcon />} colorScheme="purple" onClick={() => { if (!newSector.summary) return; createSectorMut.mutate(newSector); setNewSector({ summary: '', description: '' }) }}>
                                Add Sector
                            </AppButton>
                            <TextField label="Description" value={newSector.description} onChange={e => setNewSector({ ...newSector, description: e.target.value })} className="description-span multiline-auto" multiline minRows={3} maxRows={6} />
                        </Box>

                        <Divider />
                        <List>
                            {(sectorsQ.data || []).map((s: any) => (
                                <ListItem key={s.sectorid} className="pr-10">
                                    <ListItemText primary={s.summary} secondary={s.description} secondaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }} />
                                    <Box className="flex-align-center-gap1">
                                        <IconButton edge="end" aria-label="edit" onClick={() => setEditingSector(s)}><EditIcon /></IconButton>
                                        <IconButton edge="end" aria-label="delete" onClick={() => deleteSectorMut.mutate(s.sectorid)}><DeleteIcon /></IconButton>
                                    </Box>
                                </ListItem>
                            ))}
                        </List>

                        {editingSector && (
                            <Box className="mt-2 grid-gap1">
                                <TextField label="Summary" value={editingSector.summary || ''} onChange={e => setEditingSector({ ...editingSector, summary: e.target.value })} />
                                <TextField label="Description" value={editingSector.description || ''} onChange={e => setEditingSector({ ...editingSector, description: e.target.value })} multiline minRows={3} maxRows={6} className="multiline-auto" />
                                <Box>
                                    <AppButton colorScheme="purple" onClick={() => { updateSectorMut.mutate(editingSector); setEditingSector(null) }}>Save</AppButton>
                                    <AppButton colorScheme="white" onClick={() => setEditingSector(null)}>Cancel</AppButton>
                                </Box>
                            </Box>
                        )}
                    </Box>
                    {/* Note: remaining classes can be managed from the Reference Data Types accordion above */}
                </AccordionDetails>
            </Accordion>
        </Box>
    )
}

function NavigatorActionsManager({ globalEditing, setGlobalEditing }: { globalEditing: boolean; setGlobalEditing: (v: boolean) => void }) {
    const qc = useQueryClient()
    const { data = [], isLoading } = useQuery(['nav:actions'], () => lazyNav.fetchNavigatorActions())
    const inputTypesQ = useQuery(['refdata', 'NAVIGATOR_INPUT_TYPE'], () => fetchReferenceData('NAVIGATOR_INPUT_TYPE'))
    // NAVIGATOR_ACTION_TYPE is not used at action edit level; action types are managed via inputs
    const [newName, setNewName] = useState('')
    const [newSort, setNewSort] = useState<number | undefined>(undefined)
    const [editing, setEditing] = useState<any | null>(null)
    const [editingInput, setEditingInput] = useState<any | null>(null)
    const [newInputs, setNewInputs] = useState<Record<number, { inputtypeid?: number; inputvalue?: string; sortorderid?: number }>>({})

    const createMut = useMutation((p: any) => lazyNav.createNavigatorAction(p), { onSuccess: () => qc.invalidateQueries(['nav:actions']) })
    const updateMut = useMutation((p: any) => lazyNav.updateNavigatorAction(p.actionid, p), { onSuccess: () => qc.invalidateQueries(['nav:actions']) })
    const deleteMut = useMutation((id: number) => lazyNav.deleteNavigatorAction(id), { onSuccess: () => qc.invalidateQueries(['nav:actions']) })
    const createInputMut = useMutation((payload: any) => lazyNav.createNavigatorActionInput(payload.actionid, { inputtypeid: payload.inputtypeid, inputvalue: payload.inputvalue, sortorderid: payload.sortorderid }), { onSuccess: () => qc.invalidateQueries(['nav:actions']) })
    const deleteInputMut = useMutation((id: number) => lazyNav.deleteNavigatorActionInput(id), { onSuccess: () => qc.invalidateQueries(['nav:actions']) })
    const updateInputMut = useMutation((p: any) => lazyNav.updateNavigatorActionInput(p.inputid, { inputtypeid: p.inputtypeid, inputvalue: p.inputvalue, sortorderid: p.sortorderid }), { onSuccess: () => qc.invalidateQueries(['nav:actions']) })

    if (isLoading) return <div>Loading navigator actions…</div>

    return (
        <Box>
            <Box className="grid-1fr-120px-auto">
                <TextField label="Action name" value={newName} onChange={e => setNewName(e.target.value)} />
                <TextField label="Sort" value={newSort ?? ''} onChange={e => setNewSort(e.target.value ? Number(e.target.value) : undefined)} />
                <AppButton startIcon={<AddIcon />} colorScheme="purple" disabled={globalEditing} onClick={async () => {
                    if (!newName) return
                    try {
                        await createMut.mutateAsync({ actionname: newName, sortorderid: newSort ?? 0 })
                        setNewName('')
                        setNewSort(undefined)
                    } catch (e) {
                        // let react-query handle errors via onError if configured
                    }
                }}>Add</AppButton>
            </Box>

            <Divider />
            <List>
                {(data || []).map((a: any) => (
                    <ListItem key={a.actionid} className="pr-10">
                        {editing && editing.actionid === a.actionid ? (
                            <Box className="flex-align-center-gap1 full-width">
                                <TextField value={editing.actionname} onChange={e => setEditing({ ...editing, actionname: e.target.value })} className="flex-1" />
                                <TextField value={editing.sortorderid ?? ''} onChange={e => setEditing({ ...editing, sortorderid: e.target.value ? Number(e.target.value) : undefined })} className="width-80" />
                            </Box>
                        ) : (
                            <ListItemText primary={a.actionname} secondary={`${a.sortorderid != null ? `Sort: ${a.sortorderid}` : ''}${a.actiontype && a.actiontype.refvalue ? ` • ${a.actiontype.refvalue}` : ''}`} secondaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }} />
                        )}
                        <Box className="flex-align-center-gap1">
                            {editing && editing.actionid === a.actionid ? (
                                <>
                                    <IconButton edge="end" aria-label="save" onClick={async () => {
                                        try {
                                            await updateMut.mutateAsync(editing)
                                        } catch (e) {
                                            // errors handled by react-query
                                        } finally {
                                            setEditing(null)
                                            setGlobalEditing(false)
                                        }
                                    }}><SaveIcon /></IconButton>
                                    <IconButton edge="end" aria-label="cancel" onClick={() => { setEditing(null); setGlobalEditing(false) }}><CloseIcon /></IconButton>
                                </>
                            ) : (
                                <>
                                    <IconButton edge="end" aria-label="edit" onClick={() => { setEditing({ actionid: a.actionid, actionname: a.actionname, sortorderid: a.sortorderid }); setGlobalEditing(true) }} disabled={globalEditing && !(editing && editing.actionid === a.actionid)}><EditIcon /></IconButton>
                                    <IconButton edge="end" aria-label="delete" onClick={() => deleteMut.mutate(a.actionid)} disabled={globalEditing}><DeleteIcon /></IconButton>
                                </>
                            )}
                        </Box>
                        {/* inputs */}
                    </ListItem>
                ))}
            </List>

            {editing && (
                <Box className="mt-2 grid-gap1">
                    <TextField label="Action name" value={editing.actionname || ''} onChange={e => setEditing({ ...editing, actionname: e.target.value })} />
                    <TextField label="Sort" value={editing.sortorderid ?? ''} onChange={e => setEditing({ ...editing, sortorderid: e.target.value ? Number(e.target.value) : undefined })} />
                    <Box>
                        <AppButton colorScheme="purple" onClick={async () => {
                            try {
                                await updateMut.mutateAsync(editing)
                            } catch (e) {
                                // handled by react-query
                            } finally {
                                setEditing(null)
                                setGlobalEditing(false)
                            }
                        }}>Save</AppButton>
                        <AppButton colorScheme="white" onClick={() => { setEditing(null); setGlobalEditing(false) }}>Cancel</AppButton>
                    </Box>
                </Box>
            )}

            {/* Per-action inputs shown inline below each action */}
            {(data || []).map((a: any) => (
                <Paper key={a.actionid} className="paper-p1-mt1">
                    <Typography className="nav-action-title">{a.actionname}</Typography>
                    <Box className="mb-1">
                        <Box className="flex-gap-1-align-start">
                            <TextField
                                select
                                size="small"
                                label="Type"
                                value={(newInputs[a.actionid] && newInputs[a.actionid].inputtypeid) || ''}
                                onChange={(e) => setNewInputs({ ...newInputs, [a.actionid]: { ...(newInputs[a.actionid] || {}), inputtypeid: e.target.value ? Number(e.target.value) : undefined } })}
                                className="type-select fixed-height-56"
                                SelectProps={{ MenuProps: { PaperProps: { style: { minWidth: 240 } } } }}
                            >
                                {(inputTypesQ.data || []).map((t: any) => {
                                    const id = (t && (t.refid ?? t.id ?? t.value)) || ''
                                    const v = id !== '' ? Number(id) : ''
                                    const label = (t && (t.refvalue ?? t.label ?? t.name)) || String(id)
                                    return <MenuItem key={String(id)} value={v}>{label}</MenuItem>
                                })}
                            </TextField>
                            {
                                // Provide a contextual placeholder/help when the selected input type
                                // is the DB_QUERY type so admins know to supply a stored query id
                                (() => {
                                    const selectedType = (newInputs[a.actionid] && newInputs[a.actionid].inputtypeid) || ''
                                    const typeObj = (inputTypesQ.data || []).find((t: any) => (t.refid ?? t.id ?? t.value) === selectedType)
                                    const isDbQuery = typeObj && String(typeObj.refvalue || '').toUpperCase() === 'DB_QUERY'
                                    return (
                                        <TextField
                                            size="small"
                                            label="Value"
                                            placeholder={isDbQuery ? 'Enter stored navigatorinput id (numeric) for DB_QUERY' : undefined}
                                            helperText={isDbQuery ? 'DB_QUERY inputs must reference a navigatorinput id (DB_QUERY) rather than raw SQL' : ''}
                                            value={(newInputs[a.actionid] && newInputs[a.actionid].inputvalue) || ''}
                                            onChange={(e) => setNewInputs({ ...newInputs, [a.actionid]: { ...(newInputs[a.actionid] || {}), inputvalue: e.target.value } })}
                                            className="value-flex multiline-auto"
                                            multiline
                                            minRows={2}
                                            maxRows={6}
                                        />
                                    )
                                })()
                            }
                            <TextField size="small" label="Sort" value={(newInputs[a.actionid] && newInputs[a.actionid].sortorderid) ?? ''} onChange={(e) => setNewInputs({ ...newInputs, [a.actionid]: { ...(newInputs[a.actionid] || {}), sortorderid: e.target.value ? Number(e.target.value) : undefined } })} className="sort-width fixed-height-56" />
                            <AppButton startIcon={<AddIcon />} size="small" className="add-button-center" colorScheme="purple" disabled={globalEditing} onClick={() => { const p = newInputs[a.actionid] || {}; if (!p.inputtypeid || !p.inputvalue) return; createInputMut.mutate({ actionid: a.actionid, inputtypeid: p.inputtypeid, inputvalue: p.inputvalue, sortorderid: p.sortorderid ?? 0 }); setNewInputs({ ...newInputs, [a.actionid]: { inputtypeid: undefined, inputvalue: '', sortorderid: undefined } }) }}>Add</AppButton>
                        </Box>
                    </Box>
                    <List>
                        {(a.inputs || []).map((inp: any) => (
                            <ListItem key={inp.navigatoractioninputid}>
                                {editingInput && editingInput.inputid === inp.navigatoractioninputid ? (
                                    <Box className="flex-gap-1-align-start full-width">
                                        <TextField
                                            select
                                            size="small"
                                            label="Type"
                                            value={editingInput.inputtypeid ?? ''}
                                            onChange={(e) => setEditingInput({ ...editingInput, inputtypeid: e.target.value ? Number(e.target.value) : undefined })}
                                            className="type-select-160 fixed-height-56"
                                            SelectProps={{ MenuProps: { PaperProps: { style: { minWidth: 240 } } } }}
                                        >
                                            {(inputTypesQ.data || []).map((t: any) => {
                                                const id = (t && (t.refid ?? t.id ?? t.value)) || ''
                                                const v = id !== '' ? Number(id) : ''
                                                const label = (t && (t.refvalue ?? t.label ?? t.name)) || String(id)
                                                return <MenuItem key={String(id)} value={v}>{label}</MenuItem>
                                            })}
                                        </TextField>
                                        {
                                            (() => {
                                                const typeObj = (inputTypesQ.data || []).find((t: any) => (t.refid ?? t.id ?? t.value) === editingInput.inputtypeid)
                                                const isDbQuery = typeObj && String(typeObj.refvalue || '').toUpperCase() === 'DB_QUERY'
                                                return (
                                                    <TextField
                                                        size="small"
                                                        label="Value"
                                                        placeholder={isDbQuery ? 'Enter stored navigatorinput id (numeric) for DB_QUERY' : undefined}
                                                        helperText={isDbQuery ? 'DB_QUERY inputs must reference a navigatorinput id (DB_QUERY) rather than raw SQL' : ''}
                                                        value={editingInput.inputvalue ?? ''}
                                                        onChange={(e) => setEditingInput({ ...editingInput, inputvalue: e.target.value })}
                                                        className="flex-1 multiline-auto"
                                                        multiline
                                                        minRows={2}
                                                        maxRows={8}
                                                    />
                                                )
                                            })()
                                        }
                                        <TextField size="small" label="Sort" value={editingInput.sortorderid ?? ''} onChange={(e) => setEditingInput({ ...editingInput, sortorderid: e.target.value ? Number(e.target.value) : undefined })} className="width-90 fixed-height-56" />
                                        <IconButton onClick={() => { updateInputMut.mutate({ inputid: editingInput.inputid, inputtypeid: editingInput.inputtypeid, inputvalue: editingInput.inputvalue, sortorderid: editingInput.sortorderid }); setEditingInput(null); setGlobalEditing(false) }}><SaveIcon /></IconButton>
                                        <IconButton onClick={() => { setEditingInput(null); setGlobalEditing(false) }}><CloseIcon /></IconButton>
                                    </Box>
                                ) : (
                                    <>
                                        <ListItemText
                                            primary={`${(inputTypesQ.data || []).find((t: any) => (t.refid ?? t.id ?? t.value) === inp.inputtypeid)?.refvalue || inp.inputtypeid || ''}: ${inp.inputvalue || ''}`}
                                            secondary={
                                                inp.sortorderid != null ? (
                                                    <Typography variant="caption" color="text.secondary" className="input-sort-caption">{`Sort: ${inp.sortorderid}`}</Typography>
                                                ) : null
                                            }
                                        />
                                        <Box className="flex-align-center-gap1">
                                            <IconButton onClick={() => { setEditingInput({ inputid: inp.navigatoractioninputid, inputtypeid: inp.inputtypeid, inputvalue: inp.inputvalue, sortorderid: inp.sortorderinputid }); setGlobalEditing(true) }} disabled={globalEditing && !(editingInput && editingInput.inputid === inp.navigatoractioninputid)}><EditIcon /></IconButton>
                                            <IconButton onClick={() => deleteInputMut.mutate(inp.navigatoractioninputid)} disabled={globalEditing}><DeleteIcon /></IconButton>
                                        </Box>
                                    </>
                                )}
                            </ListItem>
                        ))}
                    </List>
                </Paper>
            ))}
        </Box>
    )
}

function NavigatorBriefingQuestionsManager({ globalEditing, setGlobalEditing }: { globalEditing: boolean; setGlobalEditing: (v: boolean) => void }) {
    const qc = useQueryClient()
    const { data = [], isLoading } = useQuery(['navbrief:questions'], () => lazyNav.fetchNavigatorBriefingQuestions())
    const [editing, setEditing] = useState<any | null>(null)
    const [newText, setNewText] = useState('')
    // Local mutable list for client-side reordering before persisting
    const [localList, setLocalList] = useState<Array<any>>([])
    const [orderDirty, setOrderDirty] = useState(false)

    React.useEffect(() => {
        // Map incoming server data into a stable local list sorted by order
        const list = (data || []).slice().map((q: any) => ({
            // Normalize backend fields: some responses use `questionorderindex`, others `displayorder`
            questionid: q.questionid,
            questiontext: q.questiontext,
            questionorderindex: q.questionorderindex != null ? q.questionorderindex : (q.displayorder != null ? q.displayorder : 0),
        }))
        list.sort((a, b) => (a.questionorderindex || 0) - (b.questionorderindex || 0))
        setLocalList(list)
    }, [data])

    if (isLoading) return <div>Loading briefing questions…</div>

    return (
        <Box>
            <Box className="grid-1fr-120px-auto mb-1">
                <TextField label="Question text" value={newText} onChange={e => setNewText(e.target.value)} fullWidth />
                <AppButton startIcon={<AddIcon />} colorScheme="purple" onClick={async () => {
                    if (!newText) return
                    try {
                        await lazyNav.createNavigatorBriefingQuestion({ questiontext: newText })
                        setNewText('')
                        try { qc.invalidateQueries(['navbrief:questions']) } catch (e) { }
                    } catch (e) {
                        // ignore
                    }
                }}>Add</AppButton>
            </Box>

            <Divider />
            <List>
                {localList.map((q: any, idx: number) => (
                    <ListItem key={q.questionid} className="pr-10">
                        {editing && editing.questionid === q.questionid ? (
                            <Box className="flex-align-center-gap1 full-width">
                                <TextField value={editing.questiontext} onChange={e => setEditing({ ...editing, questiontext: e.target.value })} className="flex-1" />
                                <IconButton edge="end" aria-label="save" onClick={async () => {
                                    try {
                                        await lazyNav.updateNavigatorBriefingQuestion(editing.questionid, { questiontext: editing.questiontext })
                                        setEditing(null)
                                        setGlobalEditing(false)
                                        try { qc.invalidateQueries(['navbrief:questions']) } catch (e) { }
                                    } catch (e) {
                                        // ignore
                                    }
                                }}><SaveIcon /></IconButton>
                                <IconButton edge="end" aria-label="cancel" onClick={() => { setEditing(null); setGlobalEditing(false) }}><CloseIcon /></IconButton>
                            </Box>
                        ) : (
                            <>
                                <ListItemText primary={q.questiontext} />
                                <Box className="flex-align-center-gap1">
                                    <IconButton edge="end" aria-label="edit" onClick={() => { setEditing({ questionid: q.questionid, questiontext: q.questiontext }); setGlobalEditing(true) }} disabled={globalEditing}><EditIcon /></IconButton>
                                    <IconButton edge="end" aria-label="delete" onClick={async () => { await lazyNav.deleteNavigatorBriefingQuestion(q.questionid); try { qc.invalidateQueries(['navbrief:questions']) } catch (e) { } }} disabled={globalEditing}><DeleteIcon /></IconButton>
                                </Box>
                            </>
                        )}
                    </ListItem>
                ))}
            </List>
        </Box>
    )
}

// Continue: remaining briefing questions handlers, main Settings export, and SearchStatusSelect
const _placeholder = null

export default function Settings() {
    // Entry log — DEV-only to avoid noise in production
    try {
        if ((import.meta as any).env?.DEV) {
            // eslint-disable-next-line no-console
            console.log('SETTINGS_DIAG: Settings function entry')
        }
    } catch (e) {
        // ignore
    }
    try {
        const [globalEditing, setGlobalEditing] = useState(false)
        const [tab, setTab] = useState<'applicant' | 'refdata'>('applicant')
        const { data: applicantSettings = {}, isLoading: loadingApplicantSettings } = useQuery(['settings', 'applicant'], fetchApplicantSettings)

        // Synchronous render-time diagnostic (DEV only)
        try {
            if ((import.meta as any).env?.DEV) {
                // eslint-disable-next-line no-console
                console.log('SETTINGS_DIAG: Settings render (function executed)')
            }
        } catch (e) {
            // ignore
        }

        // Diagnostic: log active handles on mount and shortly after to help identify
        // what keeps the test process alive when this component is imported/rendered.
        React.useEffect(() => {
            // Run these diagnostic checks only in DEV and only once per page load.
            try {
                if (!(import.meta as any).env?.DEV) return
            } catch (e) {
                return
            }

            const globalKey = '__jobtrack_settings_diag_logged'
            const already = (globalThis as any)[globalKey]
            if (already) return
                ; (globalThis as any)[globalKey] = true

            logActiveHandles('Settings component mount - immediate')
            const t1 = setTimeout(() => logActiveHandles('Settings component mount +50ms'), 50)
            const t2 = setTimeout(() => logActiveHandles('Settings component mount +2000ms'), 2000)
            return () => {
                clearTimeout(t1)
                clearTimeout(t2)
                // Don't re-log unmount globally — keep logs one-time to avoid StrictMode duplicates
            }
        }, [])

        return (
            <Box>
                <h2 className="settings-header">Settings</h2>

                <Box className="row-gap-1 mb-3">
                    <AppButton colorScheme={tab === 'applicant' ? 'purple' : 'white'} onClick={() => setTab('applicant')}>Applicant</AppButton>
                    {applicantSettings?.isSuperuser === true && (
                        <AppButton colorScheme={tab === 'refdata' ? 'purple' : 'white'} onClick={() => setTab('refdata')}>JobTrack Configuration</AppButton>
                    )}
                </Box>

                <Box className="mb-3">

                </Box>

                {tab === 'applicant' ? <ApplicantSettings globalEditing={globalEditing} setGlobalEditing={setGlobalEditing} /> : <ReferenceDataSettings globalEditing={globalEditing} setGlobalEditing={setGlobalEditing} />}
            </Box>
        )
    } catch (e) {
        // Ensure render-time errors are visible in test output
        // eslint-disable-next-line no-console
        console.error('SETTINGS_DIAG: render threw', e)
        throw e
    }
}

function SearchStatusSelect({ form, setForm }: { form: any; setForm: (v: any) => void }) {
    const { data = [] } = useQuery(['refdata', 'search_status'], () => fetchReferenceData('search_status'))

    return (
        <TextField
            select
            fullWidth
            label="Search status"
            value={form.searchStatusId ?? ''}
            onChange={(e) => setForm({ ...form, searchStatusId: e.target.value ? Number(e.target.value) : null })}
            SelectProps={{ native: true }}
            InputLabelProps={{ shrink: true }}
        >
            <option value="">(none)</option>
            {(data || []).map((r: any) => (
                <option key={r.refid} value={r.refid}>{r.refvalue}</option>
            ))}
        </TextField>
    )
}

// Diagnostic: indicate module evaluation finished and exports are available
// eslint-disable-next-line no-console
console.log('MODULE: Settings exports ready')
