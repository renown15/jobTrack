import { QueryClient } from '@tanstack/react-query'
import * as api from '../api/client'

// DEBUG: testApiMocks module loaded
// eslint-disable-next-line no-console
console.log('MODULE: testApiMocks loaded')

export function createQueryClient() {
    // Use test-friendly defaults to avoid background timers or refetches
    // that can keep the Node process alive during tests.
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                // avoid scheduled garbage collection/refetch timers in tests
                cacheTime: 0,
                refetchOnWindowFocus: false,
                refetchOnReconnect: false,
                refetchOnMount: false,
            },
        },
    })
}

type ApiOverrides = Partial<{
    fetchSectors: any
    fetchReferenceData: any
    fetchOrganisations: any
    fetchContacts: any
    fetchAllContacts: any
    createOrganisation: any
    createJobRole: any
    // Additional optional overrides used by various tests/components
    fetchLeads: any
    fetchLeadsAll: any
    fetchLeadsSummary: any
    fetchLeadsTopCompanies: any
    fetchLeadsReviewsByDate: any
    fetchEngagementsByMonth: any
    fetchTopRecentContacts: any
    fetchTopContactsByEngagements: any
    fetchApplicantSettings: any
    fetchContactTaskCounts: any
    fetchContactTasks: any
    fetchDocuments: any
    fetchEngagements: any
    fetchTasks: any
    fetchLeadsSummaryAll?: any
}>

// Install a set of sensible per-test spies on the api client. Tests may pass
// overrides to control return values for specific calls. Returns a teardown
// function that restores all mocks.
export function setupDefaultApiMocks(vi: any, overrides: ApiOverrides = {}) {
    vi.restoreAllMocks()

    vi.spyOn(api, 'fetchSectors').mockResolvedValue(overrides.fetchSectors ?? [])

    vi.spyOn(api, 'fetchReferenceData').mockImplementation((key?: string) => {
        if (overrides.fetchReferenceData) return Promise.resolve(overrides.fetchReferenceData)
        // default small set for application_status and source_channel to avoid MUI warnings
        if (key === 'application_status') return Promise.resolve([{ refid: 2, refvalue: 'Applied' }])
        if (key === 'source_channel') return Promise.resolve([{ refid: 1, refvalue: 'LinkedIn' }])
        return Promise.resolve([])
    })

    vi.spyOn(api, 'fetchOrganisations').mockResolvedValue(overrides.fetchOrganisations ?? [])
    const _contactsOverride = overrides.fetchContacts ?? { items: [], total: 0, page: 1, pageSize: 25 }
    vi.spyOn(api, 'fetchContacts').mockResolvedValue(_contactsOverride)
    // If tests provided a paginated `fetchContacts` override but did not
    // explicitly override `fetchAllContacts`, derive a sensible array of
    // contacts from the paginated shape (the `.items` array). This keeps
    // existing tests working that only override `fetchContacts` while the
    // components call `fetchAllContacts` in other places.
    const _allContactsFallback = overrides.fetchAllContacts !== undefined ? overrides.fetchAllContacts : (_contactsOverride && _contactsOverride.items ? _contactsOverride.items : [])
    vi.spyOn(api, 'fetchAllContacts').mockResolvedValue(_allContactsFallback)
    // Leads / Analytics / Settings: provide defaults matching component expectations
    if ((api as any).fetchLeads) vi.spyOn(api as any, 'fetchLeads').mockResolvedValue(overrides.fetchLeads ?? { items: [], total: 0 })
    if ((api as any).fetchLeadsAll) vi.spyOn(api as any, 'fetchLeadsAll').mockResolvedValue(overrides.fetchLeadsAll ?? [])
    if ((api as any).fetchLeadsSummary) vi.spyOn(api as any, 'fetchLeadsSummary').mockResolvedValue(overrides.fetchLeadsSummary ?? {})
    if ((api as any).fetchLeadsTopCompanies) vi.spyOn(api as any, 'fetchLeadsTopCompanies').mockResolvedValue(overrides.fetchLeadsTopCompanies ?? [])
    if ((api as any).fetchLeadsReviewsByDate) vi.spyOn(api as any, 'fetchLeadsReviewsByDate').mockResolvedValue(overrides.fetchLeadsReviewsByDate ?? [])
    if ((api as any).fetchEngagementsByMonth) vi.spyOn(api as any, 'fetchEngagementsByMonth').mockResolvedValue(overrides.fetchEngagementsByMonth ?? [])
    if ((api as any).fetchTopRecentContacts) vi.spyOn(api as any, 'fetchTopRecentContacts').mockResolvedValue(overrides.fetchTopRecentContacts ?? [])
    if ((api as any).fetchTopContactsByEngagements) vi.spyOn(api as any, 'fetchTopContactsByEngagements').mockResolvedValue(overrides.fetchTopContactsByEngagements ?? [])
    if ((api as any).fetchApplicantSettings) vi.spyOn(api as any, 'fetchApplicantSettings').mockResolvedValue(overrides.fetchApplicantSettings ?? {})
    // Commonly-used helpers that components call during render
    // Provide safe defaults so components don't perform real network requests
    // and so their derived data shapes are predictable in tests.
    if ((api as any).fetchContactTaskCounts) vi.spyOn(api as any, 'fetchContactTaskCounts').mockResolvedValue([])
    if ((api as any).fetchContactTasks) vi.spyOn(api as any, 'fetchContactTasks').mockResolvedValue([])
    if ((api as any).fetchDocuments) vi.spyOn(api as any, 'fetchDocuments').mockResolvedValue([])
    if ((api as any).fetchEngagements) vi.spyOn(api as any, 'fetchEngagements').mockResolvedValue([])
    if ((api as any).fetchTasks) vi.spyOn(api as any, 'fetchTasks').mockResolvedValue([])
    if ((api as any).fetchJobRoles) vi.spyOn(api as any, 'fetchJobRoles').mockResolvedValue([])

    if (overrides.createOrganisation) vi.spyOn(api, 'createOrganisation').mockResolvedValue(overrides.createOrganisation)
    if (overrides.createJobRole) vi.spyOn(api, 'createJobRole').mockResolvedValue(overrides.createJobRole)

    // Return a restore function for convenience
    return () => {
        vi.restoreAllMocks()
    }
}

// Note: do not re-export `vi` from here to avoid circular import
// problems when `setupTests.ts` requires this module during setup.
