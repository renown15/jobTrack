import React from 'react'
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    Typography,
    Divider,
    CircularProgress,
    Card,
    CardContent,
    useMediaQuery,
    useTheme
} from '@mui/material'

interface BriefingRow {
    briefingid: number
    questiontext: string
    questionanswer: string
}

interface BriefingModalProps {
    open: boolean
    onClose: () => void
    briefingRows: BriefingRow[]
    loading: boolean
}

export function BriefingModal({ open, onClose, briefingRows, loading }: BriefingModalProps) {
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={isMobile}>
            <DialogTitle>Navigator Briefing</DialogTitle>
            <DialogContent dividers>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Box sx={{ display: 'grid', gap: 2 }}>
                        {(briefingRows || []).map((r: BriefingRow) => (
                            isMobile ? (
                                <Card key={r.briefingid} variant="outlined">
                                    <CardContent>
                                        <Typography sx={{ fontWeight: 700, mb: 1 }}>
                                            {r.questiontext}
                                        </Typography>
                                        <Typography sx={{ whiteSpace: 'pre-wrap' }}>
                                            {r.questionanswer}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            ) : (
                                <Box key={r.briefingid}>
                                    <Typography sx={{ fontWeight: 700 }}>{r.questiontext}</Typography>
                                    <Typography sx={{ whiteSpace: 'pre-wrap' }}>{r.questionanswer}</Typography>
                                    <Divider sx={{ my: 1 }} />
                                </Box>
                            )
                        ))}
                        {(!briefingRows || briefingRows.length === 0) && (
                            <Typography>No briefing data</Typography>
                        )}
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    )
}
