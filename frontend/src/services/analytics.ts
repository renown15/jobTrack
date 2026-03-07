import {
    fetchAnalyticsSummary as fetchAnalyticsSummaryRaw,
    fetchLeadsSummary as fetchLeadsSummaryRaw,
    fetchLeadsTopCompanies as fetchLeadsTopCompaniesRaw,
    fetchLeadsReviewsByDate as fetchLeadsReviewsByDateRaw,
    fetchEngagementsByMonth as fetchEngagementsByMonthRaw,
    fetchTopRecentContacts as fetchTopRecentContactsRaw,
    fetchTopContactsByEngagements as fetchTopContactsByEngagementsRaw,
    fetchAllContacts as fetchAllContactsRaw,
    fetchReferenceData as fetchReferenceDataRaw,
} from '../api/client'
import type { AnalyticsSummary } from '../api/types'

function toCamelCaseObject(src: any): any {
    if (src === null || src === undefined) return src
    if (typeof src !== 'object') return src
    if (Array.isArray(src)) return src.map(toCamelCaseObject)
    const out: any = {}
    for (const k of Object.keys(src)) {
        const v = src[k]
        const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
        out[camel] = toCamelCaseObject(v)
    }
    return out
}

async function normalizeRaw<T = any>(fn: (...args: any[]) => Promise<any>, ...args: any[]): Promise<T | null> {
    const raw = await fn(...args)
    if (raw === null || raw === undefined) return null
    // Debug logging to help trace data-shape issues after refactors.
    try {
        // eslint-disable-next-line no-console
        console.debug(`[services][${fn.name}] raw ->`, raw)
        // eslint-disable-next-line no-console
        console.debug(`[services][${fn.name}] normalized ->`, toCamelCaseObject(raw))
    } catch (e) {
        // ignore logging errors
    }
    // Return the raw payload unchanged to preserve original backend shapes
    // (this mirrors pre-refactor behavior so UI components continue to work).
    return raw as T
}

export async function fetchAnalyticsSummary(params?: { from_date?: string; to_date?: string }): Promise<AnalyticsSummary | null> {
    return normalizeRaw<AnalyticsSummary>(fetchAnalyticsSummaryRaw, params)
}

export async function fetchLeadsSummary(): Promise<any | null> {
    return normalizeRaw(fetchLeadsSummaryRaw)
}

export async function fetchLeadsTopCompanies(limit = 10): Promise<any[] | null> {
    return normalizeRaw(fetchLeadsTopCompaniesRaw, limit)
}

export async function fetchLeadsReviewsByDate(from?: string, to?: string): Promise<any | null> {
    return normalizeRaw(fetchLeadsReviewsByDateRaw, from, to)
}

export async function fetchEngagementsByMonth(from?: string, to?: string): Promise<any | null> {
    return normalizeRaw(fetchEngagementsByMonthRaw, from, to)
}

export async function fetchTopRecentContacts(kind?: string, limit?: number): Promise<any[] | null> {
    return normalizeRaw(fetchTopRecentContactsRaw, kind, limit)
}

export async function fetchTopContactsByEngagements(): Promise<any[] | null> {
    return normalizeRaw(fetchTopContactsByEngagementsRaw)
}

export async function fetchAllContacts(...args: any[]): Promise<any[] | null> {
    return normalizeRaw(fetchAllContactsRaw, ...args)
}

export async function fetchReferenceData(refClass: string): Promise<any[] | null> {
    return normalizeRaw(fetchReferenceDataRaw, refClass)
}

export default {
    fetchAnalyticsSummary,
    fetchLeadsSummary,
    fetchLeadsTopCompanies,
    fetchLeadsReviewsByDate,
    fetchEngagementsByMonth,
    fetchTopRecentContacts,
    fetchTopContactsByEngagements,
    fetchAllContacts,
    fetchReferenceData,
}
