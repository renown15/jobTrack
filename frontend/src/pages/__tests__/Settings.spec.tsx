import React from 'react'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as api from '../../api/client'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient, setupDefaultApiMocks } from '../../test-utils/testApiMocks'

// Mock heavy UI pieces to avoid import-time side-effects
vi.mock('../../components/Shared/Toast', () => ({ __esModule: true, default: (props: any) => React.createElement('div', {}, props.message || '') }))
vi.mock('../../components/ExportData/ExportToSpreadsheet', () => ({ __esModule: true, default: () => React.createElement('div', {}, 'Export') }))

// Provide a default AuthProvider mock
vi.mock('../../auth/AuthProvider', () => ({
    useAuth: () => ({ applicant: { applicantId: 1 } })
}))

describe('Settings component (cleaned)', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi)
        const safe: Array<[string, any]> = [
            ['fetchNavigatorBriefingQuestions', []],
            ['fetchApplicantBriefingBatches', []],
            ['fetchApplicantBriefingBatch', []],
            ['fetchNavigatorActions', []],
            ['createApplicantBriefingBatch', {}],
            ['uploadApplicantAvatar', {}],
            ['fetchSectors', []],
        ]
        for (const [n, v] of safe) if ((api as any)[n]) vi.spyOn(api as any, n).mockResolvedValue(v)
    })

    afterEach(() => vi.restoreAllMocks())

    it('renders header and default applicant tab', async () => {
        vi.spyOn(api, 'fetchApplicantSettings').mockResolvedValue({ applicantId: 1 })
        const Settings = (await import('../Settings')).default

        render(
            <QueryClientProvider client={createQueryClient()}>
                <Settings />
            </QueryClientProvider>
        )

        expect(screen.getByRole('heading', { name: /Settings/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Applicant/i })).toBeInTheDocument()
    })

    it('saves applicant details calling updateApplicantSettings', async () => {
        const applicantData = { applicantId: 1, firstName: 'Old', lastName: 'Name', email: 'old@example.com', phone: '123' }
        vi.spyOn(api, 'fetchApplicantSettings').mockResolvedValue(applicantData)
        const upd = vi.spyOn(api, 'updateApplicantSettings').mockResolvedValue({})

        const Settings = (await import('../Settings')).default
        render(
            <QueryClientProvider client={createQueryClient()}>
                <Settings />
            </QueryClientProvider>
        )

        await waitFor(() => expect((screen.getByLabelText(/First name/i) as HTMLInputElement).value).toBe('Old'))

        const firstName = screen.getByLabelText(/First name/i)
        // Use deterministic change to avoid flaky clear/type under parallel runs
        fireEvent.change(firstName, { target: { value: 'NewName' } })

        // click the page-level Save button (await to avoid racing loading state)
        const saveBtn = await screen.findByRole('button', { name: /Save/i })
        await userEvent.click(saveBtn)

        await waitFor(() => expect(upd).toHaveBeenCalled())
        const calledWith = upd.mock.calls[0][0]
        expect(calledWith.firstName).toBe('NewName')
        expect(calledWith.applicantId).toBe(1)
    })

    it('saves navigator briefing answers when on briefing tab', async () => {
        vi.spyOn(api, 'fetchApplicantSettings').mockResolvedValue({ applicantId: 1 })
        vi.spyOn(api, 'fetchNavigatorBriefingQuestions').mockResolvedValue([{ questionid: 1, questiontext: 'Q1' }])
        const createBatch = vi.spyOn(api, 'createApplicantBriefingBatch').mockResolvedValue({})

        const Settings = (await import('../Settings')).default
        render(
            <QueryClientProvider client={createQueryClient()}>
                <Settings />
            </QueryClientProvider>
        )

        await userEvent.click(await screen.findByRole('button', { name: /Navigator Briefing/i }))
        await screen.findByText('Q1')
        const textareas = screen.getAllByRole('textbox')
        expect(textareas.length).toBeGreaterThan(0)
        await userEvent.type(textareas[0], 'Answer1')

        const saves = screen.getAllByRole('button', { name: /Save/i })
        await userEvent.click(saves[saves.length - 1])

        await waitFor(() => expect(createBatch).toHaveBeenCalled())
    })

})
