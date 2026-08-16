import React from 'react'
import {
    Dialog,
    DialogContent,
    Button,
    Box,
    Typography,
    CircularProgress,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    useMediaQuery,
    useTheme,
    Card,
    CardContent,
    Stack
} from '@mui/material'
import WideDialog from '../Shared/WideDialog'

interface Task {
    taskid: number
    name?: string
    description?: string
    duedate?: string
    targets?: any[]
    targets_count?: number
    notes?: string
}

interface ActionModalProps {
    open: boolean
    onClose: () => void
    title: string
    tasks: Task[]
    loading: boolean
}

export function ActionModal({ open, onClose, title, tasks, loading }: ActionModalProps) {
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))

    if (isMobile) {
        return (
            <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen>
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>{title}</Typography>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <Stack spacing={2}>
                            {(tasks || []).map((t: Task) => (
                                <Card key={t.taskid} variant="outlined">
                                    <CardContent>
                                        <Typography sx={{ fontWeight: 700, mb: 1 }}>
                                            {t.name || t.description || ''}
                                        </Typography>
                                        {t.duedate && (
                                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                                                <strong>Due:</strong> {new Date(t.duedate).toLocaleDateString()}
                                            </Typography>
                                        )}
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                                            <strong>Targets:</strong>{' '}
                                            {Array.isArray(t.targets)
                                                ? t.targets.length
                                                : (t.targets_count != null ? t.targets_count : '')}
                                        </Typography>
                                        {t.notes && (
                                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>
                                                {t.notes}
                                            </Typography>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                            {(!tasks || tasks.length === 0) && (
                                <Typography>No tasks available</Typography>
                            )}
                        </Stack>
                    )}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button onClick={onClose}>Close</Button>
                    </Box>
                </Box>
            </Dialog>
        )
    }

    return (
        <WideDialog open={open} onClose={onClose} fullWidth maxWidthPx={1100}>
            <Box sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell><strong>Task</strong></TableCell>
                                <TableCell><strong>Due date</strong></TableCell>
                                <TableCell><strong>Targets</strong></TableCell>
                                <TableCell><strong>Notes</strong></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {(tasks || []).map((t: Task) => (
                                <TableRow key={t.taskid} hover>
                                    <TableCell sx={{ fontWeight: 700 }}>
                                        {t.name || t.description || ''}
                                    </TableCell>
                                    <TableCell>
                                        {t.duedate ? new Date(t.duedate).toLocaleDateString() : ''}
                                    </TableCell>
                                    <TableCell>
                                        {Array.isArray(t.targets)
                                            ? t.targets.length
                                            : (t.targets_count != null ? t.targets_count : '')}
                                    </TableCell>
                                    <TableCell sx={{ whiteSpace: 'pre-wrap' }}>
                                        {t.notes || ''}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                    <Button onClick={onClose}>Close</Button>
                </Box>
            </Box>
        </WideDialog>
    )
}
