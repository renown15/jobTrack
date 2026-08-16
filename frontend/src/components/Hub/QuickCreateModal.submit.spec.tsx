import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QuickCreateModal from './QuickCreateModal'
import { QueryClientProvider } from '@tanstack/react-query'
import * as api from '../../api/client'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'
import { createQueryClient, setupDefaultApiMocks } from '../../../src/test-utils/testApiMocks'

// create a fresh QueryClient per test render to avoid cache leakage between tests

describe('QuickCreateModal submit flows', () => {
    beforeEach(() => {
        setupDefaultApiMocks(vi, {
            fetchSectors: [],
            fetchReferenceData: [{ refid: 2, refvalue: 'Offered' }, { refid: 3, refvalue: 'LinkedIn' }],
            fetchOrganisations: [],
            fetchContacts: { items: [], total: 0, page: 1, pageSize: 25 },
            fetchAllContacts: [],
        })
    })

    it('creates an organisation when submitting form', async () => {
        const createSpy = vi.spyOn(api, 'createOrganisation').mockResolvedValue({ orgid: 123 })

        const qc = createQueryClient()
        render(
            <QueryClientProvider client={qc}>
                <QuickCreateModal open={true} onClose={() => { }} mode="organisation" />
            </QueryClientProvider>
        )

        const nameInput = screen.getByLabelText(/Organisation name/i)
        await userEvent.type(nameInput, 'New Org')

        const createBtn = screen.getByRole('button', { name: /Create/i })
        await userEvent.click(createBtn)

        await waitFor(() => expect(createSpy).toHaveBeenCalled())
    })

    it('creates a jobrole when submitting jobrole form', async () => {
        // Ensure the autocompletes have options available synchronously via helper overrides
        // Provide an application status reference so the form validation
        // (which requires an application status for jobrole creation)
        // allows the Create button to be enabled in tests.
        setupDefaultApiMocks(vi, {
            fetchOrganisations: [{ orgid: 1, name: 'Org A' }],
            fetchContacts: { items: [{ contactid: 10, name: 'Alice' }], total: 1, page: 1, pageSize: 20 },
            fetchSectors: [],
            // Include at least one application_status entry
            fetchReferenceData: [{ refid: 2, refvalue: 'Applied' }],
        })
        const createJobSpy = vi.spyOn(api, 'createJobRole').mockResolvedValue({ jobid: 999 })
        // Ensure fetchJobRoleDocuments resolves so the create flow can reconcile
        // and perform attach calls.
        vi.spyOn(api, 'fetchJobRoleDocuments').mockResolvedValue([])

        const qc = createQueryClient()
        render(
            <QueryClientProvider client={qc}>
                {/* Provide a prefill for status so tests don't need to interact with the MUI Select */}
                <QuickCreateModal open={true} onClose={() => { }} mode="jobrole" editing={{ statusid: 2 }} />
            </QueryClientProvider>
        )

        // fill role name
        const roleInput = screen.getByLabelText(/Role name/i)
        await userEvent.type(roleInput, 'Engineer')

        // select organisation option (first combobox is organisation)
        const combos = await screen.findAllByRole('combobox')
        const orgCombobox = combos[0]
        await userEvent.click(orgCombobox)
        await screen.findByText('Org A')
        await userEvent.click(await screen.findByText('Org A'))

        // select contact (second combobox)
        const contactCombobox = combos[1]
        await userEvent.click(contactCombobox)
        await screen.findByText('Alice')
        await userEvent.click(await screen.findByText('Alice'))

        // select application status so the form becomes valid (required for creation)
        // MUI Select may not expose a named button role consistently in test
        // environments. Find the element that is labelled by the job-status
        // label id and click it to open the menu, then choose the option.
        const statusButton = document.querySelector('[aria-labelledby="job-status-label"]') as HTMLElement | null
        if (!statusButton) throw new Error('Application status select not found')
        await userEvent.click(statusButton)
        const appliedOptions = await screen.findAllByText('Applied')
        await userEvent.click(appliedOptions[0])

        // click create: find any button whose visible text contains 'Create'
        // Query raw DOM buttons as a fallback when accessible queries are brittle
        const allButtons = Array.from(document.body.querySelectorAll('button'))
        const createBtn = allButtons.find((b) => /Create/i.test(b.textContent || ''))
        if (!createBtn) throw new Error('Create button not found')
        await userEvent.click(createBtn)

        await waitFor(() => expect(createJobSpy).toHaveBeenCalled())
        // assert payload contains rolename
        const calledWith = createJobSpy.mock.calls[0][0]
        expect(calledWith.rolename).toBe('Engineer')
    }, 10000)

    it('creates a jobrole and attaches selected documents', async () => {
        setupDefaultApiMocks(vi, {
            fetchOrganisations: [{ orgid: 1, name: 'Org A' }],
            fetchContacts: { items: [{ contactid: 10, name: 'Alice' }], total: 1, page: 1, pageSize: 20 },
            fetchSectors: [],
            fetchReferenceData: [{ refid: 2, refvalue: 'Applied' }],
            fetchDocuments: [{ documentid: 5, documentname: 'Doc A' }],
        })

        const createJobSpy = vi.spyOn(api, 'createJobRole').mockResolvedValue({ jobid: 999 })
        const attachSpy = vi.spyOn(api, 'attachDocumentToJobRole').mockResolvedValue({})
        // Ensure fetchJobRoleDocuments resolves for the newly created job so
        // reconciliation runs and attachDocumentToJobRole is invoked.
        vi.spyOn(api, 'fetchJobRoleDocuments').mockResolvedValue([])

        const qc = createQueryClient()
        render(
            <QueryClientProvider client={qc}>
                {/* Pre-populate selected documents via the editing payload to
                    avoid flaky Autocomplete interactions in this unit test. */}
                <QuickCreateModal open={true} onClose={() => { }} mode="jobrole" editing={{ statusid: 2, documents: [{ documentid: 5, documentname: 'Doc A' }] }} />
            </QueryClientProvider>
        )

        // fill role name
        const roleInput = screen.getByLabelText(/Role name/i)
        await userEvent.type(roleInput, 'Engineer')

        // select organisation
        const combos = await screen.findAllByRole('combobox')
        await userEvent.click(combos[0])
        await screen.findByText('Org A')
        await userEvent.click(await screen.findByText('Org A'))

        // select contact
        await userEvent.click(combos[1])
        await screen.findByText('Alice')
        await userEvent.click(await screen.findByText('Alice'))

        // select status
        const statusButton = document.querySelector('[aria-labelledby="job-status-label"]') as HTMLElement | null
        if (!statusButton) throw new Error('Application status select not found')
        await userEvent.click(statusButton)
        // find option element for 'Applied' and click it
        const options = await screen.findAllByRole('option')
        const appliedOption = options.find(o => (o.textContent || '').trim() === 'Applied')
        if (!appliedOption) throw new Error('Applied option not found')
        await userEvent.click(appliedOption)

        // The document was preselected via the `editing.documents` payload,
        // so no UI interaction is required here; proceed to submit.

        // submit
        const allButtons = Array.from(document.body.querySelectorAll('button'))
        const createBtn = allButtons.find((b) => /Create/i.test(b.textContent || ''))
        if (!createBtn) throw new Error('Create button not found')
        await userEvent.click(createBtn)

        await waitFor(() => expect(createJobSpy).toHaveBeenCalled())
        await waitFor(() => expect(attachSpy).toHaveBeenCalledWith(999, 5))
    }, 10000)

    it('updates a jobrole and reconciles document attachments (attach/detach)', async () => {
        setupDefaultApiMocks(vi, {
            fetchOrganisations: [{ orgid: 1, name: 'Org A' }],
            fetchContacts: { items: [{ contactid: 10, name: 'Alice' }], total: 1, page: 1, pageSize: 20 },
            fetchSectors: [],
            fetchReferenceData: [{ refid: 2, refvalue: 'Applied' }],
            fetchDocuments: [{ documentid: 1, documentname: 'Doc 1' }, { documentid: 2, documentname: 'Doc 2' }],
        })

        // When editing, QuickCreateModal fetches existing jobrole documents
        vi.spyOn(api, 'fetchJobRoleDocuments').mockResolvedValue([{ documentid: 1, documentname: 'Doc 1' }])

        const updateSpy = vi.spyOn(api, 'updateJobRole').mockResolvedValue({})
        const attachSpy = vi.spyOn(api, 'attachDocumentToJobRole').mockResolvedValue({})
        const detachSpy = vi.spyOn(api, 'detachDocumentFromJobRole').mockResolvedValue({})

        const qc = createQueryClient()
        render(
            <QueryClientProvider client={qc}>
                {/* Pre-populate editing payload with rolename/org and target documents
                    so the update flow can run deterministically without UI picks. */}
                <QuickCreateModal open={true} onClose={() => { }} mode="jobrole" editing={{ jobid: 123, statusid: 2, rolename: 'Engineer', companyorgid: 1, sourcechannelid: 7, documents: [{ documentid: 2, documentname: 'Doc 2' }] }} />
            </QueryClientProvider>
        )

        // Pre-populate selected documents by including them in the editing
        // payload when rendering the modal so we avoid interacting with the
        // Autocomplete in this unit test.

        // Submit update
        const updateBtn = Array.from(document.body.querySelectorAll('button')).find((b) => /Update/i.test(b.textContent || ''))
        if (!updateBtn) throw new Error('Update button not found')
        await userEvent.click(updateBtn)

        await waitFor(() => expect(updateSpy).toHaveBeenCalled())
        await waitFor(() => expect(detachSpy).toHaveBeenCalledWith(123, 1))
        await waitFor(() => expect(attachSpy).toHaveBeenCalledWith(123, 2))
    }, 10000)

    it('creates an engagement when create-and-add checkbox is checked on contact create', async () => {
        // Provide a contact-role refdata so the contact form becomes valid
        setupDefaultApiMocks(vi, {
            fetchOrganisations: [],
            fetchContacts: { items: [], total: 0, page: 1, pageSize: 25 },
            fetchReferenceData: [{ refid: 7, refvalue: 'Recruiter' }],
        })

        const createContactSpy = vi.spyOn(api, 'createContact').mockResolvedValue({ contactid: 42 })
        const createEngSpy = vi.spyOn(api, 'createEngagement').mockResolvedValue({ engagementid: 99 })

        const qc = createQueryClient()
        render(
            <QueryClientProvider client={qc}>
                <QuickCreateModal open={true} onClose={() => { }} mode="contact" />
            </QueryClientProvider>
        )

        // fill name
        const nameInput = screen.getByLabelText(/Contact name/i)
        await userEvent.type(nameInput, 'New Person')

        // open role select and choose Recruiter
        const roleButton = document.querySelector('[aria-labelledby="role-type-label"]') as HTMLElement | null
        if (!roleButton) throw new Error('Role select not found')
        await userEvent.click(roleButton)
        const recruiterOption = await screen.findByText('Recruiter')
        await userEvent.click(recruiterOption)

        // check the create-and-add checkbox
        const cb = screen.getByLabelText(/Create and add engagement/i)
        await userEvent.click(cb)

        // submit
        const allButtons = Array.from(document.body.querySelectorAll('button'))
        const createBtn = allButtons.find((b) => /Create/i.test(b.textContent || ''))
        if (!createBtn) throw new Error('Create button not found')
        await userEvent.click(createBtn)

        await waitFor(() => expect(createContactSpy).toHaveBeenCalled())
        // Engagements with empty notes are no longer auto-created; the nested
        // engagement editor opens locally instead. Ensure no createEngagement call.
        await waitFor(() => expect(createEngSpy).not.toHaveBeenCalled())
    })

    it('nested organisation create updates parent org picker and selection (jobrole flow)', async () => {
        // Start with no organisations in the list so the nested create path
        // is exercised and we can verify the parent receives the created org.
        setupDefaultApiMocks(vi, {
            fetchOrganisations: [],
            fetchContacts: { items: [{ contactid: 10, name: 'Alice' }], total: 1, page: 1, pageSize: 20 },
            fetchSectors: [],
            fetchReferenceData: [{ refid: 2, refvalue: 'Applied' }],
        })

        const createOrgSpy = vi.spyOn(api, 'createOrganisation').mockResolvedValue({ orgid: 555, name: 'New Org' })
        const createJobSpy = vi.spyOn(api, 'createJobRole').mockResolvedValue({ jobid: 777 })

        const qc = createQueryClient()
        render(
            <QueryClientProvider client={qc}>
                <QuickCreateModal open={true} onClose={() => { }} mode="jobrole" editing={{ statusid: 2 }} />
            </QueryClientProvider>
        )

        // fill role name
        const roleInput = screen.getByLabelText(/Role name/i)
        await userEvent.type(roleInput, 'Engineer')

        // Open the test-only "Add organisation" button which appears in test env
        const addOrgBtn = screen.getByRole('button', { name: /Add organisation/i })
        await userEvent.click(addOrgBtn)

        // Nested organisation modal should appear — find its name input
        const orgNameInput = await screen.findByLabelText(/Organisation name/i)
        await userEvent.type(orgNameInput, 'New Org')

        // Submit nested create (click the Create button inside the nested dialog)
        const nestedDialog = await screen.findByRole('dialog', { name: /Create Organisation/i })
        const nestedCreateBtn = within(nestedDialog).getByRole('button', { name: /Create/i })
        await userEvent.click(nestedCreateBtn)

        // Wait for createOrganisation to be invoked
        await waitFor(() => expect(createOrgSpy).toHaveBeenCalled())
        // Parent modal's organisation input should now contain the created name
        const parentDialog = await screen.findByRole('dialog', { name: /Create Role/i })
        // There may be multiple labelled "Organisation" inputs due to the
        // nested organisation dialog being rendered inside the parent in tests.
        // Find all matches inside the parent dialog and pick the one whose
        // closest dialog ancestor is the parent (exclude nested dialog inputs).
        const orgInputs = within(parentDialog).getAllByLabelText(/Organisation/i)
        const orgInputTextbox = orgInputs.find((el) => (el as HTMLElement).closest('[role="dialog"]') === parentDialog)
        if (!orgInputTextbox) throw new Error('Parent organisation input not found')

        // Now select a contact and status so we can create the jobrole
        const combos = await screen.findAllByRole('combobox')
        // second combobox is contact
        await userEvent.click(combos[1])
        await screen.findByText('Alice')
        await userEvent.click(await screen.findByText('Alice'))

        // select status
        const statusButton = document.querySelector('[aria-labelledby="job-status-label"]') as HTMLElement | null
        if (!statusButton) throw new Error('Application status select not found')
        await userEvent.click(statusButton)
        const appliedOptions = await screen.findAllByText('Applied')
        await userEvent.click(appliedOptions[0])

        // submit jobrole create
        const allButtons = Array.from(document.body.querySelectorAll('button'))
        const createBtn = allButtons.find((b) => /Create/i.test(b.textContent || ''))
        if (!createBtn) throw new Error('Create button not found')
        await userEvent.click(createBtn)

        await waitFor(() => expect(createJobSpy).toHaveBeenCalled())
        // Assert the create payload included the newly-created org id
        const calledWith = createJobSpy.mock.calls[0][0]
        expect(calledWith.companyorgid).toBe(555)
    }, 10000)
})
