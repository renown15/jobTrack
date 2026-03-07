import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { enableMuiNotchMock } from '../../../test-utils/muiNotchHelper'

describe('TaskFormModal notch behavior', () => {
    test('Name and Notes fields toggle notched when text is entered', async () => {
        // enable the notch measurement shim so MUI will populate the legend
        enableMuiNotchMock()
        // (test uses real MUI TextField; no per-test mock installed)

        // Import after mock installed
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const TaskFormModal = (await import('../TaskFormModal')).default

        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        render(
            <QueryClientProvider client={qc}>
                <TaskFormModal open={true} onClose={() => { }} onSaved={() => { }} />
            </QueryClientProvider>
        )

        // Name field (match label text that may include a required asterisk)
        const name = await screen.findByLabelText(/Name/)
        expect(name).toBeInTheDocument()

        // Find the label element by its visible text (choose the LABEL tag)
        const nameLabelCandidates = screen.getAllByText('Name')
        const nameLabelBefore = nameLabelCandidates.find(el => el.tagName === 'LABEL')
        expect(nameLabelBefore).toBeTruthy()
        expect(nameLabelBefore && nameLabelBefore.classList.contains('MuiInputLabel-shrink')).toBeFalsy()

        await userEvent.type(name, 'Important task')
        expect(name).toHaveValue('Important task')

        // Assert the notched outline legend contains the label text
        const nameFieldRoot = (name as HTMLElement).closest('.MuiOutlinedInput-root')
        const nameFieldset = nameFieldRoot?.querySelector('.MuiOutlinedInput-notchedOutline')
        const nameLegendSpan = nameFieldset?.querySelector('legend span')
        expect(nameLegendSpan).toBeTruthy()
        expect(nameLegendSpan && nameLegendSpan.textContent).toContain('Name')

        // Notes field (textarea)
        const notes = await screen.findByLabelText('Notes')
        expect(notes).toBeInTheDocument()

        const notesLabelCandidates = screen.getAllByText('Notes')
        const notesLabelBefore = notesLabelCandidates.find(el => el.tagName === 'LABEL')
        expect(notesLabelBefore).toBeTruthy()
        expect(notesLabelBefore && notesLabelBefore.classList.contains('MuiInputLabel-shrink')).toBeFalsy()

        await userEvent.type(notes, 'Add extra details')
        expect(notes).toHaveValue('Add extra details')

        // Assert the notched outline legend for Notes contains the label text
        const notesFieldRoot = (notes as HTMLElement).closest('.MuiOutlinedInput-root')
        const notesFieldset = notesFieldRoot?.querySelector('.MuiOutlinedInput-notchedOutline')
        const notesLegendSpan = notesFieldset?.querySelector('legend span')
        expect(notesLegendSpan).toBeTruthy()
        expect(notesLegendSpan && notesLegendSpan.textContent).toContain('Notes')

        const nameLabelCandidatesAfter = screen.getAllByText('Name')
        const nameLabel = nameLabelCandidatesAfter.find(el => el.tagName === 'LABEL')
        expect(nameLabel).toBeTruthy()
        expect(nameLabel && nameLabel.classList.contains('MuiInputLabel-shrink')).toBeTruthy()

        const notesLabelCandidatesAfter = screen.getAllByText('Notes')
        const notesLabel = notesLabelCandidatesAfter.find(el => el.tagName === 'LABEL')
        expect(notesLabel).toBeTruthy()
        expect(notesLabel && notesLabel.classList.contains('MuiInputLabel-shrink')).toBeTruthy()
    }, 20000)
})
