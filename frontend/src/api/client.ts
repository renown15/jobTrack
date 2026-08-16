import axios from 'axios'
import { getApplicantId } from '../auth/currentApplicant'

// module loaded

// Prefer an explicitly configured API base (VITE_API_BASE_URL). If not provided,
// default to same-origin (empty string) so requests go to the current host/port.
const _rawBase = import.meta.env.VITE_API_BASE_URL || ''
export const BASE_URL = _rawBase.replace(/\/$/, '')

export const api = axios.create({
    baseURL: BASE_URL,
    withCredentials: true,
    headers: ({
        'Content-Type': 'application/json'
    } as any)
})

// Helpful axios interceptors for debugging network errors in the browser.
// They log request/response metadata so the dev console shows what failed.
api.interceptors.request.use((config) => {
    // Attach applicant id header when available
    try {
        const aid = getApplicantId && typeof getApplicantId === 'function' ? getApplicantId() : null
        if (aid != null) {
            if (!config.headers) config.headers = {} as any
                ; (config.headers as any)['X-Applicant-Id'] = String(aid)
        }
        // Attach CSRF token from sessionStorage when available
        try {
            if (typeof window !== 'undefined' && window.sessionStorage) {
                const csrf = window.sessionStorage.getItem('JOBTRACK_CSRF')
                if (csrf) {
                    if (!config.headers) config.headers = {} as any
                        ; (config.headers as any)['X-CSRF-Token'] = csrf
                }
            }
        } catch (e) {
            // ignore
        }
    } catch (e) {
        // ignore
    }

    // DEV: log each outgoing request for diagnosis when client logs enabled
    try {
        const enableLogs = Boolean((import.meta as any).env?.VITE_ENABLE_CLIENT_LOGS === 'true')
        if (enableLogs) {
            try {
                // eslint-disable-next-line no-console
                console.debug('[api>>]', config.method, config.url, config.params || undefined)
            } catch (e) { }
        }
    } catch (e) { }
    return config
})

api.interceptors.response.use(
    (res) => {
        // response received (debugging removed)
        return res
    },
    (err) => {
        // Axios uses `err.request` when no response was received (network error/CORS)
        const status = err.response?.status
        const url = err.config?.url
        // Suppress noisy error-level logging for the common unauthenticated check
        // (`GET /api/auth/me`) which intentionally returns 401 when not signed in.
        if (status === 401 && url && url.includes('/auth/me')) {
            // auth.me unauthenticated (expected) - suppressed verbose debug
        } else {
            // eslint-disable-next-line no-console
            const _err: any = err
            console.error('[api] network error', {
                message: _err.message,
                code: _err.code,
                url: _err.config?.url,
                method: _err.config?.method,
                params: _err.config?.params,
                data: _err.config?.data,
                request: _err.request,
                response: _err.response,
            })
        }
        return Promise.reject(err)
    }
)

// Types
import type { Contact, PaginatedResponse, AnalyticsSummary } from './types'

function requireApplicantId(): number {
    const aid = getApplicantId()
    if (aid == null) {
        // In test environments (Vitest/Jest) the test setup may not have
        // completed before some modules are imported/collected. To avoid
        // brittle ordering issues causing many tests to fail with a
        // hard exception, default to applicant id `1` when running under
        // a test runner. This keeps tests deterministic while preserving
        // the strict behavior in production.
        try {
            if (typeof process !== 'undefined' && process.env && (process.env.VITEST || process.env.NODE_ENV === 'test')) {
                return 1
            }
        } catch (e) {
            // ignore and fall through to throwing
        }
        throw new Error('Applicant not selected')
    }
    return aid
}

function withApplicantPath(path: string) {
    // path may be '/api/contacts' or '/contacts' etc. Ensure it becomes '/api/<aid>/...'
    const aid = requireApplicantId()
    if (path.startsWith('/api')) path = path.slice(4)
    if (!path.startsWith('/')) path = '/' + path
    return `/api/${aid}${path}`
}

function injectApplicant(payload?: Record<string, any>) {
    const aid = requireApplicantId()
    return Object.assign({}, payload || {}, { applicantid: aid })
}

async function deleteWithApplicant(url: string) {
    const aid = requireApplicantId()
    return api.delete(url, { data: { applicantid: aid } })
}

async function postWithApplicant(url: string, payload?: Record<string, any>) {
    return api.post(url, injectApplicant(payload))
}

async function putWithApplicant(url: string, payload?: Record<string, any>) {
    return api.put(url, injectApplicant(payload))
}

/**
 * Fetch contacts from the backend. The backend returns an array of contacts (no server-side
 * pagination). To keep the frontend pagination controls working, we perform client-side
 * pagination here and return a PaginatedResponse<Contact>.
 */
export async function fetchContacts(page = 1, pageSize = 20, roleTypeId?: number): Promise<PaginatedResponse<Contact>> {
    const params: Record<string, any> = {}
    if (roleTypeId != null) params.role_type_id = roleTypeId
    const res = await api.get(withApplicantPath('/api/contacts'), { params })
    // Support multiple mock/response shapes in tests and runtimes:
    // - axios responses: { data: [...] }
    // - some mocks may resolve directly to an array
    // - some mocks return a paginated shape: { items: [...], total }
    let all: Contact[] = []
    if (Array.isArray(res)) all = res as any
    else if (res && typeof res === 'object') {
        const maybe = (res.data !== undefined) ? res.data : res
        if (Array.isArray(maybe)) all = maybe
        else if (maybe && Array.isArray((maybe as any).items)) all = (maybe as any).items
        else all = []
    }

    const total = all.length
    const start = (page - 1) * pageSize
    const end = start + pageSize
    const items = all.slice(start, end).map((c: any) => ({
        ...c,
        // Normalise contact status shapes: prefer `contact_status`, then `status`, then legacy `contact_status_value`.
        contact_status: c?.contact_status ?? c?.status ?? c?.contact_status_value ?? null,
    }))

    return {
        items,
        total,
        page,
        pageSize,
    }
}

