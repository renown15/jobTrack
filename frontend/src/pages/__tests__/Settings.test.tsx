import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as api from '../../api/client'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient, setupDefaultApiMocks } from '../../test-utils/testApiMocks'

vi.mock('../../auth/AuthProvider', () => ({
    useAuth: () => ({ applicant: { applicantId: 1 } })
}))

describe('Settings (new test)', () => {
    // Increase timeout for this file's async behavior under parallel runs
    // (no per-file timeout here; use waitFor with explicit timeouts where necessary)
    beforeEach(() => {
        setupDefaultApiMocks(vi)
        // stub settings-related API calls to safe defaults
        const stubs: Array<[string, any]> = [
            ['fetchNavigatorBriefingQuestions', []],
            ['fetchApplicantBriefingBatches', []],
            ['fetchApplicantBriefingBatch', []],
            ['fetchNavigatorActions', []],
            ['createApplicantBriefingBatch', {}],
            ['uploadApplicantAvatar', {}],
        ]
        for (const [n, v] of stubs) if ((api as any)[n]) vi.spyOn(api as any, n).mockResolvedValue(v)
    })
    afterEach(() => vi.restoreAllMocks())

    it('renders applicant settings and saves changes', async () => {
        vi.spyOn(api, 'fetchApplicantSettings').mockResolvedValue({ applicantId: 1, firstName: 'Old' })
        const upd = vi.spyOn(api, 'updateApplicantSettings').mockResolvedValue({})

        const Settings = (await import('../Settings')).default

        render(
            <QueryClientProvider client={createQueryClient()}>
                <Settings />
            </QueryClientProvider>
        )

        await waitFor(() => expect((screen.getByLabelText(/First name/i) as HTMLInputElement).value).toBe('Old'))

        const firstNameInput = screen.getByLabelText(/First name/i)
        // Use direct change to avoid focus/clear race that sometimes concatenates old+new values
        fireEvent.change(firstNameInput, { target: { value: 'New' } })
        await userEvent.click(screen.getByRole('button', { name: /Save/i }))

        await waitFor(() => expect(upd).toHaveBeenCalled())
        expect(upd.mock.calls[0][0].firstName).toBe('New')
    })
})
