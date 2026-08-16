import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import Hub from '../Hub'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { createQueryClient, setupDefaultApiMocks } from '../../test-utils/testApiMocks'
import { QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'

const qc = createQueryClient()

describe('Hub organisations heat regression', () => {
    beforeEach(() => {
        // Provide a small contact set and organisations so counts are deterministic
        setupDefaultApiMocks(vi, {
            fetchAllContacts: [
                { contactid: 1, name: 'A', created_at: '2024-01-01', last_contact_date: '2024-11-01' },
                { contactid: 2, name: 'B', created_at: '2024-02-01', last_contact_date: '2024-10-01' },
                { contactid: 3, name: 'C', created_at: '2024-03-01', last_contact_date: '2024-09-01' },
                { contactid: 4, name: 'D', created_at: '2024-04-01', last_contact_date: null },
            ],
            fetchOrganisations: [{ orgid: 1, name: 'Org A' }, { orgid: 2, name: 'Org B' }],
            fetchEngagements: [],
        })
    })

    afterEach(() => { vi.restoreAllMocks() })

    it('does not change Total / Recruitment counts when activating organisations view', async () => {
        const theme = createTheme()
        render(
            <QueryClientProvider client={qc}>
                <ThemeProvider theme={theme}>
                    <BrowserRouter>
                        <Hub />
                    </BrowserRouter>
                </ThemeProvider>
            </QueryClientProvider>
        )

        // Wait for StatsCards to render
        const totalCard = await screen.findByRole('button', { name: /Total Contacts/i })
        const recruitmentCard = await screen.findByText(/Recruitment Contacts/i)

        const extractNumber = (el: Element) => {
            const txt = el.textContent || ''
            const m = txt.match(/(\d+)/)
            return m ? Number(m[1]) : NaN
        }

        const beforeTotal = extractNumber(totalCard)
        const beforeRecruit = extractNumber(recruitmentCard.parentElement ?? recruitmentCard)

        // Click the Employing organisations card to switch the bottom panel
        const orgsCard = screen.getByText(/Employing organisations/i)
        fireEvent.click(orgsCard)

        // After activation, totals should remain stable
        await waitFor(() => {
            const afterTotal = extractNumber(totalCard)
            const afterRecruit = extractNumber(recruitmentCard.parentElement ?? recruitmentCard)
            expect(afterTotal).toBe(beforeTotal)
            expect(afterRecruit).toBe(beforeRecruit)
        })
    }, 20000)
})
