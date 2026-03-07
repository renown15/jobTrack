/**
 * Integration tests for Tasks API
 * Based on: frontend/src/api/client.ts
 */

import { describe, it, expect } from 'vitest'
import { ApiClient, TEST_APPLICANT_ID, setupIntegrationTests } from '../setup'

describe('Tasks API Integration', () => {
    const getClient = setupIntegrationTests()
    let client: ApiClient

    it('should list all tasks', async () => {
        client = getClient()
        const response = await client.get(`/api/${TEST_APPLICANT_ID}/tasks`)
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
    })

    it('should create a new task', async () => {
        client = getClient()
        const newTask = {
            name: 'Test Task',
            duedate: '2025-12-31',
            notes: 'Test notes'
        }

        const response = await client.post(`/api/${TEST_APPLICANT_ID}/tasks`, newTask)
        expect([200, 201]).toContain(response.status)

        const task = await response.json()
        expect(task).toBeDefined()
        expect(task.name).toBe('Test Task')
    })
})
