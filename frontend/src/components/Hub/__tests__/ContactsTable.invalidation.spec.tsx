import React from 'react'
import { vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ContactsTable from '../ContactsTable'

vi.mock('../../../api/client', () => ({
    fetchAllContacts: vi.fn(() => Promise.resolve([
        { contactid: 1, name: 'Alice', engagement_count: 0, documents_count: 0, roles_count: 0, current_organization: '' }
    ])),
    fetchContactTaskCounts: vi.fn(() => Promise.resolve([])),
    fetchContactTasks: vi.fn(() => Promise.resolve([])),
    deleteContact: vi.fn(() => Promise.resolve({})),
    fetchReferenceData: vi.fn(() => Promise.resolve([])),
    fetchOrganisations: vi.fn(() => Promise.resolve([])),
    fetchJobRoles: vi.fn(() => Promise.resolve([])),
    fetchTasks: vi.fn(() => Promise.resolve([])),
}))

describe('ContactsTable — delete invalidations', () => {
    it('invalidates hub-level queries when a contact is deleted', async () => {
        const qc = new QueryClient()
        const spy = vi.spyOn(qc, 'invalidateQueries')

        render(
            <QueryClientProvider client={qc}>
                <ContactsTable />
            </QueryClientProvider>
        )

        // wait for the mocked contact to render
        await screen.findByText('Alice')

        // find the delete button for the contact and click it
        const deleteBtn = screen.getByLabelText('Delete contact 1')
        fireEvent.click(deleteBtn)

        // Confirm dialog should appear — click the Delete button
        await screen.findByText('Delete contact')
        const confirm = screen.getByText('Delete')
        fireEvent.click(confirm)

        // Wait for deleteContact to be called and for invalidations
        await waitFor(() => {
            expect(spy).toHaveBeenCalled()
        })

        // Expect specific hub-level keys to have been invalidated
        expect(spy).toHaveBeenCalledWith(['contactsList'])
        expect(spy).toHaveBeenCalledWith(['contactsCount'])
        expect(spy).toHaveBeenCalledWith(['analyticsSummary'])
        expect(spy).toHaveBeenCalledWith(['engagementsCount'])
    })
})
