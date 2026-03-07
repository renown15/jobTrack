import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import Hub from '../Hub'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { createQueryClient, setupDefaultApiMocks } from '../../test-utils/testApiMocks'
import { QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'

const qc = createQueryClient()

describe('Hub organisations table display regression', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi, {
            fetchAllContacts: [
                { contactid: 1, name: 'A', created_at: '2024-01-01', last_contact_date: '2024-11-01' },
            ],
            fetchOrganisations: [{ orgid: 1, name: 'Org A' }, { orgid: 2, name: 'Org B' }],
            fetchEngagements: [],
        })
    })

    afterEach(() => { vi.restoreAllMocks() })

    it('shows organisations table when organisations card activated', async () => {
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

        // Wait for the cards to render
        await screen.findByRole('button', { name: /Total Contacts/i })

        // Activate the Employing organisations card
        const orgsCard = screen.getByText(/Employing organisations/i)
        fireEvent.click(orgsCard)

        // Organisations table should render and include organisation names
        await waitFor(() => {
            expect(screen.getByText('Org A')).toBeTruthy()
            expect(screen.getByText('Org B')).toBeTruthy()
        })
    })
})
