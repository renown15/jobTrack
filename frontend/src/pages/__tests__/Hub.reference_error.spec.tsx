import React from 'react'
import { render } from '@testing-library/react'
import '@testing-library/jest-dom'
import Hub from '../../pages/Hub'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

describe('Hub component initialization', () => {
    test('renders without ReferenceError (no uninitialized variable access)', () => {
        // Rendering Hub should not throw a ReferenceError related to TDZ/ordering
        const qc = new QueryClient()
        expect(() =>
            render(
                <QueryClientProvider client={qc}>
                    <Hub />
                </QueryClientProvider>
            )
        ).not.toThrow()
    })
})
