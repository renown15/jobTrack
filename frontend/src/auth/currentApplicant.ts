const STORAGE_KEY = 'jobtrack.applicantId'

// DEBUG: currentApplicant module loaded
// eslint-disable-next-line no-console
console.log('MODULE: currentApplicant loaded, storageKey=', STORAGE_KEY)

function readFromStorage(): number | null {
    try {
        const v = sessionStorage.getItem(STORAGE_KEY)
        if (!v) return null
        const n = Number(v)
        return Number.isFinite(n) ? n : null
    } catch (e) {
        return null
    }
}

let _applicantId: number | null = readFromStorage()

export function setApplicantId(id: number | null) {
    _applicantId = id
    try {
        // Debug log to help trace state changes during logout/login
        // eslint-disable-next-line no-console
        console.debug('[currentApplicant] setApplicantId ->', id)
        if (id == null) sessionStorage.removeItem(STORAGE_KEY)
        else sessionStorage.setItem(STORAGE_KEY, String(id))
    } catch (e) {
        // ignore storage errors
    }
}

export function getApplicantId(): number | null {
    // Always prefer the value from storage to handle cases where modules were
    // loaded before AuthProvider updated the in-memory variable.
    const stored = readFromStorage()
    if (stored != null) return stored
    return _applicantId
}

export default { setApplicantId, getApplicantId }
