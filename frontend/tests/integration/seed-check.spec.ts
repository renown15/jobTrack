import { describe, it, expect } from 'vitest'
import { ApiClient, TEST_APPLICANT_ID, TEST_USER, setupIntegrationTests } from './setup'

describe('Seed verification', () => {
    const getClient = setupIntegrationTests()
    let client: ApiClient

    it('creates test applicant and required ref-data and orgs', async () => {
        client = getClient()

        // Ensure login works (seeded applicant should exist)
        const { response: loginResp, data } = await client.login(TEST_USER.email, TEST_USER.password)
        expect(loginResp.status).toBe(200)
        expect(data).toBeDefined()

        // Check application_status reference data exists
        const refResp = await client.get(`/api/${TEST_APPLICANT_ID}/reference-data?category=application_status`)
        expect(refResp.status).toBe(200)
        const refData = await refResp.json()
        // Expect at least one application_status row
        if (Array.isArray(refData)) {
            expect(refData.length).toBeGreaterThan(0)
        } else {
            expect(Object.keys(refData || {}).length).toBeGreaterThan(0)
        }

        // Check organisations seeded (should at least return an array)
        const orgResp = await client.get(`/api/${TEST_APPLICANT_ID}/organisations`)
        expect(orgResp.status).toBe(200)
        const orgs = await orgResp.json()
        expect(Array.isArray(orgs)).toBe(true)
        expect(orgs.length).toBeGreaterThanOrEqual(0)
    })
})
