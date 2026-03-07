import { describe, it, expect } from 'vitest'
import * as BoardModule from '../src/components/ActionCanvas/ActionCanvasBoard'

describe('ActionCanvasBoard module', () => {
    it('loads without throwing', () => {
        expect(BoardModule).toBeTruthy()
    })
})
