/**
 * Integration tests for Engagements API
 * Based on: frontend/src/api/client.ts
 */

import { describe, it, expect } from 'vitest'
import { ApiClient, TEST_APPLICANT_ID, setupIntegrationTests } from '../setup'

describe('Engagements API Integration', () => {
    const getClient = setupIntegrationTests()
    let client: ApiClient

    it('should list all engagements', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/engagements`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
    })

    it('should filter engagements by contact', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/engagements?contact_id=1`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
    })

    it('should limit engagements results', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/engagements?limit=5`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
    })

    it('should get engagements count', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/engagements/count`)
        expect(response.status).toBe(200)

        const count = await response.json()
        expect(typeof count).toBe('number')
    })
})
