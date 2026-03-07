import React from 'react'
import { render } from '@testing-library/react'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient, setupDefaultApiMocks } from '../../test-utils/testApiMocks'
import * as api from '../../api/client'
import { fireEvent } from '@testing-library/react'

vi.mock('../auth/AuthProvider', () => ({
    useAuth: () => ({ applicant: { applicantId: 1 } })
}))

describe('Coaching page', () => {
    // increase timeout for this file's async imports and network-like setup
    // under parallel runs the module import can take longer; extend to 20s
    // (no per-file timeout here) allow individual waits to control timing
    beforeEach(() => {
        // Provide a small set of reference data and contacts so the component
        // can compute coaches. We expect the component to still throw due to
        // a missing state variable (`openCreateSession`) in the current code.
        setupDefaultApiMocks(vi, {
            fetchReferenceData: [{ refid: 10, refvalue: 'Coach' }],
            fetchAllContacts: [{ contactid: 1, name: 'Alice Coach', role_type_id: 10 }]
        })
    })
    afterEach(() => vi.restoreAllMocks())

    it('renders Coaching page header and add coach button', async () => {
        const Coaching = (await import('../Coaching')).default

        const { findByText, findByRole } = render(
            <QueryClientProvider client={createQueryClient()}>
                <Coaching />
            </QueryClientProvider>
        )

        // header (match exact header text to avoid matching "Coaching Session")
        expect(await findByText(/^Coaching$/i)).toBeTruthy()
        // add coach button (match exact label)
        expect(await findByRole('button', { name: '+ ADD COACH' })).toBeTruthy()
        // Coaching Actions section
        expect(await findByText(/Coaching Actions/i)).toBeTruthy()
    })

    it('renders actions controls and marks coaching-linked tasks', async () => {
        // prepare mocks: include a coaching target type and two tasks
        setupDefaultApiMocks(vi, {
            fetchReferenceData: [{ refid: 20, refvalue: 'Coaching' }],
            fetchAllContacts: [{ contactid: 1, name: 'Alice Coach', role_type_id: 20 }]
        })

        // setupDefaultApiMocks does not override fetchTasks; mock it explicitly
        vi.spyOn(api, 'fetchTasks').mockResolvedValue([
            { taskid: 101, name: 'Prepare plan', duedate: '2025-12-01' },
            { taskid: 102, name: 'Follow up' }
        ])

        // mock fetchTaskTargets so task 101 has a coaching target
        vi.spyOn(api, 'fetchTaskTargets').mockImplementation(async (taskid: number) => {
            if (Number(taskid) === 101) return [{ targettype: 20, targetid: 1 }]
            return []
        })

        const Coaching = (await import('../Coaching')).default

        const { findByRole, findByText, findAllByText } = render(
            <QueryClientProvider client={createQueryClient()}>
                <Coaching />
            </QueryClientProvider>
        )
        // Add Action button
        expect(await findByRole('button', { name: '+ Add Action' })).toBeTruthy()
        // Coaching Actions header and column
        expect(await findByText(/Coaching Actions/i)).toBeTruthy()
        expect(await findByRole('columnheader', { name: /Coaching Action/i })).toBeTruthy()

        // verify the checkbox for the 'Prepare plan' row is checked
        const matches = await findAllByText(/Prepare plan/i)
        const taskCell = matches.find((n: any) => n.closest && n.closest('tr')) as HTMLElement | undefined
        expect(taskCell).toBeTruthy()
        const row = taskCell!.closest('tr')
        expect(row).toBeTruthy()
        // within the row there should be a checkbox checked
        const checkbox = row!.querySelector('input[type="checkbox"]') as HTMLInputElement | null
        expect(checkbox).not.toBeNull()
        expect(checkbox!.checked).toBe(true)
    })

    it('opens targets and logs modals when column buttons clicked', async () => {
        setupDefaultApiMocks(vi, {
            fetchReferenceData: [{ refid: 20, refvalue: 'Coaching' }],
            fetchAllContacts: [{ contactid: 1, name: 'Alice Coach', role_type_id: 20 }]
        })

        vi.spyOn(api, 'fetchTasks').mockResolvedValue([
            { taskid: 101, name: 'Prepare plan', duedate: '2025-12-01' }
        ])
        vi.spyOn(api, 'fetchTaskTargets').mockResolvedValue([{ id: 999, targettype: 20, targetid: 1, created_at: '2025-12-01' }])
        vi.spyOn(api, 'fetchTaskLogs').mockResolvedValue([{ id: 1, commentary: 'Note', logdate: '2025-12-02' }])

        const Coaching = (await import('../Coaching')).default

        const { findByText, findByRole } = render(
            <QueryClientProvider client={createQueryClient()}>
                <Coaching />
            </QueryClientProvider>
        )

        // wait for table row
        const taskCell = await findByText(/Prepare plan/i)
        const row = taskCell.closest('tr') as HTMLElement
        // Targets collapsed view shows a button with count '1'
        const targetsBtn = row.querySelector('button') as HTMLElement
        expect(targetsBtn).toBeTruthy()
        fireEvent.click(targetsBtn)
        // modal should show
        expect(await findByText(/Manage targets/i)).toBeTruthy()

        // close modal
        const closeBtn = await findByRole('button', { name: /Close/i })
        fireEvent.click(closeBtn)

        // Find the index of the 'Logs' column header and click the button in that cell for this row
        const table = row.closest('table') as HTMLTableElement | null
        expect(table).toBeTruthy()
        const headers = Array.from(table!.querySelectorAll('th'))
        const logsIndex = headers.findIndex(h => /Logs/i.test(h.textContent || ''))
        expect(logsIndex).toBeGreaterThan(-1)
        const cells = Array.from(row.querySelectorAll('td'))
        const logsCell = cells[logsIndex]
        expect(logsCell).toBeTruthy()
        const logsBtn = logsCell!.querySelector('button') as HTMLElement
        expect(logsBtn).toBeTruthy()
        fireEvent.click(logsBtn)
        expect(await findByText(/Activity logs for/i)).toBeTruthy()
    })
})
