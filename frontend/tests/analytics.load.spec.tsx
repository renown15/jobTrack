import { describe, it, expect } from 'vitest'
import * as AnalyticsModule from '../src/pages/Analytics'

describe('Analytics module', () => {
    it('loads without throwing', () => {
        expect(AnalyticsModule).toBeTruthy()
    })
})
