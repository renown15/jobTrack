import React from 'react'
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    Typography,
    useMediaQuery,
    useTheme,
    Card,
    CardContent
} from '@mui/material'

interface InsightModalProps {
    open: boolean
    onClose: () => void
    score: number | null
    content: string
}

export function InsightModal({ open, onClose, score, content }: InsightModalProps) {
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={isMobile}>
            <DialogTitle>Navigator AI Insight</DialogTitle>
            <DialogContent dividers>
                {isMobile ? (
                    <Card variant="outlined" sx={{ mb: 2 }}>
                        <CardContent>
                            {score != null && (
                                <Typography sx={{ fontWeight: 700, mb: 1 }}>
                                    Model score: {score} / 10
                                </Typography>
                            )}
                            <Typography sx={{ whiteSpace: 'pre-wrap' }}>{content}</Typography>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        {score != null && (
                            <Box sx={{ mb: 1 }}>
                                <Typography sx={{ fontWeight: 700 }}>
                                    Model score: {score} / 10
                                </Typography>
                            </Box>
                        )}
                        <Typography sx={{ whiteSpace: 'pre-wrap' }}>{content}</Typography>
                    </>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    )
}
