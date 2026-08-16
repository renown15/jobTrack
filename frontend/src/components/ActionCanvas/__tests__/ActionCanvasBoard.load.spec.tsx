import { describe, it, expect } from 'vitest'
import * as BoardModule from '../ActionCanvasBoard'

describe('ActionCanvasBoard module (load)', () => {
    it('imports without throwing', () => {
        expect(BoardModule).toBeTruthy()
    })
})