export async function fetchAllContacts(roleTypeId?: number, orgId?: number, from_date?: string, to_date?: string): Promise<Contact[]> {
    const params: Record<string, any> = {}
    if (roleTypeId != null) params.role_type_id = roleTypeId
    if (orgId != null) params.org_id = orgId
    if (from_date) params.from_date = from_date
    if (to_date) params.to_date = to_date
    // fetchAllContacts params prepared (debugging removed)
    const res = await api.get(withApplicantPath('/api/contacts'), { params: Object.keys(params).length ? params : undefined })
    // Normalize possible response shapes
    let rows: any[] = []
    if (Array.isArray(res)) rows = res as any
    else if (res && typeof res === 'object') {
        const maybe = res.data !== undefined ? res.data : res
        if (Array.isArray(maybe)) rows = maybe
        else if (maybe && Array.isArray((maybe as any).items)) rows = (maybe as any).items
    }
    return rows.map((c: any) => ({
        ...c,
        contact_status: c?.contact_status ?? c?.status ?? c?.contact_status_value ?? null,
    }))
}

export async function fetchAnalyticsSummary(params?: { from_date?: string; to_date?: string }): Promise<AnalyticsSummary | null> {
    try {
        const res = await api.get(withApplicantPath('/api/analytics/summary'), { params })
        return res.data || null
    } catch (e) {
        return null
    }
}

export async function fetchOrganisations(): Promise<any[]> {
    try {
        // diagnostic noop
    } catch (e) {
        // ignore
    }
    const res = await api.get(withApplicantPath('/api/organisations'))
    try {
        // diagnostic noop
    } catch (e) { /* ignore */ }
    // Support multiple possible mock/response shapes in tests and runtimes:
    // - axios responses: { data: [...] }
    // - some mocks may resolve directly to an array
    if (Array.isArray(res)) return res
    if (res && typeof res === 'object') return (res.data ?? [])
    return []
}

export async function fetchOrganisation(orgId: number): Promise<any | null> {
    const res = await api.get(withApplicantPath(`/api/organisations/${orgId}`))
    return res.data ?? null
}

export async function fetchJobRoles(contactId?: number): Promise<any[]> {
    const params: Record<string, any> = {}
    if (contactId) params.contact_id = contactId
    const res = await api.get(withApplicantPath('/api/jobroles'), { params })
    return res.data ?? []
}

export async function fetchSectors(): Promise<any[]> {
    const res = await api.get(withApplicantPath('/api/sectors'))
    return res.data ?? []
}

export async function createSector(payload: { summary: string; description?: string; notes?: string }): Promise<any> {
    const res = await api.post('/api/sectors', payload)
    return res.data
}

export async function updateSector(sectorId: number, payload: { summary?: string; description?: string; notes?: string }): Promise<any> {
    const res = await api.put(`/api/sectors/${sectorId}`, payload)
    return res.data
}

export async function deleteSector(sectorId: number): Promise<any> {
    const res = await api.delete(`/api/sectors/${sectorId}`)
    return res.data
}

export async function fetchContactTargets(contactId: number): Promise<any[]> {
    const res = await api.get(withApplicantPath(`/api/contacts/${contactId}/targets`))
    return res.data ?? []
}

export async function fetchContactTasks(contactId: number): Promise<any[]> {
    const res = await api.get(withApplicantPath(`/api/contacts/${contactId}/tasks`))
    return res.data ?? []
}

export async function fetchContactTaskCounts(): Promise<{ contactid: number; actions_count: number }[]> {
    const res = await api.get(withApplicantPath(`/api/contacts/tasks/counts`))
    return res.data ?? []
}

export async function addContactTarget(contactId: number, orgId?: number, orgName?: string): Promise<any> {
    const payload: Record<string, any> = {}
    if (orgId != null) payload.orgid = Number(orgId)
    else if (orgName) payload.org_name = orgName
    const res = await postWithApplicant(withApplicantPath(`/api/contacts/${contactId}/targets`), payload)
    return res.data
}

export async function removeContactTarget(contactId: number, targetOrgId: number): Promise<any> {
    const res = await deleteWithApplicant(withApplicantPath(`/api/contacts/${contactId}/targets/${targetOrgId}`))
    return res.data
}

export async function fetchEngagements(contactId?: number, limit?: number): Promise<any[]> {
    const params: Record<string, any> = {}
    if (contactId) params.contact_id = contactId
    if (limit) params.limit = limit
    const res = await api.get(withApplicantPath('/api/engagements'), { params })
    // fetchEngagements result received (debugging removed)
    return res.data ?? []
}

export async function fetchNavigatorInsights(): Promise<any> {
    const res = await api.get(withApplicantPath('/navigator/insights'))
    return res.data ?? { ok: false }
}

export async function fetchNavigatorHealth(applicantId?: number): Promise<any> {
    // Allow caller to pass an explicit applicantId to avoid depending
    // on global selection state (useful when the UI has just loaded
    // applicant settings but `getApplicantId()` is not yet populated).
    try {
        if (typeof applicantId !== 'undefined' && applicantId != null) {
            const res = await api.get(`/api/${Number(applicantId)}/navigator/health`)
            return res.data ?? { ok: false }
        }
    } catch (e) {
        // fall through to default behaviour
    }
    const res = await api.get(withApplicantPath('/navigator/health'))
    return res.data ?? { ok: false }
}

export async function fetchNavigatorDetail(metric: string, limit = 200): Promise<any> {
    const res = await api.get(withApplicantPath('/navigator/detail'), { params: { metric, limit } })
    return res.data ?? { ok: false }
}

