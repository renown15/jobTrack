import React from 'react'
import { BRAND_PURPLE_LIGHT } from '../../constants/colors'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'

type Props = {
    summary: any
    counts: { contacts: number; organisations: number; roles: number; engagements: number; recruiters?: number; recruitmentOrganisations?: number; activeRoles?: number; activeInterviews?: number }
    contactStats?: { matchesCount?: number; noContactCount?: number; totalCount?: number }
    recruiterContactStats?: { matchesCount?: number; noContactCount?: number; totalCount?: number }
    activeKey: string
    onActivate: (key: 'contacts' | 'organisations' | 'roles' | 'engagements' | 'recruiters' | 'recruiters_met' | 'other_contacts_met' | 'recruitment_organisations' | 'active_roles' | 'interviews') => void
}

function Card({ title, count, countNode, active, onClick }: { title: string; count?: number; countNode?: React.ReactNode; active: boolean; onClick: () => void }) {
    return (
        <Paper
            role="button"
            tabIndex={0}
            onClick={(e: any) => {
                try {
                    // log click target info to help diagnose mis-clicks/overlays
                    const tgt = e.target
                    const cur = e.currentTarget
                    const rect = cur && cur.getBoundingClientRect ? cur.getBoundingClientRect() : null
                    // eslint-disable-next-line no-console
                    console.debug('[StatsCards] Card clicked ->', title, 'target=', tgt && (tgt.tagName || tgt.nodeName), 'client=', { x: e.clientX, y: e.clientY }, 'rect=', rect)
                } catch (err) {
                    // ignore
                }
                try { onClick() } catch (err) { /* ignore */ }
            }}
            onKeyDown={(e) => (e.key === 'Enter' ? onClick() : null)}
            sx={{
                position: 'relative',
                py: 0.5,
                px: 1,
                cursor: 'pointer',
                outline: active ? `2px solid ${BRAND_PURPLE_LIGHT}` : undefined,
                minHeight: 64,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                // Normal card styling
                border: '1px solid transparent',
                backgroundColor: 'transparent'
            }}
        >
            {/* title label (rendered as main content) */}
            <Typography variant="subtitle2" sx={{ lineHeight: 1 }}>{title}</Typography>
            <Box sx={{ mt: 0.5 }}>
                {countNode ? (
                    countNode
                ) : (
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>{count}</Typography>
                )}
            </Box>
        </Paper>
    )
}

