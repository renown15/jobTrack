import { describe, it, expect } from 'vitest'
import * as ActionCanvasModule from '../ActionCanvas'

describe('ActionCanvas module (load)', () => {
    it('imports without throwing', () => {
        expect(ActionCanvasModule).toBeTruthy()
    })
})
