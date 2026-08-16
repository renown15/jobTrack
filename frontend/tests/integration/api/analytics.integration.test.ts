/**
 * Integration tests for Analytics API
 * Based on: frontend/src/api/client.ts
 */

import { describe, it, expect } from 'vitest'
import { ApiClient, TEST_APPLICANT_ID, setupIntegrationTests } from '../setup'

describe('Analytics API Integration', () => {
    const getClient = setupIntegrationTests()
    let client: ApiClient

    it('should get analytics summary', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/analytics/summary`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(data).toBeDefined()
    })

    it('should get engagements by month', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/analytics/engagements_by_month`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
    })

    it('should get top contacts by engagements', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/analytics/top_contacts_by_engagements`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
    })

    it('should get top recent contacts', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/analytics/top_recent_contacts`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
    })
})
