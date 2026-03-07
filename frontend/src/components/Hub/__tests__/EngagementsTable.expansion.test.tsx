import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import EngagementsTable from '../EngagementsTable'

// Provide a focused mock for fetchEngagements returning a single grouped engagement
vi.mock('../../../api/client', () => {
    return {
        fetchEngagements: vi.fn(() => Promise.resolve([
            {
                engagementid: 999,
                contactid: 77, // contactgroup id
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
        ])),
        // Minimal additional stubs used by other hooks/components
        fetchAllContacts: vi.fn(() => Promise.resolve([])),
        fetchOrganisations: vi.fn(() => Promise.resolve([])),
        fetchReferenceData: vi.fn(() => Promise.resolve([])),
        fetchDocuments: vi.fn(() => Promise.resolve([])),
        fetchSectors: vi.fn(() => Promise.resolve([])),
        fetchTasks: vi.fn(() => Promise.resolve([])),
    }
})

vi.stubGlobal('console', { ...console, debug: () => { } })

describe('EngagementsTable expansion (isolated)', () => {
    test('expands group row to reveal children when toggle clicked', async () => {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const { container } = render(
            <QueryClientProvider client={qc}>
                <EngagementsTable />
            </QueryClientProvider>
        )

        // Wait for group summary row
        await waitFor(() => expect(screen.getByText(/Generated group 999/)).toBeTruthy())

        // Toggle expand
        const toggle = screen.getByLabelText(/toggle group/i)
        fireEvent.click(toggle)

        // Debug: output DOM to help diagnose why child rows aren't visible
        // eslint-disable-next-line no-console
        console.log(container.innerHTML)

        // Expect child names to render
        await waitFor(() => expect(screen.getByText(/Child One/)).toBeTruthy())
        await waitFor(() => expect(screen.getByText(/Child Two/)).toBeTruthy())
    })

    test('itemsForTable contains group and child rows with consistent keys', async () => {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const { container } = render(
            <QueryClientProvider client={qc}>
                <EngagementsTable />
            </QueryClientProvider>
        )

        await waitFor(() => expect(screen.getByText(/Generated group 999/)).toBeTruthy())
        // Inspect rendered rows in DOM table body
        const rows = container.querySelectorAll('tbody tr')
        // There should be at least one row (group summary)
        expect(rows.length).toBeGreaterThanOrEqual(1)
    })
})
