import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RolesTable from './RolesTable'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient, setupDefaultApiMocks } from '../../../src/test-utils/testApiMocks'
import * as api from '../../api/client'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'

const qc = createQueryClient()

describe('RolesTable delete flow', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi, {
            fetchOrganisations: [],
            fetchSectors: [],
            fetchContacts: { items: [], total: 0, page: 1, pageSize: 25 },
        })
        vi.spyOn(api, 'fetchJobRoles').mockResolvedValue([
            { jobid: 20, rolename: 'Engineer', company_name: 'Org A', contactid: 10 },
        ])
    })
    afterEach(() => { vi.restoreAllMocks() })

    it('deletes role after confirmation', async () => {
        const deleteSpy = vi.spyOn(api, 'deleteJobRole').mockResolvedValue({})
        const { container } = render(
            <QueryClientProvider client={qc}>
                <RolesTable />
            </QueryClientProvider>
        )

        await waitFor(() => expect(screen.getByText(/Engineer/)).toBeTruthy())
        const deleteBtn = screen.getByRole('button', { name: /Delete role 20/ })
        await userEvent.click(deleteBtn)

        // confirm dialog should appear with current wording
        await waitFor(() => expect(screen.getByText(/Delete job role/)).toBeTruthy())
        await userEvent.click(screen.getByText('Delete'))

        await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(20))
        await waitFor(() => expect(screen.getByText(/Job role deleted/)).toBeTruthy())
    })
})
