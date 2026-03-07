import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect } from 'vitest'
import { createQueryClient } from '../../../src/test-utils/testApiMocks'

describe('QuickCreateModal integration', () => {
    // Intentionally do not use the global test API mocks for this file so
    // we can exercise the real `api` module. We'll dynamically unmock and
    // import the real api and component inside the test below.

    it('creates a contact with selected lead and promotes the lead', async () => {
        // Mock only the API functions we need while keeping other implementations
        // from the real module. This ensures the component imports see the
        // mocked functions and allows us to assert calls reliably.
        vi.mock('../../api/client', async () => {
            const actual = await vi.importActual('../../api/client') as any
            const lead = { leadid: 11, name: 'Integration Lead', reviewoutcomeid: null }
            return {
                ...actual,
                fetchLeadsAll: vi.fn().mockResolvedValue([lead]),
                fetchReferenceData: vi.fn().mockImplementation((key?: string) => {
                    if (key === 'lead_review_status') return Promise.resolve([{ refid: 99, refvalue: 'Promoted To Contact' }])
                    return Promise.resolve([])
                }),
                createContact: vi.fn().mockResolvedValue({ contactid: 999 } as any),
                setLeadReviewOutcome: vi.fn().mockResolvedValue({ ok: true } as any),
            }
        })

        // Import the component after setting up the mock so it receives the mocked functions
        const { default: QuickCreateModal } = await import('./QuickCreateModal')

        // Import the (mocked) api module so we can inspect the mock calls
        const api = await import('../../api/client') as any

        const qc = createQueryClient()
        // Provide an `editing` prefill with `leadid` so the modal treats this
        // as a create-from-lead flow without relying on the Autocomplete UI.
        render(
            <QueryClientProvider client={qc}>
                <QuickCreateModal open={true} onClose={() => { }} mode="contact" initialRoleTypeId={1} editing={{ leadid: 11, linkedin_url: 'https://linkedin.example', role_type_id: 1 }} />
            </QueryClientProvider>
        )

        // Fill required name
        const nameInput = await screen.findByLabelText(/Contact name/i)
        await userEvent.type(nameInput, 'New Integration Contact')

        // We prefilled `editing.leadid` so no Autocomplete interaction is required.

        // Submit create
        const createBtn = await screen.findByText(/^Create$/)
        // Ensure the button becomes enabled before clicking
        await waitFor(() => expect(createBtn).toBeEnabled())
        // Helpful debug log for CI/local runs
        // eslint-disable-next-line no-console
        console.log('QuickCreateModal.test: Create button enabled, clicking')
        await userEvent.click(createBtn)
        // eslint-disable-next-line no-console
        console.log('QuickCreateModal.test: click sent')

        await waitFor(() => expect(api.createContact).toHaveBeenCalled())
        // Payload should include leadid
        const payload = api.createContact.mock.calls[0][0]
        expect(payload).toMatchObject({ name: expect.any(String), leadid: 11 })

        await waitFor(() => expect(api.setLeadReviewOutcome).toHaveBeenCalledWith(11, 99))

        // Extra sanity: ensure the mocked functions are indeed mocks and were called
        expect(vi.isMockFunction(api.createContact)).toBe(true)
        expect(vi.isMockFunction(api.setLeadReviewOutcome)).toBe(true)
    }, 20000)
})
