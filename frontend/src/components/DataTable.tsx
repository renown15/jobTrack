import React, { useRef, useState } from 'react'
// Custom scrollbar styling for WebKit (Safari/Chrome) to make horizontal scrollbar more visible
import './DataTableScrollbar.css'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import TablePagination from '@mui/material/TablePagination'
import TableSortLabel from '@mui/material/TableSortLabel'

type Column<T> = {
    key: keyof T | string
    // label may be a string or any React node (e.g. icon/button wrappers)
    label: React.ReactNode
    render?: (row: T) => React.ReactNode
    // Optional fixed initial width in pixels. If provided it will be used as
    // the column's starting width. If omitted, the table falls back to the
    // existing default sizing behaviour.
    width?: number
    // Force center alignment for header and cell content when true
    center?: boolean
    // If true and the label is a simple string, the column will be initialized
    // to a compact width approx matching the header text length.
    shrinkToHeader?: boolean
}

type DataTableProps<T> = {
    columns: Column<T>[]
    rows: T[]
    total?: number
    page: number // 0-based page
    pageSize: number
    onPageChange?: (newPage: number) => void
    onPageSizeChange?: (newSize: number) => void
    // Optional sorting. If onSortChange is provided, parent may handle server-side sort.
    sortKey?: string | null
    sortDirection?: 'asc' | 'desc' | null
    onSortChange?: (key: string | null, direction: 'asc' | 'desc' | null) => void
}

