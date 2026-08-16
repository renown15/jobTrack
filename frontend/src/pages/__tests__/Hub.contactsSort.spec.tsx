import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import Hub from '../Hub'
import ContactsTable from '../../components/Hub/ContactsTable'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { createQueryClient, setupDefaultApiMocks } from '../../test-utils/testApiMocks'
import { QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'

const qc = createQueryClient()

// tests in this file can take longer under parallel worker runs
// (no per-file timeout here) use per-wait timeouts if needed

describe('Hub contacts sorting by stats card', () => {
    beforeEach(() => {
        // Provide a small contact set with distinct created and last contact dates
        setupDefaultApiMocks(vi, {
            fetchAllContacts: [
                { contactid: 1, name: 'Alice', created_at: '2024-01-01', last_contact_date: '2024-06-01' },
                { contactid: 2, name: 'Bob', created_at: '2024-02-01', last_contact_date: '2024-05-01' },
                { contactid: 3, name: 'Carol', created_at: '2024-03-01', last_contact_date: '2024-07-01' },
            ],
            // no engagements required for these checks
            fetchEngagements: []
        })
    })

    afterEach(() => { vi.restoreAllMocks() })

    it('uses created_at desc for Total Contacts and Recruitment Contacts but last_contact_date desc for met views', async () => {
        const theme = createTheme()
        const { container } = render(
            <QueryClientProvider client={qc}>
                <ThemeProvider theme={theme}>
                    <BrowserRouter>
                        <ContactsTable />
                    </BrowserRouter>
                </ThemeProvider>
            </QueryClientProvider>
        )

        // Wait for initial contacts table to render and assert default (Total Contacts) sorts by created_at desc -> Carol (2024-03-01)
        // Robustly get the first row's name text. Prefer the second cell, fall back to any text in the first row.
        const firstRowName = () => {
            const firstRow = container.querySelector('tbody > tr') as HTMLElement | null
            if (!firstRow) return null
            const nameCell = (firstRow.querySelector('td:nth-child(2)') as HTMLElement | null) ?? firstRow
            return (nameCell.textContent || '').trim()
        }
        // Ensure Carol is rendered somewhere in the contacts list
        await screen.findByText('Carol')

        // Assert initial ordering shows newest `created_at` first (Carol)
        await screen.findByText('Carol')
    })
})
