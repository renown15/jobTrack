import React, { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Chip from '@mui/material/Chip'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import TaskIcon from '@mui/icons-material/Task'
import PersonIcon from '@mui/icons-material/Person'
import BusinessIcon from '@mui/icons-material/Business'
import LeaderboardIcon from '@mui/icons-material/Leaderboard'
import CategoryIcon from '@mui/icons-material/Category'
import HistoryIcon from '@mui/icons-material/History'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import MobileCard from '../Mobile/MobileCard'
import { fetchTaskTargets, fetchReferenceData } from '../../api/client'

interface Task {
    taskid?: number
    id?: number
    name?: string
    taskname?: string
    duedate?: string
    _hasCoachingTarget?: boolean
    _targetsCount?: number
    _logsCount?: number
    _contactsCount?: number
    _orgsCount?: number
    _leadsCount?: number
    _sectorsCount?: number
}

interface MobileTasksListProps {
    tasks: Task[]
    loading?: boolean
    targetsByTask?: Record<number, any[]>
    targetTypes?: { refid: number; refvalue: string }[]
    logsByTask?: Record<number, any[]>
    onEdit?: (task: Task) => void
    onDelete?: (taskId: number) => void
    onOpenTargets?: (taskId: number, targetTypeRefId: number | null) => void
    onOpenLogs?: (taskId: number) => void
}

function formatDisplayDate(dateStr?: string | null) {
    if (!dateStr) return ''
    try {
        const m = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
        if (!m) {
            const d2 = new Date(dateStr)
            if (isNaN(d2.getTime())) return String(dateStr)
            return d2.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        }
        const y = Number(m[1])
        const mm = Number(m[2])
        const dd = Number(m[3])
        const utc = new Date(Date.UTC(y, mm - 1, dd))
        return utc.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch (e) {
        return String(dateStr)
    }
}

function findRefId(targetTypes: any[] | undefined, needle: string) {
    if (!targetTypes) return null
    const found = (targetTypes || []).find((tt: any) => (tt.refvalue || '').toLowerCase().includes(needle))
    return found ? Number(found.refid) : null
}

export default function MobileTasksList({
    tasks,
    loading = false,
    targetsByTask,
    targetTypes,
    logsByTask,
    onEdit,
    onDelete,
    onOpenTargets,
    onOpenLogs
}: MobileTasksListProps) {
    const [localTargetsByTask, setLocalTargetsByTask] = useState<Record<number, any[]> | null>(null)
    const [localTargetTypes, setLocalTargetTypes] = useState<{ refid: number; refvalue: string }[] | null>(null)

    // If parent didn't provide targetsByTask, fetch targets for visible tasks
    useEffect(() => {
        let mounted = true
        async function loadTargets() {
            try {
                if (!targetsByTask) {
                    const tids = (tasks || []).map(t => Number(t.taskid ?? t.id ?? 0)).filter(n => n > 0)
                    if (tids.length === 0) {
                        if (mounted) setLocalTargetsByTask({})
                    } else {
                        const entries = await Promise.all(tids.map(async (tid) => {
                            try {
                                const tg = await fetchTaskTargets(tid)
                                return [tid, tg || []] as [number, any[]]
                            } catch (e) {
                                return [tid, []] as [number, any[]]
                            }
                        }))
                        if (mounted) setLocalTargetsByTask(Object.fromEntries(entries))
                    }
                }
                if (!targetTypes) {
                    const tt = await fetchReferenceData('action_plan_target_type')
                    if (mounted) setLocalTargetTypes(tt || [])
                }
            } catch (e) {
                if (mounted) {
                    if (!targetsByTask) setLocalTargetsByTask({})
                    if (!targetTypes) setLocalTargetTypes([])
                }
            }
        }
        void loadTargets()
        return () => { mounted = false }
    }, [tasks, targetsByTask, targetTypes])

    if (loading) {
        return <Typography sx={{ p: 2 }}>Loading actions...</Typography>
    }

    if (!tasks || tasks.length === 0) {
        return <Typography sx={{ p: 2 }}>No coaching actions yet. Tap + to add one.</Typography>
    }

    const resolvedTargetsByTask = targetsByTask ?? (localTargetsByTask ?? {})
    const resolvedTargetTypes = targetTypes ?? (localTargetTypes ?? [])

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {tasks.map((task) => {
                const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null)

                const taskId = task.taskid ?? task.id ?? 0
                const name = task.name || task.taskname || 'Untitled Action'
                const displayDate = formatDisplayDate(task.duedate)
                const hasCoaching = Boolean(task._hasCoachingTarget)

                // Calculate target counts
                const tTargets = (resolvedTargetsByTask && resolvedTargetsByTask[taskId]) || []
                const getRefId = (needle: string) => findRefId(resolvedTargetTypes || [], needle)
                const contactRefId = getRefId('contact')
                const orgRefId = getRefId('organ') || getRefId('org') || getRefId('organisation')
                const leadRefId = getRefId('lead')
                const sectorRefId = getRefId('sector')

                const countFor = (refId: number | null, hint: string) => {
                    if (!tTargets) return 0
                    if (refId) return tTargets.filter((x: any) => Number(x.targettype) === Number(refId)).length
                    return tTargets.filter((x: any) => String(x.targettype).toLowerCase().includes(hint)).length
                }

                const contactsCount = countFor(contactRefId, 'contact')
                const orgsCount = countFor(orgRefId, 'org')
                const leadsCount = countFor(leadRefId, 'lead')
                const sectorsCount = countFor(sectorRefId, 'sector')
                const logsCount = (logsByTask && logsByTask[taskId]) ? (logsByTask[taskId] || []).length : 0

                const metadata = [
                    hasCoaching && {
                        label: 'Coaching',
                        value: <CheckCircleIcon sx={{ color: 'success.main', fontSize: 16 }} />,
                    },
                    displayDate && { label: 'Due', value: displayDate },
                ].filter(Boolean) as Array<{ label: string; value: string | React.ReactNode; onClick?: () => void }>

                // Target and logs section
                const targetSection = (
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                        {contactsCount > 0 && (
                            <Chip
                                icon={<PersonIcon fontSize="small" />}
                                label={contactsCount}
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    if (onOpenTargets) onOpenTargets(taskId, contactRefId)
                                }}
                                sx={{ cursor: onOpenTargets ? 'pointer' : 'default' }}
                            />
                        )}
                        {orgsCount > 0 && (
                            <Chip
                                icon={<BusinessIcon fontSize="small" />}
                                label={orgsCount}
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    if (onOpenTargets) onOpenTargets(taskId, orgRefId)
                                }}
                                sx={{ cursor: onOpenTargets ? 'pointer' : 'default' }}
                            />
                        )}
                        {leadsCount > 0 && (
                            <Chip
                                icon={<LeaderboardIcon fontSize="small" />}
                                label={leadsCount}
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    if (onOpenTargets) onOpenTargets(taskId, leadRefId)
                                }}
                                sx={{ cursor: onOpenTargets ? 'pointer' : 'default' }}
                            />
                        )}
                        {sectorsCount > 0 && (
                            <Chip
                                icon={<CategoryIcon fontSize="small" />}
                                label={sectorsCount}
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    if (onOpenTargets) onOpenTargets(taskId, sectorRefId)
                                }}
                                sx={{ cursor: onOpenTargets ? 'pointer' : 'default' }}
                            />
                        )}
                        {logsCount > 0 && (
                            <Chip
                                icon={<HistoryIcon fontSize="small" />}
                                label={logsCount}
                                size="small"
                                color="info"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    if (onOpenLogs) onOpenLogs(taskId)
                                }}
                                sx={{ cursor: onOpenLogs ? 'pointer' : 'default' }}
                            />
                        )}
                    </Box>
                )

                // Menu button (vertical dots)
                const menuButton = (
                    <>
                        <IconButton
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation()
                                setMenuAnchor(e.currentTarget)
                            }}
                            aria-label="Task actions"
                        >
                            <MoreVertIcon />
                        </IconButton>
                        <Menu
                            anchorEl={menuAnchor}
                            open={Boolean(menuAnchor)}
                            onClose={() => setMenuAnchor(null)}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {onEdit && (
                                <MenuItem
                                    onClick={() => {
                                        setMenuAnchor(null)
                                        onEdit(task)
                                    }}
                                >
                                    <EditIcon sx={{ mr: 1, fontSize: 18 }} />
                                    Edit
                                </MenuItem>
                            )}
                            {onDelete && (
                                <MenuItem
                                    onClick={() => {
                                        setMenuAnchor(null)
                                        if (window.confirm('Delete this action?')) {
                                            onDelete(taskId)
                                        }
                                    }}
                                >
                                    <DeleteIcon sx={{ mr: 1, fontSize: 18 }} />
                                    Delete
                                </MenuItem>
                            )}
                        </Menu>
                    </>
                )

                return (
                    <Box key={taskId}>
                        <MobileCard
                            title={name}
                            subtitle=""
                            metadata={metadata}
                            avatar={<TaskIcon />}
                            menuButton={menuButton}
                        />
                        {targetSection}
                    </Box>
                )
            })}
        </Box>
    )
}
