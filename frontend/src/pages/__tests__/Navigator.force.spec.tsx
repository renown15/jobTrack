import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import Navigator from '../Navigator'
import { createQueryClient, setupDefaultApiMocks } from '../../test-utils/testApiMocks'
import * as api from '../../api/client'
import * as currentApplicant from '../../auth/currentApplicant'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'

describe('Navigator initial force refresh', () => {
    const qc = createQueryClient()

    beforeEach(() => {
        setupDefaultApiMocks(vi)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it.skip('calls fetchNavigatorInsightsForce once and refreshes metric history', async () => {
        // Ensure an applicant id is present so the effect runs
        vi.spyOn(currentApplicant, 'getApplicantId').mockReturnValue(123)

        const forceSpy = vi.spyOn(api, 'fetchNavigatorInsightsForce').mockResolvedValue({ metrics: [{ metric: 'm' }], computed_at: new Date().toISOString() })
        const historySpy = vi.spyOn(api, 'fetchNavigatorMetricHistory').mockResolvedValue([{ id: 1, created_at: new Date().toISOString() }])

        render(
            <QueryClientProvider client={qc}>
                <Navigator />
            </QueryClientProvider>
        )

        // Wait for the force-refresh call to be invoked
        await waitFor(() => expect(forceSpy).toHaveBeenCalledTimes(1))

        // And ensure metric history was refreshed afterwards
        await waitFor(() => expect(historySpy).toHaveBeenCalled())
    })
})
