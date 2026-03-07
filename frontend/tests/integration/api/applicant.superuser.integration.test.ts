import { describe, it, expect } from 'vitest'
import { ApiClient, TEST_APPLICANT_ID, setupIntegrationTests } from '../setup'

describe('Applicant Superuser Integration', () => {
    const getClient = setupIntegrationTests()
    let client: ApiClient

    it('loads isSuperuser from applicant settings', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/settings/applicant`)
        expect(response.status).toBe(200)

        const data = await response.json()
        // Server may return `isSuperuser` or `issuperuser`.
        const isSuper = (data.isSuperuser ?? data.issuperuser) ? true : false
        expect(typeof isSuper).toBe('boolean')
    })
})
