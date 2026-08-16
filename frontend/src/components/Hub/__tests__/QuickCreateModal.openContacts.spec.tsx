import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QuickCreateModal from '../QuickCreateModal'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient, setupDefaultApiMocks } from '../../../test-utils/testApiMocks'
import { vi } from 'vitest'

describe('QuickCreateModal open behaviour', () => {
    beforeEach(() => {
        const restore = setupDefaultApiMocks(vi, { fetchAllContacts: [{ contactid: 750, name: 'Alice' }, { contactid: 731, name: 'Bob' }] })
        // ensure mocks are restored after each test
        // (vitest will automatically clear between tests but keep reference)
        return restore
    })

    it('preserves selectedContacts from editing.contact_ids when opened', async () => {
        const editing = { contact_ids: [750, 731], engagedate: '2026-01-08', engagementtypeid: 2, notes: 'prefill' }

        render(
            <QueryClientProvider client={createQueryClient()}>
                <QuickCreateModal open={true} mode="engagement" editing={editing} onClose={() => { }} />
            </QueryClientProvider>
        )

        // The Contact(s) Autocomplete input should display the two selected names
        await waitFor(async () => {
            // Wait for contacts to be loaded and selection reconciled
            const alice = await screen.findByText('Alice')
            const bob = await screen.findByText('Bob')
            expect(alice).toBeTruthy()
            expect(bob).toBeTruthy()
        })
    })
})
