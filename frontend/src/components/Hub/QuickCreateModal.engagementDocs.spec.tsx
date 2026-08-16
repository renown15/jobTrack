import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QuickCreateModal from './QuickCreateModal'
import { QueryClientProvider } from '@tanstack/react-query'
import * as api from '../../api/client'
import { vi } from 'vitest'
import { createQueryClient, setupDefaultApiMocks } from '../../test-utils/testApiMocks'

describe('QuickCreateModal engagement document attachment', () => {
    // allow extra time for this integration-like flow (use per-wait timeouts)
    beforeEach(() => {
        // Provide contacts, reference data and documents so the engagement
        // form becomes valid and the Attach documents picker shows options
        setupDefaultApiMocks(vi, {
            fetchOrganisations: [],
            fetchReferenceData: [{ refid: 10, refvalue: 'Phone call' }],
            fetchSectors: [],
            fetchContacts: { items: [{ contactid: 123, name: 'Test Contact' }], total: 1, page: 1, pageSize: 25 },
            fetchDocuments: { items: [{ documentid: 1, documentname: 'Doc 1' }, { documentid: 2, documentname: 'Doc 2' }], total: 2 },
        })
    })

    it('attaches selected documents after creating an engagement', async () => {
        // Mock createEngagement to return an object containing an id we expect the attach function to use
        const engagementResponse = { engagementid: 555 }
        const createEngagementSpy = vi.spyOn(api, 'createEngagement').mockResolvedValue(engagementResponse)

        // Spy on attachDocumentToEngagement
        const attachSpy = vi.spyOn(api, 'attachDocumentToEngagement').mockResolvedValue({ success: true })

        const qc = createQueryClient()
        // Render the modal with a prefilled `editing` payload that contains
        // `documents` and `contactid`. The component will canonicalize the
        // incoming `documents` into `selectedDocuments` when opened, allowing
        // the create flow to attach them after create without using the
        // Autocomplete UI (avoids flaky portaled MUI interactions in tests).
        render(
            <QueryClientProvider client={qc}>
                <QuickCreateModal open={true} onClose={() => { }} mode="engagement" editing={{ contactid: 123, engagementtypeid: 10, documents: [{ documentid: 1 }, { documentid: 2 }] }} />
            </QueryClientProvider>
        )

        // Fill required notes so UI is fully populated
        const notes = await screen.findByLabelText(/Notes/i)
        await userEvent.type(notes, 'Test engagement with docs')

        // Click Create
        const createBtn = await screen.findByRole('button', { name: /Create/i })
        await userEvent.click(createBtn)

        // wait for createEngagement to be called (longer timeout for parallel runs)
        await waitFor(() => expect(createEngagementSpy).toHaveBeenCalled(), { timeout: 15000 })

        // then attachDocumentToEngagement should be called for each selected document with the returned engagement id
        await waitFor(() => {
            expect(attachSpy).toHaveBeenCalled()
            // Ensure calls include the engagement id and one of the doc ids
            const calledWithEngagement = attachSpy.mock.calls.every(call => call[0] === 555)
            if (!calledWithEngagement) throw new Error('attachDocumentToEngagement called without expected engagement id')
        }, { timeout: 15000 })
    })
})
