import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import QuickCreateModal from './QuickCreateModal'
import { QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'
import { createQueryClient, setupDefaultApiMocks } from '../../test-utils/testApiMocks'
import * as api from '../../api/client'

describe('QuickCreateModal documents prefill', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi, {
            fetchOrganisations: [],
            fetchContacts: { items: [], total: 0, page: 1, pageSize: 20 },
        })
        // Explicitly mock fetchDocuments for this test since the helper
        // doesn't apply a fetchDocuments override.
        vi.spyOn(api, 'fetchDocuments').mockResolvedValue([
            { documentid: 1, documentname: 'Resume A' },
            { documentid: 2, documentname: 'Cover Letter' },
        ])
    })
    afterEach(() => { vi.restoreAllMocks() })

    it('prefills document Autocomplete when editing engagement with attached document id', async () => {
        const qc = createQueryClient()
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

        // Wait for the Autocomplete input label to be present
        await screen.findByLabelText(/Attach documents/i)

        // The Autocomplete value should render the selected document name
        await waitFor(() => {
            expect(screen.getByText('Resume A')).toBeTruthy()
        })
    })
})

describe('QuickCreateModal jobrole documents picker', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi, {
            fetchOrganisations: [{ orgid: 1, name: 'Org A' }],
            fetchContacts: { items: [{ contactid: 10, name: 'Alice' }], total: 1, page: 1, pageSize: 20 },
            fetchSectors: [],
            fetchReferenceData: [{ refid: 2, refvalue: 'Applied' }],
            fetchDocuments: [{ documentid: 1, documentname: 'Doc A', documenturi: '/d/1' }],
        })
    })

    it('renders the jobrole documents picker input', async () => {
        const qc = createQueryClient()
        render(
            <QueryClientProvider client={qc}>
                <QuickCreateModal open={true} onClose={() => { }} mode="jobrole" editing={{ statusid: 2 }} />
            </QueryClientProvider>
        )

        const picker = await screen.findByTestId('jobrole-documents-picker')
        expect(picker).toBeTruthy()
    })
})
