import { describe, it, expect } from 'vitest'
import { ApiClient, TEST_APPLICANT_ID, setupIntegrationTests } from '../setup'
import { Client as PgClient } from 'pg'

describe('Admin-driven Superuser Integration', () => {
    const getClient = setupIntegrationTests()
    let client: ApiClient
    let pg: PgClient | null = null
    let targetId: number | null = null

    it('promotes a target applicant via admin API and reflects in settings', async () => {
        client = getClient()

        // Create a target applicant directly in the test DB to avoid session takeover
        const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || ''
        if (!dbUrl) throw new Error('TEST_DATABASE_URL not set for integration test')

        pg = new PgClient({ connectionString: dbUrl })
        await pg.connect()

        const unique = Date.now()
        const email = `integration+${unique}@example.com`
        const first = 'Integration'
        const last = `User${unique}`

        const insertRes = await pg.query(
            `INSERT INTO applicantprofile (firstname, lastname, email, isactive)
             VALUES ($1, $2, $3, true) RETURNING applicantid`,
            [first, last, email]
        )
        targetId = insertRes.rows[0].applicantid
        expect(typeof targetId).toBe('number')

        // As the authenticated client (promoted to superuser in setup), call admin PATCH
        const patchResp = await client.request(`/api/admin/applicants/${targetId}/superuser`, {
            method: 'PATCH',
            body: JSON.stringify({ isSuperuser: true }),
        })
        expect(patchResp.ok).toBe(true)
        const patchJson = await patchResp.json()
        expect(patchJson.isSuperuser === true || patchJson.isSuperuser === 'true').toBeTruthy()

        // Fetch target settings and assert the superuser flag
        const settingsResp = await client.get(`/api/${targetId}/settings/applicant`)
        expect(settingsResp.status).toBe(200)
        const settingsData = await settingsResp.json()
        const isSuper = (settingsData.isSuperuser ?? settingsData.issuperuser) ? true : false
        expect(isSuper).toBe(true)

        // cleanup created applicant
        try {
            await pg.query('DELETE FROM applicantprofile WHERE applicantid = $1', [targetId])
        } catch (e) {
            // ignore cleanup failures
        }
        await pg.end()
        pg = null
    })
})
