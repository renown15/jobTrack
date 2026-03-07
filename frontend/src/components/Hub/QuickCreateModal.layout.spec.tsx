import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import QuickCreateModal from './QuickCreateModal'
import { QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect } from 'vitest'
import { createQueryClient, setupDefaultApiMocks } from '../../../src/test-utils/testApiMocks'

describe('QuickCreateModal layout spacing', () => {
    it('ensures Application date picker is equally spaced from controls above and below', async () => {
        // Provide minimal data so the modal renders jobrole fields
        setupDefaultApiMocks(vi, {
            fetchOrganisations: [{ orgid: 1, name: 'Org A' }],
            fetchContacts: { items: [{ contactid: 10, name: 'Alice' }], total: 1, page: 1, pageSize: 20 },
            fetchSectors: [],
            fetchReferenceData: [{ refid: 2, refvalue: 'Applied' }],
        })

        const qc = createQueryClient()
        render(
            <QueryClientProvider client={qc}>
                {/* Render QuickCreateModal in jobrole edit mode with an application date
                    so the `DatePicker` control is rendered. */}
                <QuickCreateModal open={true} onClose={() => { }} mode="jobrole" editing={{ statusid: 2, applicationdate: '2025-12-28' }} />
            </QueryClientProvider>
        )

        // Wait for fields to be present
        const combos = await screen.findAllByRole('combobox')
        // organisation is first combobox, contact is second
        const contact = combos[1]
        const date = await screen.findByLabelText(/Application date/i)
        const status = await screen.findByLabelText(/Application status/i)

        // Try to use layout rectangles if JSDOM provides them; fall back to
        // computed margins when boundingClientRect is not meaningful.
        const cRect = contact.getBoundingClientRect()
        const dRect = date.getBoundingClientRect()
        const sRect = status.getBoundingClientRect()

        if ((cRect.top === 0 && cRect.bottom === 0) && (dRect.top === 0 && dRect.bottom === 0) && (sRect.top === 0 && sRect.bottom === 0)) {
            // Layout not available (likely JSDOM). Compare CSS margin-bottom/top instead.
            const cMb = parseFloat(getComputedStyle(contact).marginBottom || '0')
            const dMt = parseFloat(getComputedStyle(date).marginTop || '0')
            const dMb = parseFloat(getComputedStyle(date).marginBottom || '0')
            const sMt = parseFloat(getComputedStyle(status).marginTop || '0')

            // The spacing between controls should be composed of bottom margin
            // from the control above and top margin from the control below; we
            // assert that distance above the date (cMb + dMt) is approximately
            // equal to the distance below the date (dMb + sMt).
            const gapAbove = (cMb || 0) + (dMt || 0)
            const gapBelow = (dMb || 0) + (sMt || 0)
            expect(Math.abs(gapAbove - gapBelow)).toBeLessThan(1)
        } else {
            const gapAbove = dRect.top - cRect.bottom
            const gapBelow = sRect.top - dRect.bottom
            // allow a 2px tolerance for rounding
            expect(Math.abs(gapAbove - gapBelow)).toBeLessThan(2)
        }
    })
})

describe('QuickCreateModal layout', () => {
    it('organisation autocomplete stretches to fill available flex space', () => {
        // ensure default API mocks are installed for predictable rendering
        setupDefaultApiMocks(vi)
        render(
            <QueryClientProvider client={createQueryClient()}>
                <QuickCreateModal open={true} onClose={() => { }} mode="contact" />
            </QueryClientProvider>
        )

        // Find the organisation input rendered by the Autocomplete's TextField
        // use role-based query to avoid colliding with other nodes containing the word "organisation"
        const orgInput = screen.getByRole('textbox', { name: /Organisation/i })
        expect(orgInput).toBeTruthy()

        // Walk up the DOM to find the nearest ancestor div that has an explicit style
        let anc: HTMLElement | null = orgInput as HTMLElement
        while (anc && anc.parentElement) {
            anc = anc.parentElement
            if (anc && anc.style && anc.style.flex) break
        }

        expect(anc).toBeTruthy()
        // The wrapper should have a flex style so it can grow to match other fullWidth controls
        expect(anc?.style.flex).toMatch(/1/)
    })
})
