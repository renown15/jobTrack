import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { enableMuiNotchMock } from '../../test-utils/muiNotchHelper'

describe('Documents add dialog notch behavior', () => {
    test('Document Name and Description fields toggle notched when text is entered', async () => {
        // (test uses real MUI TextField; no per-test mock installed)
        // enable the notch measurement shim so MUI will populate the legend
        enableMuiNotchMock()

        // Import after installing mock
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Documents = (await import('../Documents')).default

        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        render(
            <QueryClientProvider client={qc}>
                <Documents />
            </QueryClientProvider>
        )

        // Open add dialog by clicking the add button
        const addBtn = await screen.findByText('+ Add document')
        expect(addBtn).toBeInTheDocument()
        await userEvent.click(addBtn)

        // Document Name
        const name = await screen.findByLabelText('Document Name')
        expect(name).toBeInTheDocument()

        const nameLabelCandidates = screen.getAllByText('Document Name')
        const nameLabelBefore = nameLabelCandidates.find(el => el.tagName === 'LABEL')
        expect(nameLabelBefore).toBeTruthy()
        expect(nameLabelBefore && nameLabelBefore.classList.contains('MuiInputLabel-shrink')).toBeFalsy()

        await userEvent.type(name, 'My doc name')
        expect(name).toHaveValue('My doc name')

        // Description (multiline)
        const desc = await screen.findByLabelText('Description')
        expect(desc).toBeInTheDocument()

        const descLabelCandidates = screen.getAllByText('Description')
        const descLabelBefore = descLabelCandidates.find(el => el.tagName === 'LABEL')
        expect(descLabelBefore).toBeTruthy()
        expect(descLabelBefore && descLabelBefore.classList.contains('MuiInputLabel-shrink')).toBeFalsy()

        await userEvent.type(desc, 'Some description')
        expect(desc).toHaveValue('Some description')

        const nameLabelCandidatesAfter = screen.getAllByText('Document Name')
        const nameLabel = nameLabelCandidatesAfter.find(el => el.tagName === 'LABEL')
        expect(nameLabel).toBeTruthy()
        expect(nameLabel && nameLabel.classList.contains('MuiInputLabel-shrink')).toBeTruthy()

        const descLabelCandidatesAfter = screen.getAllByText('Description')
        const descLabel = descLabelCandidatesAfter.find(el => el.tagName === 'LABEL')
        expect(descLabel).toBeTruthy()
        expect(descLabel && descLabel.classList.contains('MuiInputLabel-shrink')).toBeTruthy()

        // Assert the notched outline legends contain the label text
        const nameFieldRoot = (name as HTMLElement).closest('.MuiOutlinedInput-root')
        const nameFieldset = nameFieldRoot?.querySelector('.MuiOutlinedInput-notchedOutline')
        const nameLegendSpan = nameFieldset?.querySelector('legend span')
        expect(nameLegendSpan).toBeTruthy()
        expect(nameLegendSpan && nameLegendSpan.textContent).toContain('Document Name')

        const descFieldRoot = (desc as HTMLElement).closest('.MuiOutlinedInput-root')
        const descFieldset = descFieldRoot?.querySelector('.MuiOutlinedInput-notchedOutline')
        const descLegendSpan = descFieldset?.querySelector('legend span')
        expect(descLegendSpan).toBeTruthy()
        expect(descLegendSpan && descLegendSpan.textContent).toContain('Description')
    }, 20000)
})
