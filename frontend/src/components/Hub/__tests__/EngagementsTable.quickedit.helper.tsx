import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import EngagementsTable from '../EngagementsTable'

// Mock the client API module imports used by the components
vi.mock('../../api/client', () => {
    return {
        fetchEngagements: vi.fn(() => Promise.resolve([
            {
                engagementid: 123,
                contactid: 1,
                contact_name: 'Alice',
                company_name: 'Acme',
                engagedate: '2025-12-10',
                kind: 'note',
                notes: 'Original note from server',
            }
        ])),
        fetchAllContacts: vi.fn(() => Promise.resolve([{ contactid: 1, name: 'Alice' }])),
        fetchOrganisations: vi.fn(() => Promise.resolve([{ orgid: 1, name: 'Acme' }])),
        fetchReferenceData: vi.fn(() => Promise.resolve([])),
        fetchDocuments: vi.fn(() => Promise.resolve([])),
        fetchSectors: vi.fn(() => Promise.resolve([])),
        fetchContactTargets: vi.fn(() => Promise.resolve([])),
        // stubs for update/create used by QuickCreateModal
        updateEngagement: vi.fn(() => Promise.resolve({})),
        createEngagement: vi.fn(() => Promise.resolve({ engagementid: 999 })),
        attachDocumentToEngagement: vi.fn(() => Promise.resolve()),
        detachDocumentFromEngagement: vi.fn(() => Promise.resolve()),
        fetchTasks: vi.fn(() => Promise.resolve([])),
    }
})

vi.stubGlobal('console', { ...console, debug: () => { } })

describe('Engagements quick-edit flow', () => {
    test('opens quick-edit modal and prefills engagement fields', async () => {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

        render(
            <QueryClientProvider client={qc}>
                <EngagementsTable />
            </QueryClientProvider>
        )

        // Wait for the engagement row to render
        await waitFor(() => expect(screen.getByText('Original note from server')).toBeTruthy())

        // Find the edit button for the engagement
        const editButton = screen.getByLabelText(/Edit engagement 123/i)
        fireEvent.click(editButton)

        // The QuickCreateModal should open and the Notes field should contain the engagement notes
        const notesField = await screen.findByLabelText(/Notes/i)
        await waitFor(() => {
            expect((notesField as HTMLInputElement).value).toContain('Original note from server')
        })
    })
})
