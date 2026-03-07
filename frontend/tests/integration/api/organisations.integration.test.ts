/**
 * Integration tests for Organisations API
 * Based on: frontend/src/api/client.ts
 */

import { describe, it, expect } from 'vitest'
import { ApiClient, TEST_APPLICANT_ID, setupIntegrationTests } from '../setup'

describe('Organisations API Integration', () => {
    const getClient = setupIntegrationTests()
    let client: ApiClient

    it('should list all organisations', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/organisations`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
    })

    it('should create a new organisation', async () => {
        client = getClient()
        const newOrg = {
            name: 'Test Company',
            sectorid: 1 // Technology sector seeded in prime_test_db.sql
        }

        const response = await client.post(`/api/${TEST_APPLICANT_ID}/organisations`, newOrg)
        expect([200, 201]).toContain(response.status)

        const org = await response.json()
        expect(org).toBeDefined()
    })
})
