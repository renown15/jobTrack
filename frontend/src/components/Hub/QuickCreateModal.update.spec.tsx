import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QuickCreateModal from './QuickCreateModal'
import { QueryClientProvider } from '@tanstack/react-query'
import * as api from '../../api/client'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'
import { createQueryClient, setupDefaultApiMocks } from '../../../src/test-utils/testApiMocks'


describe('QuickCreateModal update flows', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi, {
            fetchOrganisations: [],
            fetchContacts: { items: [], total: 0, page: 1, pageSize: 25 },
            fetchAllContacts: [],
        })
    })
    afterEach(() => { vi.restoreAllMocks() })

    it('prepopulates organisation sector and updates organisation', async () => {
        vi.spyOn(api, 'fetchSectors').mockResolvedValue(([
            { sectorid: 5, summary: 'Technology' },
        ] as unknown) as any)

        const updateSpy = vi.spyOn(api, 'updateOrganisation').mockResolvedValue({})
        const onClose = vi.fn()
        const editing = { orgid: 3, name: 'Old Org', sectorid: 5 }

        const qc = createQueryClient()
        render(
            <QueryClientProvider client={qc}>
                <QuickCreateModal open={true} onClose={onClose} mode="organisation" editing={editing} />
            </QueryClientProvider>
        )

        // Sector autocomplete should display 'Technology'
        await waitFor(() => expect(screen.getByDisplayValue('Technology')).toBeTruthy())

        // update organisation name
        const nameInput = screen.getByLabelText('Organisation name') as HTMLInputElement
        await userEvent.clear(nameInput)
        await userEvent.type(nameInput, 'New Org')

        // click Update
        await userEvent.click(screen.getByRole('button', { name: /Update/ }))

        await waitFor(() => expect(updateSpy).toHaveBeenCalled())
        expect(updateSpy).toHaveBeenCalledWith(3, { name: 'New Org', sectorid: 5 })
        await waitFor(() => expect(onClose).toHaveBeenCalled())
    })

    it('prepopulates jobrole fields and updates job role with status and source', async () => {
        vi.spyOn(api, 'fetchOrganisations').mockResolvedValue([{ orgid: 1, name: 'Org A' }])
        vi.spyOn(api, 'fetchAllContacts').mockResolvedValue([{ contactid: 10, name: 'Alice Smith' } as any])
        vi.spyOn(api, 'fetchReferenceData').mockImplementation((key?: string) => {
            if (key === 'application_status') return Promise.resolve([{ refid: 2, refvalue: 'Offered' }])
            if (key === 'source_channel') return Promise.resolve([{ refid: 3, refvalue: 'LinkedIn' }])
            return Promise.resolve([])
        })

        const updateSpy = vi.spyOn(api, 'updateJobRole').mockResolvedValue({})
        const onClose = vi.fn()
        const editing = { jobid: 11, rolename: 'Dev', contactid: 10, companyorgid: 1, applicationdate: '2022-01-01', statusid: 2, sourcechannelid: 3 }

        const qc = createQueryClient()
        render(
            <QueryClientProvider client={qc}>
                <QuickCreateModal open={true} onClose={onClose} mode="jobrole" editing={editing} />
            </QueryClientProvider>
        )

        // Wait for organisation and contact autocompletes to show
        await waitFor(() => expect(screen.getByDisplayValue('Org A')).toBeTruthy())
        await waitFor(() => expect(screen.getByDisplayValue('Alice Smith')).toBeTruthy())

        // click Update
        await userEvent.click(screen.getByRole('button', { name: /Update/ }))

        await waitFor(() => expect(updateSpy).toHaveBeenCalled())
        const calledWith = updateSpy.mock.calls[0]
        expect(calledWith[0]).toBe(11)
        expect(calledWith[1]).toMatchObject({ rolename: 'Dev', contactid: 10, applicationdate: '2022-01-01', statusid: 2, sourcechannelid: 3 })
        await waitFor(() => expect(onClose).toHaveBeenCalled())
    })
})
