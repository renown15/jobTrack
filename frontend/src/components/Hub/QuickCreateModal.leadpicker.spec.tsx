import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QuickCreateModal from './QuickCreateModal'
import { QueryClientProvider } from '@tanstack/react-query'
import * as api from '../../api/client'
import { vi, describe, it, beforeEach, expect } from 'vitest'
import { createQueryClient, setupDefaultApiMocks } from '../../../src/test-utils/testApiMocks'

describe('QuickCreateModal lead picker visibility', () => {
    beforeEach(() => {
        // base defaults
        setupDefaultApiMocks(vi, {
            fetchOrganisations: [],
            fetchContacts: { items: [], total: 0, page: 1, pageSize: 25 },
            fetchReferenceData: [],
        })
    })

    it('shows the mapped lead from the fetched leads list even when promoted', async () => {
        const lead = { leadid: 1, name: 'Lead A', reviewoutcomeid: 99 }
        // mock fetchLeadsAll to return the lead (server returned all or included promoted)
        vi.spyOn(api as any, 'fetchLeadsAll').mockResolvedValue([lead])
        // return refdata that marks 99 as Promoted To Contact
        vi.spyOn(api, 'fetchReferenceData').mockImplementation((key?: string) => {
            if (key === 'lead_review_status') return Promise.resolve([{ refid: 99, refvalue: 'Promoted To Contact' }])
            return Promise.resolve([])
        })

        const qc = createQueryClient()
        render(
            <QueryClientProvider client={qc}>
                <QuickCreateModal open={true} onClose={() => { }} mode="contact" editing={{ contactid: 42, leadid: 1, name: 'Existing', islinkedinconnected: true }} />
            </QueryClientProvider>
        )

        const input = await screen.findByLabelText(/Originating lead/i)
        await waitFor(() => expect((input as HTMLInputElement).value).toContain('Lead A'))
    })

    it('shows the mapped lead when server list excludes it (prefetch fallback)', async () => {
        // server returns empty list
        vi.spyOn(api as any, 'fetchLeadsAll').mockResolvedValue([])
        // prefillLead returns the lead object for the selected id
        vi.spyOn(api as any, 'prefillLead').mockResolvedValue({ leadid: 2, name: 'Seeded Lead', reviewoutcomeid: 99 })
        vi.spyOn(api, 'fetchReferenceData').mockImplementation((key?: string) => {
            if (key === 'lead_review_status') return Promise.resolve([{ refid: 99, refvalue: 'Promoted To Contact' }])
            return Promise.resolve([])
        })

        const qc = createQueryClient()
        render(
            <QueryClientProvider client={qc}>
                <QuickCreateModal open={true} onClose={() => { }} mode="contact" editing={{ contactid: 99, leadid: 2, name: 'Existing 2', islinkedinconnected: true }} />
            </QueryClientProvider>
        )

        const input = await screen.findByLabelText(/Originating lead/i)
        await waitFor(() => expect((input as HTMLInputElement).value).toContain('Seeded Lead'))
    })
})
