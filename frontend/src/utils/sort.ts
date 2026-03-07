export function getValue(row: any, key: string | number | symbol) {
    try {
        if (typeof key === 'string' && key.includes('.')) {
            return key.split('.').reduce((acc: any, part) => (acc ? acc[part] : undefined), row)
        }
        return row[key as any]
    } catch (e) {
        return undefined
    }
}

export function compareValues(a: any, b: any) {
    if (a == null && b == null) return 0
    if (a == null) return -1
    if (b == null) return 1

    if (typeof a === 'number' && typeof b === 'number') return a - b

    const ad = Date.parse(String(a))
    const bd = Date.parse(String(b))
    if (!isNaN(ad) && !isNaN(bd)) return ad - bd

    return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' })
}

export function sortArray<T>(arr: T[], key: string | null, direction: 'asc' | 'desc' | null) {
    if (!key || !direction) return arr
    const out = [...arr]
    out.sort((r1: any, r2: any) => {
        const v1 = getValue(r1, key)
        const v2 = getValue(r2, key)
        const cmp = compareValues(v1, v2)
        return direction === 'desc' ? -cmp : cmp
    })
    return out
}
