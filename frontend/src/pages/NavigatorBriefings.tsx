import React from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchNavigatorBriefingQuestions, fetchApplicantBriefingBatches, fetchApplicantBriefingBatch, createApplicantBriefingBatch, BriefingBatchSummary } from '../api/client'

// top-level diagnostic to see when the module is imported
// eslint-disable-next-line no-console
console.log('NAVBRIEF_MODULE: import start')
const SaveIcon = (props: any) => React.createElement('span', { 'aria-hidden': true }, '💾')
const Toast = ({ open, message, severity, onClose }: any) => {
    if (!open) return null
    return React.createElement('div', { role: 'status', 'data-severity': severity }, message || '')
}

export default function NavigatorBriefings() {
    const qc = useQueryClient()
    const { data: briefingQuestions = [], isLoading: loadingBriefingQuestions } = useQuery(['navbrief:questions'], fetchNavigatorBriefingQuestions)
    const { data: briefingBatches = [] } = useQuery<BriefingBatchSummary[]>(['navbrief:batches'], fetchApplicantBriefingBatches)
    const [selectedBatch, setSelectedBatch] = React.useState<string | null>(null)
    const [answers, setAnswers] = React.useState<Record<number, string>>({})
    const [briefingMenuAnchor, setBriefingMenuAnchor] = React.useState<HTMLElement | null>(null)
    const openBriefingMenu = Boolean(briefingMenuAnchor)
    const openBriefingMenuHandler = (e: React.MouseEvent<HTMLElement>) => setBriefingMenuAnchor(e.currentTarget)
    const closeBriefingMenu = () => setBriefingMenuAnchor(null)

    // TEMPORARY: simplified effect for test isolation
    // Initialize answers from questions; if a saved batch is selected/auto-chosen
    // we'll load its answers and overwrite these defaults.
    React.useEffect(() => {
        const initial: Record<number, string> = {}
            ; (briefingQuestions || []).forEach((q: any) => { initial[q.questionid] = '' })
        setAnswers(initial)
    }, [briefingQuestions])

    // Auto-select the most recent saved batch when batches load (only if nothing selected)
    React.useEffect(() => {
        if (!briefingBatches || briefingBatches.length === 0) return
        if (selectedBatch) return
        try {
            const timestamps = (briefingBatches || []).map((b: any) => {
                const ts = (typeof b === 'string') ? b : (b.batchcreationtimestamp || b.batch || '')
                return ts ? new Date(ts).getTime() : 0
            })
            const max = Math.max(...timestamps)
            if (max > 0) {
                const idx = timestamps.indexOf(max)
                const b = briefingBatches[idx]
                const ts = (typeof b === 'string') ? b : (b.batchcreationtimestamp || b.batch || '')
                if (ts) setSelectedBatch(ts)
            }
        } catch (e) {
            // ignore auto-select failures
        }
    }, [briefingBatches, selectedBatch])

    // When a saved batch is selected, fetch its saved answers and populate `answers`.
    React.useEffect(() => {
        if (!selectedBatch) return
        let cancelled = false
            ; (async () => {
                try {
                    // fetchApplicantBriefingBatch returns an array of rows for the batch
                    const rows = await fetchApplicantBriefingBatch(selectedBatch)
                    // build a default answers map then override with saved values
                    const initial: Record<number, string> = {}
                        ; (briefingQuestions || []).forEach((q: any) => { initial[q.questionid] = '' })
                    if (Array.isArray(rows)) {
                        rows.forEach((r: any) => {
                            const qid = r.questionid ?? r.questionId ?? r.id ?? null
                            const ans = r.questionanswer ?? r.answer ?? r.question_answer ?? ''
                            if (qid != null) initial[qid] = ans
                        })
                    }
                    if (!cancelled) setAnswers(initial)
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.debug('NAVBRIEF: failed to load saved batch', selectedBatch, e)
                }
            })()
        return () => { cancelled = true }
    }, [selectedBatch, briefingQuestions])

    return (
        <Paper className="paper-p2-mb2 paper-briefing full-width">
            <Box className="flex-align-center-gap1 mb-1">
                <Box className="flex-align-center-gap1" style={{ width: '100%' }}>
                    <Button variant="outlined" size="small" onClick={openBriefingMenuHandler} className="nowrap">Select saved briefing</Button>
                    <Menu anchorEl={briefingMenuAnchor} open={openBriefingMenu} onClose={closeBriefingMenu}>
                        {(briefingBatches || []).map((b: any) => {
                            const ts = (typeof b === 'string') ? b : (b.batchcreationtimestamp || b.batch || '')
                            const count = (b && typeof b === 'object') ? (b.count ?? null) : null
                            const label = ts ? new Date(ts).toLocaleString() + (count != null ? ` (${count})` : '') : '(unknown)'
                            return <MenuItem key={ts || String(Math.random())} onClick={() => { setSelectedBatch(ts); closeBriefingMenu() }}>{label}</MenuItem>
                        })}
                    </Menu>
                    <Typography variant="body2" className="nowrap" style={{ marginLeft: 8 }}>{selectedBatch ? new Date(selectedBatch).toLocaleString() : '(new)'}</Typography>
                    <Box sx={{ flex: 1 }} />
                    <Button
                        onClick={() => { setSelectedBatch(null); const initial: Record<number, string> = {}; (briefingQuestions || []).forEach((q: any) => { initial[q.questionid] = '' }); setAnswers(initial) }}
                        disabled={((briefingBatches || []).length === 0)}
                        className="nowrap"
                    >+ NEW</Button>
                </Box>
            </Box>

            <Divider className="divider-mb2" />

            {(loadingBriefingQuestions) ? <div>Loading questions…</div> : (
                <Box className="grid-gap2">
                    {(briefingQuestions || []).map((q: any) => (
                        <Box key={q.questionid}>
                            <Typography sx={{ fontWeight: 700 }}>{q.questiontext}</Typography>
                            <TextField multiline rows={4} fullWidth value={answers[q.questionid] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.questionid]: e.target.value })} />
                        </Box>
                    ))}

                    <Box className="flex-gap-1">
                        <Button startIcon={<SaveIcon />} variant="contained" onClick={async () => {
                            try {
                                const payload = (briefingQuestions || []).map((q: any) => ({ questionid: q.questionid, questionanswer: answers[q.questionid] || '' }))
                                await createApplicantBriefingBatch(payload)
                                try { qc.invalidateQueries(['navbrief:questions']); qc.invalidateQueries(['navbrief:batches']); } catch (e) { }
                                // eslint-disable-next-line no-console
                                console.log('Navigator briefing saved')
                            } catch (err: any) {
                                // eslint-disable-next-line no-console
                                console.error(err)
                            }
                        }}>Save</Button>
                    </Box>
                </Box>
            )}
        </Paper>
    )
}

// top-level diagnostic indicating module evaluation finished
// eslint-disable-next-line no-console
console.log('NAVBRIEF_MODULE: import end')
