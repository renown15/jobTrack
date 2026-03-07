import React, { useState } from 'react'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import InputLabel from '@mui/material/InputLabel'
import FormControl from '@mui/material/FormControl'
import Box from '@mui/material/Box'
import type { PaginatedResponse } from '../../api/types'
import { fetchAllContacts, fetchOrganisations, fetchLeads } from '../../api/client'

type Props = {
    value?: { targettype?: number; targetid?: number }
    onChange: (v: { targettype?: number; targetid?: number } | undefined) => void
    targetTypes: { refid: number; refvalue: string }[]
}

export default function TargetLookup({ value, onChange, targetTypes }: Props) {
    const [options, setOptions] = useState<Array<any>>([])
    const [loading, setLoading] = useState(false)

    const selectedType = value?.targettype

    async function loadOptions(typeId: number) {
        setLoading(true)
        try {
            // type mapping assumed: use refvalue to decide which endpoint
            const tt = targetTypes.find((t) => t.refid === typeId)
            if (!tt) {
                setOptions([])
                return
            }
            const label = (tt.refvalue || '').toLowerCase()
            if (label.includes('contact')) {
                const all = await fetchAllContacts()
                setOptions(all.map((c: any) => ({ id: c.contactid, label: `${c.firstname || ''} ${c.lastname || ''}`.trim() || c.email || `#${c.contactid}` })))
            } else if (label.includes('organisation') || label.includes('organization') || label.includes('org')) {
                const all = await fetchOrganisations()
                setOptions(all.map((o: any) => ({ id: o.orgid, label: o.name || `#${o.orgid}` })))
            } else if (label.includes('lead')) {
                const res = await fetchLeads(1, 200)
                const items = res.items || []
                setOptions(items.map((l: any) => ({ id: l.leadid, label: l.name || l.company || `#${l.leadid}` })))
            } else {
                setOptions([])
            }
        } catch (e) {
            setOptions([])
        } finally {
            setLoading(false)
        }
    }

    return (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel id="ta-type-label">Type</InputLabel>
                <Select
                    labelId="ta-type-label"
                    value={selectedType ?? ''}
                    label="Type"
                    onChange={async (e) => {
                        const v = Number(e.target.value) || undefined
                        onChange(v ? { targettype: v } : undefined)
                        if (v) await loadOptions(v)
                    }}
                >
                    <MenuItem value="">Select</MenuItem>
                    {targetTypes.map((tt) => (
                        <MenuItem key={tt.refid} value={tt.refid}>{tt.refvalue}</MenuItem>
                    ))}
                </Select>
            </FormControl>
            <Autocomplete
                options={options}
                getOptionLabel={(o: any) => o.label || ''}
                loading={loading}
                sx={{ minWidth: 240 }}
                value={options.find((o) => o.id === value?.targetid) || null}
                onChange={(_, v) => {
                    if (!v) onChange(undefined)
                    else onChange({ targettype: value?.targettype, targetid: v.id })
                }}
                renderInput={(params) => <TextField {...params} size="small" label="Select" />}
            />
        </Box>
    )
}
