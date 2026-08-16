import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Documents from '../Documents'

describe('Documents page - Add dialog inputs', () => {
    test('renders Document Name and Description fields and they accept input', async () => {
        render(<Documents />)

        // Open the Add dialog by clicking the + Add document button
        const addBtn = await screen.findByRole('button', { name: /\+ Add document/i })
        fireEvent.click(addBtn)

        // The mocked MUI TextField exposes the label as aria-label (see setupTests.ts)
        const nameInput = await screen.findByLabelText('Document Name')
        expect(nameInput).toBeInTheDocument()

        // Change value and assert it is reflected
        fireEvent.change(nameInput, { target: { value: 'Test Document.pdf' } })
        await waitFor(() => expect((nameInput as HTMLInputElement).value).toBe('Test Document.pdf'))

        const descInput = await screen.findByLabelText('Description')
        expect(descInput).toBeInTheDocument()
        fireEvent.change(descInput, { target: { value: 'This is a description' } })
        await waitFor(() => expect((descInput as HTMLTextAreaElement).value).toBe('This is a description'))
    })
})
