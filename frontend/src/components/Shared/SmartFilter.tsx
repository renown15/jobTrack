import React, { useRef, useState } from 'react'
import Box from '@mui/material/Box'
import AppButton from './AppButton'
import Popper from '@mui/material/Popper'
import Paper from '@mui/material/Paper'
import ClickAwayListener from '@mui/material/ClickAwayListener'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import EditIcon from '@mui/icons-material/Edit'

type Props = {
    options: string[]
    value?: string[]
    onChange: (v: string[]) => void
    placeholder?: string
    matchCount?: number
    showSelectAll?: boolean
}

export default function SmartFilter({ options, value = [], onChange, placeholder, matchCount, showSelectAll }: Props) {
    const [open, setOpen] = useState(false)
    const [local, setLocal] = useState<string[]>([...value])
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
    const buttonRef = useRef<HTMLDivElement | null>(null)

    function openDialog(e?: React.MouseEvent) {
        setLocal([...value])
        setOpen(true)
        setAnchorEl(e ? (e.currentTarget as HTMLElement) : buttonRef.current)
    }

    function handleDone() {
        onChange(local)
        setOpen(false)
        setAnchorEl(null)
    }

    function handleClear() {
        setLocal([])
    }

    const display = () => {
        if (!value || value.length === 0) return placeholder || 'Filter'
        if (value.length === 1) return value[0]
        return `${value.length} selected`
    }

    return (
        <div ref={buttonRef}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AppButton onClick={(e) => openDialog(e)} size="small" variant="outlined" sx={{ minWidth: 120, justifyContent: 'space-between', textTransform: 'none' }}>
                        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', textAlign: 'left' }}>{display()}</span>
                        <EditIcon fontSize="small" />
                    </AppButton>
                </Box>
            </Box>

            <Popper open={open} anchorEl={anchorEl} placement="bottom-start" modifiers={[{ name: 'flip', enabled: false }]} style={{ zIndex: 1300 }}>
                <ClickAwayListener onClickAway={() => { setOpen(false); setAnchorEl(null) }}>
                    <Paper sx={{ p: 2, width: 320 }}>
                        <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                                {local.map((v) => (
                                    <Chip key={v} label={v} onDelete={() => setLocal((s) => s.filter((x) => x !== v))} />
                                ))}
                            </Box>
                            {/* match count / info line */}
                            {typeof matchCount !== 'undefined' && (
                                <Box sx={{ color: 'text.secondary', fontSize: 12, mb: 1 }}>
                                    Matches: {matchCount}
                                </Box>
                            )}
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 1 }}>
                                {showSelectAll && (
                                    <AppButton colorScheme="white" onClick={() => { setLocal([...options]) }}>
                                        Select all
                                    </AppButton>
                                )}
                                <AppButton colorScheme="white" onClick={() => { handleClear() }}>Clear</AppButton>
                                <AppButton colorScheme="white" onClick={() => { setOpen(false); setAnchorEl(null) }}>Cancel</AppButton>
                                <AppButton colorScheme="purple" onClick={handleDone}>Done</AppButton>
                            </Box>
                            {/* Custom PopperComponent for the Autocomplete to force the list to render downward */}
                            {/**
                             * Autocomplete renders its own Popper for the options list. We provide a PopperComponent
                             * that disables flipping so it always renders below the input, and we set a max height
                             * on the listbox so it scrolls when space is limited.
                             */}
                            <Autocomplete
                                PopperComponent={(props: any) => <Popper {...props} placement="bottom-start" modifiers={[{ name: 'flip', enabled: false }]} />}
                                multiple
                                options={options}
                                value={local}
                                onChange={(_, v) => setLocal(v)}
                                renderInput={(params) => <TextField {...params} label={placeholder || 'Select values'} />}
                                disableCloseOnSelect
                                filterSelectedOptions
                                sx={{ width: '100%' }}
                                ListboxProps={{ style: { maxHeight: 260, overflow: 'auto' } }}
                            />
                        </Box>
                    </Paper>
                </ClickAwayListener>
            </Popper>
        </div>
    )
}
