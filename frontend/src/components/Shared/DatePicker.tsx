import React from 'react'
import TextField from '@mui/material/TextField'

type Props = {
    label?: string
    value?: string | null
    onChange: (v: string | null) => void
    onBlur?: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void
    inputRef?: React.Ref<HTMLInputElement>
    size?: 'small' | 'medium'
    fullWidth?: boolean
    sx?: any
    required?: boolean
    onFocus?: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void
    // When true, allow the control to represent a null/empty value and
    // avoid defaulting to today. Defaults to false to preserve existing behaviour.
    allowNull?: boolean
}

export default function DatePicker({ label, value, onChange, onBlur, onFocus, inputRef, size = 'small', fullWidth = false, sx, required, allowNull = false }: Props) {
    // Compute a local YYYY-MM-DD today string (avoid timezone issues).
    const today = (() => {
        const d = new Date()
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${dd}`
    })()

    // When allowNull is false (legacy behaviour), default null/undefined to today.
    const display = (value ?? (allowNull ? '' : today))

    // If the parent hasn't initialised the model (value is null/undefined)
    // and `allowNull` is false, initialise it to today so forms that don't
    // touch the control still submit the expected default date.
    React.useEffect(() => {
        if (value == null && !allowNull) {
            try {
                onChange(today)
            } catch (err) {
                // swallow; parent may not expect immediate update
            }
        }
        // only run when value changes from/into null
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, allowNull])

    // Previously there was a focus->clear->restore workaround for native
    // pickers which caused focus/blur races on some platforms. Keep the
    // handlers minimal to avoid freezing the page.

    const mergedSx = React.useMemo(() => ({
        ...(sx || {}),
        // Ensure the label in the notch shows focused (primary) color
        // when the input is focused (including when native picker is open).
        '& .MuiInputLabel-root.Mui-focused': {
            color: 'primary.main !important',
        },
        '& .MuiInputLabel-root.MuiInputLabel-shrink.Mui-focused': {
            color: 'primary.main !important',
        },
    }), [sx])
    return (
        <TextField
            label={label}
            type="date"
            size={size}
            margin="normal"
            fullWidth={fullWidth}
            // For native `type="date"` inputs the browser renders a placeholder
            // which can overlap the floating label. Always shrink the label for
            // date inputs so the UI shows a single clear label instead of
            // overlapping text.
            InputLabelProps={{ shrink: true }}
            value={display}
            onFocus={(e) => {
                try {
                    // eslint-disable-next-line no-console
                    console.log('[DatePicker] onFocus', { label, value })
                } catch (err) { }
                if (typeof onFocus === 'function') onFocus(e)
            }}
            onBlur={(e) => {
                if (typeof onBlur === 'function') onBlur(e)
            }}
            onChange={(e) => {
                const input = e.target as HTMLInputElement
                // If allowNull is enabled, an empty input represents `null`.
                const raw = input.value
                const v = (allowNull && (!raw || raw === '')) ? null : (raw || today)
                onChange(v)
                // Note: avoid programmatic blurring here — some browsers
                // exhibit focus/blur races with native date pickers which
                // may cause the page to become unresponsive. Let the
                // platform manage focus after selection.
            }}
            inputRef={inputRef}
            // Slightly increase the internal vertical padding so the text
            // has 1px more space above and below than the browser default.
            InputProps={{
                sx: {
                    '& input': {
                        paddingTop: 'calc(0.5em + 1px)',
                        paddingBottom: 'calc(0.5em + 1px)'
                    }
                }
            }}
            sx={mergedSx}
            required={required}
        />
    )
}
