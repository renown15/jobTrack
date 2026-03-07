import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import ContactsTable from './ContactsTable'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient, setupDefaultApiMocks } from '../../../src/test-utils/testApiMocks'
import * as api from '../../api/client'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'

const qc = createQueryClient()

describe('ContactsTable', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi, {
            fetchAllContacts: [
                ({ contactid: 10, name: 'Alice', current_organization: 'Org A', currentrole: 'Recruiter', current_org_sector: 'Tech', roles_count: 2, engagement_count: 1, first_contact_date: '2025-01-02', last_contact_date: '2025-02-15', islinkedinconnected: true } as any)
            ],
        })
    })
    afterEach(() => { vi.restoreAllMocks() })

    it('renders contacts rows and counts', async () => {
        render(
            <QueryClientProvider client={qc}>
                <ContactsTable />
            </QueryClientProvider>
        )
        await waitFor(() => expect(screen.getByText(/^Alice$/i)).toBeTruthy())
        expect(screen.getByText(/Org A/)).toBeTruthy()
        // LinkedIn icon should be present (aria-label)
        expect(screen.getByLabelText(/Open LinkedIn for Alice/)).toBeTruthy()
        // Engagement count button should be visible
        const countBtn = screen.getByText('1')
        expect(countBtn).toBeTruthy()
        // Click the engagement count to open the engagements modal
        fireEvent.click(countBtn)
        await waitFor(() => {
            // Modal title should include contact name
            expect(screen.getByText(/Engagements for Alice/)).toBeTruthy()
            // Engagements table should show the Date column header
            expect(screen.getByText(/Date/)).toBeTruthy()
        })
    })
})
