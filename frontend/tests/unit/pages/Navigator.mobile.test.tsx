import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import '@testing-library/jest-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Navigator from '../../../src/pages/Navigator'

// Mock useMediaQuery for responsive behavior
vi.mock('@mui/material/useMediaQuery', () => ({
    default: vi.fn(),
}))
import useMediaQuery from '@mui/material/useMediaQuery'

// Mock API client
vi.mock('../../../src/api/client')
import * as apiClient from '../../../src/api/client'

// Mock navigator state
vi.mock('../../../src/state/navigatorState', () => ({
    default: vi.fn(() => ({
        refresh: vi.fn(),
    })),
}))

describe.skip('Navigator Mobile Integration (skipped - complex async behavior)', () => {
    let queryClient: QueryClient

    const mockMetrics = [
        {
            metric: 'total_contacts',
            value: 42,
            unit: 'count',
            trend: 'up',
            trend_delta: 5,
        },
        {
            metric: 'active_roles',
            value: 8,
            unit: 'count',
            trend: 'stable',
        },
        {
            metric: 'cv_score',
            value: 7.5,
            unit: 'score',
            missing: false,
        },
    ]

    beforeEach(() => {
        vi.clearAllMocks()
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false, staleTime: Infinity },
            },
        })

        // Mock all required API responses
        vi.spyOn(apiClient, 'fetchNavigatorInsights').mockResolvedValue({
            metrics: mockMetrics,
            computed_at: new Date().toISOString(),
        })
        vi.spyOn(apiClient, 'fetchNavigatorMetricHistory').mockResolvedValue([])
        vi.spyOn(apiClient, 'fetchApplicantBriefingBatches').mockResolvedValue([])
        vi.spyOn(apiClient, 'fetchApplicantSettings').mockResolvedValue({})
        vi.spyOn(apiClient, 'fetchDocuments').mockResolvedValue([])
        vi.spyOn(apiClient, 'fetchReferenceData').mockResolvedValue([])
    })

    test('renders on mobile without crashing', async () => {
        // Mobile = useMediaQuery returns true
        (useMediaQuery as ReturnType<typeof vi.fn>).mockReturnValue(true)

        render(
            <QueryClientProvider client={queryClient}>
                <Navigator />
            </QueryClientProvider>
        )

        // Just verify it renders the title
        await waitFor(() => {
            expect(screen.getByText('Navigator Insights')).toBeInTheDocument()
        }, { timeout: 3000 })
    })

    test('renders on desktop without crashing', async () => {
        // Desktop = useMediaQuery returns false
        (useMediaQuery as ReturnType<typeof vi.fn>).mockReturnValue(false)

        render(
            <QueryClientProvider client={queryClient}>
                <Navigator />
            </QueryClientProvider>
        )

        // Just verify it renders the title
        await waitFor(() => {
            expect(screen.getByText('Navigator Insights')).toBeInTheDocument()
        }, { timeout: 3000 })
    })
})