export default function StatsCards({ summary, counts, contactStats, recruiterContactStats, activeKey, onActivate }: Props) {
    // Debug: log counts when StatsCards renders
    // Removed debug logging
    return (
        <Grid container spacing={2}>
            {/* Top row: 4 equal-width cards */}
            <Grid item xs={12}>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} sx={{ flex: { xs: '1 1 100%', md: '0 0 20%' }, maxWidth: { xs: '100%', md: '20%' }, minWidth: 0 }}>
                        <Tooltip title={`Dormant Contacts ${contactStats?.noContactCount ?? 0}`} arrow>
                            <span>
                                <Card
                                    title="Total Contacts"
                                    active={activeKey === 'contacts'}
                                    onClick={() => onActivate('contacts')}
                                    countNode={(
                                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                                            <Typography variant="h6" sx={{ fontWeight: 600 }}>{contactStats?.matchesCount ?? counts.contacts}</Typography>
                                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>|</Typography>
                                            <Typography variant="body2" sx={{ color: '#9e9e9e', fontWeight: 600 }}>-{contactStats?.noContactCount ?? 0}</Typography>
                                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>|</Typography>
                                            <Typography variant="h6" sx={{ fontWeight: 600 }}>{(contactStats?.matchesCount ?? counts.contacts) - (contactStats?.noContactCount ?? 0)}</Typography>
                                        </Box>
                                    )}
                                />
                            </span>
                        </Tooltip>
                    </Grid>
                    <Grid item xs={12} sm={6} sx={{ flex: { xs: '1 1 100%', md: '0 0 20%' }, maxWidth: { xs: '100%', md: '20%' }, minWidth: 0 }}>
                        <Card title="Recruiters Met" count={summary?.contactEngagements?.recruiters ?? 0} active={activeKey === 'recruiters_met'} onClick={() => onActivate('recruiters_met')} />
                    </Grid>
                    <Grid item xs={12} sm={6} sx={{ flex: { xs: '1 1 100%', md: '0 0 20%' }, maxWidth: { xs: '100%', md: '20%' }, minWidth: 0 }}>
                        <Card title="Employing organisations" count={counts.organisations} active={activeKey === 'organisations'} onClick={() => onActivate('organisations')} />
                    </Grid>
                    <Grid item xs={12} sm={6} sx={{ flex: { xs: '1 1 100%', md: '0 0 20%' }, maxWidth: { xs: '100%', md: '20%' }, minWidth: 0 }}>
                        <Card title="Roles" count={counts.roles} active={activeKey === 'roles'} onClick={() => onActivate('roles')} />
                    </Grid>
                    <Grid item xs={12} sm={6} sx={{ flex: { xs: '1 1 100%', md: '0 0 20%' }, maxWidth: { xs: '100%', md: '20%' }, minWidth: 0 }}>
                        <Card title="Engagements" count={counts.engagements} active={activeKey === 'engagements'} onClick={() => onActivate('engagements')} />
                    </Grid>
                </Grid>
            </Grid>

            {/* Second row: recruitment cards left-aligned, same width as one top card */}
            <Grid item xs={12}>
                <Grid container spacing={2} justifyContent="flex-start">
                    {/* Other Contacts Met (placed to the right of Recruitment Contacts) */}
                    <Grid item xs={12} sm={6} sx={{ flex: { xs: '1 1 100%', md: '0 0 20%' }, maxWidth: { xs: '100%', md: '20%' }, minWidth: 0 }}>
                        <Tooltip title={`Dormant Contacts ${recruiterContactStats?.noContactCount ?? 0}`} arrow>
                            <span>
                                <Card
                                    title="Recruitment Contacts"
                                    active={activeKey === 'recruiters'}
                                    onClick={() => onActivate('recruiters')}
                                    countNode={(
                                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                                            <Typography variant="h6" sx={{ fontWeight: 600 }}>{(recruiterContactStats?.matchesCount ?? counts.recruiters ?? 0)}</Typography>
                                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>|</Typography>
                                            <Typography variant="body2" sx={{ color: '#9e9e9e', fontWeight: 600 }}>-{recruiterContactStats?.noContactCount ?? 0}</Typography>
                                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>|</Typography>
                                            <Typography variant="h6" sx={{ fontWeight: 600 }}>{(recruiterContactStats?.matchesCount ?? counts.recruiters ?? 0) - (recruiterContactStats?.noContactCount ?? 0)}</Typography>
                                        </Box>
                                    )}
                                />
                            </span>
                        </Tooltip>
                    </Grid>
                    <Grid item xs={12} sm={6} sx={{ flex: { xs: '1 1 100%', md: '0 0 20%' }, maxWidth: { xs: '100%', md: '20%' }, minWidth: 0 }}>
                        <Card title="Other Contacts Met" count={summary?.contactEngagements?.others ?? 0} active={activeKey === 'other_contacts_met'} onClick={() => onActivate('other_contacts_met')} />
                    </Grid>
                    <Grid item xs={12} sm={6} sx={{ flex: { xs: '1 1 100%', md: '0 0 20%' }, maxWidth: { xs: '100%', md: '20%' }, minWidth: 0 }}>
                        <Card title="Recruitment Organisations" count={counts.recruitmentOrganisations ?? 0} active={activeKey === 'recruitment_organisations'} onClick={() => onActivate('recruitment_organisations')} />
                    </Grid>
                    <Grid item xs={12} sm={6} sx={{ flex: { xs: '1 1 100%', md: '0 0 20%' }, maxWidth: { xs: '100%', md: '20%' }, minWidth: 0 }}>
                        <Card title="Active Roles" count={counts.activeRoles ?? 0} active={activeKey === 'active_roles'} onClick={() => onActivate('active_roles')} />
                    </Grid>
                    <Grid item xs={12} sm={6} sx={{ flex: { xs: '1 1 100%', md: '0 0 20%' }, maxWidth: { xs: '100%', md: '20%' }, minWidth: 0 }}>
                        <Card title="Interviews" count={counts.activeInterviews ?? 0} active={activeKey === 'interviews'} onClick={() => onActivate('interviews')} />
                    </Grid>
                </Grid>
            </Grid>
        </Grid>
    )
}
