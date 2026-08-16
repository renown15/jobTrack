import React from 'react'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient, setupDefaultApiMocks } from '../../test-utils/testApiMocks'
import * as api from '../../api/client'
import ApplicantSettings from '../ApplicantSettings'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'

// Provide an auth provider mock used by ApplicantSettings
vi.mock('../../auth/AuthProvider', () => ({
    useAuth: () => ({ applicant: { applicantId: 1 } })
}))

describe('ApplicantSettings (focused)', () => {
    beforeEach(() => {
        // diagnostic: mark beforeEach start
        // eslint-disable-next-line no-console
        console.log('TEST_BEFORE_EACH: start')
        setupDefaultApiMocks(vi)
        // eslint-disable-next-line no-console
        console.log('TEST_BEFORE_EACH: setupDefaultApiMocks completed')
        // ensure briefing APIs and upload are safe
        if ((api as any).fetchNavigatorBriefingQuestions) vi.spyOn(api as any, 'fetchNavigatorBriefingQuestions').mockResolvedValue([])
        if ((api as any).fetchApplicantBriefingBatches) vi.spyOn(api as any, 'fetchApplicantBriefingBatches').mockResolvedValue([])
        if ((api as any).fetchApplicantBriefingBatch) vi.spyOn(api as any, 'fetchApplicantBriefingBatch').mockResolvedValue([])
        if ((api as any).uploadApplicantAvatar) vi.spyOn(api as any, 'uploadApplicantAvatar').mockResolvedValue({})
        // diagnostic: mark beforeEach end
        // eslint-disable-next-line no-console
        console.log('TEST_BEFORE_EACH: end')
    })
    afterEach(() => vi.restoreAllMocks())

    it('renders applicant profile header and details', async () => {
        vi.spyOn(api, 'fetchApplicantSettings').mockResolvedValue({ applicantId: 1, firstName: 'Sam' })
        // diagnostic
        // eslint-disable-next-line no-console
        console.log('TEST: using statically imported Settings')

        // eslint-disable-next-line no-console
        console.log('TEST: about to render ApplicantSettings')
        render(
            <QueryClientProvider client={createQueryClient()}>
                <ApplicantSettings globalEditing={false} setGlobalEditing={() => { }} />
            </QueryClientProvider>
        )
        // eslint-disable-next-line no-console
        console.log('TEST: render call completed')

        // header should render
        await screen.findByText(/Applicant profile/i)
        // wait for first name to populate
        await waitFor(() => expect((screen.getByLabelText(/First name/i) as HTMLInputElement).value).toBe('Sam'))
    })

    it('calls updateApplicantSettings when Save clicked', async () => {
        const applicantData = { applicantId: 1, firstName: 'Old' }
        vi.spyOn(api, 'fetchApplicantSettings').mockResolvedValue(applicantData)
        const upd = vi.spyOn(api, 'updateApplicantSettings').mockResolvedValue({})
        const mod = await import('../ApplicantSettings')
        const SettingsComp = mod.default ?? mod

        render(
            <QueryClientProvider client={createQueryClient()}>
                <SettingsComp globalEditing={false} setGlobalEditing={() => { }} />
            </QueryClientProvider>
        )
        // (debug removed)

        await waitFor(() => expect((screen.getByLabelText(/First name/i) as HTMLInputElement).value).toBe('Old'))
        const firstName = screen.getByLabelText(/First name/i)
        // Use a deterministic change event to avoid flaky focus/clear behavior
        fireEvent.change(firstName, { target: { value: 'NewName' } })

        // find Save button and click (wait for UI to render)
        const saveBtn = await screen.findByRole('button', { name: /Save/i })
        await userEvent.click(saveBtn)

        await waitFor(() => expect(upd).toHaveBeenCalled())
        const calledWith = upd.mock.calls[0][0]
        expect(calledWith.firstName).toBe('NewName')
        expect(calledWith.applicantId).toBe(1)
    })
})
