import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OrganisationsTable from './OrganisationsTable'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient, setupDefaultApiMocks } from '../../../src/test-utils/testApiMocks'
import * as api from '../../api/client'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'

const qc = createQueryClient()

describe('OrganisationsTable interactions', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi, {
            fetchOrganisations: [
                { orgid: 1, name: 'Org A', sector_summary: 'Tech', contacts_count: 2, roles_count: 1 },
            ],
            fetchSectors: [],
            fetchContacts: { items: [], total: 0, page: 1, pageSize: 25 },
            fetchAllContacts: [
                { contactid: 10, name: 'Alice Smith', firstname: 'Alice', lastname: 'Smith', company: 'Org A', currentorgid: 1 },
            ],
        })
        vi.spyOn(api, 'fetchJobRoles').mockResolvedValue([
            { jobid: 11, rolename: 'Dev', companyorgid: 1 },
        ])
    })
    afterEach(() => { vi.restoreAllMocks() })

    it('opens create organisation modal and contacts dialog', async () => {
        render(
            <QueryClientProvider client={qc}>
                <OrganisationsTable />
            </QueryClientProvider>
        )

        // click add org
        const addBtn = screen.getByText('+ Add Org')
        await userEvent.click(addBtn)
        await waitFor(() => expect(screen.getByText(/Create Organisation/)).toBeTruthy())

        // click contacts count button
        const contactsBtn = screen.getAllByText('2')[0]
        await userEvent.click(contactsBtn)
        await waitFor(() => expect(screen.getByText(/Contacts for Org A/)).toBeTruthy())
    })
})
