import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient, setupDefaultApiMocks } from '../../../test-utils/testApiMocks'

import ActionPlanTasksTable from '../ActionPlanTasksTable'
import * as api from '../../../api/client'

const qc = createQueryClient()

describe('ActionPlanTasksTable grouping', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi)
    })
    afterEach(() => vi.restoreAllMocks())

    it('shows a single Targets column with total count, expands to individual target columns', async () => {
        const tasks = [{ taskid: 1, name: 'Task One', duedate: null }]

        // Mock API to reflect runtime behaviour: component should fetch targets and target types when not provided
        vi.spyOn(api, 'fetchTaskTargets').mockImplementation(async (taskid: number) => {
            if (Number(taskid) === 1) return [
                { targettype: 1, targetid: 11 },
                { targettype: 2, targetid: 21 },
                { targettype: 1, targetid: 12 }
            ]
            return []
        })
        vi.spyOn(api, 'fetchReferenceData').mockImplementation(async (key?: string) => {
            if (key === 'action_plan_target_type') return [
                { refid: 1, refvalue: 'Contact' },
                { refid: 2, refvalue: 'Organisation' },
                { refid: 3, refvalue: 'Lead' },
                { refid: 4, refvalue: 'Sector' }
            ]
            return []
        })

        render(
            <QueryClientProvider client={qc}>
                <ActionPlanTasksTable tasks={tasks} />
            </QueryClientProvider>
        )

        // Wait for the task row
        await waitFor(() => expect(screen.getByText(/Task One/)).toBeTruthy())

        // Initially the header should show the grouped Targets column
        expect(screen.getByRole('columnheader', { name: /Targets/i })).toBeTruthy()
        // Individual headers should not be present yet
        expect(screen.queryByRole('columnheader', { name: /Contacts/i })).toBeNull()
        expect(screen.queryByRole('columnheader', { name: /Organisations/i })).toBeNull()

        // The row should show total targets = 3
        const row = screen.getByText(/Task One/).closest('tr')!
        expect(row).toBeTruthy()
        expect(row.querySelector('button')?.textContent).toMatch(/3/)

        // Expand targets via the header button
        const expandBtn = screen.getByRole('button', { name: /Expand targets/i })
        expect(expandBtn).toBeTruthy()
        fireEvent.click(expandBtn)

        // After expansion, individual target headers should appear
        await waitFor(() => {
            expect(screen.getByRole('columnheader', { name: /Contacts/i })).toBeTruthy()
            expect(screen.getByRole('columnheader', { name: /Organisations/i })).toBeTruthy()
        })

        // And the row should show the split counts: Contacts=2, Organisations=1
        expect(row.querySelector('button')?.textContent).toMatch(/2/) // first button in row is contacts count
        // find organisation count cell text
        expect(row).toHaveTextContent('1')
    })
})
