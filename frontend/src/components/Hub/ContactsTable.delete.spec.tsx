import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ContactsTable from './ContactsTable'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient, setupDefaultApiMocks } from '../../../src/test-utils/testApiMocks'
import * as api from '../../api/client'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'

const qc = createQueryClient()

describe('ContactsTable delete flow', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi, {
            fetchAllContacts: [
                { contactid: 10, name: 'Alice Smith', firstname: 'Alice', lastname: 'Smith', company: 'Org A', currentorgid: 1 },
            ],
            fetchOrganisations: [],
            fetchSectors: [],
            fetchContacts: { items: [], total: 0, page: 1, pageSize: 25 },
        })
    })
    afterEach(() => { vi.restoreAllMocks() })

    it('deletes contact after confirmation', async () => {
        const deleteSpy = vi.spyOn(api, 'deleteContact').mockResolvedValue({})
        const { container } = render(
            <QueryClientProvider client={qc}>
                <ContactsTable />
            </QueryClientProvider>
        )

        await waitFor(() => expect(screen.getByText(/Alice/)).toBeTruthy())
        const deleteBtn = screen.getByRole('button', { name: /Delete contact 10/ })
        await userEvent.click(deleteBtn)

        await waitFor(() => expect(screen.getByText(/Delete contact/)).toBeTruthy())
        await userEvent.click(screen.getByText('Delete'))

        await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(10))
        await waitFor(() => expect(screen.getByText(/Contact deleted/)).toBeTruthy())
    })
})
