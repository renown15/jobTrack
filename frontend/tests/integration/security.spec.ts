import { test, expect } from 'vitest'
import { setupIntegrationTests, API_BASE_URL, TEST_APPLICANT_ID } from './setup'

const getClient = setupIntegrationTests()

test('returns 403 when missing X-CSRF-Token header', async () => {
    const client = getClient()
    // ensure we have a session cookie from login
    const cookie = client.getSessionCookie()
    if (!cookie) throw new Error('No session cookie available; login likely failed')

    const url = `${API_BASE_URL}/api/${TEST_APPLICANT_ID}/contacts`
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': cookie
        },
        body: JSON.stringify({ name: 'Integration CSRF Missing Test' })
    })

    expect(res.status).toBe(403)
})

test('returns 403 when X-CSRF-Token is invalid', async () => {
    const client = getClient()
    const cookie = client.getSessionCookie()
    if (!cookie) throw new Error('No session cookie available; login likely failed')

    const url = `${API_BASE_URL}/api/${TEST_APPLICANT_ID}/contacts`
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': cookie,
            'X-CSRF-Token': 'invalid-token'
        },
        body: JSON.stringify({ name: 'Integration CSRF Invalid Test' })
    })

    expect(res.status).toBe(403)
})

test('returns 401/403 when session is missing or does not match', async () => {
    const client = getClient()
    const token = client.getCsrfToken()
    if (!token) throw new Error('No CSRF token available; login likely failed')

    const url = `${API_BASE_URL}/api/${TEST_APPLICANT_ID}/contacts`
    // No Cookie header provided
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': token
        },
        body: JSON.stringify({ name: 'Integration Missing Session Test' })
    })

    expect([401, 403]).toContain(res.status)
})
