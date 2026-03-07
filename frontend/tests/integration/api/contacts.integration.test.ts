/**
 * Integration tests for Contacts API
 * Based on: frontend/src/api/client.ts
 */

import { describe, it, expect } from 'vitest'
import { ApiClient, TEST_APPLICANT_ID, setupIntegrationTests } from '../setup'

describe('Contacts API Integration', () => {
    const getClient = setupIntegrationTests()
    let client: ApiClient

    it('should list all contacts', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/contacts`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
    })

    it('should filter contacts by role type', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/contacts?role_type_id=1`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
    })

    it('should create a new contact', async () => {
        client = getClient()
        const newContact = {
            name: 'Test Contact',
            currentrole: 'Engineer',
            roletypeid: 1
        }

        const response = await client.post(`/api/${TEST_APPLICANT_ID}/contacts`, newContact)
        expect([200, 201]).toContain(response.status)

        const contact = await response.json()
        expect(contact).toBeDefined()
    })

    it('should get contact targets', async () => {
        client = getClient()
        // Use contact id 1 if it exists from seed data
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/contacts/1/targets`)
        // 200 if contact exists with targets, 404 if not
        expect([200, 404]).toContain(response.status)
    })

    it('should get contact tasks', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/contacts/1/tasks`)
        expect([200, 404]).toContain(response.status)
    })

    it('should get contact task counts', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/contacts/tasks/counts`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
    })
})