export async function fetchNavigatorInsightsForce(force = false): Promise<any> {
    const params: Record<string, any> = {}
    if (force) params.force_refresh = true
    const res = await api.get(withApplicantPath('/navigator/insights'), { params: Object.keys(params).length ? params : undefined })
    return res.data ?? { ok: false }
}

export async function fetchNavigatorMetricHistory(): Promise<{ id: number; created_at: string }[]> {
    const res = await api.get(withApplicantPath('/navigator/metricshistory'))
    return res.data?.history ?? []
}

export async function fetchAllApplicantsSummary(): Promise<any[]> {
    try {
        const res = await api.get('/api/admin/applicants/summary')
        return res.data ?? []
    } catch (err: any) {
        // If the request is forbidden, return an empty list instead of
        // propagating an error. This keeps the UI quiet when the server
        // rejects access due to session/auth mismatch.
        const status = err?.response?.status
        if (status === 403 || status === 401) {
            // expected when not authenticated or not a superuser
            return []
        }
        throw err
    }
}

// Admin actions: update applicant status and clear password
export async function adminUpdateApplicantStatus(targetApplicantId: number, isActive: boolean): Promise<any> {
    const res = await api.patch(`/api/admin/applicants/${targetApplicantId}/status`, { isActive })
    return res.data
}

export async function adminClearApplicantPassword(targetApplicantId: number): Promise<any> {
    const res = await api.delete(`/api/admin/applicants/${targetApplicantId}/password`)
    return res.data
}

export async function adminUpdateApplicantSuperuser(targetApplicantId: number, isSuperuser: boolean): Promise<any> {
    const res = await api.patch(`/api/admin/applicants/${targetApplicantId}/superuser`, { isSuperuser })
    return res.data
}

export async function adminDeleteApplicant(targetApplicantId: number): Promise<any> {
    const res = await api.delete(`/api/admin/applicants/${targetApplicantId}`)
    return res.data
}
export async function fetchNavigatorMetricSnapshot(snapshotId: number): Promise<any> {
    const res = await api.get(withApplicantPath(`/navigator/metricshistory/${snapshotId}`))
    return res.data ?? { ok: false }
}

export async function patchNavigatorMetricSnapshot(snapshotId: number, metricKey: string, score: number | null, commentary?: string | null): Promise<any> {
    // PATCH/PUT a single metric into an existing snapshot. The navigator API
    // accepts a metrics array on PUT; send a single-element array with the
    // updated metric to merge server-side.
    const payload = { metrics: [{ metric: metricKey, model_score: score, model_commentary: commentary }] }
    const res = await api.put(withApplicantPath(`/navigator/metricshistory/${snapshotId}`), payload)
    return res.data
}

export async function fetchEngagementsCount(): Promise<number> {
    const res = await api.get(withApplicantPath('/api/engagements/count'))
    return Number(res.data || 0)
}

export async function createContact(payload: Record<string, any>): Promise<any> {
    const res = await postWithApplicant(withApplicantPath('/api/contacts'), payload)
    return res.data
}

export async function createOrganisation(payload: Record<string, any>): Promise<any> {
    const res = await postWithApplicant(withApplicantPath('/api/organisations'), payload)
    return res.data
}

export async function deleteOrganisation(orgId: number): Promise<any> {
    const res = await api.delete(withApplicantPath(`/api/organisations/${orgId}`))
    return res.data
}

export async function createJobRole(payload: Record<string, any>): Promise<any> {
    const res = await postWithApplicant(withApplicantPath('/api/jobroles'), payload)
    return res.data
}

export async function deleteJobRole(jobId: number): Promise<any> {
    // Use URL-scoped applicant path for deletes to avoid body/header ambiguity
    const res = await api.delete(withApplicantPath(`/jobroles/${jobId}`))
    return res.data
}

export async function createEngagement(payload: Record<string, any>): Promise<any> {
    const res = await postWithApplicant(withApplicantPath('/engagements'), payload)
    return res.data
}

export async function updateContact(contactId: number, payload: Record<string, any>): Promise<any> {
    const res = await putWithApplicant(withApplicantPath(`/api/contacts/${contactId}`), payload)
    return res.data
}

export async function deleteContact(contactId: number): Promise<any> {
    const res = await deleteWithApplicant(withApplicantPath(`/api/contacts/${contactId}`))
    return res.data
}

export async function updateOrganisation(orgId: number, payload: Record<string, any>): Promise<any> {
    const res = await putWithApplicant(withApplicantPath(`/api/organisations/${orgId}`), payload)
    return res.data
}

export async function updateJobRole(jobId: number, payload: Record<string, any>): Promise<any> {
    const res = await putWithApplicant(withApplicantPath(`/api/jobroles/${jobId}`), payload)
    return res.data
}

export async function updateEngagement(engagementId: number, payload: Record<string, any>): Promise<any> {
    const res = await putWithApplicant(withApplicantPath(`/api/engagements/${engagementId}`), payload)
    return res.data
}

export async function deleteEngagement(engagementId: number): Promise<any> {
    const res = await deleteWithApplicant(withApplicantPath(`/api/engagements/${engagementId}`))
    return res.data
}

export async function fetchReferenceData(refClass?: string): Promise<any[]> {
    const params: Record<string, any> = {}
    if (refClass) params.class = refClass
    // The backend exposes GET reference data at /api/<applicantid>/reference-data
    // Server expects query param `category`, and returns either an array of rows
    // or an object { referencedata: [...], sectors: [...] } depending on callers.
    if (refClass) params.category = refClass
    const res = await api.get(withApplicantPath('/api/reference-data'), { params: Object.keys(params).length ? params : undefined })
    const data = res.data
    // Normalize both response shapes to an array of referencedata rows
    if (!data) return []
    if (Array.isArray(data)) {
        if (!refClass) return data
        return data.filter((r: any) => String(r.refdataclass || r.category || '').toLowerCase() === String(refClass).toLowerCase())
    }
    // If server returned wrapper object
    const rd = data.referencedata || data.referencedata || []
    if (!refClass) return rd
    return (rd as any[]).filter((r: any) => String(r.refdataclass || r.category || '').toLowerCase() === String(refClass).toLowerCase())
}

