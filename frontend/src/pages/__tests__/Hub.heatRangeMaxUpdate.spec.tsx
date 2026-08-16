import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import Hub from '../Hub'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { createQueryClient, setupDefaultApiMocks } from '../../test-utils/testApiMocks'
import { QueryClientProvider } from '@tanstack/react-query'
import * as api from '../../api/client'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'

function daysAgoDate(days: number) {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString().slice(0, 10)
}

describe('Hub heatRange max follow behaviour', () => {
    const qc = createQueryClient()

    beforeEach(() => {
        // initial dataset with max days-ago = 30
        setupDefaultApiMocks(vi, {
            fetchAllContacts: [
                { contactid: 1, name: 'A', created_at: daysAgoDate(40), last_contact_date: daysAgoDate(10) },
                { contactid: 2, name: 'B', created_at: daysAgoDate(50), last_contact_date: daysAgoDate(30) },
            ],
            fetchOrganisations: [],
            fetchEngagements: [],
        })
    })

    afterEach(() => { vi.restoreAllMocks() })

    it('updates heat slider upper bound when dataset max increases', async () => {
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

        // initial dataMax should equal 30 days -> labelRight shows that date
        const initialRight = daysAgoDate(30)
        await waitFor(() => expect(screen.getByText(initialRight)).toBeTruthy())

        // Now change the API mock so dataset includes an older contact (60 days ago)
        vi.spyOn(api, 'fetchAllContacts').mockResolvedValue([
            { contactid: 1, name: 'A', created_at: daysAgoDate(70), last_contact_date: daysAgoDate(10) },
            { contactid: 2, name: 'B', created_at: daysAgoDate(80), last_contact_date: daysAgoDate(30) },
            { contactid: 3, name: 'C', created_at: daysAgoDate(120), last_contact_date: daysAgoDate(60) },
        ])

        // Invalidate the contactsAllForHeat query so Hub refetches and recomputes ranges
        qc.invalidateQueries(['contactsAllForHeat'])

        const newRight = daysAgoDate(60)
        await waitFor(() => expect(screen.getByText(newRight)).toBeTruthy())
    })
})
