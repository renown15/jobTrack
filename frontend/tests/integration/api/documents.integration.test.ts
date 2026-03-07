/**
 * Integration tests for Documents API
 * Based on: frontend/src/api/client.ts
 */

import { describe, it, expect } from 'vitest'
import { ApiClient, TEST_APPLICANT_ID, setupIntegrationTests } from '../setup'

describe('Documents API Integration', () => {
    const getClient = setupIntegrationTests()
    let client: ApiClient

    it('should list all documents', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/documents`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
    })

    it('should filter documents by engagement', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/documents?engagement_id=1`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
    })

    it('should create a document', async () => {
        client = getClient()
        const newDoc = {
            documentname: 'Test Document',
            documentdescription: 'Test description',
            documenttypeid: 1
        }

        const response = await client.post(`/api/${TEST_APPLICANT_ID}/documents`, newDoc)
        expect([200, 201]).toContain(response.status)

        const doc = await response.json()
        expect(doc).toBeDefined()
    })
})
