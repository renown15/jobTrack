/**
 * Integration tests for Job Roles API
 * Based on: frontend/src/api/client.ts
 */

import { describe, it, expect } from 'vitest'
import { ApiClient, TEST_APPLICANT_ID, setupIntegrationTests } from '../setup'

describe('Job Roles API Integration', () => {
    const getClient = setupIntegrationTests()
    let client: ApiClient

    it('should list all job roles', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/jobroles`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
    })

    it('should filter job roles by contact', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/jobroles?contact_id=1`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
    })

    it('should create a new job role', async () => {
        client = getClient()

        // First create a contact to associate with the job role
        const contactResponse = await client.post(`/api/${TEST_APPLICANT_ID}/contacts`, {
            name: 'Test Contact for Job',
            roletypeid: 1
        })
        const contact = await contactResponse.json()

        const newRole = {
            contactid: contact.contactid,
            rolename: 'Software Engineer',
            statusid: 1
            // companyorgid omitted - no organisations exist in test DB
        }

        const response = await client.post(`/api/${TEST_APPLICANT_ID}/jobroles`, newRole)
        expect([200, 201]).toContain(response.status)

        const role = await response.json()
        expect(role).toBeDefined()
    })
})
