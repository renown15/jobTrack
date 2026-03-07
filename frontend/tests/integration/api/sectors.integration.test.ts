/**
 * Integration tests for Sectors API
 * Based on: frontend/src/api/client.ts
 */

import { describe, it, expect } from 'vitest'
import { ApiClient, TEST_APPLICANT_ID, setupIntegrationTests } from '../setup'

describe('Sectors API Integration', () => {
    const getClient = setupIntegrationTests()
    let client: ApiClient

    it('should list all sectors', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/sectors`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
    })

    it('should create a new sector', async () => {
        client = getClient()
        const newSector = {
            summary: 'Manufacturing',
            description: 'Manufacturing and industrial sector'
        }

        const response = await client.post(`/api/sectors`, newSector)
        expect([200, 201]).toContain(response.status)

        const sector = await response.json()
        expect(sector).toBeDefined()
    })
})
