import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OrganisationsTable from './OrganisationsTable'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient, setupDefaultApiMocks } from '../../../src/test-utils/testApiMocks'
import * as api from '../../api/client'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'

const qc = createQueryClient()

describe('OrganisationsTable delete flow', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi, {
            fetchOrganisations: [
                { orgid: 1, name: 'Org A', sector_summary: 'Tech', contacts_count: 2, roles_count: 1 },
            ],
            fetchSectors: [],
            fetchContacts: { items: [], total: 0, page: 1, pageSize: 25 },
        })
        vi.spyOn(api, 'fetchJobRoles').mockResolvedValue([])
    })
    afterEach(() => { vi.restoreAllMocks() })

    it('deletes organisation after confirmation', async () => {
        const deleteSpy = vi.spyOn(api, 'deleteOrganisation').mockResolvedValue({})
        const { container } = render(
            <QueryClientProvider client={qc}>
                <OrganisationsTable />
            </QueryClientProvider>
        )

        await waitFor(() => expect(screen.getByText(/Org A/)).toBeTruthy())
        // click the delete IconButton by accessible name
        const deleteBtn = screen.getByRole('button', { name: /Delete organisation 1/ })
        await userEvent.click(deleteBtn)

        // confirm dialog appears; click Delete
        await waitFor(() => expect(screen.getByText(/Delete organisation/)).toBeTruthy())
        await userEvent.click(screen.getByText('Delete'))

        await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(1))
        // toast should show success message
        await waitFor(() => expect(screen.getByText(/Organisation deleted/)).toBeTruthy())
    })
})
