import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import QuickCreateModal from './QuickCreateModal'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '../../../src/test-utils/testApiMocks'

// Use a fresh QueryClient per test to avoid cross-test cache leakage

describe('QuickCreateModal (smoke)', () => {
    it('renders create organisation form', () => {
        render(
            <QueryClientProvider client={createQueryClient()}>
                <QuickCreateModal open={true} onClose={() => { }} mode="organisation" />
            </QueryClientProvider>
        )
        expect(screen.getByLabelText(/Organisation name/i)).toBeTruthy()
        expect(screen.getByLabelText(/Sector/i)).toBeTruthy()
    })

    it('renders create jobrole form controls', () => {
        render(
            <QueryClientProvider client={createQueryClient()}>
                <QuickCreateModal open={true} onClose={() => { }} mode="jobrole" />
            </QueryClientProvider>
        )
        expect(screen.getByLabelText(/Role name/i)).toBeTruthy()
        expect(screen.getAllByLabelText(/Organisation/i).length).toBeGreaterThan(0)
        expect(screen.getAllByLabelText(/Contact/i).length).toBeGreaterThan(0)
    })
})