export default function DataTable<T extends Record<string, any>>(props: DataTableProps<T>) {
    const { columns, rows, total = rows.length, page, pageSize, onPageChange, onPageSizeChange, sortKey = null, sortDirection = null, onSortChange } = props
    // Column widths state (by key). Initialize from any provided column width
    // hints so compact columns can appear without user resizing.
    const [colWidths, setColWidths] = useState<{ [key: string]: number }>(() => {
        const m: { [key: string]: number } = {}
        // helper: measure text width using canvas where available, fallback to char-estimate
        const measure = (text: string) => {
            try {
                if (typeof document !== 'undefined') {
                    const canvas = document.createElement('canvas')
                    const ctx = canvas.getContext('2d')
                    if (ctx) {
                        ctx.font = '14px Roboto, Arial, sans-serif'
                        return ctx.measureText(text).width
                    }
                }
            } catch (e) {
                // ignore
            }
            return text.length * 8
        }

        try {
            // Determine a reasonable viewport bound for total width
            const vp = (typeof window !== 'undefined' && window?.innerWidth) ? window.innerWidth : 1200
            const maxByViewport = Math.max(800, Math.floor(vp * 1.5))

            // collect provisional widths and use percentile to avoid outliers
            const provisional: { [key: string]: number[] } = {}
            for (const c of columns) {
                const k = String(c.key)
                // baseline from explicit width or heuristics
                let base = 0
                if ((c as any).width && typeof (c as any).width === 'number') {
                    base = Math.max(24, Math.round((c as any).width))
                } else if ((c as any).shrinkToHeader && typeof c.label === 'string') {
                    const label = c.label as string
                    base = Math.min(200, Math.max(40, label.length * 10 + 20))
                } else if (typeof c.label !== 'string' || /action|actions|ops|buttons?/i.test(k)) {
                    base = 80
                } else {
                    base = 120
                }

                // measure header text (if label is string) and add extra space for icon nodes
                const headerText = typeof c.label === 'string' ? c.label : ''
                const headerMeasured = Math.ceil(measure(headerText || ''))
                // give a bit more room for non-string labels (icons / controls)
                let headerExtra = typeof c.label === 'string' ? 0 : 28
                // special-case common column keys that need a bit more room for toggles
                if (/engag|engagement/i.test(k)) headerExtra = Math.max(headerExtra, 32)

                // measure sample of row contents (limit to first 200 rows or fewer)
                const sample = (rows || []).slice(0, 200)
                const measures: number[] = []
                for (const r of sample) {
                    try {
                        const v = getValue(r, c.key as any)
                        const s = v == null ? '' : String(v)
                        const w = Math.ceil(measure(s))
                        measures.push(w)
                    } catch (e) {
                        // ignore
                    }
                }

                // include header as a candidate
                measures.push(headerMeasured + headerExtra)

                // if no measures, fall back to base
                if (!measures.length) {
                    m[k] = base
                    provisional[k] = [base]
                    continue
                }

                // sort measures and compute median + 90th percentile
                measures.sort((a, b) => a - b)
                const median = measures[Math.floor(measures.length / 2)] || measures[0]
                const p90idx = Math.max(0, Math.floor(measures.length * 0.9) - 1)
                const p90 = measures[p90idx] || measures[measures.length - 1]

                // If the caller provided an explicit width, treat it as the preferred fixed width
                if ((c as any).width && typeof (c as any).width === 'number') {
                    const explicit = Math.max(24, Math.round((c as any).width))
                    m[k] = explicit
                    provisional[k] = measures
                    continue
                }

                // choose desired width: at least header, prefer median but allow p90 up to a limit
                const desired = Math.max(headerMeasured + headerExtra, Math.round(Math.max(median, Math.min(p90, median * 1.5))))

                // add modest padding and clamp
                const padded = Math.min(360, Math.max(36, desired + 16))
                let final = Math.max(base, Math.round(padded))

                // Column-specific overrides for common columns
                if (/heat/i.test(k)) {
                    // heat column is usually very small; constrain it further
                    final = Math.min(final, 64)
                }
                if (/sector/i.test(k)) {
                    // sector values are short but need some room; enforce a sensible minimum
                    final = Math.max(final, 180)
                }
                if (/engag|engagement/i.test(k)) {
                    // engagement columns often include a toggle; ensure minimum space
                    final = Math.max(final, 140)
                }
                // Give more room to name-like columns so they can show full names
                if (/\b(name|full_name|displayname|display_name|candidate_name)\b/i.test(k)) {
                    // reduce previous min by 10px as requested
                    final = Math.max(final, 250)
                }
                // Give organisation/company columns a bit more room (take 10px from name)
                if (/\b(organisation|organization|org|company|employer|company_name|companyname)\b/i.test(k)) {
                    final = Math.max(final, 180 + 10)
                }

                m[k] = final
                provisional[k] = measures
            }

            // if total width exceeds the viewport bound, scale columns down proportionally
            const sum = Object.keys(m).reduce((s, k) => s + (m[k] || 0), 0)
            if (sum > maxByViewport) {
                const scale = maxByViewport / sum
                const minW = 40
                for (const k of Object.keys(m)) {
                    m[k] = Math.max(minW, Math.round(m[k] * scale))
                }
            }
        } catch (e) {
            // ignore and fall back to defaults (empty map)
        }
        return m
    })

    // Local sorting state if parent doesn't control it
    const [localSortKey, setLocalSortKey] = React.useState<string | null>(sortKey)
    const [localSortDir, setLocalSortDir] = React.useState<'asc' | 'desc' | null>(sortDirection)

    React.useEffect(() => {
        // keep local state in sync if parent controls sort props
        setLocalSortKey(sortKey ?? null)
        setLocalSortDir(sortDirection ?? null)
    }, [sortKey, sortDirection])

    // Apply client-side sort if present and no server-side handler is provided
    const activeSortKey = localSortKey
    const activeSortDir = localSortDir

    function getValue(row: any, key: string | number | symbol) {
        try {
            if (typeof key === 'string' && key.includes('.')) {
                return key.split('.').reduce((acc: any, part) => (acc ? acc[part] : undefined), row)
            }
            return row[key as any]
        } catch (e) {
            return undefined
        }
    }

    function compareValues(a: any, b: any) {
        if (a == null && b == null) return 0
        if (a == null) return -1
        if (b == null) return 1

        // numbers
        if (typeof a === 'number' && typeof b === 'number') return a - b

        // attempt date parse
        const ad = Date.parse(String(a))
        const bd = Date.parse(String(b))
        if (!isNaN(ad) && !isNaN(bd)) return ad - bd

        // fallback string compare
        return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' })
    }

    function isDateLike(s: string) {
        if (!s || typeof s !== 'string') return false
        const trimmed = s.trim()
        // ISO-ish: 2025-12-30 or 2025-12-30T12:00
        if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(trimmed)) return true
        // short dates: 12/30/2025 or 30/12/2025
        if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) return true
        // common month name formats e.g. 30 Dec 2025, Dec 30, 2025
        if (/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(trimmed)) return true
        // fallback: Date.parse returns a number but avoid matching plain numbers
        const pd = Date.parse(trimmed)
        return !isNaN(pd) && /\d/.test(trimmed)
    }

    // Lightweight manual column-resize handler: avoid heavy 3rd-party wrapper
    const startDrag = (e: React.MouseEvent, key: string) => {
        e.preventDefault()
        const startX = e.clientX
        const startWidth = colWidths[key] ?? Math.round(((columns.find(c => String(c.key) === key) as any)?.width ?? 150))
        const onMove = (ev: MouseEvent) => {
            const delta = ev.clientX - startX
            const newWidth = Math.max(24, Math.round(startWidth + delta))
            setColWidths(prev => ({ ...prev, [key]: newWidth }))
        }
        const onUp = () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }

    let displayRows = rows
    // Stable row key generator to avoid React reusing DOM nodes when rows
    // are inserted/removed (for example when group rows expand to show children).
    const rowKey = (row: any, idx: number) => {
        try {
            if (!row) return `i:${idx}`
            if (row.__is_child) {
                const parent = row.__parent_key ?? row.__group_key ?? ''
                const cid = row.contactid ?? row.contact_id ?? ''
                return `child:${String(parent)}:${String(cid)}`
            }
            if (row.__is_group) return `group:${String(row.__group_key ?? row.contactgroupname ?? row.groupname ?? idx)}`
            const eid = row.engagementlogid ?? row.engagementid ?? row.logid ?? null
            if (eid) return `eng:${String(eid)}`
            if (row.contactid) return `contact:${String(row.contactid)}`
        } catch (e) {
            // ignore
        }
        return `i:${idx}`
    }
    if (activeSortKey) {
        const key = activeSortKey

        // If there are no grouping annotations, fall back to the simple sort
        const hasGroups = (rows || []).some(r => r && (r.__is_group || r.__is_child))
        if (!hasGroups) {
            displayRows = [...rows].sort((r1, r2) => {
                const v1 = getValue(r1, key)
                const v2 = getValue(r2, key)
                const cmp = compareValues(v1, v2)
                return activeSortDir === 'desc' ? -cmp : cmp
            })
        } else {
            // Build group entries and single rows so we can sort groups and
            // singles together by the same key, but always emit a group row
            // followed immediately by its children.
            const groupsMap = new Map<string, { groupRow: any, children: any[] }>()
            const singles: any[] = []
            for (const r of rows || []) {
                if (!r) continue
                if (r.__is_group) {
                    const k = String(r.__group_key ?? r.contactgroupname ?? r.groupname ?? '')
                    groupsMap.set(k, { groupRow: r, children: [] })
                } else if (r.__is_child) {
                    const pk = String(r.__parent_key ?? r.__group_key ?? '')
                    const entry = groupsMap.get(pk)
                    if (entry) entry.children.push(r)
                    else singles.push(r)
                } else {
                    singles.push(r)
                }
            }

            const groupEntries = Array.from(groupsMap.values())

            // Build a unified list of sortable entries (groups and singles)
            type Entry = { type: 'group', keyVal: any, group: { groupRow: any, children: any[] } } | { type: 'single', keyVal: any, row: any }
            const entries: Entry[] = []

            for (const g of groupEntries) {
                const kv = getValue(g.groupRow, key)
                entries.push({ type: 'group', keyVal: kv, group: g })
            }
            for (const s of singles) {
                const kv = getValue(s, key)
                entries.push({ type: 'single', keyVal: kv, row: s })
            }

            entries.sort((a, b) => {
                const cmp = compareValues(a.keyVal, b.keyVal)
                return activeSortDir === 'desc' ? -cmp : cmp
            })

            // Flatten entries back to rows, emitting group then its children
            const flattened: any[] = []
            for (const e of entries) {
                if (e.type === 'single') {
                    flattened.push(e.row)
                } else {
                    flattened.push(e.group.groupRow)
                    // preserve original child order; we could optionally sort children
                    for (const c of e.group.children) flattened.push(c)
                }
            }
            displayRows = flattened
        }
    }

    // Compute total width so the table can be wider than the viewport and trigger horizontal scroll
    const totalWidth = Object.keys(colWidths).length ? Object.keys(colWidths).reduce((sum, k) => sum + (colWidths[k] || 150), 0) : columns.reduce((sum, c) => sum + ((c as any).width ?? ((c as any).shrinkToHeader && typeof c.label === 'string' ? Math.min(200, Math.max(40, (c.label as string).length * 10 + 20)) : 150)), 0)

    // Prevent runaway widths: clamp totalWidth to a reasonable upper bound
    // (1.5x viewport width) so dialogs or containers won't be forced to enormous sizes.
    let totalWidthClamped = totalWidth
    try {
        const maxByViewport = Math.max(800, Math.floor((window?.innerWidth || 1200) * 1.5))
        totalWidthClamped = Math.min(totalWidth, maxByViewport)
    } catch (e) {
        // window may be undefined in some test environments; fallback to original
        totalWidthClamped = totalWidth
    }

    return (
        <Paper>
            {/* Outer scrollable wrapper so scrollbars appear reliably */}
            <div className="data-table-scrollbar" style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                {/* Allow the inner content to grow beyond the viewport width */}
                <div style={{ minWidth: totalWidthClamped }}>
                    {/* Let the MUI TableContainer be visible so the outer wrapper handles scrolling */}
                    <TableContainer style={{ overflowX: 'visible' }}>
                        <Table size="small" style={{ minWidth: totalWidthClamped, tableLayout: 'fixed' }}>
                            <TableHead>
                                <TableRow style={{ borderBottom: '2px solid rgba(0,0,0,0.12)' }}>
                                    {columns.map((c, colIndex) => {
                                        const keyStr = String(c.key)
                                        const active = activeSortKey === keyStr
                                        const direction = active ? (activeSortDir ?? 'asc') : 'asc'
                                        const isActionCol = /action|actions|ops|buttons?/i.test(keyStr)
                                        const headerTextStr = typeof c.label === 'string' ? (c.label as string).toLowerCase() : ''
                                        const roleCountHeader = /\broles?\s*count\b/i.test(headerTextStr)
                                        const notesHeader = /\b(notes?|comment|comments?)\b/i.test(headerTextStr || keyStr)
                                        // also inspect a small sample of row values for date-like content when header label is non-string
                                        const headerIsDateLike = (rows || []).slice(0, 10).some(r => {
                                            try {
                                                const v = getValue(r, c.key as any)
                                                return v != null && isDateLike(String(v))
                                            } catch (e) {
                                                return false
                                            }
                                        })
                                        const centerHeaderBase = isActionCol || /\b(date|created|added|logdate|updated|modified|uploaded|submitted|sent|timestamp|time)\b/i.test(headerTextStr) || /\bengag(?:ement)?s?\b/i.test(headerTextStr) || /\bactions?(?:\s*count)?\b/i.test(headerTextStr) || roleCountHeader || headerIsDateLike
                                        const nameLikeHeader = /\b(name|title|company|position)\b/i.test(headerTextStr || keyStr)
                                        // respect explicit per-column `center` flag when provided
                                        const forcedCenterHeader = Boolean((c as any).center)
                                        // never center notes/comment columns unless forced
                                        const centerHeader = forcedCenterHeader || (!notesHeader && centerHeaderBase && (!nameLikeHeader || roleCountHeader))
                                        const width = colWidths[keyStr] ?? ((c as any).width ?? (isActionCol ? 80 : ((c as any).shrinkToHeader && typeof c.label === 'string' ? Math.min(200, Math.max(40, (c.label as string).length * 10 + 20)) : 150)))
                                        const isLast = colIndex === columns.length - 1
                                        return (
                                            <TableCell key={keyStr} style={{ width, minWidth: 60, position: 'relative', userSelect: 'none', paddingRight: 0, fontWeight: 700, borderRight: isLast ? 'none' : '1px solid rgba(0,0,0,0.08)', padding: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', height: 44, paddingLeft: 12, paddingRight: 8, justifyContent: centerHeader ? 'center' : 'flex-start' }}>
                                                    <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: centerHeader ? 'center' : 'left' }}>
                                                        {((c as any).sortable || onSortChange) ? (
                                                            <TableSortLabel
                                                                active={active}
                                                                direction={direction as any}
                                                                onClick={() => {
                                                                    let nextDir: 'asc' | 'desc' | null = 'asc'
                                                                    if (active) nextDir = activeSortDir === 'asc' ? 'desc' : 'asc'
                                                                    if (onSortChange) {
                                                                        onSortChange(keyStr, nextDir)
                                                                    } else {
                                                                        setLocalSortKey(keyStr)
                                                                        setLocalSortDir(nextDir)
                                                                    }
                                                                }}
                                                            >
                                                                {c.label}
                                                            </TableSortLabel>
                                                        ) : (
                                                            c.label
                                                        )}
                                                    </div>
                                                </div>
                                                <div
                                                    onMouseDown={(ev) => startDrag(ev as any, keyStr)}
                                                    style={{ position: 'absolute', top: 0, right: 0, width: 8, height: '100%', cursor: 'col-resize', zIndex: 20 }}
                                                />
                                            </TableCell>
                                        )
                                    })}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {displayRows.map((row, idx) => (
                                    <TableRow key={rowKey(row, idx)} hover style={row && row.__is_group ? { backgroundColor: '#f7f7f7' } : undefined}>
                                        {columns.map((c, colIndex) => {
                                            const keyStr = String(c.key)
                                            const isActionCol = /action|actions|ops|buttons?/i.test(keyStr)
                                            const width = colWidths[keyStr] ?? ((c as any).width ?? (isActionCol ? 80 : ((c as any).shrinkToHeader && typeof c.label === 'string' ? Math.min(200, Math.max(40, (c.label as string).length * 10 + 20)) : 150)))
                                            const isLast = colIndex === columns.length - 1
                                            const roleCountKey = /\broles?\s*count\b/i.test(keyStr)
                                            const nameLikeKey = /\b(name|title|company|position)\b/i.test(keyStr)
                                            const notesKey = /\b(notes?|comment|comments?)\b/i.test(keyStr)
                                            const bodyCenterBase = isActionCol || /\b(date|created|added|logdate|updated|modified|uploaded|submitted|sent|timestamp|time)\b/i.test(keyStr) || /\bengag(?:ement)?s?\b/i.test(keyStr) || /\bactions?(?:\s*count)?\b/i.test(keyStr) || roleCountKey
                                            // obtain the raw cell value; prefer the direct render output when it's a simple string
                                            const rawValue = (() => { try { return getValue(row, c.key as any) } catch (e) { return null } })()
                                            const renderedValue = (() => {
                                                try {
                                                    if (c.render) {
                                                        const out = c.render(row)
                                                        return typeof out === 'string' || typeof out === 'number' ? String(out) : null
                                                    }
                                                } catch (e) {
                                                    // ignore
                                                }
                                                return rawValue == null ? null : String(rawValue)
                                            })()
                                            const isDateCell = renderedValue != null && isDateLike(String(renderedValue))
                                            // notes/comments should always be left-aligned
                                            const forcedBodyCenter = Boolean((c as any).center)
                                            const bodyCenter = forcedBodyCenter || (notesKey ? false : ((bodyCenterBase && (!nameLikeKey || roleCountKey)) || isDateCell))
                                            return (
                                                <TableCell key={keyStr} style={{ width, minWidth: 24, maxWidth: isActionCol ? 120 : 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: bodyCenter ? 'center' : 'left', paddingLeft: bodyCenter ? 8 : 12, paddingTop: 6, paddingBottom: 6 }}>
                                                    <div title={typeof renderedValue === 'string' && renderedValue.length > 0 ? renderedValue : undefined} style={{ display: 'flex', alignItems: 'center', justifyContent: bodyCenter ? 'center' : 'flex-start', width: '100%' }}>
                                                        {c.render ? c.render(row) : (rawValue == null ? '' : String(rawValue))}
                                                    </div>
                                                </TableCell>
                                            )
                                        })}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </div>
            </div>

            <TablePagination
                component="div"
                count={total}
                page={page}
                onPageChange={(_, newPage) => onPageChange && onPageChange(newPage)}
                rowsPerPage={pageSize}
                onRowsPerPageChange={(e) => onPageSizeChange && onPageSizeChange(parseInt(e.target.value, 10))}
                rowsPerPageOptions={[10, 20, 50]}
            />
        </Paper >
    )
}
