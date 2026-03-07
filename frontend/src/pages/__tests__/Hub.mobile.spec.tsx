import React from 'react'
import { render, screen } from '@testing-library/react'
import Hub from '../Hub'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import * as useMediaQueryModule from '@mui/material/useMediaQuery'
import { createQueryClient, setupDefaultApiMocks } from '../../test-utils/testApiMocks'
import { QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'

describe('Hub mobile behavior', () => {
    const theme = createTheme()
    const qc = createQueryClient()

    beforeEach(() => {
        setupDefaultApiMocks(vi)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it.skip('closes the Summary accordion on mobile', async () => {
        // Stub window.matchMedia to simulate mobile viewport (used by useMediaQuery)
        const originalMatchMedia = window.matchMedia
        // @ts-ignore
        window.matchMedia = (query: string) => ({
            matches: true,
            media: query,
            onchange: null,
            addListener: () => { },
            removeListener: () => { },
            addEventListener: () => { },
            removeEventListener: () => { },
            dispatchEvent: () => false,
        } as unknown as MediaQueryList)

        render(
            <QueryClientProvider client={qc}>
                <ThemeProvider theme={theme}>
                    <BrowserRouter>
                        <Hub />
                    </BrowserRouter>
                </ThemeProvider>
            </QueryClientProvider>
        )

        // The Summary title should be present
        const summary = await screen.findByText(/Summary/i)
        expect(summary).toBeInTheDocument()

        // The StatsCards content should be hidden when on mobile. Look for a label
        // that appears inside the summary details; it should not be visible.
        const contactCardLabel = screen.queryByText(/Total Contacts/i)
        expect(contactCardLabel).not.toBeInTheDocument()
        // restore
        // @ts-ignore
        window.matchMedia = originalMatchMedia
    })
})
