import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import RolesTable from './RolesTable'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient, setupDefaultApiMocks } from '../../../src/test-utils/testApiMocks'
import * as api from '../../api/client'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'
import userEvent from '@testing-library/user-event'

const qc = createQueryClient()

describe('RolesTable', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi)
        vi.spyOn(api, 'fetchJobRoles').mockResolvedValue([
            { jobid: 1, rolename: 'Engineer', contact_name: 'Alice', company_name: 'Org A', companyorgid: 10, sourcechannelid: 1, statusid: 2, source_name: 'LinkedIn', applicationdate: '2025-01-01', status_name: 'Applied' }
        ])
    })
    afterEach(() => { vi.restoreAllMocks() })

    it('renders roles table rows', async () => {
        render(
            <QueryClientProvider client={qc}>
                <RolesTable />
            </QueryClientProvider>
        )
        await waitFor(() => {
            expect(screen.getByText(/Engineer/)).toBeTruthy()
            expect(screen.getByText(/Alice/)).toBeTruthy()
            expect(screen.getByText(/Org A/)).toBeTruthy()
        })
    })

    it('edits a role from the table and refreshes rows', async () => {
        // first call returns old data, subsequent calls return updated data
        const initial = [{ jobid: 1, rolename: 'Engineer', contact_name: 'Alice', company_name: 'Org A', source_name: 'LinkedIn', applicationdate: '2025-01-01', status_name: 'Applied' }]
        const updated = [{ jobid: 1, rolename: 'Engineer II', contact_name: 'Alice', company_name: 'Org A', source_name: 'LinkedIn', applicationdate: '2025-01-01', status_name: 'Applied' }]
        const fetchSpy = vi.spyOn(api, 'fetchJobRoles')
        fetchSpy.mockResolvedValueOnce(initial).mockResolvedValue(updated)

        const updateSpy = vi.spyOn(api, 'updateJobRole').mockResolvedValue({})

        const qc2 = createQueryClient()
        render(
            <QueryClientProvider client={qc}>
                <RolesTable />
            </QueryClientProvider>
        )

        // wait for initial row
        await waitFor(() => expect(screen.getByText('Engineer')).toBeTruthy())

        // open quick edit modal via edit button
        const editBtn = screen.getByLabelText('Edit role 1')
        await userEvent.click(editBtn)

        // modal should show role name input prefilled
        const roleInput = await screen.findByLabelText(/Role name/i) as HTMLInputElement
        await waitFor(() => expect(roleInput.value).toBe('Engineer'))

        // change role name
        await userEvent.clear(roleInput)
        await userEvent.type(roleInput, 'Engineer II')

        // click Update
        const updateBtn = Array.from(document.body.querySelectorAll('button')).find((b) => /Update/i.test(b.textContent || ''))
        if (!updateBtn) throw new Error('Update button not found')
        await userEvent.click(updateBtn)

        // ensure update API called
        await waitFor(() => expect(updateSpy).toHaveBeenCalled())

        // RolesTable should refetch and display updated name
        await waitFor(() => expect(screen.getByText('Engineer II')).toBeTruthy())
    })
})
