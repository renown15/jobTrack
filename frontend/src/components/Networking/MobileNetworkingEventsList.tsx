import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import TaskIcon from '@mui/icons-material/Task'
import EventIcon from '@mui/icons-material/Event'
import MobileCard from '../Mobile/MobileCard'

interface NetworkingEvent {
    eventid: number
    eventname: string
    eventdate: string
    eventtype: string
    notes: string
    actions_count?: number
    actionsCount?: number
}

interface MobileNetworkingEventsListProps {
    events: NetworkingEvent[]
    loading?: boolean
    onEdit?: (eventId: number, event: NetworkingEvent) => void
    onDelete?: (eventId: number) => void
    onViewTasks?: (eventId: number) => void
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

export default function MobileNetworkingEventsList({
    events,
    loading = false,
    onEdit,
    onDelete,
    onViewTasks
}: MobileNetworkingEventsListProps) {
    if (loading) {
        return <Typography sx={{ p: 2 }}>Loading events...</Typography>
    }

    if (!events || events.length === 0) {
        return <Typography sx={{ p: 2 }}>No networking events yet. Tap + to add one.</Typography>
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {events.map((event) => {
                const eventId = event.eventid
                const name = event.eventname || 'Untitled Event'
                const displayDate = formatDisplayDate(event.eventdate)
                const type = event.eventtype || ''
                const notes = event.notes || ''
                const actionsCount = Number(event.actions_count ?? event.actionsCount ?? 0)

                const metadata = [
                    displayDate && { label: 'Date', value: displayDate },
                    type && { label: 'Type', value: type },
                    {
                        label: 'Actions',
                        value: String(actionsCount),
                        onClick: onViewTasks ? () => onViewTasks(eventId) : undefined
                    }
                ].filter(Boolean) as Array<{ label: string; value: string; onClick?: () => void }>

                const actions = (
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                        {onViewTasks && (
                            <IconButton
                                size="small"
                                aria-label="View actions"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onViewTasks(eventId)
                                }}
                            >
                                <TaskIcon fontSize="small" />
                            </IconButton>
                        )}
                        {onEdit && (
                            <IconButton
                                size="small"
                                aria-label="Edit"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onEdit(eventId, event)
                                }}
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        )}
                        {onDelete && (
                            <IconButton
                                size="small"
                                aria-label="Delete"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    if (window.confirm('Delete this networking event?')) {
                                        onDelete(eventId)
                                    }
                                }}
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        )}
                    </Box>
                )

                return (
                    <MobileCard
                        key={eventId}
                        title={name}
                        subtitle={notes}
                        metadata={metadata}
                        avatar={<EventIcon />}
                        actions={actions}
                    />
                )
            })}
        </Box>
    )
}
