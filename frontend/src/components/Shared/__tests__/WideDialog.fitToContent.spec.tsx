import React from 'react'
import { render, screen } from '@testing-library/react'
import WideDialog from '../WideDialog'

describe('WideDialog fitToContent', () => {
    it('sets paper to inline-block when fitToContent is true', () => {
        render(
            <WideDialog open={true} fitToContent={true} onClose={() => { }}>
                <div data-testid="inner" style={{ width: '320px' }}>inner</div>
            </WideDialog>
        )

        // Find an element with inline style display:inline-block (the Paper)
        const inlineElems = Array.from(document.querySelectorAll('div')).filter((d) => d.getAttribute('style') && d.getAttribute('style')!.includes('display: inline-block'))
        expect(inlineElems.length).toBeGreaterThan(0)

        // Ensure our inner content exists inside one of those inline-block containers
        const inner = screen.getByTestId('inner')
        const parent = inlineElems.find((el) => el.contains(inner))
        expect(parent).toBeDefined()
    })
})
