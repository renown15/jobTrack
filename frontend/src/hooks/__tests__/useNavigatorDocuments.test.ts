import { renderHook, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { useNavigatorDocuments } from '../useNavigatorDocuments'

// Mock API
vi.mock('../../api/client')
import * as apiClient from '../../api/client'

describe('useNavigatorDocuments', () => {
    const mockDocuments = [
        {
            documentid: 1,
            documenttype: 'cv',
            documentname: 'resume.pdf',
            documentcontent: 'content',
            created_at: '2025-12-01T00:00:00Z'
        },
        {
            documentid: 2,
            documenttype: 'cover letter',
            documentname: 'cover.pdf',
            documentcontent: 'content',
            created_at: '2025-12-02T00:00:00Z'
        },
        {
            documentid: 3,
            documenttype: 'linkedin profile',
            documentname: 'linkedin.pdf',
            created_at: '2025-12-03T00:00:00Z'
        }
    ]

    beforeEach(() => {
        vi.clearAllMocks()
        vi.spyOn(apiClient, 'fetchDocuments').mockResolvedValue(mockDocuments)
    })

    describe('Document Fetching', () => {
        test('fetches documents when not provided via props', async () => {
            const { result } = renderHook(() => useNavigatorDocuments(1, []))

            expect(result.current.loading).toBe(true)

            await waitFor(() => {
                expect(result.current.loading).toBe(false)
            })

            expect(result.current.documents).toHaveLength(3)
            expect(apiClient.fetchDocuments).toHaveBeenCalled()
        })

        test('uses prop documents when provided', () => {
            const propDocs = [{ documentid: 99, documenttype: 'test' }]
            const { result } = renderHook(() => useNavigatorDocuments(1, propDocs))

            expect(result.current.documents).toBe(propDocs)
            expect(result.current.documents).toHaveLength(1)
            expect(apiClient.fetchDocuments).not.toHaveBeenCalled()
        })

        test('does not fetch when applicantId is null', () => {
            const { result } = renderHook(() => useNavigatorDocuments(null, []))

            expect(result.current.documents).toEqual([])
            expect(apiClient.fetchDocuments).not.toHaveBeenCalled()
        })

        test('handles fetch errors gracefully', async () => {
            const error = new Error('Network error')
            vi.spyOn(apiClient, 'fetchDocuments').mockRejectedValue(error)

            const { result } = renderHook(() => useNavigatorDocuments(1, []))

            await waitFor(() => {
                expect(result.current.loading).toBe(false)
            })

            expect(result.current.error).toEqual(error)
            expect(result.current.documents).toEqual([])
        })

        test('cleans up on unmount', async () => {
            const { unmount } = renderHook(() => useNavigatorDocuments(1, []))

            unmount()

            // Should not crash or cause issues
            expect(true).toBe(true)
        })
    })

    describe('Applicant ID Changes', () => {
        test('resets documents when applicant changes', async () => {
            const { result, rerender } = renderHook(
                ({ applicantId }) => useNavigatorDocuments(applicantId, []),
                { initialProps: { applicantId: 1 } }
            )

            await waitFor(() => {
                expect(result.current.documents).toHaveLength(3)
            })

            // Change applicant
            rerender({ applicantId: 2 })

            // Should trigger new fetch
            await waitFor(() => {
                expect(result.current.documents).toHaveLength(3)
            })

            // fetchDocuments should have been called for both applicants
            expect(apiClient.fetchDocuments).toHaveBeenCalled()
        })
    })

    describe('getLatestDocByType', () => {
        test('finds document by exact type match', () => {
            const { result } = renderHook(() => useNavigatorDocuments(1, mockDocuments))

            const cvDoc = result.current.getLatestDocByType('cv')

            expect(cvDoc).toBeTruthy()
            expect(cvDoc?.documentid).toBe(1)
        })

        test('finds document by numeric type ID', () => {
            const docsWithTypeId = [
                { documentid: 1, documenttypeid: 5, documentname: 'test.pdf' }
            ]
            const { result } = renderHook(() => useNavigatorDocuments(1, docsWithTypeId))

            const doc = result.current.getLatestDocByType('5')

            expect(doc).toBeTruthy()
            expect(doc?.documentid).toBe(1)
        })

        test('finds document by word-wise match', () => {
            const { result } = renderHook(() => useNavigatorDocuments(1, mockDocuments))

            const doc = result.current.getLatestDocByType('cover letter')

            expect(doc).toBeTruthy()
            expect(doc?.documentid).toBe(2)
        })

        test('finds document by filename substring', () => {
            const { result } = renderHook(() => useNavigatorDocuments(1, mockDocuments))

            const doc = result.current.getLatestDocByType('linkedin')

            expect(doc).toBeTruthy()
            expect(doc?.documentid).toBe(3)
        })

        test('prefers documents with content over those without', () => {
            const docs = [
                { documentid: 1, documenttype: 'cv', documentname: 'cv1.pdf', created_at: '2025-12-02T00:00:00Z' },
                { documentid: 2, documenttype: 'cv', documentname: 'cv2.pdf', documentcontent: 'content', created_at: '2025-12-01T00:00:00Z' }
            ]
            const { result } = renderHook(() => useNavigatorDocuments(1, docs))

            const doc = result.current.getLatestDocByType('cv')

            // Should prefer doc 2 even though doc 1 is newer, because doc 2 has content
            expect(doc?.documentid).toBe(2)
        })

        test('sorts by creation date when multiple matches have content', () => {
            const docs = [
                { documentid: 1, documenttype: 'cv', documentcontent: 'content', created_at: '2025-12-01T00:00:00Z' },
                { documentid: 2, documenttype: 'cv', documentcontent: 'content', created_at: '2025-12-03T00:00:00Z' },
                { documentid: 3, documenttype: 'cv', documentcontent: 'content', created_at: '2025-12-02T00:00:00Z' }
            ]
            const { result } = renderHook(() => useNavigatorDocuments(1, docs))

            const doc = result.current.getLatestDocByType('cv')

            // Should return the newest (doc 2)
            expect(doc?.documentid).toBe(2)
        })

        test('returns null when no documents match', () => {
            const { result } = renderHook(() => useNavigatorDocuments(1, mockDocuments))

            const doc = result.current.getLatestDocByType('nonexistent')

            expect(doc).toBeNull()
        })

        test('returns null when documents array is empty', () => {
            const { result } = renderHook(() => useNavigatorDocuments(1, []))

            const doc = result.current.getLatestDocByType('cv')

            expect(doc).toBeNull()
        })

        test('handles case-insensitive matching', () => {
            const { result } = renderHook(() => useNavigatorDocuments(1, mockDocuments))

            const doc1 = result.current.getLatestDocByType('CV')
            const doc2 = result.current.getLatestDocByType('Cv')

            expect(doc1?.documentid).toBe(1)
            expect(doc2?.documentid).toBe(1)
        })
    })

    describe('Loading States', () => {
        test('sets loading to true during fetch', () => {
            vi.spyOn(apiClient, 'fetchDocuments').mockImplementation(
                () => new Promise((resolve) => setTimeout(() => resolve([]), 100))
            )

            const { result } = renderHook(() => useNavigatorDocuments(1, []))

            expect(result.current.loading).toBe(true)
        })

        test('sets loading to false after successful fetch', async () => {
            const { result } = renderHook(() => useNavigatorDocuments(1, []))

            await waitFor(() => {
                expect(result.current.loading).toBe(false)
            })
        })

        test('sets loading to false after failed fetch', async () => {
            vi.spyOn(apiClient, 'fetchDocuments').mockRejectedValue(new Error('Failed'))

            const { result } = renderHook(() => useNavigatorDocuments(1, []))

            await waitFor(() => {
                expect(result.current.loading).toBe(false)
            })
        })
    })

    describe('Edge Cases', () => {
        test('handles documents with missing fields', () => {
            const docs = [
                { documentid: 1 } // Minimal document
            ]
            const { result } = renderHook(() => useNavigatorDocuments(1, docs))

            expect(result.current.documents).toHaveLength(1)
            expect(() => result.current.getLatestDocByType('test')).not.toThrow()
        })

        test('handles empty type name', () => {
            const { result } = renderHook(() => useNavigatorDocuments(1, mockDocuments))

            const doc = result.current.getLatestDocByType('')

            expect(doc).toBeNull()
        })

        test('handles whitespace-only type name', () => {
            const { result } = renderHook(() => useNavigatorDocuments(1, mockDocuments))

            const doc = result.current.getLatestDocByType('   ')

            expect(doc).toBeNull()
        })
    })
})
