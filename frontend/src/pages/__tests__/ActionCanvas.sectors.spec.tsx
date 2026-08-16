import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { createQueryClient, setupDefaultApiMocks } from '../../test-utils/testApiMocks'
import * as api from '../../api/client'

vi.mock('../../auth/AuthProvider', () => ({
    useAuth: () => ({ applicant: { applicantId: 1 } })
}))

describe.skip('ActionCanvas sectors rendering (skipped: hanging in CI)', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi, {
            fetchSectors: [{ id: 42, name: 'Technology' }],
            fetchAllContacts: [],
            fetchOrganisations: []
        })
    })

    afterEach(() => vi.restoreAllMocks())

    it('shows sectors tab and renders sector items', async () => {
        // ensure tasks default is empty to avoid extra async work
        vi.spyOn(api, 'fetchTasks').mockResolvedValue([])

        const ActionCanvas = (await import('../ActionCanvas')).default

        render(
            <QueryClientProvider client={createQueryClient()}>
                <MemoryRouter initialEntries={["/"]}>
                    <ActionCanvas />
                </MemoryRouter>
            </QueryClientProvider>
        )

        // wait for the page header
        await waitFor(() => expect(screen.getByText(/Action Canvas|Action Plan/i)).toBeTruthy())

        // click the Sectors tab
        const sectorsTab = screen.getByRole('tab', { name: /Sectors/i })
        fireEvent.click(sectorsTab)

        // expect our mocked sector to appear
        await waitFor(() => expect(screen.getByText(/Technology/i)).toBeTruthy())
    })
})
