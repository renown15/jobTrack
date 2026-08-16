import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import OrganisationsTable from './OrganisationsTable'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient, setupDefaultApiMocks } from '../../../src/test-utils/testApiMocks'
import * as api from '../../api/client'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'

const qc = createQueryClient()

describe('OrganisationsTable', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi, {
            fetchOrganisations: [
                { orgid: 1, name: 'Org A', sector_summary: 'Tech', contacts_count: 2, roles_count: 1 },
                { orgid: 2, name: 'Org B', sector_summary: 'Finance', contacts_count: 0, roles_count: 0 },
            ],
        })
        vi.spyOn(api, 'fetchJobRoles').mockResolvedValue([
            { jobid: 11, rolename: 'Dev', companyorgid: 1 },
        ])
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('renders organisation rows and counts', async () => {
        render(
            <QueryClientProvider client={qc}>
                <OrganisationsTable />
            </QueryClientProvider>
        )

        await waitFor(() => {
            expect(screen.getByText(/Org A/)).toBeTruthy()
            expect(screen.getByText(/Tech/)).toBeTruthy()
            // Contacts button
            expect(screen.getAllByText('2').length).toBeGreaterThan(0)
            // Roles button shows count computed from mocked jobroles
            expect(screen.getAllByText('1').length).toBeGreaterThan(0)
        })
    })
})
