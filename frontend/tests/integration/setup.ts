/**
 * Integration Test Setup for JobTrack
 * 
 * Provides utilities for running integration tests against a real Flask backend
 * and dockerized PostgreSQL test database. These tests validate the full API
 * contract from frontend perspective.
 */

import { beforeAll, afterAll } from 'vitest'
// Use node-postgres to perform test DB setup (promote seeded test applicant to superuser)
import { Client as PgClient } from 'pg'

export const API_BASE_URL = process.env.VITE_API_URL || 'http://127.0.0.1:5001'
export const TEST_APPLICANT_ID = 1

/**
 * Test user credentials for authentication flows
 */
export const TEST_USER = {
    email: 'test@example.com',
    password: 'testpassword123',
    firstname: 'Test',
    lastname: 'User'
}

/**
 * Helper to make authenticated API requests
 */
export class ApiClient {
    private csrfToken: string | null = null
    private sessionCookie: string | null = null

    constructor(private baseUrl: string = API_BASE_URL) { }

    // Expose token and cookie for test code to perform negative tests
    getSessionCookie(): string | null {
        return this.sessionCookie
    }

    getCsrfToken(): string | null {
        return this.csrfToken
    }

    async login(email: string = TEST_USER.email, password: string = TEST_USER.password) {
        const response = await fetch(`${this.baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
            credentials: 'include'
        })

        // Extract CSRF token and session cookie
        const data = await response.json()
        this.csrfToken = data.csrf_token || null

        // Robustly parse Set-Cookie across Node/undici and browser-like environments.
        // Browsers do not expose Set-Cookie via JS; in Node/undici we attempt to read it.
        const allSetCookieStrings: string[] = []

        const headerSc = response.headers.get('set-cookie') || response.headers.get('Set-Cookie')
        if (headerSc) allSetCookieStrings.push(headerSc)

        try {
            const raw = (response.headers as any).raw ? (response.headers as any).raw() : null
            if (raw) {
                // raw can be an object whose keys are header names -> array values
                for (const key of Object.keys(raw)) {
                    if (/^set-cookie$/i.test(key) && raw[key]) {
                        const val = raw[key]
                        if (Array.isArray(val)) {
                            allSetCookieStrings.push(...val.map(String))
                        } else {
                            allSetCookieStrings.push(String(val))
                        }
                    }
                }
            }
        } catch (e) {
            // ignore parsing issues
        }

        if (allSetCookieStrings.length > 0) {
            const joined = allSetCookieStrings.join('; ')
            // Try to find an explicit `session=` cookie first (Flask default),
            // otherwise fall back to the first cookie-name=value pair.
            const sessionMatch = joined.match(/(?:^|;\s*)session=([^;\s]+)/i)
            if (sessionMatch) {
                this.sessionCookie = `session=${sessionMatch[1]}`
            } else {
                // Find first cookie token like name=value
                const tokenMatch = joined.match(/(?:^|;\s*)([^=;\s]+)=([^;\s]+)/)
                if (tokenMatch) {
                    this.sessionCookie = `${tokenMatch[1]}=${tokenMatch[2]}`
                }
            }
        }

        return { response, data }
    }

    async request(path: string, options: RequestInit = {}) {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {})
        }

        // Add CSRF token for non-GET requests
        if (this.csrfToken && options.method && options.method !== 'GET') {
            headers['X-CSRF-Token'] = this.csrfToken
        }

        // Add session cookie
        if (this.sessionCookie) {
            headers['Cookie'] = this.sessionCookie
        }

        const response = await fetch(`${this.baseUrl}${path}`, {
            ...options,
            headers,
            credentials: 'include'
        })

        return response
    }

    async get(path: string) {
        return this.request(path, { method: 'GET' })
    }

    async post(path: string, body: any) {
        return this.request(path, {
            method: 'POST',
            body: JSON.stringify(body)
        })
    }

    async put(path: string, body: any) {
        return this.request(path, {
            method: 'PUT',
            body: JSON.stringify(body)
        })
    }

    async delete(path: string) {
        return this.request(path, { method: 'DELETE' })
    }

    async logout() {
        return this.request('/api/auth/logout', { method: 'POST' })
    }
}

/**
 * Wait for backend to be ready
 */
export async function waitForBackend(maxAttempts = 30, delayMs = 1000): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/health`, {
                method: 'GET'
            })
            if (response.ok) {
                console.log(`✅ Backend ready after ${i + 1} attempts`)
                return
            }
        } catch (e) {
            // Connection refused, backend not ready yet
        }
        await new Promise(resolve => setTimeout(resolve, delayMs))
    }
    throw new Error(`Backend not ready after ${maxAttempts} attempts`)
}

/**
 * Clean test data from database
 */
export async function cleanTestData(client: ApiClient) {
    // Delete test contacts, orgs, etc. created during tests
    // This ensures tests are isolated and repeatable
    try {
        const contactsRes = await client.get(`/api/${TEST_APPLICANT_ID}/contacts?limit=1000`)
        if (contactsRes.ok) {
            const contacts = await contactsRes.json()
            for (const contact of contacts) {
                if (contact.name?.includes('Test') || contact.name?.includes('Integration')) {
                    await client.delete(`/api/${TEST_APPLICANT_ID}/contacts/${contact.contactid}`)
                }
            }
        }

        const orgsRes = await client.get(`/api/${TEST_APPLICANT_ID}/organisations?limit=1000`)
        if (orgsRes.ok) {
            const orgs = await orgsRes.json()
            for (const org of orgs) {
                if (org.name?.includes('Test') || org.name?.includes('Integration')) {
                    await client.delete(`/api/${TEST_APPLICANT_ID}/organisations/${org.orgid}`)
                }
            }
        }
    } catch (e) {
        console.warn('Failed to clean test data:', e)
    }
}

/**
 * Setup hook for integration tests
 */
export function setupIntegrationTests() {
    let client: ApiClient

    beforeAll(async () => {
        // Wait for backend to be available
        await waitForBackend()

        // Ensure the seeded test applicant is a superuser for admin-driven integration tests.
        // We connect directly to the test database using TEST_DATABASE_URL injected by the test runner.
        const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || ''
        if (dbUrl) {
            try {
                const pg = new PgClient({ connectionString: dbUrl })
                await pg.connect()
                await pg.query('BEGIN')
                await pg.query('UPDATE applicantprofile SET issuperuser = true WHERE applicantid = $1', [TEST_APPLICANT_ID])
                await pg.query('COMMIT')
                await pg.end()
                console.log('✅ Promoted test applicant to superuser for integration tests')
            } catch (e) {
                console.warn('Could not promote test applicant to superuser:', e)
            }
        } else {
            console.warn('TEST_DATABASE_URL not set; skipping superuser promotion')
        }

        // Create authenticated client
        client = new ApiClient()
        // Login with test user credentials from seed data
        await client.login()
    })

    afterAll(async () => {
        if (client) {
            // Clean up test data
            await cleanTestData(client)
            await client.logout()
        }
    })

    return () => client || new ApiClient()
}
