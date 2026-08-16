import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { enableMuiNotchMock } from '../../../test-utils/muiNotchHelper'

describe('Networking Add Event notch behavior', () => {
    // Allow more time for MUI measurement & dynamic imports under parallel runs
    test('Event name field toggles notched when text is entered', async () => {
        // (test uses real MUI TextField; no per-test mock installed)
        // enable the notch measurement shim so MUI will populate the legend
        enableMuiNotchMock()

        // Mock API client to avoid network calls used by Networking component
        // Use vi.mock so the mock is applied before the component import
        vi.mock('../../../api/client', () => {
            return {
                __esModule: true,
                fetchNetworkingEvents: async () => [],
                createNetworkingEvent: async () => ({}),
                fetchEventTasks: async () => [],
                addEventTask: async () => ({}),
                deleteEventTaskLink: async () => ({}),
                fetchReferenceData: async () => [],
                createTask: async () => ({}),
                deleteNetworkingEvent: async () => ({})
            }
        })

        // Ensure fetchNetworkingEvents returns an array (override any default test mocks)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const apiMod = await import('../../../api/client')
        if (apiMod && typeof apiMod.fetchNetworkingEvents === 'function') {
            vi.spyOn(apiMod, 'fetchNetworkingEvents').mockResolvedValue([])
        }

        // Import component after mocks/spies are in place
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Networking = (await import('../Networking')).default

        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        render(
            <QueryClientProvider client={qc}>
                <Networking />
            </QueryClientProvider>
        )

        // Open the Add Event dialog
        const addBtn = await screen.findByRole('button', { name: /Add event/i })
        expect(addBtn).toBeInTheDocument()
        await userEvent.click(addBtn)

        // Event name field — prefer structural checks that reflect runtime
        const name = await screen.findByLabelText('Event name')
        expect(name).toBeInTheDocument()

        // Initially label shouldn't be shrunk — select the LABEL element by visible text
        const nameLabelCandidatesBefore = screen.getAllByText('Event name')
        const nameLabelBefore = nameLabelCandidatesBefore.find(el => el.tagName === 'LABEL')
        expect(nameLabelBefore).toBeTruthy()
        expect(nameLabelBefore && nameLabelBefore.classList.contains('MuiInputLabel-shrink')).toBeFalsy()

        await userEvent.type(name, 'Community meetup')
        expect(name).toHaveValue('Community meetup')

        // After typing the label should shrink (indicates notched outline)
        const nameLabelCandidatesAfter = screen.getAllByText('Event name')
        const nameLabel = nameLabelCandidatesAfter.find(el => el.tagName === 'LABEL')
        expect(nameLabel).toBeTruthy()
        expect(nameLabel && nameLabel.classList.contains('MuiInputLabel-shrink')).toBeTruthy()

        // Also assert the notched outline legend contains the label text
        const nameFieldRoot = (name as HTMLElement).closest('.MuiOutlinedInput-root')
        const nameFieldset = nameFieldRoot?.querySelector('.MuiOutlinedInput-notchedOutline')
        const nameLegendSpan = nameFieldset?.querySelector('legend span')
        expect(nameLegendSpan).toBeTruthy()
        expect(nameLegendSpan && nameLegendSpan.textContent).toContain('Event name')
    })
})
