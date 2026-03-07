import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Contacts from '../../../src/pages/Contacts'
import * as apiClient from '../../../src/api/client'
import { vi } from 'vitest'

// Mock MUI useMediaQuery so we can force mobile rendering in tests
vi.mock('@mui/material/useMediaQuery', () => ({ default: vi.fn() }))
import useMediaQuery from '@mui/material/useMediaQuery'

describe('Contacts mobile rendering', () => {
    let queryClient: QueryClient

    beforeEach(() => {
        vi.clearAllMocks()
            // Force mobile via useMediaQuery mock
            ; (useMediaQuery as any).mockReturnValue(true)

        queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

        vi.spyOn(apiClient, 'fetchContacts').mockResolvedValue({
            items: [
                { contactid: 1, name: 'Alice Example', firstname: 'Alice', lastname: 'Example' }
            ], total: 1
        })
    })

    afterEach(() => {
        ; (useMediaQuery as any).mockReset()
    })

    it('renders mobile contacts list when forced mobile', async () => {
        render(
            <QueryClientProvider client={queryClient}>
                <Contacts />
            </QueryClientProvider>
        )

        await waitFor(() => {
            expect(screen.getByText('Alice Example')).toBeInTheDocument()
        })
    })
})
