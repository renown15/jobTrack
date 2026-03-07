import { describe, it, expect } from 'vitest'
import * as ActionCanvasModule from '../src/pages/ActionCanvas'

describe('ActionCanvas module', () => {
    it('loads without throwing', () => {
        expect(ActionCanvasModule).toBeTruthy()
    })
})
