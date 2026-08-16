import React, { useState, useRef, useEffect } from 'react'
import { Box, IconButton, TextField, Paper, Typography } from '@mui/material'
import AppButton from './Shared/AppButton'
import ChatIcon from '@mui/icons-material/Chat'
import CloseIcon from '@mui/icons-material/Close'
import SendIcon from '@mui/icons-material/Send'
import { navigatorQuery, fetchApplicantSettings, fetchNavigatorHealth } from '../api/client'
import { getApplicantId } from '../auth/currentApplicant'
import { brandPurple } from './Sidebar'

export default function ChatPanel() {
    const [open, setOpen] = useState(false)
    const [messages, setMessages] = useState<Array<{ role: string; text: string }>>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [applicant, setApplicant] = useState<any>(null)
    const [llmOk, setLlmOk] = useState<boolean>(true)
    const inputRef = useRef<HTMLInputElement | null>(null)
    const scrollRef = useRef<HTMLDivElement | null>(null)

    async function sendMessage() {
        if (!input || loading || !llmOk) return
        const userText = input.trim()
        setInput('')
        setMessages((m) => [...m, { role: 'user', text: userText }])
        setLoading(true)
        try {
            const firstName = applicant?.firstName || applicant?.firstname || ''
            const res = await navigatorQuery(userText, undefined, { first_name: firstName })
            let reply = ''
            if (res && (res as any).ok) {
                if (typeof (res as any).response === 'string') reply = (res as any).response
                else reply = JSON.stringify((res as any).response)
            } else if (res && (res as any).error) {
                reply = `Error: ${(res as any).error}`
            } else {
                reply = 'No response from server.'
            }
            setMessages((m) => [...m, { role: 'assistant', text: reply }])
        } catch (e: any) {
            setMessages((m) => [...m, { role: 'assistant', text: `Request failed: ${e?.message || e}` }])
        } finally {
            setLoading(false)
        }
    }

    function TypingIndicator() {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Box sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    px: 1.25,
                    py: 0.5,
                    borderRadius: 2,
                }}>
                    <Box sx={{ display: 'flex', gap: 0.6, alignItems: 'center' }}>
                        <Box sx={{ width: 6, height: 6, bgcolor: 'rgba(255,255,255,0.95)', borderRadius: '50%', animation: 'tn-dot 1s infinite' }} />
                        <Box sx={{ width: 6, height: 6, bgcolor: 'rgba(255,255,255,0.95)', borderRadius: '50%', animation: 'tn-dot 1s 0.16s infinite' }} />
                        <Box sx={{ width: 6, height: 6, bgcolor: 'rgba(255,255,255,0.95)', borderRadius: '50%', animation: 'tn-dot 1s 0.32s infinite' }} />
                    </Box>
                </Box>
                <Box sx={{
                    '@keyframes tn-dot': {
                        '0%': { transform: 'translateY(0)', opacity: 0.3 },
                        '50%': { transform: 'translateY(-3px)', opacity: 1 },
                        '100%': { transform: 'translateY(0)', opacity: 0.3 }
                    }
                }} />
            </Box>
        )
    }

    // auto-scroll to bottom when messages change or when typing indicator appears
    useEffect(() => {
        const el = scrollRef.current
        if (!el) return
        // small timeout to allow DOM updates
        const t = setTimeout(() => { el.scrollTop = el.scrollHeight }, 30)
        return () => clearTimeout(t)
    }, [messages.length, loading])

    // Load applicant details when the panel opens (used for substitutions)
    useEffect(() => {
        let mounted = true
        async function load() {
            let ap: any = null
            try {
                ap = await fetchApplicantSettings()
                if (!mounted) return
                setApplicant(ap || null)
            } catch (e) {
                // ignore failures
            }
            // check LLM health for this applicant so Chat can be disabled when not available
            try {
                const aid = ap ? (ap.applicantid ?? ap.id ?? ap.applicantId) : null
                const fallbackAid = (aid ?? getApplicantId())
                // coerce to a number if possible; pass undefined when invalid
                const parsedAid = (fallbackAid != null && !Number.isNaN(Number(fallbackAid))) ? Number(fallbackAid) : undefined
                try { console.debug('[ChatPanel] probing navigator health with applicantId', { aid: parsedAid }) } catch (e) { }
                const h = await fetchNavigatorHealth(parsedAid)
                if (!mounted) return
                try { console.debug('[ChatPanel] navigator health result', h) } catch (e) { }
                setLlmOk(Boolean(h && (h.ok === true || (h.llm && h.llm.ok === true))))
            } catch (e) {
                // default to disabled on error
                try { console.error('[ChatPanel] navigator health probe failed', e) } catch (err) { }
                try { setLlmOk(false) } catch (e) { }
            }
        }
        if (open) load()
        return () => { mounted = false }
    }, [open])

    return (
        <>
            <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1200 }}>
                {!open ? (
                    <Box sx={{ position: 'relative', display: 'inline-block' }}>
                        <IconButton color="primary" onClick={() => setOpen(true)} size="large" sx={{ bgcolor: '#fff' }}>
                            <ChatIcon />
                        </IconButton>
                        {loading && (
                            <Box sx={{ position: 'absolute', right: 0, top: 0, transform: 'translate(35%, -35%)' }}>
                                <Box sx={{ width: 22, height: 22, bgcolor: brandPurple, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(11,6,30,0.12)' }}>
                                    <Box sx={{ width: 4, height: 4, bgcolor: '#fff', borderRadius: '50%', mr: 0.4, animation: 'tn-badge 1s infinite' }} />
                                    <Box sx={{ width: 4, height: 4, bgcolor: '#fff', borderRadius: '50%', mr: 0.4, animation: 'tn-badge 1s 0.16s infinite' }} />
                                    <Box sx={{ width: 4, height: 4, bgcolor: '#fff', borderRadius: '50%', animation: 'tn-badge 1s 0.32s infinite' }} />
                                </Box>
                                <Box sx={{ '@keyframes tn-badge': { '0%': { opacity: 0.25 }, '50%': { opacity: 1 }, '100%': { opacity: 0.25 } } }} />
                            </Box>
                        )}
                    </Box>
                ) : null}
            </div>

            {open ? (
                <Paper elevation={8} sx={{ position: 'fixed', right: 16, top: 88, width: 360, bottom: 24, zIndex: 1200, display: 'flex', flexDirection: 'column', backgroundColor: '#e6d0ff' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', p: 1, borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                        <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 700 }}>Navigator Chat</Typography>
                        <IconButton size="small" onClick={() => setOpen(false)}><CloseIcon fontSize="small" /></IconButton>
                    </Box>

                    {/* Note: prompt comes from DB and is not editable by the user */}

                    <Box sx={{ flex: 1, overflow: 'auto', p: 1 }} ref={scrollRef}>
                        {messages.length === 0 ? (
                            <Typography variant="body2" color="textSecondary">No messages yet. Ask a question.</Typography>
                        ) : (
                            messages.map((m, idx) => {
                                const isUser = m.role === 'user'
                                return (
                                    <Box key={idx} sx={{ mb: 1, display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                                            <Typography variant="caption" color="textSecondary" sx={{ mb: 0.5, fontWeight: 700 }}>{isUser ? 'You' : 'Navigator'}</Typography>
                                            <Box
                                                sx={{
                                                    position: 'relative',
                                                    p: 1.25,
                                                    bgcolor: brandPurple,
                                                    borderRadius: 2,
                                                    color: '#ffffff',
                                                    boxShadow: '0 2px 6px rgba(11,6,30,0.12)',
                                                    '&:after': isUser ? {
                                                        content: '""',
                                                        position: 'absolute',
                                                        right: -8,
                                                        top: '12px',
                                                        width: 0,
                                                        height: 0,
                                                        borderLeft: `8px solid ${brandPurple}`,
                                                        borderTop: '6px solid transparent',
                                                        borderBottom: '6px solid transparent',
                                                    } : {
                                                        content: '""',
                                                        position: 'absolute',
                                                        left: -8,
                                                        top: '12px',
                                                        width: 0,
                                                        height: 0,
                                                        borderRight: `8px solid ${brandPurple}`,
                                                        borderTop: '6px solid transparent',
                                                        borderBottom: '6px solid transparent',
                                                    }
                                                }}
                                            >
                                                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: '#ffffff' }}>{m.text}</Typography>
                                            </Box>
                                        </Box>
                                    </Box>
                                )
                            })
                        )}
                        {loading && (
                            // show a typing indicator bubble from the assistant while waiting
                            <Box sx={{ mb: 1, display: 'flex', justifyContent: 'flex-start' }}>
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: '78%' }}>
                                    <Typography variant="caption" color="textSecondary" sx={{ mb: 0.5, fontWeight: 700 }}>Navigator</Typography>
                                    <Box sx={{ p: 1.25, bgcolor: brandPurple, borderRadius: 2, color: '#ffffff', boxShadow: '0 2px 6px rgba(11,6,30,0.12)' }}>
                                        <TypingIndicator />
                                    </Box>
                                </Box>
                            </Box>
                        )}
                    </Box>

                    <Box sx={{ p: 1, borderTop: '0.5px solid rgba(0,0,0,0.06)', display: 'flex', gap: 1, alignItems: 'center' }}>
                        <TextField
                            inputRef={inputRef}
                            placeholder={llmOk ? 'Type a question…' : 'Chat unavailable — LLM offline'}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            size="small"
                            fullWidth
                            disabled={loading || !llmOk}
                            sx={{
                                backgroundColor: '#ffffff',
                                borderRadius: 1,
                                '& .MuiOutlinedInput-root': {
                                    height: 40,
                                    boxSizing: 'border-box',
                                },
                                '& .MuiOutlinedInput-input': {
                                    padding: '8px 12px',
                                }
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (llmOk && !loading) sendMessage() } }}
                        />
                        <AppButton
                            colorScheme="white"
                            size="small"
                            endIcon={<SendIcon />}
                            onClick={sendMessage}
                            disabled={loading || !input.trim() || !llmOk}
                            sx={{
                                alignSelf: 'center',
                                height: 40,
                                minWidth: 72,
                                backgroundColor: '#ffffff',
                                color: brandPurple,
                                border: `2px solid ${brandPurple}`,
                                boxSizing: 'border-box',
                                borderRadius: 1,
                                '& .MuiButton-endIcon': { color: brandPurple },
                                '&:hover': {
                                    backgroundColor: brandPurple,
                                    color: '#ffffff',
                                    borderColor: brandPurple,
                                    '& .MuiButton-endIcon': { color: '#ffffff' }
                                }
                            }}
                        >
                            Send
                        </AppButton>
                    </Box>
                </Paper>
            ) : null}
        </>
    )
}
