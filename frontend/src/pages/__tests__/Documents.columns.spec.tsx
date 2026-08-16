import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import Documents from '../Documents'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient, setupDefaultApiMocks } from '../../test-utils/testApiMocks'
import * as api from '../../api/client'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'

const qc = createQueryClient()

describe('Documents table columns', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi, {})
        vi.spyOn(api, 'fetchDocuments').mockResolvedValue([
            { documentid: 1, documentname: 'Resume', document_type: 'Resume', documentdescription: 'My resume', engagements_count: 2 }
        ])
    })
    afterEach(() => { vi.restoreAllMocks() })

    it('renders exactly 6 columns (Name, Type, Description, Engagements, Date, Action)', async () => {
        render(
            <QueryClientProvider client={qc}>
                <Documents />
            </QueryClientProvider>
        )

        // wait for the table headers to render
        await waitFor(() => expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0))

        // Column headers should be present and equal to 6
        const headers = screen.getAllByRole('columnheader')
        expect(headers.length).toBe(6)

        // Ensure expected labels exist only in the table headers
        const headerTexts = headers.map(h => (h.textContent || '').replace(/\s+/g, ' ').trim())
        expect(headerTexts).toEqual(expect.arrayContaining(['Name', 'Type', 'Description', 'Engagements', 'Date', 'Action']))
    })
})
