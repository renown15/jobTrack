import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import EngagementsTable from '../EngagementsTable'

// Mock the API to return a larger mixed dataset with several grouped engagements
vi.mock('../../../api/client', () => {
    const groups = [
        {
            engagementid: 201,
            contactid: 1001,
            contactgroupname: 'Group A',
            contacts: [
                { contactid: 11, name: 'Z Child 1', company_name: 'Org A1' },
                { contactid: 12, name: 'Z Child 2', company_name: 'Org A2' },
            ],
            engagedate: '2025-01-03',
            kind: 'Note',
            notes: 'group A note'
        },
        {
            engagementid: 202,
            contactid: 1002,
            contactgroupname: 'Group B',
            contacts: [
                { contactid: 21, name: 'Y Child 1', company_name: 'Org B1' },
                { contactid: 22, name: 'Y Child 2', company_name: 'Org B2' },
            ],
            engagedate: '2025-01-01',
            kind: 'Discussion',
            notes: 'group B note'
        }
    ]

    // Add several single-contact engagements to increase chance sorting shuffles things
    const singles: any[] = []
    for (let i = 0; i < 5; i++) {
        singles.push({
            engagementid: 300 + i,
            contactid: 2000 + i,
            contact_name: `Single ${i}`,
            contacts: [{ contactid: 2000 + i, name: `Single ${i}`, company_name: `Org ${i}` }],
            engagedate: `2025-01-${(4 + (i % 20)).toString().padStart(2, '0')}`,
            kind: 'Email',
            notes: 'single note'
        })
    }

    return {
        fetchEngagements: vi.fn(() => Promise.resolve([...groups, ...singles])),
        fetchAllContacts: vi.fn(() => Promise.resolve([])),
        fetchOrganisations: vi.fn(() => Promise.resolve([])),
        fetchReferenceData: vi.fn(() => Promise.resolve([])),
        fetchDocuments: vi.fn(() => Promise.resolve([])),
        fetchSectors: vi.fn(() => Promise.resolve([])),
        fetchTasks: vi.fn(() => Promise.resolve([])),
    }
})

vi.stubGlobal('console', { ...console, debug: () => { } })

describe('EngagementsTable sorting keeps children with parents', () => {
    test('sorting does not disconnect children from their group summary', async () => {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const { container } = render(
            <QueryClientProvider client={qc}>
                <EngagementsTable />
            </QueryClientProvider>
        )

        // Wait for the table to render and then click the first available group expander
        await waitFor(() => expect(screen.getAllByRole('button', { hidden: true }).length).toBeGreaterThanOrEqual(0))
        // click all "toggle group" buttons to ensure groups are expanded
        const toggleBtns = Array.from(document.querySelectorAll('button[aria-label^="toggle group"]')) as HTMLButtonElement[]
        toggleBtns.forEach(b => fireEvent.click(b))

        // Now wait for the child row to appear and capture rows
        await waitFor(() => expect(screen.getByText('Z Child 1')).toBeTruthy())
        const tbody = container.querySelector('tbody')!
        const rowsBefore = Array.from(tbody.querySelectorAll('tr'))
        const childRowIndex = rowsBefore.findIndex(r => r.textContent && r.textContent.includes('Z Child 1'))
        expect(childRowIndex).toBeGreaterThan(-1)
        // Require the parent/group row to be immediately above the child
        expect(childRowIndex).toBeGreaterThan(0)
        // Parent row should contain the toggle button
        const parentRow = rowsBefore[childRowIndex - 1]
        expect(parentRow.querySelector('button[aria-label^="toggle group"]')).toBeTruthy()

        // Click the Date header to toggle sort (simulate user sort)
        const dateHeader = screen.getByText(/Date/)
        fireEvent.click(dateHeader)

        // After sorting, ensure Group A's children remain next to their parent
        await waitFor(() => {
            const rows = Array.from(tbody.querySelectorAll('tr'))
            const childIdx = rows.findIndex(r => r.textContent && r.textContent.includes('Z Child 1'))
            expect(childIdx).toBeGreaterThan(-1)
            // Require immediate adjacency after sort as well
            expect(childIdx).toBeGreaterThan(0)
            expect(rows[childIdx - 1].querySelector('button[aria-label^="toggle group"]')).toBeTruthy()
        })
    })
})
