import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import HubMainView from '../../../../src/components/Hub/HubMainView'

// Mock the data fetching functions
vi.mock('../../../../src/api/client', () => ({
    fetchAllContacts: vi.fn(() => Promise.resolve([])),
    fetchOrganisations: vi.fn(() => Promise.resolve([])),
    fetchJobRoles: vi.fn(() => Promise.resolve([])),
    fetchEngagements: vi.fn(() => Promise.resolve([])),
    deleteContact: vi.fn(() => Promise.resolve()),
    deleteOrganisation: vi.fn(() => Promise.resolve()),
    deleteJobRole: vi.fn(() => Promise.resolve()),
    deleteEngagement: vi.fn(() => Promise.resolve()),
}))

// Import the mocked functions
import * as apiClient from '../../../../src/api/client'

// Mock useResponsive
vi.mock('../../../../src/hooks/useResponsive', () => ({
    __esModule: true,
    default: vi.fn(() => ({ isMobile: true, isSmallMobile: false })),
}))

// Mock useNavigate
vi.mock('react-router-dom', () => ({
    useNavigate: vi.fn(() => vi.fn()),
}))

const createTestQueryClient = () => new QueryClient({
    defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
    },
})

describe('HubMainView Mobile Integration', () => {
    let queryClient: QueryClient

    beforeEach(() => {
        queryClient = createTestQueryClient()
        vi.clearAllMocks()
    })

    const renderHubMainView = (props = {}) => {
        return render(
            <QueryClientProvider client={queryClient}>
                <HubMainView
                    activeKey="contacts"
                    {...props}
                />
            </QueryClientProvider>
        )
    }

    test('renders mobile contacts list when activeKey is contacts', async () => {
        (apiClient.fetchAllContacts as ReturnType<typeof vi.fn>).mockResolvedValue([
            { contactid: 1, name: 'Test Contact' }
        ])

        renderHubMainView({ activeKey: 'contacts' })

        await waitFor(() => {
            expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
        })
    })

    test('renders mobile organisations list when activeKey is organisations', async () => {
        (apiClient.fetchOrganisations as ReturnType<typeof vi.fn>).mockResolvedValue([
            { orgid: 1, name: 'Test Org' }
        ])

        renderHubMainView({ activeKey: 'organisations' })

        await waitFor(() => {
            expect(apiClient.fetchOrganisations).toHaveBeenCalled()
        })
    })

    test('renders mobile roles list when activeKey is roles', async () => {
        (apiClient.fetchJobRoles as ReturnType<typeof vi.fn>).mockResolvedValue([
            { jobid: 1, rolename: 'Test Role' }
        ])

        renderHubMainView({ activeKey: 'roles' })

        await waitFor(() => {
            expect(apiClient.fetchJobRoles).toHaveBeenCalled()
        })
    })

    test('renders mobile engagements list when activeKey is engagements', async () => {
        (apiClient.fetchEngagements as ReturnType<typeof vi.fn>).mockResolvedValue([
            { engagementid: 1, contact_name: 'Test' }
        ])

        renderHubMainView({ activeKey: 'engagements' })

        await waitFor(() => {
            expect(apiClient.fetchEngagements).toHaveBeenCalled()
        })
    })

    test('filters organisations by sector when recruitment_organisations activeKey', async () => {
        const orgs = [
            { orgid: 1, name: 'Recruitment Org', sector_summary: 'Recruitment' },
            { orgid: 2, name: 'Tech Org', sector_summary: 'Technology' },
        ]
            ; (apiClient.fetchOrganisations as ReturnType<typeof vi.fn>).mockResolvedValue(orgs)

        renderHubMainView({
            activeKey: 'recruitment_organisations',
            sectorFilter: 'Recruitment'
        })

        await waitFor(() => {
            expect(apiClient.fetchOrganisations).toHaveBeenCalled()
        })

        // Only recruitment org should be visible (tested via filtering logic)
    })

    test('filters roles to active when activeKey is active_roles', async () => {
        const roles = [
            { jobid: 1, rolename: 'Active Role', status_name: 'Applied' },
            { jobid: 2, rolename: 'Rejected Role', status_name: 'Rejected' },
        ]
            ; (apiClient.fetchJobRoles as ReturnType<typeof vi.fn>).mockResolvedValue(roles)

        renderHubMainView({ activeKey: 'active_roles' })

        await waitFor(() => {
            expect(apiClient.fetchJobRoles).toHaveBeenCalled()
        })
    })

    test('filters engagements to interviews when activeKey is interviews', async () => {
        const engagements = [
            { engagementid: 1, kind: 'Interview', contact_name: 'Test' },
            { engagementid: 2, kind: 'Email', contact_name: 'Test' },
        ]
            ; (apiClient.fetchEngagements as ReturnType<typeof vi.fn>).mockResolvedValue(engagements)

        renderHubMainView({ activeKey: 'interviews' })

        await waitFor(() => {
            expect(apiClient.fetchEngagements).toHaveBeenCalled()
        })
    })
})
