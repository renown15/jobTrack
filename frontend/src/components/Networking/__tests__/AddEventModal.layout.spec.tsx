import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Networking from '../Networking'
import * as apiClient from '../../../api/client'

describe('Networking Add Event modal layout', () => {
    beforeEach(() => {
        // Mock API calls used by the component to avoid network I/O
        vi.spyOn(apiClient, 'fetchNetworkingEvents').mockResolvedValue([])
        vi.spyOn(apiClient, 'fetchReferenceData').mockResolvedValue([])
        vi.spyOn(apiClient, 'createNetworkingEvent').mockResolvedValue({})
        vi.spyOn(apiClient, 'updateNetworkingEvent').mockResolvedValue({})
        vi.spyOn(apiClient, 'deleteNetworkingEvent').mockResolvedValue({})
        // other functions may be called lazily; provide harmless defaults
        if (!(apiClient as any).fetchEventTasks) (apiClient as any).fetchEventTasks = vi.fn().mockResolvedValue([])
    })

    it('opens the Add Event modal and shows a single date input for Event date', async () => {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        render(
            <QueryClientProvider client={qc}>
                <Networking />
            </QueryClientProvider>
        )

        // Open the Add event dialog
        const addBtn = screen.getByText(/Add event/i)
        fireEvent.click(addBtn)

        // The DatePicker uses the label "Event date" — ensure there's exactly one input for it
        const labelled = await screen.findAllByLabelText('Event date')
        expect(labelled.length).toBe(1)
        const input = labelled[0] as HTMLInputElement
        expect(input).toBeInTheDocument()
        expect(input.type).toBe('date')
    })
})
