import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import ContactsTable from './ContactsTable'
import { createQueryClient, setupDefaultApiMocks } from '../../test-utils/testApiMocks'
import * as api from '../../api/client'

const qc = createQueryClient()

const sampleContacts = [
    { contactid: 1, name: 'Rec A', role_type_id: 99, current_organization: 'OrgX' },
    { contactid: 2, name: 'Other B', role_type_id: 5, current_organization: 'OrgY' },
    { contactid: 3, name: 'Other C', role_type_id: 5, current_organization: 'OrgZ' },
]

describe('ContactsTable filtering with onlyIds and roleTypeFilterId', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi, { fetchAllContacts: sampleContacts })
    })
    afterEach(() => { vi.restoreAllMocks() })

    it('shows only contacts in onlyIds when no roleTypeFilterId provided', async () => {
        render(
            <QueryClientProvider client={qc}>
                <ContactsTable onlyIds={[1, 2]} />
            </QueryClientProvider>
        )

        // Wait for rows to render
        await waitFor(() => expect(screen.getByText(/Rec A/)).toBeTruthy())
        expect(screen.getByText(/Other B/)).toBeTruthy()
        // Contact not in onlyIds should not appear
        expect(screen.queryByText(/Other C/)).toBeNull()
    })

    it('when roleTypeFilterId provided, fetchAllContacts is expected to return only matching roles; ContactsTable respects that and only shows recruiters in onlyIds', async () => {
        // override fetchAllContacts to simulate server-side filtering by roleTypeFilterId
        vi.spyOn(api, 'fetchAllContacts').mockImplementation((roleTypeFilterId?: number, orgFilterId?: number) => {
            if (Number(roleTypeFilterId) === 99) return Promise.resolve([sampleContacts[0]])
            return Promise.resolve(sampleContacts)
        })

        render(
            <QueryClientProvider client={qc}>
                <ContactsTable roleTypeFilterId={99} onlyIds={[1, 2]} />
            </QueryClientProvider>
        )

        // Wait for recruiter row to render
        await waitFor(() => expect(screen.getByText(/Rec A/)).toBeTruthy())
        // Other B should NOT appear because server returned only recruiter rows for roleTypeFilterId=99
        expect(screen.queryByText(/Other B/)).toBeNull()
    })
})
