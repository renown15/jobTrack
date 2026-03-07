import React from 'react'
import Dialog, { DialogProps } from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'

type WideDialogProps = DialogProps & {
    maxWidthPx?: number // optional override for max width in px
    fitToContent?: boolean // if true, dialog will measure inner content width and fit to it
}

export default function WideDialog(props: WideDialogProps) {
    const { children, sx, maxWidthPx, fitToContent, ...rest } = props
    // If caller provided maxWidthPx use it, otherwise leave undefined so
    // MUI's `maxWidth`/`fullWidth` props control sizing when not using
    // `fitToContent`. Previously we forced a very large default which made
    // dialogs expand to an unintended huge width.
    const defaultMaxWidth = typeof maxWidthPx === 'number' ? maxWidthPx : null

    const contentRef = React.useRef<HTMLDivElement | null>(null)
    const paperRef = React.useRef<HTMLElement | null>(null)
    const [computedPx, setComputedPx] = React.useState<number | null>(null)
    const lastMeasuredRef = React.useRef<number | null>(null)
    // Global debug flag (used elsewhere to show outlines). Use same flag
    // to gate verbose console output so importing the component doesn't
    // produce noisy logs in normal runs.
    let dbg = false
    try { dbg = typeof window !== 'undefined' && (window as any).__JOBTRACK_DEBUG_OVERLAYS } catch (e) { /* ignore */ }

    const measure = React.useCallback(() => {
        try {
            if (!fitToContent) return
            const content = contentRef.current
            if (!content) return
            // measure the scrollWidth of the content and add some padding
            let needed = Math.ceil(content.scrollWidth + 48)
            try {
                // Consider all data-table scroll wrappers and their inner content widths
                const dtNodes = Array.from(content.querySelectorAll('.data-table-scrollbar') || []) as HTMLElement[]
                for (const n of dtNodes) {
                    try {
                        // the inner div inside .data-table-scrollbar contains the minWidth used by DataTable
                        const inner = n.querySelector('div') as HTMLElement | null
                        if (inner && inner.scrollWidth) needed = Math.max(needed, Math.ceil(inner.scrollWidth + 48))
                    } catch (e) { /* ignore node errors */ }
                }
                // If we detected any data-table scroll wrappers, ensure a reasonable minimum
                if (dtNodes.length > 0) {
                    needed = Math.max(needed, 1000)
                }

                // Consider all table elements inside content and use their scrollWidth
                const tables = Array.from(content.querySelectorAll('table') || []) as HTMLTableElement[]
                for (const t of tables) {
                    try { if (t && t.scrollWidth) needed = Math.max(needed, Math.ceil(t.scrollWidth + 48)) } catch (e) { }
                }
                if (tables.length > 0) {
                    needed = Math.max(needed, 900)
                }

                // Also consider react-resizable boxes (column handles) which may affect layout
                const resizables = Array.from(content.querySelectorAll('.react-resizable') || []) as HTMLElement[]
                for (const r of resizables) {
                    try { if (r && r.scrollWidth) needed = Math.max(needed, Math.ceil(r.scrollWidth + 48)) } catch (e) { }
                }
            } catch (e) {
                // ignore per-measure errors
            }
            const maxAllowed = Math.floor(Math.min(defaultMaxWidth ?? Infinity, window.innerWidth * 0.95))
            const chosen = Math.min(needed, maxAllowed)
            // Only update state when measurement meaningfully changes to avoid
            // triggering repeated re-renders/measure loops when layout oscillates.
            if (lastMeasuredRef.current !== chosen) {
                lastMeasuredRef.current = chosen
                setComputedPx(chosen)
            }
            // Debugging: expose measurement details to console to help diagnose clipping
            try {
                // eslint-disable-next-line no-console
                if (dbg) console.debug('[WideDialog] measure', { fitToContent, defaultMaxWidth, windowInnerWidth: window.innerWidth, contentScrollWidth: content.scrollWidth, needed, maxAllowed, chosen })
            } catch (e) { }
        } catch (e) {
            // ignore measurement errors
        }
    }, [fitToContent, defaultMaxWidth])

    const isOpen = !!(rest as any).open

    React.useEffect(() => {
        // Only activate measurement and observers when the dialog is both
        // requested to `fitToContent` and is currently open. This prevents
        // the measurement loop from running while the dialog is not shown.
        if (!fitToContent || !isOpen) return
        // measure on mount and when window resizes
        measure()
        // Also re-measure on the next animation frame and after short timeouts
        // to allow complex children (tables, resizable columns) to finish layout.
        try { requestAnimationFrame(() => { try { measure() } catch (e) { } }) } catch (e) { /* ignore */ }
        const lateTimer1 = setTimeout(() => { try { measure() } catch (e) { } }, 100)
        const lateTimer2 = setTimeout(() => { try { measure() } catch (e) { } }, 300)
        const lateTimer3 = setTimeout(() => { try { measure() } catch (e) { } }, 700)
        const ro = (window as any).ResizeObserver ? new (window as any).ResizeObserver((entries: any) => {
            measure()
        }) : null
        if (ro && contentRef.current) ro.observe(contentRef.current)
        window.addEventListener('resize', measure)
        // Also observe DOM mutations inside content so dynamic child changes trigger re-measure
        let mo: MutationObserver | null = null
        try {
            if ((window as any).MutationObserver && contentRef.current) {
                mo = new (window as any).MutationObserver(() => { try { measure() } catch (e) { } })
                mo?.observe(contentRef.current, { childList: true, subtree: true, attributes: true })
            }
        } catch (e) { /* ignore */ }

        return () => {
            try { if (ro && contentRef.current) ro.unobserve(contentRef.current) } catch (e) { }
            try { if (mo && contentRef.current) mo.disconnect() } catch (e) { }
            window.removeEventListener('resize', measure)
            try { clearTimeout(lateTimer1); clearTimeout(lateTimer2); clearTimeout(lateTimer3) } catch (e) { }
        }
    }, [fitToContent, measure, isOpen])

    const chosenPx = computedPx ?? defaultMaxWidth

    // Use computed width when available (from measurement) or the explicit
    // numeric `maxWidthPx` if provided. If neither is present, fall back to
    // a sensible viewport percentage (95vw) so dialogs remain usable.
    const effectiveChosenPx = typeof chosenPx === 'number' ? chosenPx : null

    // Inline paper style so it takes precedence over CSS rules when we need
    // to control sizing for `fitToContent` or when an explicit `maxWidthPx`
    // is provided. If neither is present and `fitToContent` is false we
    // avoid setting a huge inline maxWidth so MUI's `maxWidth`/`fullWidth`
    // props behave normally.
    const paperInlineStyle: any = fitToContent ? {
        // Let the paper size to its content but center it in the viewport.
        // Use inline-block so tests and some browsers measuring inline
        // content can correctly compute widths.
        width: 'auto',
        display: 'inline-block',
        margin: '0 auto',
        boxSizing: 'border-box',
        maxWidth: typeof effectiveChosenPx === 'number' ? `${effectiveChosenPx}px` : '95vw',
        maxHeight: '95vh',
        overflowX: 'auto',
    } : (typeof chosenPx === 'number' ? {
        // Caller supplied a numeric max width override (maxWidthPx)
        maxWidth: `${chosenPx}px`,
        maxHeight: '95vh',
        overflowX: 'auto',
    } : {
        // No explicit maxWidthPx and not fitting to content — let MUI handle sizing.
        maxHeight: '95vh',
        overflowX: 'auto',
    })

    // Combine any user-provided PaperProps styles; attach ref
    const incomingPaperProps = (rest as any)?.PaperProps || {}
    // Add optional dev-only outline when requested via global flag
    let mergedPaperProps: any = { ...(incomingPaperProps || {}), ref: paperRef as any, style: { ...(incomingPaperProps?.style || {}), ...paperInlineStyle } }
    try {
        if (dbg) {
            mergedPaperProps.style = { ...(mergedPaperProps.style || {}), outline: '3px solid rgba(0,200,0,0.9)', boxShadow: '0 0 0 4px rgba(0,200,0,0.06)' }
        }
    } catch (e) { /* ignore */ }

    const maxWidthValue = `${chosenPx}px`
    // Avoid forcing a concrete width via sx; only ensure the paper can scroll
    // Only enforce a wide maxWidth when we're fitting to content. Otherwise
    // allow MUI's `maxWidth`/`fullWidth` props to control sizing so callers
    // asking for `maxWidth="md"` get the expected width instead of a
    // forced 95vw.
    const paperSx = fitToContent ? {
        '& .MuiDialog-paper': {
            maxWidth: `95vw !important`,
            overflowX: 'auto',
        },
    } : {
        // do not override .MuiDialog-paper maxWidth when not fitting to content
        '& .MuiDialog-paper': {
            overflowX: 'auto',
        },
    }
    const mergedSx = Array.isArray(sx) ? [paperSx, ...sx] : { ...paperSx, ...(sx as any) }

    // When fitToContent is requested, ignore caller-supplied `fullWidth`/`maxWidth`
    // so the dialog can size to the inline content. Otherwise pass props through.
    // IMPORTANT: remove any caller-supplied `onClose` from the props we spread
    // so our internal `handleDialogClose` can intercept backdrop clicks.
    const incomingOnClose = (rest as any)?.onClose
    const dialogPropsBase = { ...(rest as any) }
    // Ensure we don't accidentally override our onClose handler when spreading
    try { delete (dialogPropsBase as any).onClose } catch (e) { /* ignore */ }
    if (fitToContent) {
        try { delete (dialogPropsBase as any).fullWidth } catch (e) { }
        try { delete (dialogPropsBase as any).maxWidth } catch (e) { }
    }
    const dialogProps = dialogPropsBase

    // Intercept onClose so backdrop clicks do NOT close the dialog. Callers
    // must press an explicit Cancel (or the provided onClose) to close.
    const handleDialogClose = (event: any, reason?: any) => {
        // ignore backdrop clicks — require explicit Cancel
        if (reason === 'backdropClick') return
        if (typeof incomingOnClose === 'function') {
            try { incomingOnClose(event, reason) } catch (e) { /* ignore */ }
        }
    }

    return (
        <Dialog
            PaperProps={mergedPaperProps}
            sx={mergedSx}
            onClose={handleDialogClose}
            onKeyDown={(e: any) => {
                try {
                    if (e && (e.key === 'Escape' || e.key === 'Esc')) {
                        if (typeof incomingOnClose === 'function') {
                            try { incomingOnClose(e, 'escapeKeyDown') } catch (err) { /* ignore */ }
                        }
                    }
                } catch (err) { /* ignore */ }
            }}
            {...dialogProps}
        >
            <div ref={contentRef} style={{ display: 'block', position: 'relative', width: '100%' }}>
                {/* Global close icon in top-right of dialog content */}
                {typeof incomingOnClose === 'function' ? (
                    <IconButton
                        size="small"
                        aria-label="Dismiss dialog"
                        onClick={(e) => { try { incomingOnClose(e, 'closeButton') } catch (err) { } }}
                        sx={{ position: 'absolute', right: 8, top: 8, zIndex: 1400 }}
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                ) : null}
                {
                    // debug current computed paper style once mounted
                    (function debugPaper() {
                        try {
                            // eslint-disable-next-line no-console
                            // Only emit render-time debug information when the
                            // global debug flag is set and the dialog is open —
                            // avoids noisy logs from components that merely import
                            // the dialog but do not show it.
                            if (dbg && isOpen) console.debug('[WideDialog] rendered', { fitToContent, computedPx, paperStyle: mergedPaperProps?.style })
                        } catch (e) { }
                        return null
                    })()
                }
                {children}
            </div>
        </Dialog>
    )
}
