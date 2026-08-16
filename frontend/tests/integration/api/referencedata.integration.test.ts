/**
 * Integration tests for Reference Data API
 * Based on: frontend/src/api/client.ts - fetchReferenceData()
 */

import { describe, it, expect } from 'vitest'
import { ApiClient, TEST_APPLICANT_ID, setupIntegrationTests } from '../setup'

describe('Reference Data API Integration', () => {
    const getClient = setupIntegrationTests()
    let client: ApiClient

    it('should get all reference data', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/reference-data`)
        expect(response.status).toBe(200)

        const data = await response.json()
        // Response can be array or object with referencedata property
        if (Array.isArray(data)) {
            expect(data.length).toBeGreaterThanOrEqual(0)
        } else {
            expect(data.referencedata || data).toBeDefined()
        }
    })

    it('should get contact role types', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/reference-data?category=contact_role_type`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(data).toBeDefined()
    })

    it('should get engagement types', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/reference-data?category=engagement_type`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(data).toBeDefined()
    })

    it('should get application statuses', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/reference-data?category=application_status`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(data).toBeDefined()
    })
})
