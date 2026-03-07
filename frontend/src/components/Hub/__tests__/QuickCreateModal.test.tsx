import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { enableMuiNotchMock } from '../../../test-utils/muiNotchHelper'

// This test is flaky when run in parallel worker mode. It will skip itself
// during the main (multi-threaded) Vitest run unless the environment variable
// `VITEST_SINGLE_THREADED` is set to 'true'. The runner will invoke this
// file explicitly in single-threaded mode when needed.
const RUN_IN_SINGLE_THREADED = process.env.VITEST_SINGLE_THREADED === 'true'
const describeOrSkip = RUN_IN_SINGLE_THREADED ? describe : describe.skip

describeOrSkip('QuickCreateModal notch behavior (engagement)', () => {
    test('Notes field toggles notched when text is entered', async () => {
        // Enable the jsdom shim so MUI will compute the notched legend
        enableMuiNotchMock()

        // (test uses real MUI TextField; no per-test mock installed)

        // Import the component after installing the mock
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const QuickCreateModal = (await import('../../Hub/QuickCreateModal')).default

        const onClose = vi.fn?.() ?? (() => { })
        const onSuccess = async () => true

        // Provide an `editing` payload for engagement mode. Start with empty notes.
        const editing = {
            engagementid: null,
            contactid: 1,
            engagedate: '',
            notes: '',
            engagementtypeid: '',
        }

        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        render(
            <QueryClientProvider client={qc}>
                <QuickCreateModal open={true} onClose={onClose} mode="engagement" editing={editing} onSuccess={onSuccess} />
            </QueryClientProvider>
        )

        // Find the Notes textarea by its label (setupTests maps label -> aria-label)
        const notes = await screen.findByLabelText('Notes')
        expect(notes).toBeInTheDocument()

        const notesLabelCandidates = screen.getAllByText('Notes')
        const notesLabelBefore = notesLabelCandidates.find(el => el.tagName === 'LABEL')
        expect(notesLabelBefore).toBeTruthy()
        expect(notesLabelBefore && notesLabelBefore.classList.contains('MuiInputLabel-shrink')).toBeFalsy()

        // Type into the textarea and assert the label shrinks (indicates notched outline)
        await userEvent.type(notes, 'Follow up with candidate')
        expect(notes).toHaveValue('Follow up with candidate')

        const notesLabelCandidatesAfter = screen.getAllByText('Notes')
        const notesLabel = notesLabelCandidatesAfter.find(el => el.tagName === 'LABEL')
        expect(notesLabel).toBeTruthy()
        expect(notesLabel && notesLabel.classList.contains('MuiInputLabel-shrink')).toBeTruthy()

        // The notched outline should contain a legend > span with the label text
        const notesFieldRoot =
            notes.closest('.MuiOutlinedInput-root') || notes.closest('.MuiInput-root') || notes.parentElement?.closest('.MuiOutlinedInput-root')
        expect(notesFieldRoot).toBeTruthy()

        await waitFor(() => {
            const legendSpan = notesFieldRoot!.querySelector('.MuiOutlinedInput-notchedOutline legend span')
            expect(legendSpan).toBeTruthy()
            expect(legendSpan && legendSpan.textContent && legendSpan.textContent.trim()).toBe('Notes')
        })
    })
})
