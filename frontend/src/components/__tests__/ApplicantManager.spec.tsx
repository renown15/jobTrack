import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ApplicantManager from '../Admin/ApplicantManager'
import * as api from '../../api/client'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

describe('ApplicantManager actions', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('renders action buttons and calls admin APIs', async () => {
        const mockSettings = { applicantid: 1, isSuperuser: true }
        vi.spyOn(api, 'fetchApplicantSettings').mockResolvedValue(mockSettings)

        const applicant = {
            applicantId: 99,
            firstName: 'Test',
            lastName: 'User',
            email: 'test@example.com',
            lastLogin: null,
            contactsCount: 0,
            organisationsCount: 0,
            rolesCount: 0,
            engagementsCount: 0,
            networkingCount: 0,
            leadsCount: 0,
            actionsCount: 0,
            navigatorSnapshotsCount: 0,
            isActive: true,
            isSuperuser: false,
        }

        vi.spyOn(api, 'fetchAllApplicantsSummary').mockResolvedValue([applicant])
        const statusSpy = vi.spyOn(api, 'adminUpdateApplicantStatus').mockResolvedValue({ ok: true, isActive: false })
        const superSpy = vi.spyOn(api, 'adminUpdateApplicantSuperuser').mockResolvedValue({ ok: true, isSuperuser: true })
        const clearSpy = vi.spyOn(api, 'adminClearApplicantPassword').mockResolvedValue({ ok: true })

        const qc = new QueryClient()
        render(
            <QueryClientProvider client={qc}>
                <ApplicantManager />
            </QueryClientProvider>
        )

        // Wait for table row to appear
        await waitFor(() => expect(screen.getByText(/test@example.com/i)).toBeInTheDocument())

        const activeSwitch = screen.getByRole('checkbox', { name: /Active test@example.com/i })
        await userEvent.click(activeSwitch)

        await waitFor(() => expect(statusSpy).toHaveBeenCalledWith(99, false))

        const superSwitch = screen.getByRole('checkbox', { name: /Superuser test@example.com/i })
        await userEvent.click(superSwitch)
        await waitFor(() => expect(superSpy).toHaveBeenCalledWith(99, true))

        const clearBtn = screen.getByRole('button', { name: /Reset/i })
        // Mock confirm dialog to return true
        vi.stubGlobal('confirm', () => true)
        await userEvent.click(clearBtn)
        await waitFor(() => expect(clearSpy).toHaveBeenCalledWith(99))
        // cleanup stub
        // @ts-ignore
        vi.unstubAllGlobals()
    })
})