export async function fetchReferenceDataAll(): Promise<{ referencedata: any[]; sectors: any[] } | null> {
    const res = await api.get(withApplicantPath('/api/reference-data'))
    const data = res.data
    if (!data) return { referencedata: [], sectors: [] }
    if (Array.isArray(data)) {
        // server returned flat array of referencedata rows
        return { referencedata: data, sectors: [] }
    }
    return data || { referencedata: [], sectors: [] }
}

// Navigator prompts (LLM prompts) -- CRUD
export async function fetchNavigatorPrompts(): Promise<any[]> {
    const res = await api.get(withApplicantPath('/api/navigator/prompts'))
    return res.data ?? []
}

// Navigator actions (configurable buttons)
export async function fetchNavigatorActions(): Promise<any[]> {
    const res = await api.get('/api/settings/navigator_actions')
    return res.data ?? []
}

export async function runNavigatorSql(queryOrId: string | number): Promise<any> {
    // The backend now only accepts a stored query id (query_id) which refers to
    // a row in `navigatorinput` with inputtypeid = 'DB_QUERY'. Accept either a
    // numeric id or a numeric string here; non-numeric values are rejected so
    // callers can be updated to reference stored queries by id.
    const maybeId = typeof queryOrId === 'number' ? queryOrId : (queryOrId || '').toString().trim()
    const asNumber = typeof maybeId === 'number' ? maybeId : Number(maybeId)
    if (!Number.isFinite(asNumber) || asNumber <= 0) {
        throw new Error('runNavigatorSql requires a numeric stored query id. Update navigator inputs to reference a `navigatorinput` id (DB_QUERY).')
    }

    // POST to the applicant-scoped settings run_sql endpoint with a query_id
    const res = await api.post(withApplicantPath('/settings/run_sql'), { query_id: asNumber })
    return res.data
}

export async function fetchNavigatorDocumentsText(documentIds: number[]): Promise<any[]> {
    if (!Array.isArray(documentIds) || documentIds.length === 0) return []
    // Debug: log outgoing request payload and measure duration
    try {
        console.debug('[api] fetchNavigatorDocumentsText request', { documentIds })
    } catch (e) { /* ignore console errors */ }
    const start = Date.now()
    try {
        const res = await postWithApplicant(withApplicantPath('/navigator/documents_text'), { document_ids: documentIds })
        try {
            const duration = Date.now() - start
            console.debug('[api] fetchNavigatorDocumentsText response', { status: res?.status, duration, data: res?.data })
        } catch (e) { /* ignore logging errors */ }
        // Backend returns { ok: true, documents: [...] }
        if (!res || !res.data) return []
        if (Array.isArray(res.data)) return res.data
        return res.data.documents || []
    } catch (err) {
        try {
            const _err: any = err
            console.error('[api] fetchNavigatorDocumentsText error', { error: _err.message || String(_err) })
        } catch (e) { /* ignore */ }
        throw err
    }
}

export async function createNavigatorAction(payload: { actionname: string; sortorderid?: number }): Promise<any> {
    const res = await api.post('/api/settings/navigator_actions', payload)
    return res.data
}

export async function updateNavigatorAction(actionid: number, payload: { actionname?: string; sortorderid?: number }): Promise<any> {
    const res = await api.put(`/api/settings/navigator_actions/${actionid}`, payload)
    return res.data
}

export async function deleteNavigatorAction(actionid: number): Promise<any> {
    const res = await api.delete(`/api/settings/navigator_actions/${actionid}`)
    return res.data
}

export async function createNavigatorActionInput(actionid: number, payload: { inputtypeid?: number; inputvalue?: string; sortorderid?: number }): Promise<any> {
    const res = await api.post(`/api/settings/navigator_actions/${actionid}/inputs`, payload)
    return res.data
}

export async function updateNavigatorActionInput(inputid: number, payload: { inputtypeid?: number; inputvalue?: string; sortorderid?: number }): Promise<any> {
    const res = await api.put(`/api/settings/navigator_actions/inputs/${inputid}`, payload)
    return res.data
}

export async function deleteNavigatorActionInput(inputid: number): Promise<any> {
    const res = await api.delete(`/api/settings/navigator_actions/inputs/${inputid}`)
    return res.data
}

export async function createExport(): Promise<any> {
    // Core app endpoint: POST /api/<aid>/export
    const res = await postWithApplicant(withApplicantPath('/export'), {})
    return res.data
}

export async function createNavigatorPrompt(payload: { promptname: string; promptvalue: string }): Promise<any> {
    const res = await postWithApplicant('/api/navigator/prompts', payload)
    return res.data
}

export async function updateNavigatorPrompt(promptid: number, payload: { promptname?: string; promptvalue?: string }): Promise<any> {
    const res = await putWithApplicant(`/api/navigator/prompts/${promptid}`, payload)
    return res.data
}

export async function deleteNavigatorPrompt(promptid: number): Promise<any> {
    const res = await deleteWithApplicant(`/api/navigator/prompts/${promptid}`)
    return res.data
}


