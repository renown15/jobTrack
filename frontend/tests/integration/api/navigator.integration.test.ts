/**
 * Integration tests for Navigator AI API
 * Based on: frontend/src/api/client.ts
 */

import { describe, it, expect } from 'vitest'
import { ApiClient, TEST_APPLICANT_ID, setupIntegrationTests } from '../setup'

describe('Navigator AI API Integration', () => {
    const getClient = setupIntegrationTests()
    let client: ApiClient

    it('should get navigator health status', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/navigator/health`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(data).toBeDefined()
        expect(typeof data.ok).toBe('boolean')
    })

    it('should get navigator insights', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/navigator/insights`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(data).toBeDefined()
    })

    it('should get navigator metrics history', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/navigator/metricshistory`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(data).toBeDefined()
        // Response should have history property with array
        if (data.history) {
            expect(Array.isArray(data.history)).toBe(true)
        }
    })

    it('should post a navigator query', async () => {
        client = getClient()
        const query = {
            query_text: 'Test query'
        }

        const response = await client.post(`/api/${TEST_APPLICANT_ID}/navigator/query`, query)
        expect([200, 201]).toContain(response.status)

        const data = await response.json()
        expect(data).toBeDefined()
    })
})
