/**
 * Integration test: ensure navigator snapshot created by a forced refresh
 * can be patched/merged with later metric results.
 */
import { describe, it, expect } from 'vitest'
import { ApiClient, TEST_APPLICANT_ID, setupIntegrationTests } from '../setup'

describe('Navigator snapshot patch integration', () => {
    const getClient = setupIntegrationTests()
    let client: ApiClient

    it('creates a snapshot and allows PATCH merging of a metric', async () => {
        client = getClient()

        // Force a fresh computation which should persist a snapshot
        const forceRes = await client.get(`/api/${TEST_APPLICANT_ID}/navigator/insights?force_refresh=1`)
        expect(forceRes.status).toBe(200)
        const forceData = await forceRes.json()
        expect(forceData).toBeDefined()
        expect(Array.isArray(forceData.metrics) || forceData.metrics != null).toBe(true)

        // Fetch metric history to obtain snapshot id
        const histRes = await client.get(`/api/${TEST_APPLICANT_ID}/navigator/metricshistory`)
        expect(histRes.status).toBe(200)
        const hist = await histRes.json()
        expect(hist).toBeDefined()
        expect(Array.isArray(hist.history)).toBe(true)
        expect(hist.history.length).toBeGreaterThan(0)

        const snapshotId = (hist.history[0] && (hist.history[0].id || hist.history[0].snapshotid)) ? (hist.history[0].id || hist.history[0].snapshotid) : null
        expect(snapshotId).toBeTruthy()

        // Patch a metric into the snapshot (simulate late-arriving LLM result)
        const payload = { metrics: [{ metric: 'cv_score', model_score: 42, model_commentary: 'patched by integration test' }] }
        const putRes = await client.put(`/api/${TEST_APPLICANT_ID}/navigator/metricshistory/${snapshotId}`, payload)
        expect([200, 204]).toContain(putRes.status)

        // Fetch the snapshot and ensure the patched metric is present
        const snapRes = await client.get(`/api/${TEST_APPLICANT_ID}/navigator/metricshistory/${snapshotId}`)
        expect(snapRes.status).toBe(200)
        const snap = await snapRes.json()
        expect(snap).toBeDefined()
        const metrics = snap.metrics || snap.metricdata || []
        const patched = (metrics || []).find((m: any) => m.metric === 'cv_score')
        expect(patched).toBeTruthy()
        // Expect either model_score or model_commentary to reflect the patch
        expect(patched.model_score === 42 || (patched.model_commentary && String(patched.model_commentary).includes('patched by integration test'))).toBe(true)
    })
})