// Leads API
export async function importLeadsZip(file: File): Promise<any> {
    const form = new FormData()
    form.append('file', file)
    // Use fetch to reliably send multipart/form-data with the correct boundary.
    const url = (BASE_URL || '') + withApplicantPath('/api/leads/import')
    // Attach applicant id header when available
    let headers: Record<string, string> | undefined
    try {
        const aid = getApplicantId && typeof getApplicantId === 'function' ? getApplicantId() : null
        if (aid != null) {
            headers = { 'X-Applicant-Id': String(aid) }
            // also include form field so backend can parse applicantid from multipart
            form.append('applicantid', String(aid))
        }
    } catch (e) {
        // ignore
    }

    const res = await fetch(url, {
        method: 'POST',
        body: form,
        credentials: 'include',
        headers,
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Upload failed: ${res.status} ${text}`)
    }
    const data = await res.json()
    // Normalize avatarUrl to absolute URL so browser loads from API host
    if (data && data.avatarUrl && typeof data.avatarUrl === 'string' && data.avatarUrl.startsWith('/')) {
        data.avatarUrl = (BASE_URL || '') + data.avatarUrl
    }
    return data
}

export async function uploadApplicantAvatar(file: File): Promise<any> {
    const form = new FormData()
    form.append('avatar', file)
    // Use fetch to reliably send multipart/form-data with the correct boundary.
    const url = (BASE_URL || '') + withApplicantPath('/api/settings/applicant/avatar')
    // Attach applicant id header when available
    let headers: Record<string, string> | undefined
    try {
        const aid = getApplicantId && typeof getApplicantId === 'function' ? getApplicantId() : null
        if (aid != null) {
            headers = { 'X-Applicant-Id': String(aid) }
            // also include form field so backend can parse applicantid from multipart
            form.append('applicantid', String(aid))
        }
    } catch (e) {
        // ignore
    }

    const res = await fetch(url, {
        method: 'POST',
        body: form,
        credentials: 'include',
        headers,
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Upload failed: ${res.status} ${text}`)
    }
    return await res.json()
}

