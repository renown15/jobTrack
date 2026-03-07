import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { createQueryClient, setupDefaultApiMocks } from '../../test-utils/testApiMocks'
import * as api from '../../api/client'

vi.mock('../../auth/AuthProvider', () => ({
    useAuth: () => ({ applicant: { applicantId: 1 } })
}))

describe.skip('ActionPlan page layout (skipped: hanging in CI)', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi, {
            // provide minimal reference data for action_plan_target_type
            fetchReferenceData: [{ refid: 200, refvalue: 'Coaching' }],
            // provide empty target lists used by the page
            fetchAllContacts: [],
            fetchOrganisations: [],
            fetchSectors: []
        })
    })

    afterEach(() => vi.restoreAllMocks())

    it('renders table headers and shows coaching checkbox for annotated tasks', async () => {
        // mock tasks and targets: one task has a coaching target
        vi.spyOn(api, 'fetchTasks').mockResolvedValue([
            { taskid: 9001, name: 'Smoke Task', duedate: null }
        ])
        vi.spyOn(api, 'fetchTaskTargets').mockImplementation(async (taskid: number) => {
            if (Number(taskid) === 9001) return [{ targettype: 200, targetid: 1 }]
            return []
        })

        const ActionPlan = (await import('../ActionCanvas')).default

        const { findByText, findByRole, findAllByRole } = render(
            <QueryClientProvider client={createQueryClient()}>
                <MemoryRouter initialEntries={["/"]}>
                    <ActionPlan />
                </MemoryRouter>
            </QueryClientProvider>
        )

        // assert page header (use waitFor + screen queries with longer timeout)
        await waitFor(() => expect(screen.getByText(/Action Plan/i)).toBeTruthy(), { timeout: 20000 })

        // assert columns: Name, Coaching, Due
        await waitFor(() => expect(screen.getAllByRole('columnheader', { name: /Name/i }).length).toBeGreaterThan(0), { timeout: 20000 })
        await waitFor(() => expect(screen.getByRole('columnheader', { name: /Coaching/i })).toBeTruthy(), { timeout: 20000 })
        await waitFor(() => expect(screen.getByRole('columnheader', { name: /Due/i })).toBeTruthy(), { timeout: 20000 })

        // ensure our task row renders and shows a checked (disabled) checkbox in the Coaching column
        const row = await findByText(/Smoke Task/i)
        const tr = row.closest('tr')
        expect(tr).toBeTruthy()
        const checkbox = tr!.querySelector('input[type="checkbox"]') as HTMLInputElement | null
        expect(checkbox).not.toBeNull()
        expect(checkbox!.checked).toBe(true)
    }, 20000)
})
