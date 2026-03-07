import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import QuickCreateModal from '../QuickCreateModal'

// Mock the client API module imports used by the component
vi.mock('../../../api/client', () => {
    return {
        fetchOrganisations: vi.fn(() => Promise.resolve([])),
        fetchAllContacts: vi.fn(() => Promise.resolve([])),
        fetchReferenceData: vi.fn(() => Promise.resolve([])),
        fetchSectors: vi.fn(() => Promise.resolve([])),
        fetchContactTargets: vi.fn(() => Promise.resolve([])),
        fetchDocuments: vi.fn(() => Promise.resolve([
            { documentid: 1, documentname: 'Resume A' },
            { documentid: 2, documentname: 'Cover Letter' },
        ])),
        fetchContactDocuments: vi.fn(() => Promise.resolve([])),
        // other functions remain unmocked for simplicity
    }
})

// Silence console.debug used in the component
vi.stubGlobal('console', { ...console, debug: () => { } })

describe('QuickCreateModal document prefill', () => {
    test('prefills document Autocomplete when editing engagement with attached document id', async () => {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const editing = {
            engagementid: 123,
            contactid: 1,
            documents: [1], // just the id
            engagedate: '2025-12-08',
            notes: 'Test note',
        }

        render(
            <QueryClientProvider client={qc}>
                <QuickCreateModal open={true} onClose={() => { }} mode="engagement" editing={editing} />
            </QueryClientProvider>
        )

        // Wait for the Autocomplete input to render
        const input = await screen.findByLabelText(/Attach documents/i)
        // The Autocomplete value is rendered as a chip with the document name.
        // Wait for the document label to appear in the DOM.
        await waitFor(() => {
            expect(screen.getByText('Resume A')).toBeTruthy()
        })
    })
})
