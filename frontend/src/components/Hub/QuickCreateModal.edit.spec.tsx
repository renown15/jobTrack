import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import QuickCreateModal from './QuickCreateModal'
import { QueryClientProvider } from '@tanstack/react-query'
import * as api from '../../api/client'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'
import { createQueryClient, setupDefaultApiMocks } from '../../../src/test-utils/testApiMocks'

// use a fresh QueryClient per test

describe('QuickCreateModal edit-mode', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi, {
            fetchOrganisations: [{ orgid: 5, name: 'Org Z', sector_summary: 'Tech' }],
            fetchContacts: { items: [{ contactid: 77, name: 'Bob' }], total: 1, page: 1, pageSize: 20 },
            fetchReferenceData: [{ refid: 2, refvalue: 'Applied' }, { refid: 1, refvalue: 'LinkedIn' }],
        })
    })
    afterEach(() => { vi.restoreAllMocks() })

    it('preselects organisation and contact when editing a jobrole', async () => {
        const editing = { jobid: 99, rolename: 'Tester', contactid: 77, companyorgid: 5, applicationdate: '2025-01-01', statusid: 2 }
        render(
            <QueryClientProvider client={createQueryClient()}>
                <QuickCreateModal open={true} onClose={() => { }} mode="jobrole" editing={editing} />
            </QueryClientProvider>
        )

        // Wait until autocompletes have resolved
        await waitFor(() => {
            expect(screen.getByDisplayValue(/Tester/)).toBeTruthy()
            // organisation value should be present (find by name)
            expect(screen.getByDisplayValue(/Org Z/)).toBeTruthy()
            expect(screen.getByDisplayValue(/Bob/)).toBeTruthy()
        })
    })
})
