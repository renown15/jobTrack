import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import Documents from '../Documents'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient, setupDefaultApiMocks } from '../../test-utils/testApiMocks'
import * as api from '../../api/client'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'

describe('Documents engagement count refresh', () => {
    const qc = createQueryClient()

    beforeEach(() => {
        setupDefaultApiMocks(vi, {})
    })
    afterEach(() => { vi.restoreAllMocks() })

    it('updates engagements count after documents query is invalidated/refetched', async () => {
        // First render: fetchDocuments returns count 1
        vi.spyOn(api, 'fetchDocuments')
            .mockResolvedValueOnce([{ documentid: 1, documentname: 'Resume', engagements_count: 1 }])
            .mockResolvedValueOnce([{ documentid: 1, documentname: 'Resume', engagements_count: 0 }])

        render(
            <QueryClientProvider client={qc}>
                <Documents />
            </QueryClientProvider>
        )

        // initial render shows 1 (match exact text to avoid other labelled buttons)
        await waitFor(() => expect(screen.getByText(/^1$/)).toBeTruthy())

        // simulate an external update that invalidates the documents query
        // Documents listens for a window "documents:refresh" event
        window.dispatchEvent(new Event('documents:refresh'))

        // after refetch, the count should update to 0
        await waitFor(() => expect(screen.getByText(/^0$/)).toBeTruthy())
    })
})
