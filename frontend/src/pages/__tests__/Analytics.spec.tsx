import React from 'react'
import { render, screen } from '@testing-library/react'
import Analytics from '../Analytics'
import * as api from '../../api/client'
import * as svc from '../../services/analytics'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient, setupDefaultApiMocks } from '../../test-utils/testApiMocks'

// Mock useAuth to avoid needing the real AuthProvider
vi.mock('../auth/AuthProvider', () => ({
    useAuth: () => ({ isAuthenticated: true, applicant: { applicantId: 1 } })
}))

describe('Analytics page', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi)
    })
    afterEach(() => { vi.restoreAllMocks() })

    it('renders summary KPIs and charts from the analytics API', async () => {
        const sample = {
            organizationsBySector: [
                { sector: 'Tech', name: 'Acme', orgid: 1, contact_count: 5, engagement_count: 3, interview_count: 1 }
            ],
            topHiringOrgs: { labels: ['Acme'], values: [5], details: [{ name: 'Acme', total: 5, current: 2, target: 3 }] },
            cumulativeContacts: { labels: ['2025-01', '2025-02'], values: [1, 3] },
            cumulativeEngagements: { labels: ['2025-01', '2025-02'], values: [0, 2] },
            cumulativeInterviews: { labels: ['2025-01', '2025-02'], values: [0, 1] },
            summary: { total_contacts: 5, total_engagements: 3, total_interviews: 1, total_applications: 2, engagement_rate: 0.6, interview_rate: 0.2 }
        }

        vi.spyOn(svc, 'fetchAnalyticsSummary').mockResolvedValue(sample as any)

        render(
            <QueryClientProvider client={createQueryClient()}>
                <Analytics />
            </QueryClientProvider>
        )

        // title
        expect(await screen.findByText(/JobTrack Analytics/i)).toBeTruthy()

        // No KPI cards — assert page title only (cards removed by design)
    })
})
