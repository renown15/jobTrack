import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import EngagementsTable from '../EngagementsTable'

// Mock API similar to expansion test but include many other dummy engagements
vi.mock('../../../api/client', () => {
    // build many single-contact engagements for contacts distinct from the group members
    const others = Array.from({ length: 40 }).map((_, i) => ({
        engagementid: 1000 + i,
        // ensure contact ids do not conflict with group member ids (11,12) or group id (77)
        contactid: 300 + i,
        contact_name: `DifferentContact ${i + 1}`,
        company_name: `Org${(i % 5) + 1}`,
        engagedate: '2025-01-02',
        kind: 'call',
        notes: 'other note'
    }))
    const group = {
        engagementid: 999,
        contactid: 77,
        contactgroupname: 'Generated group 999',
        contacts: [
            { contactid: 11, name: 'Child One', company_name: 'OrgA' },
            { contactid: 12, name: 'Child Two', company_name: 'OrgB' }
        ],
        company_name: '',
        engagedate: '2025-01-01',
        kind: 'note',
        notes: 'group note'
    }
    return {
        fetchEngagements: vi.fn(() => Promise.resolve([...others, group])),
        fetchAllContacts: vi.fn(() => Promise.resolve([])),
        fetchOrganisations: vi.fn(() => Promise.resolve([])),
        fetchReferenceData: vi.fn(() => Promise.resolve([])),
        fetchDocuments: vi.fn(() => Promise.resolve([])),
        fetchSectors: vi.fn(() => Promise.resolve([])),
        fetchTasks: vi.fn(() => Promise.resolve([])),
    }
})

describe('EngagementsTable search behaviour', () => {
    test('searching for a child shows one group row and its children (no duplicate groups)', async () => {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const { container } = render(
            <QueryClientProvider client={qc}>
                <EngagementsTable search={"Child"} />
            </QueryClientProvider>
        )

        await waitFor(() => expect(screen.getByText(/Generated group 999/)).toBeTruthy())

        // Count group summary rows by aria-label on the toggle buttons
        const toggles = container.querySelectorAll('button[aria-label^="toggle group"]')
        // There should be exactly one group toggle (one summary row)
        expect(toggles.length).toBe(1)

        // Child rows should be present in the table body
        await waitFor(() => expect(screen.getByText(/Child One/)).toBeTruthy())
        await waitFor(() => expect(screen.getByText(/Child Two/)).toBeTruthy())
    })
})
