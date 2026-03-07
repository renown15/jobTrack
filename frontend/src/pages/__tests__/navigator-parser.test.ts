import { test, expect } from 'vitest'
import extractModelResult from '../../utils/navigatorParser'

test('parses simple model response', () => {
    const sample = {
        model_score: 8,
        model_commentary: "These are very solid foundational answers. They provide a clear picture of your motivations, frustrations, and financial considerations – all crucial elements in shaping a targeted job search strategy. The detail regarding your previous role (scale, complexity, team collaboration, and the negative aspects) is particularly valuable. The financial information is also well-defined. The only minor improvement would be to delve a little deeper into *why* you disliked the budget fights and the lack of technological respect - exploring the underlying reasons could reveal key sectors and organisations to target. Overall, a strong starting point."
    }
    const parsed = extractModelResult(sample)
    expect(parsed.score).toBe(8)
    expect(typeof parsed.commentary).toBe('string')
    expect(parsed.commentary!.startsWith('These are very solid')).toBe(true)
})
