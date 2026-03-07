import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import { useQuery } from '@tanstack/react-query'
import {
    fetchApplicantSettings,
    fetchAllApplicantsSummary,
    adminUpdateApplicantStatus,
    adminClearApplicantPassword,
} from '../../api/client'
import { adminDeleteApplicant } from '../../api/client'
import Button from '@mui/material/Button'
import Switch from '@mui/material/Switch'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminUpdateApplicantSuperuser } from '../../api/client'

function StatCard({ label, value }: { label: string; value: number | null }) {
    return (
        <Paper variant="outlined" sx={{ p: 2, height: 80, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Typography variant="caption" color="textSecondary">{label}</Typography>
            <Typography variant="h6">{value == null ? '—' : value}</Typography>
        </Paper>
    )
}

function ApplicantClearPasswordButton({ applicant }: { applicant: any }) {
    const qc = useQueryClient()
    const clearPassword = useMutation((id: number) => adminClearApplicantPassword(id), {
        onSuccess: () => qc.invalidateQueries(['admin', 'applicantsSummary'])
    })

    const handleClear = async () => {
        if (!window.confirm(`Clear password for ${applicant.email}? This will force a password reset.`)) return
        try {
            await clearPassword.mutateAsync(applicant.applicantId)
        } catch (e) { /* ignore */ }
    }

    return (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Button size="small" color="warning" variant="contained" onClick={handleClear} disabled={clearPassword.isLoading}>
                Reset
            </Button>
        </div>
    )
}

function ApplicantDeleteButton({ applicant, currentApplicantId }: { applicant: any; currentApplicantId?: number | null }) {
    const qc = useQueryClient()
    const del = useMutation((id: number) => adminDeleteApplicant(id), {
        onSuccess: () => qc.invalidateQueries(['admin', 'applicantsSummary'])
    })

    const handleDelete = async () => {
        if (currentApplicantId && Number(currentApplicantId) === Number(applicant.applicantId)) {
            // Prevent self-delete at UI level; backend will also prevent this.
            // eslint-disable-next-line no-alert
            alert('You cannot delete the currently signed-in applicant.')
            return
        }
        if (!window.confirm(`Delete applicant ${applicant.email}? This will permanently remove all their data.`)) return
        try {
            await del.mutateAsync(applicant.applicantId)
        } catch (e) { /* ignore */ }
    }

    return (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Button size="small" color="error" variant="contained" onClick={handleDelete} disabled={del.isLoading}>
                Delete
            </Button>
        </div>
    )
}

function ApplicantActiveSwitch({ applicant }: { applicant: any }) {
    const qc = useQueryClient()
    const updateStatus = useMutation(({ id, isActive }: { id: number; isActive: boolean }) => adminUpdateApplicantStatus(id, isActive), {
        onSuccess: () => qc.invalidateQueries(['admin', 'applicantsSummary'])
    })

    return (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Switch
                checked={Boolean(applicant.isActive)}
                onChange={async () => {
                    try {
                        await updateStatus.mutateAsync({ id: applicant.applicantId, isActive: !applicant.isActive })
                    } catch (e) { /* ignore */ }
                }}
                inputProps={{ 'aria-label': `Active ${applicant.email}` }}
                disabled={updateStatus.isLoading}
            />
        </div>
    )
}

function ApplicantSuperuserSwitch({ applicant }: { applicant: any }) {
    const qc = useQueryClient()
    const updateSuper = useMutation(({ id, isSuper }: { id: number; isSuper: boolean }) => adminUpdateApplicantSuperuser(id, isSuper), {
        onSuccess: () => qc.invalidateQueries(['admin', 'applicantsSummary'])
    })

    return (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Switch
                checked={Boolean(applicant.isSuperuser)}
                onChange={async () => {
                    try {
                        await updateSuper.mutateAsync({ id: applicant.applicantId, isSuper: !applicant.isSuperuser })
                    } catch (e) { /* ignore */ }
                }}
                inputProps={{ 'aria-label': `Superuser ${applicant.email}` }}
                disabled={updateSuper.isLoading}
            />
        </div>
    )
}

export default function ApplicantManager() {
    const { data: applicantSettings, isLoading: loadingSettings } = useQuery(['settings', 'applicant'], fetchApplicantSettings)

    const applicantsQ = useQuery(['admin', 'applicantsSummary'], () => fetchAllApplicantsSummary(), { enabled: !!applicantSettings?.isSuperuser })

    if (loadingSettings) return <Box sx={{ p: 2 }}><CircularProgress size={20} /></Box>

    if (!applicantSettings?.isSuperuser) return null

    return (
        <Box sx={{ p: 2 }}>
            <Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold' }}>Applicant Manager</Typography>

            <Box sx={{ mt: 2 }}>
                {applicantsQ.isLoading ? (
                    <CircularProgress size={20} />
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', padding: 8 }}>Applicant</th>
                                <th style={{ textAlign: 'left', padding: 8 }}>Last Login</th>
                                <th style={{ textAlign: 'right', padding: 8 }}>Contacts</th>
                                <th style={{ textAlign: 'right', padding: 8 }}>Orgs</th>
                                <th style={{ textAlign: 'right', padding: 8 }}>Roles</th>
                                <th style={{ textAlign: 'right', padding: 8 }}>Engagements</th>
                                <th style={{ textAlign: 'right', padding: 8 }}>Networking</th>
                                <th style={{ textAlign: 'right', padding: 8 }}>Leads</th>
                                <th style={{ textAlign: 'right', padding: 8 }}>Actions</th>
                                <th style={{ textAlign: 'right', padding: 8 }}>Navigator snaps</th>
                                <th style={{ textAlign: 'right', padding: 8 }}>Superuser</th>
                                <th style={{ textAlign: 'right', padding: 8 }}>Active</th>
                                <th style={{ textAlign: 'center', padding: 8 }}>Password</th>
                                <th style={{ textAlign: 'right', padding: 8 }}>Delete</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(applicantsQ.data || []).map((a: any) => (
                                <tr key={a.applicantId} style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                                    <td style={{ padding: 8 }}>{a.firstName} {a.lastName} <div style={{ color: 'rgba(0,0,0,0.5)', fontSize: 12 }}>{a.email}</div></td>
                                    <td style={{ padding: 8 }}>{a.lastLogin ? new Date(a.lastLogin).toLocaleString() : '—'}</td>
                                    <td style={{ padding: 8, textAlign: 'right' }}>{a.contactsCount}</td>
                                    <td style={{ padding: 8, textAlign: 'right' }}>{a.organisationsCount}</td>
                                    <td style={{ padding: 8, textAlign: 'right' }}>{a.rolesCount}</td>
                                    <td style={{ padding: 8, textAlign: 'right' }}>{a.engagementsCount}</td>
                                    <td style={{ padding: 8, textAlign: 'right' }}>{a.networkingCount}</td>
                                    <td style={{ padding: 8, textAlign: 'right' }}>{a.leadsCount}</td>
                                    <td style={{ padding: 8, textAlign: 'right' }}>{a.actionsCount}</td>
                                    <td style={{ padding: 8, textAlign: 'right' }}>{a.navigatorSnapshotsCount}</td>
                                    <td style={{ padding: 8, textAlign: 'right' }}>
                                        <ApplicantSuperuserSwitch applicant={a} />
                                    </td>
                                    <td style={{ padding: 8, textAlign: 'right' }}>
                                        <ApplicantActiveSwitch applicant={a} />
                                    </td>
                                    <td style={{ padding: 8, textAlign: 'right' }}>
                                        <ApplicantClearPasswordButton applicant={a} />
                                    </td>
                                    <td style={{ padding: 8, textAlign: 'right' }}>
                                        <ApplicantDeleteButton applicant={a} currentApplicantId={applicantSettings?.applicantid} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Box>
        </Box>
    )
}
