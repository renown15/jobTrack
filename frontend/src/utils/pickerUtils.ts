// Small helpers for consistent object-valued pickers across the app
export type AnyRecord = { [k: string]: any }

export function toNumberOrNull(v: any): number | null {
    if (v === undefined || v === null || v === '') return null
    const n = Number(v)
    return isNaN(n) ? null : n
}

// Resolve an option from a list by numeric idKey (like 'orgid', 'contactid', 'sectorid').
// If not found, return a lightweight placeholder object that contains the id (so
// Autocomplete can render a stable value) or null if id is nullish.
export function resolveOptionById(list: AnyRecord[] = [], id: any, idKey = 'id', fallback?: AnyRecord): AnyRecord | null {
    const nid = toNumberOrNull(id)
    if (nid == null) return null
    if (!Array.isArray(list)) return fallback ? { ...fallback, [idKey]: nid } : { [idKey]: nid }
    const found = list.find((o: AnyRecord) => toNumberOrNull(o[idKey]) === nid)
    if (found) return found
    // not found: return a placeholder so the Autocomplete has a value object to display
    if (fallback && typeof fallback === 'object') return { ...fallback, [idKey]: nid }
    return { [idKey]: nid }
}

// Comparison helper for MUI Autocomplete to compare options by numeric id
export function optionEqualsById(idKey = 'id') {
    return (opt: AnyRecord, val: AnyRecord) => {
        if (!opt || !val) return false
        const a = toNumberOrNull(opt[idKey])
        const b = toNumberOrNull(val[idKey])
        return a != null && b != null && a === b
    }
}

export default {
    toNumberOrNull,
    resolveOptionById,
    optionEqualsById,
}