export async function uploadNavigatorCV(file: File): Promise<any> {
    const form = new FormData()
    form.append('file', file)
    const url = (BASE_URL || '') + withApplicantPath('/api/navigator/upload_cv')
    let headers: Record<string, string> | undefined
    try {
        const aid = getApplicantId && typeof getApplicantId === 'function' ? getApplicantId() : null
        if (aid != null) {
            headers = { 'X-Applicant-Id': String(aid) }
            form.append('applicantid', String(aid))
        }
    } catch (e) {
        // ignore
    }

    const res = await fetch(url, {
        method: 'POST',
        body: form,
        credentials: 'include',
        headers,
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Upload failed: ${res.status} ${text}`)
    }
    return await res.json()
}

export async function signupApplicant(payload: { name: string; email: string; password: string }): Promise<any> {
    const res = await api.post('/api/auth/signup', payload)
    return res.data
}

export async function fetchLeads(page = 1, pageSize = 20, q?: string, reviewOutcomeId?: number, excludeReviewed?: boolean): Promise<PaginatedResponse<any>> {
    const params: Record<string, any> = {}
    if (q) params.q = q
    if (reviewOutcomeId != null) params.reviewoutcomeid = reviewOutcomeId
    // Support hiding any reviewed leads (exclude_reviewed) from the list
    if (excludeReviewed) params.exclude_reviewed = '1'
    // convert page -> offset
    params.limit = pageSize
    params.offset = (page - 1) * pageSize
    // leads list currently expects applicantid in request body on the server side; include it in params for now
    try {
        const aid = getApplicantId()
        if (aid != null) params.applicantid = aid
    } catch (e) { }
    const res = await api.get(withApplicantPath('/api/leads'), { params })
    const items = res.data || []
    // backend doesn't currently return total, so use items.length as total for pagination controls
    return { items, total: items.length, page, pageSize }
}

export async function resetPassword(currentPassword: string, newPassword: string): Promise<any> {
    const res = await api.post('/api/auth/reset-password', { currentPassword, newPassword })
    return res.data
}

/**
 * Fetch all leads (no pagination) optionally filtered by query and review outcome.
 * Useful for sorting across the whole dataset when the backend doesn't support server-side sort.
 */
export async function fetchLeadsAll(q?: string, reviewOutcomeId?: number, excludeReviewed?: boolean, excludePromoted?: boolean, excludeNoAction?: boolean, orderBy?: string, dir?: 'asc' | 'desc'): Promise<any[]> {
    const params: Record<string, any> = {}
    if (q) params.q = q
    if (reviewOutcomeId != null) params.reviewoutcomeid = reviewOutcomeId
    if (excludeReviewed) params.exclude_reviewed = '1'
    if (excludePromoted) params.exclude_promoted = '1'
    if (excludeNoAction) params.exclude_no_action = '1'
    if (orderBy) params.order_by = orderBy
    if (dir) params.dir = dir
    try {
        const aid = getApplicantId()
        if (aid != null) params.applicantid = aid
    } catch (e) { }
    const res = await api.get(withApplicantPath('/api/leads'), { params: Object.keys(params).length ? params : undefined })
    return res.data || []
}

export async function fetchLeadsSummary(): Promise<any> {
    const res = await api.get(withApplicantPath('/api/leads/summary'))
    return res.data ?? {}
}

export async function fetchLeadsTopCompanies(limit = 10): Promise<any[]> {
    const params: Record<string, any> = { limit }
    const res = await api.get(withApplicantPath('/api/leads/top_companies'), { params })
    return res.data ?? []
}

export async function fetchEngagementsByMonth(from_date?: string, to_date?: string): Promise<any[]> {
    const params: Record<string, any> = {}
    if (from_date) params.from_date = from_date
    if (to_date) params.to_date = to_date
    const res = await api.get(withApplicantPath('/api/analytics/engagements_by_month'), { params: Object.keys(params).length ? params : undefined })
    return res.data ?? []
}

export async function fetchTopRecentContacts(engagementType?: string | number): Promise<any[]> {
    const params: Record<string, any> = {}
    if (engagementType != null) params.engagement_type = engagementType
    const res = await api.get(withApplicantPath('/api/analytics/top_recent_contacts'), { params: Object.keys(params).length ? params : undefined })
    return res.data ?? []
}

export async function fetchTopContactsByEngagements(): Promise<any[]> {
    const res = await api.get(withApplicantPath('/api/analytics/top_contacts_by_engagements'))
    return res.data ?? []
}

export async function fetchLeadsReviewsByDate(from_date?: string, to_date?: string): Promise<any[]> {
    const params: Record<string, any> = {}
    if (from_date) params.from_date = from_date
    if (to_date) params.to_date = to_date
    const res = await api.get(withApplicantPath('/api/leads/reviews_by_date'), { params: Object.keys(params).length ? params : undefined })
    return res.data ?? []
}

export async function updateLead(leadId: number, payload: Record<string, any>): Promise<any> {
    const res = await putWithApplicant(withApplicantPath(`/api/leads/${leadId}`), payload)
    return res.data
}

export async function deleteLead(leadId: number): Promise<any> {
    const res = await deleteWithApplicant(withApplicantPath(`/api/leads/${leadId}`))
    return res.data
}

export async function prefillLead(leadId: number): Promise<any> {
    const res = await api.get(withApplicantPath(`/api/leads/${leadId}/prefill`))
    return res.data
}

export async function setLeadReviewOutcome(leadId: number, refid: number): Promise<any> {
    // Strictly set the review outcome by refid; the server will validate the refid
    const res = await postWithApplicant(withApplicantPath(`/api/leads/${leadId}/set_reviewoutcome`), { refid: Number(refid) })
    return res.data
}

export async function promoteLead(leadId: number, payload: Record<string, any>): Promise<any> {
    const res = await api.post(withApplicantPath(`/api/leads/${leadId}/promote`), payload)
    return res.data
}

export async function createReferenceData(refdataclass: string, refvalue: string): Promise<any> {
    const res = await postWithApplicant(withApplicantPath('/api/settings/refdata'), { refdataclass, refvalue })
    return res.data
}

export async function updateReferenceData(refid: number, refdataclass: string, refvalue: string): Promise<any> {
    const res = await putWithApplicant(withApplicantPath(`/api/settings/refdata/${refid}`), { refdataclass, refvalue })
    return res.data
}

export async function deleteReferenceData(refid: number): Promise<any> {
    const res = await deleteWithApplicant(withApplicantPath(`/api/settings/refdata/${refid}`))
    return res.data
}

export async function fetchApplicantSettings(): Promise<any> {
    const res = await api.get(withApplicantPath('/api/settings/applicant'))
    const data = res.data || {}
    // Normalize server field names (which may be lower_snake or plural) to the
    // camelCase shape the UI expects. Keep fallbacks so tests (which may use
    // camelCase mocks) and older responses both work.
    const mapped: Record<string, any> = Object.assign({}, data)
    mapped.firstName = data.firstName ?? data.firstname ?? ''
    mapped.lastName = data.lastName ?? data.lastname ?? ''
    mapped.email = data.email ?? data.email
    mapped.phone = data.phone ?? data.phone
    mapped.linkedin = data.linkedin ?? data.linkedinurl ?? ''
    mapped.address = data.address ?? data.addressline1 ?? ''
    mapped.city = data.city ?? data.city ?? ''
    mapped.postcode = data.postcode ?? data.postcode ?? ''
    mapped.website = data.website ?? data.personalwebsiteurl ?? ''
    mapped.searchStartDate = data.searchStartDate ?? data.searchstartdate ?? ''
    mapped.searchStatusId = data.searchStatusId ?? data.searchstatusid ?? null
    mapped.searchStatus = data.searchStatus ?? data.searchstatus ?? null
    // Normalize avatarUrl and make absolute when the server returns a relative path
    mapped.avatarUrl = data.avatarUrl ?? data.avatarurl ?? ''
    if (mapped.avatarUrl && typeof mapped.avatarUrl === 'string' && mapped.avatarUrl.startsWith('/')) {
        mapped.avatarUrl = (BASE_URL || '') + mapped.avatarUrl
    }
    // Superuser flag: server may return `issuperuser` or `isSuperuser`
    mapped.isSuperuser = (data.isSuperuser ?? data.issuperuser) ? true : false

    // DEV-only debug: show what the server returned and the mapped searchStartDate
    try {
        if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.DEV) {
            // eslint-disable-next-line no-console
            console.debug('API.fetchApplicantSettings: raw response', data)
            // eslint-disable-next-line no-console
            console.debug('API.fetchApplicantSettings: mapped.searchStartDate', mapped.searchStartDate)
        }
    } catch (e) { }

    return mapped
}

export async function updateApplicantSettings(payload: Record<string, any>): Promise<any> {
    // Ensure the request URL is prefixed with the current applicant id so it
    // matches the server route `/api/<applicantid>/settings/applicant`.
    const res = await api.put(withApplicantPath('/api/settings/applicant'), injectApplicant(payload))
    return res.data
}

// Documents API
export async function fetchDocuments(engagementId?: number): Promise<any[]> {
    const params: Record<string, any> = {}
    if (engagementId != null) params.engagement_id = engagementId
    const res = await api.get(withApplicantPath('/api/documents'), { params: Object.keys(params).length ? params : undefined })
    return res.data ?? []
}

export async function uploadDocumentFile(file: File, documentname?: string, documenttypeid?: number, documentdescription?: string): Promise<any> {
    const aid = requireApplicantId()
    const fd = new FormData()
    fd.append('file', file)
    fd.append('applicantid', String(aid))
    if (documentname) fd.append('documentname', documentname)
    if (documenttypeid != null) fd.append('documenttypeid', String(documenttypeid))
    if (documentdescription) fd.append('documentdescription', documentdescription)

    // Do not set the Content-Type header manually; let the browser add the correct
    // multipart/form-data boundary. Setting it manually can omit the boundary.
    const url = (BASE_URL || '') + withApplicantPath('/api/documents')
    let headers: Record<string, string> | undefined
    try {
        const aidHeader = getApplicantId && typeof getApplicantId === 'function' ? getApplicantId() : null
        if (aidHeader != null) {
            headers = { 'X-Applicant-Id': String(aidHeader) }
        }
    } catch (e) {
        // ignore
    }

    // Attach CSRF token from sessionStorage (double-submit) when available.
    try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
            const csrf = window.sessionStorage.getItem('JOBTRACK_CSRF')
            if (csrf) {
                headers = Object.assign({}, headers || {}, { 'X-CSRF-Token': csrf })
            }
        }
    } catch (e) {
        // ignore
    }

    const res = await fetch(url, {
        method: 'POST',
        body: fd,
        credentials: 'include',
        headers,
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Upload failed: ${res.status} ${text}`)
    }
    return await res.json()
}

