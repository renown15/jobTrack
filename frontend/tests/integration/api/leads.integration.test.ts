/**
 * Integration tests for Leads API
 * Based on: frontend/src/api/client.ts
 */

import { describe, it, expect } from 'vitest'
import { ApiClient, TEST_APPLICANT_ID, setupIntegrationTests } from '../setup'

describe('Leads API Integration', () => {
    const getClient = setupIntegrationTests()
    let client: ApiClient

    it('should list leads', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/leads`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
    })

    it('should get leads summary', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/leads/summary`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(data).toBeDefined()
    })

    it('should get top companies from leads', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/leads/top_companies?limit=5`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
    })

    it('should get leads reviews by date', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/leads/reviews_by_date`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
    })
})
