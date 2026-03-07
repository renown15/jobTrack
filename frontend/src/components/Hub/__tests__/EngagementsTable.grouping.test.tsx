import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import EngagementsTable from '../EngagementsTable'

// Mock API client used by EngagementsTable
vi.mock('../../../api/client', () => {
    return {
        fetchEngagements: vi.fn(() => Promise.resolve([
            // a grouped engagement referencing a contactgroup id with two members
            {
                engagementid: 200,
                contactid: 50, // contactgroup id
                contactgroupname: 'Group: Alice, Bob',
                contacts: [
                    { contactid: 1, name: 'Alice', company_name: 'Acme' },
                    { contactid: 2, name: 'Bob', company_name: 'BetaCo' }
                ],
                company_name: '',
                engagedate: '2025-12-10',
                kind: 'note',
                notes: 'Group meeting',
            }
        ])),
        fetchAllContacts: vi.fn(() => Promise.resolve([])),
        fetchOrganisations: vi.fn(() => Promise.resolve([])),
        fetchReferenceData: vi.fn(() => Promise.resolve([])),
        // additional mocks required by nested components / queries
        fetchDocuments: vi.fn(() => Promise.resolve([])),
        fetchSectors: vi.fn(() => Promise.resolve([])),
        fetchTasks: vi.fn(() => Promise.resolve([])),
    }
})

vi.stubGlobal('console', { ...console, debug: () => { } })

describe('EngagementsTable grouping', () => {
    test('renders group row and expands to show children', async () => {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        render(
            <QueryClientProvider client={qc}>
                <EngagementsTable />
            </QueryClientProvider>
        )

        // Wait for the group row label to appear
        await waitFor(() => expect(screen.getByText(/Group: Alice, Bob/i)).toBeTruthy())

        // Click the expand toggle on the group row (match any 'toggle group' label)
        const toggle = screen.getByLabelText(/toggle group/i)
        fireEvent.click(toggle)

        // Now the child rows should appear (match exact child names)
        await waitFor(async () => {
            const aliceMatches = await screen.findAllByText(/^Alice$/i)
            const bobMatches = await screen.findAllByText(/^Bob$/i)
            expect(aliceMatches.length).toBeGreaterThan(0)
            expect(bobMatches.length).toBeGreaterThan(0)
        })
    })

    test('searching expands group and shows only matching children', async () => {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        // Render with a search prop that matches one child
        render(
            <QueryClientProvider client={qc}>
                <EngagementsTable search="bob" />
            </QueryClientProvider>
        )

        // Group label should be present
        await waitFor(() => expect(screen.getByText(/Group: Alice, Bob/i)).toBeTruthy())

        // Because search matches 'Bob', Bob should be shown (child row)
        await waitFor(() => expect(screen.getByText(/^Bob$/)).toBeTruthy())
    })
})
