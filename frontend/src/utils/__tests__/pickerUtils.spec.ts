import { describe, it, expect } from 'vitest'
import { toNumberOrNull, resolveOptionById, optionEqualsById } from '../pickerUtils'

describe('pickerUtils', () => {
    describe('toNumberOrNull', () => {
        it('converts valid numbers and returns null for empty/invalid', () => {
            expect(toNumberOrNull(5)).toBe(5)
            expect(toNumberOrNull('7')).toBe(7)
            expect(toNumberOrNull(null)).toBeNull()
            expect(toNumberOrNull(undefined)).toBeNull()
            expect(toNumberOrNull('')).toBeNull()
            expect(toNumberOrNull('abc')).toBeNull()
        })
    })

    describe('resolveOptionById', () => {
        const list = [{ orgid: 1, name: 'A' }, { orgid: 2, name: 'B' }]
        it('finds by id when present', () => {
            const r = resolveOptionById(list, 2, 'orgid')
            expect(r).toEqual({ orgid: 2, name: 'B' })
        })
        it('returns placeholder when not found', () => {
            const r = resolveOptionById(list, 9, 'orgid')
            expect(r).toHaveProperty('orgid', 9)
        })
        it('returns null for null id', () => {
            expect(resolveOptionById(list, null, 'orgid')).toBeNull()
        })
    })

    describe('optionEqualsById', () => {
        const cmp = optionEqualsById('orgid')
        it('compares matching ids as equal', () => {
            expect(cmp({ orgid: '3' }, { orgid: 3 })).toBe(true)
        })
        it('returns false when missing', () => {
            expect(cmp(null as any, { orgid: 3 })).toBe(false)
            expect(cmp({ orgid: 3 }, null as any)).toBe(false)
        })
    })
})
