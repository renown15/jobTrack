import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QuickCreateModal from './QuickCreateModal'
import { QueryClientProvider } from '@tanstack/react-query'
import * as api from '../../api/client'
import { vi } from 'vitest'
import { createQueryClient, setupDefaultApiMocks } from '../../test-utils/testApiMocks'

describe('QuickCreateModal nested organisation flow', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi, {
            fetchOrganisations: [],
            fetchReferenceData: [],
            fetchSectors: [],
            fetchContacts: { items: [], total: 0, page: 1, pageSize: 25 },
        })
    })

    it('sets parent organisation when nested create organisation succeeds', async () => {
        const created = { orgid: 999, name: 'Created Org' }
        const createSpy = vi.spyOn(api, 'createOrganisation').mockResolvedValue(created)

        const qc = createQueryClient()
        render(
            <QueryClientProvider client={qc}>
                <QuickCreateModal open={true} onClose={() => { }} mode="contact" />
            </QueryClientProvider>
        )

        // find the add organisation button in the parent modal and click it
        // Multiple elements share the same accessible name (icon button and text button).
        // Locate all matching buttons and prefer the IconButton that contains the AddIcon svg.
        const labelledBtns = await screen.findAllByLabelText(/Add organisation/i)
        const addBtn = labelledBtns.find((b) => Boolean(b.querySelector && b.querySelector('svg[data-testid="AddIcon"]'))) || labelledBtns[0]
        await userEvent.click(addBtn)

        // nested modal should open: find the Organisation name input and type
        const nameInput = await screen.findByLabelText(/Organisation name/i)
        await userEvent.type(nameInput, 'Created Org')

        // click Create in nested modal
        const createBtn = screen.getByRole('button', { name: /Create/i })
        await userEvent.click(createBtn)

        // wait for createOrganisation to have been called
        await waitFor(() => expect(createSpy).toHaveBeenCalled())

        // after nested modal closes, parent Autocomplete input labelled 'Organisation' should show created name
        await waitFor(async () => {
            const orgInputs = screen.getAllByLabelText(/^Organisation$/i)
            // ensure at least one input exists and has value
            const hasValue = orgInputs.some((input: HTMLElement) => (input as HTMLInputElement).value === 'Created Org')
            if (!hasValue) throw new Error('Parent Organisation input did not show created value')
        })
    })
})