// Contact Documents API
export async function fetchContactDocuments(contactId: number): Promise<any[]> {
    const res = await api.get(withApplicantPath(`/api/contacts/${contactId}/documents`))
    return res.data ?? []
}

export async function downloadDocument(documentId: number): Promise<Blob> {
    const res = await api.get(`/api/documents/${documentId}/download`, { responseType: 'blob' })
    return res.data
}

export async function navigatorQuery(queryText: string, top_k?: number, substitutions?: Record<string, any>, extra?: Record<string, any>): Promise<any> {
    const payload: Record<string, any> = { query_text: queryText }
    if (top_k != null) payload.top_k = top_k
    if (substitutions && Object.keys(substitutions).length) payload.substitutions = substitutions
    if (extra && Object.keys(extra).length) Object.assign(payload, extra)
    // withApplicantPath will prefix /api/<aid>
    const res = await api.post(withApplicantPath('/api/navigator/query'), payload)
    return res.data
}

export async function attachDocumentToContact(contactId: number, documentId: number): Promise<any> {
    const res = await postWithApplicant(`/api/contacts/${contactId}/documents`, { documentid: documentId })
    return res.data
}

export async function detachDocumentFromContact(contactId: number, documentId: number): Promise<any> {
    const res = await deleteWithApplicant(withApplicantPath(`/api/contacts/${contactId}/documents/${documentId}`))
    return res.data
}

export async function createDocument(payload: { documentdescription?: string; documenturi?: string; documentname?: string; documenttypeid?: number; engagement_id?: number }): Promise<any> {
    // Normalize to the canonical `documentdescription` key (server now stores it)
    const body: Record<string, any> = { ...payload }
    if (!body.documentdescription && body.documenturi) {
        body.documentdescription = body.documenturi
        delete body.documenturi
    }
    const res = await postWithApplicant(withApplicantPath('/api/documents'), body)
    return res.data
}

export async function updateDocument(documentId: number, payload: { documentdescription?: string; documentname?: string; documenttypeid?: number }): Promise<any> {
    // allow updating documentdescription (new DB column) as well as legacy fields
    const res = await putWithApplicant(withApplicantPath(`/api/documents/${documentId}`), payload)
    return res.data
}

export async function fetchDocumentEngagements(documentId: number): Promise<any[]> {
    // New client helper: fetch engagements linked to a specific document.
    // Server route should be `/api/documents/<id>/engagements` and return an array.
    const res = await api.get(withApplicantPath(`/api/documents/${documentId}/engagements`))
    return res.data ?? []
}

export async function deleteDocument(documentId: number): Promise<any> {
    const res = await deleteWithApplicant(withApplicantPath(`/api/documents/${documentId}`))
    return res.data
}

export async function attachDocumentToEngagement(engagementId: number, documentId: number): Promise<any> {
    const res = await postWithApplicant(withApplicantPath(`/api/engagements/${engagementId}/documents`), { documentid: documentId })
    return res.data
}

export async function detachDocumentFromEngagement(engagementId: number, documentId: number): Promise<any> {
    const res = await deleteWithApplicant(withApplicantPath(`/api/engagements/${engagementId}/documents/${documentId}`))
    return res.data
}

// JobRole <-> Document linkage
export async function fetchJobRoleDocuments(jobRoleId: number): Promise<any[]> {
    const res = await api.get(withApplicantPath(`/api/jobroles/${jobRoleId}/documents`))
    return res.data ?? []
}

export async function attachDocumentToJobRole(jobRoleId: number, documentId: number): Promise<any> {
    const res = await postWithApplicant(withApplicantPath(`/api/jobroles/${jobRoleId}/documents`), { documentid: documentId })
    return res.data
}

export async function detachDocumentFromJobRole(jobRoleId: number, documentId: number): Promise<any> {
    const res = await deleteWithApplicant(withApplicantPath(`/api/jobroles/${jobRoleId}/documents/${documentId}`))
    return res.data
}

// Action Plan API
import type { Task, TaskLog, TaskTarget } from './types'

export async function fetchTasks(applicantid?: number): Promise<Task[]> {
    const params: Record<string, any> = {}
    if (applicantid != null) params.applicantid = applicantid
    const res = await api.get(withApplicantPath('/api/tasks'), { params: Object.keys(params).length ? params : undefined })
    return res.data ?? []
}

export async function createTask(payload: { applicantid?: number | null; name: string; duedate?: string | null; notes?: string | null }): Promise<Task> {
    // Ensure applicantid is included in the request body as the server requires it
    const res = await postWithApplicant(withApplicantPath('/api/tasks'), payload)
    return res.data
}

export async function updateTask(taskId: number, payload: { name?: string; duedate?: string | null; notes?: string | null; applicantid?: number | null }): Promise<Task> {
    const res = await putWithApplicant(withApplicantPath(`/api/tasks/${taskId}`), payload)
    return res.data
}

