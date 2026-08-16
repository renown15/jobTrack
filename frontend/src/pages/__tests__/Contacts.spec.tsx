import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import Contacts from '../Contacts'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient, setupDefaultApiMocks } from '../../test-utils/testApiMocks'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'

const qc = createQueryClient()

describe('Contacts page grouped engagements column', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi, {
            fetchContacts: {
                items: [
                    { contactid: 1, firstname: 'Test', lastname: 'User', email: 't@u.com', phone: '123', engagement_count: 3, first_contact_date: '2024-01-02', last_contact_date: '2024-06-15' }
                ],
                total: 1,
                page: 1,
                pageSize: 20
            }
        })
    })
    afterEach(() => { vi.restoreAllMocks() })

    it('shows engagement count and expands to reveal first/last contact dates', async () => {
        render(
            <QueryClientProvider client={qc}>
                <Contacts />
            </QueryClientProvider>
        )

        // wait for row to render
        await waitFor(() => expect(screen.getByText(/Test/)).toBeTruthy())

        // engagement count should be visible
        expect(screen.getByText('3')).toBeTruthy()

        // find expand button (aria-label 'Expand') and click
        const expandBtn = screen.getByRole('button', { name: /Expand/i })
        expect(expandBtn).toBeTruthy()
        fireEvent.click(expandBtn)

        // on expansion, first and last contact dates should appear
        await waitFor(() => {
            expect(screen.getByText(/First:/)).toBeTruthy()
            expect(screen.getByText(/Last:/)).toBeTruthy()
            expect(screen.getByText(/2024-01-02/)).toBeTruthy()
            expect(screen.getByText(/2024-06-15/)).toBeTruthy()
        })
    })
})
