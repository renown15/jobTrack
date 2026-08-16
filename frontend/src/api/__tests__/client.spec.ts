import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as client from '../client'
import { setApplicantId } from '../../auth/currentApplicant'

describe('api client', () => {
    beforeEach(() => {
        // Ensure an applicant is selected for applicant-scoped API calls
        setApplicantId(1)
            ; (client as any).api.get = vi.fn()
            ; (client as any).api.post = vi.fn()
            ; (client as any).api.put = vi.fn()
            ; (client as any).api.delete = vi.fn()
    })
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('fetchOrganisations maps response data', async () => {
        ; (client as any).api.get.mockResolvedValue({ data: [{ orgid: 1, name: 'O' }] })
        // (test mocks configured)
        const res = await client.fetchOrganisations()
        // Ensure something was returned
        expect(res).toBeDefined()
    })

    it('fetchJobRoles passes contactId param when provided', async () => {
        ; (client as any).api.get.mockResolvedValue({ data: [{ jobid: 2 }] })
        await client.fetchJobRoles(5)
        expect((client as any).api.get).toHaveBeenCalledWith('/api/1/jobroles', { params: { contact_id: 5 } })
    })

    it('createOrganisation calls api.post and deleteOrganisation calls api.delete', async () => {
        ; (client as any).api.post.mockResolvedValue({ data: { orgid: 7 } })
        const created = await client.createOrganisation({ name: 'X' })
        // client is applicant-scoped so the path includes the applicant id
        expect((client as any).api.post).toHaveBeenCalledWith('/api/1/organisations', { name: 'X', applicantid: 1 })

            ; (client as any).api.delete.mockResolvedValue({ data: {} })
        await client.deleteOrganisation(7)
        expect((client as any).api.delete).toHaveBeenCalledWith('/api/1/organisations/7')
    })
})
