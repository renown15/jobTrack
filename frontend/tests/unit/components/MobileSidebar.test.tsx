import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import MobileSidebar from '../../../src/components/MobileSidebar'
import { BrowserRouter } from 'react-router-dom'

describe('MobileSidebar', () => {
    it('renders navigation links and calls onClose when a link is clicked', () => {
        const onClose = vi.fn()
        render(
            <BrowserRouter>
                <MobileSidebar open={true} onClose={onClose} />
            </BrowserRouter>
        )

        // check some expected link labels
        expect(screen.getByText('Hub')).toBeTruthy()
        expect(screen.getByText('Navigator Insights')).toBeTruthy()
        expect(screen.getByText('Analytics Studio')).toBeTruthy()

        // clicking a link should call onClose (ListItem has onClick that calls it)
        fireEvent.click(screen.getByText('Hub'))
        expect(onClose).toHaveBeenCalled()
    })
})