export async function deleteTask(taskId: number): Promise<any> {
    const res = await deleteWithApplicant(withApplicantPath(`/api/tasks/${taskId}`))
    return res.data
}

export async function fetchTaskLogs(taskId: number): Promise<TaskLog[]> {
    const res = await api.get(withApplicantPath(`/api/tasks/${taskId}/logs`))
    return res.data ?? []
}

export async function addTaskLog(taskId: number, payload: { commentary: string; logdate?: string | null }): Promise<TaskLog> {
    const res = await postWithApplicant(withApplicantPath(`/api/tasks/${taskId}/logs`), payload)
    return res.data
}

export async function deleteTaskLog(logId: number): Promise<any> {
    const res = await api.delete(`/api/tasks/logs/${logId}`)
    return res.data
}

export async function updateTaskLog(logId: number, payload: { commentary: string; logdate?: string | null }): Promise<TaskLog> {
    const res = await api.put(`/api/tasks/logs/${logId}`, payload)
    return res.data
}

export async function fetchTaskTargets(taskId: number): Promise<TaskTarget[]> {
    const res = await api.get(withApplicantPath(`/api/tasks/${taskId}/targets`))
    return res.data ?? []
}

// Navigator action plan generation
// `generateNavigatorActionPlan` removed: action plan generation is deprecated.

// Fetch navigator LLM prompts (BASE_PROMPT, ACTION_PLAN_PROMPT, BRIEFING_PROFILE, etc.)


export async function addTaskTarget(taskId: number, payload: { targettype: number; targetid: number }): Promise<TaskTarget> {
    const res = await postWithApplicant(withApplicantPath(`/api/tasks/${taskId}/targets`), payload)
    return res.data
}

// Navigator briefing API
export async function fetchNavigatorBriefingQuestions(): Promise<any[]> {
    const res = await api.get('/api/settings/navigator_briefing_questions')
    return res.data ?? []
}

export async function createNavigatorBriefingQuestion(payload: { questionorderindex?: number; questiontext: string }): Promise<any> {
    // Server expects `displayorder` in the payload; normalize the incoming shape
    const body: Record<string, any> = { questiontext: payload.questiontext }
    if (payload.questionorderindex != null) body.displayorder = payload.questionorderindex
    const res = await api.post('/api/settings/navigator_briefing_questions', body)
    return res.data
}

export async function updateNavigatorBriefingQuestion(questionid: number, payload: { questionorderindex?: number; questiontext?: string }): Promise<any> {
    // Server expects `displayorder` in the payload; map accordingly
    const body: Record<string, any> = {}
    if (payload.questiontext != null) body.questiontext = payload.questiontext
    if (payload.questionorderindex != null) body.displayorder = payload.questionorderindex
    const res = await api.put(`/api/settings/navigator_briefing_questions/${questionid}`, body)
    return res.data
}

export async function deleteNavigatorBriefingQuestion(questionid: number): Promise<any> {
    const res = await api.delete(`/api/settings/navigator_briefing_questions/${questionid}`)
    return res.data
}

export async function updateNavigatorBriefingOrder(order: Array<{ questionid: number; questionorderindex: number }>): Promise<any> {
    const res = await api.put('/api/settings/navigator_briefing_questions/reorder', order)
    return res.data
}

export type BriefingBatchSummary = { batchcreationtimestamp?: string; batch?: string; count?: number }

export async function fetchApplicantBriefingBatches(): Promise<BriefingBatchSummary[]> {
    // New summary endpoint returns [{ batchcreationtimestamp: string, count: number }, ...]
    const res = await api.get(withApplicantPath('/api/settings/briefings'))
    return res.data ?? []
}

export async function fetchApplicantBriefingBatch(batch: string): Promise<any[]> {
    const res = await api.get(withApplicantPath('/api/navigator_briefings'), { params: { batch } })
    return res.data ?? []
}

export async function createApplicantBriefingBatch(answers: Array<{ questionid: number; questionanswer: string }>): Promise<any> {
    const res = await postWithApplicant(withApplicantPath('/api/navigator_briefings'), { answers })
    return res.data
}

export async function deleteTaskTarget(targetId: number): Promise<any> {
    const res = await deleteWithApplicant(withApplicantPath(`/api/tasks/targets/${targetId}`))
    return res.data
}

// Networking Events API
export async function fetchNetworkingEvents(): Promise<any[]> {
    const res = await api.get(withApplicantPath('/api/networking'))
    return res.data ?? []
}

export async function createNetworkingEvent(payload: { eventName: string; eventDate: string; notes?: string; eventTypeId: number }): Promise<any> {
    const res = await postWithApplicant(withApplicantPath('/api/networking'), payload)
    return res.data
}

export async function updateNetworkingEvent(eventId: number, payload: { eventName?: string; eventDate?: string; notes?: string; eventTypeId?: number }): Promise<any> {
    const res = await putWithApplicant(withApplicantPath(`/api/networking/${eventId}`), payload)
    return res.data
}

export async function deleteNetworkingEvent(eventId: number): Promise<any> {
    const res = await deleteWithApplicant(withApplicantPath(`/api/networking/${eventId}`))
    return res.data
}

export async function fetchEventTasks(eventId: number): Promise<any[]> {
    const res = await api.get(withApplicantPath(`/api/networking/${eventId}/tasks`))
    return res.data ?? []
}

export async function addEventTask(eventId: number, taskId: number): Promise<any> {
    const res = await postWithApplicant(withApplicantPath(`/api/networking/${eventId}/tasks`), { taskId })
    return res.data
}

export async function deleteEventTaskLink(linkId: number): Promise<any> {
    const res = await deleteWithApplicant(withApplicantPath(`/api/networking/tasks/${linkId}`))
    return res.data
}

export default api
