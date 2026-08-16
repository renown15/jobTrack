import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import ContactsTable from './ContactsTable'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient, setupDefaultApiMocks } from '../../../src/test-utils/testApiMocks'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'

const qc = createQueryClient()

describe('ContactsTable name/title/role grouping', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi, {
            fetchAllContacts: [
                ({ contactid: 10, name: 'Alice', current_organization: 'Org A', currentrole: 'Recruiter', role_type: 'Hiring Manager', engagement_count: 1 } as any)
            ],
        })
    })
    afterEach(() => { vi.restoreAllMocks() })

    it('defaults collapsed showing only Name; expands to show Title and Role', async () => {
        render(
            <QueryClientProvider client={qc}>
                <ContactsTable />
            </QueryClientProvider>
        )

        // wait for row to render
        await waitFor(() => expect(screen.getByText(/Alice/)).toBeTruthy())

        // In collapsed default, Title and Role column headers should not be present
        expect(screen.queryByText(/^Title$/i)).toBeNull()
        expect(screen.queryByText(/^Role$/i)).toBeNull()

        // find the header expand button and click it
        const headerExpand = screen.getByRole('button', { name: /Expand name columns/i })
        expect(headerExpand).toBeTruthy()
        fireEvent.click(headerExpand)

        // after expansion, Title and Role headers should appear
        await waitFor(() => {
            expect(screen.getByText(/^Title$/i)).toBeTruthy()
            expect(screen.getByText(/^Role$/i)).toBeTruthy()
            // and the row should include the title and role values
            expect(screen.getByText(/Recruiter/)).toBeTruthy()
            expect(screen.getByText(/Hiring Manager/)).toBeTruthy()
        })
    })
})
