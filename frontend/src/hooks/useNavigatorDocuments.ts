import { useState, useEffect, useCallback } from 'react'
import { fetchDocuments } from '../api/client'

export interface NavigatorDocument {
    documentid: number
    document_type?: string
    documenttype?: string
    documentname?: string
    documenttypeid?: number
    documentcontent?: any
    file_data?: any
    content?: any
    content_bytes?: any
    contentBytes?: any
    documentcontenttype?: string
    content_type?: string
    documenturi?: string
    created_at?: string
}

export interface UseNavigatorDocumentsResult {
    documents: NavigatorDocument[]
    loading: boolean
    error: Error | null
    getLatestDocByType: (typeName: string) => NavigatorDocument | null
}

/**
 * Custom hook for managing Navigator document fetching and filtering.
 * 
 * Handles:
 * - Fetching documents when not provided via props
 * - Caching fetched documents
 * - Finding latest document by type
 * - Loading and error states
 * 
 * @param applicantId - The applicant ID to fetch documents for
 * @param propDocs - Optional documents passed from parent component
 * @returns Documents, loading state, and helper functions
 */
export function useNavigatorDocuments(
    applicantId: number | null | undefined,
    propDocs: NavigatorDocument[] = []
): UseNavigatorDocumentsResult {
    const [fetchedDocs, setFetchedDocs] = useState<NavigatorDocument[] | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    // Use prop documents if provided, otherwise use fetched documents
    const effectiveDocs = (propDocs && propDocs.length) ? propDocs : (fetchedDocs || [])

    /**
     * Find the latest document matching the requested type.
     * Supports multiple matching strategies:
     * - Numeric type ID
     * - Exact type name match
     * - Word-wise matching
     * - Substring matching
     * 
     * Prefers documents with actual content over those with just URIs.
     */
    const getLatestDocByType = useCallback((typeName: string): NavigatorDocument | null => {
        if (!effectiveDocs || effectiveDocs.length === 0) return null

        const requestedRaw = (typeName || '').toString()
        const requested = requestedRaw.toLowerCase().trim()
        const requestedNum = !Number.isNaN(Number(requestedRaw)) ? Number(requestedRaw) : null
        const requestedWords = requested.split(/\s+/).filter((w) => !!w)

        const matches = effectiveDocs.filter((d: NavigatorDocument) => {
            const dtypeField = ((d.document_type || '') || (d.documenttype || '') || '').toString()
            const dtype = dtypeField.toLowerCase().trim()
            const name = ((d.documentname || '') || '').toString().toLowerCase()
            const typeId = d.documenttypeid != null ? Number(d.documenttypeid) : null

            // Match numeric type id
            if (requestedNum != null && typeId === requestedNum) return true

            // Exact match
            if (dtype === requested) return true

            // Numeric string match
            if (requestedNum != null && dtype === String(requestedNum)) return true

            // Word-wise match
            if (requestedWords.length > 0 &&
                requestedWords.every((w) => dtype.includes(w) || name.includes(w))) {
                return true
            }

            // Substring fallback
            if (requested && name.includes(requested)) return true

            return false
        })

        if (!matches || matches.length === 0) return null

        // Prefer documents with actual content
        const withContent = matches.filter((m: NavigatorDocument) => {
            const hasBytes = !!(m.documentcontent || m.file_data || m.content ||
                m.content_bytes || m.contentBytes)
            const hasType = !!(m.documentcontenttype || m.content_type)
            return hasBytes || hasType
        })

        const pool = (withContent && withContent.length > 0) ? withContent : matches

        // Sort by creation date (newest first), then by ID
        const sorted = pool.slice().sort((a: NavigatorDocument, b: NavigatorDocument) => {
            try {
                const ta = a.created_at ? Date.parse(a.created_at) : null
                const tb = b.created_at ? Date.parse(b.created_at) : null
                if (ta != null && tb != null) return tb - ta
            } catch { }
            return (b.documentid || 0) - (a.documentid || 0)
        })

        return sorted[0] || null
    }, [effectiveDocs])

    // Fetch documents when not provided via props
    useEffect(() => {
        // Skip if parent provided docs
        if (propDocs && propDocs.length) return

        // Skip if already fetched
        if (fetchedDocs !== null) return

        // Skip if no applicant ID
        if (!applicantId) return

        let mounted = true

        const loadDocs = async () => {
            try {
                setLoading(true)
                setError(null)
                const res = await fetchDocuments()
                if (!mounted) return
                setFetchedDocs(res || [])
            } catch (e) {
                console.error('Failed to fetch applicant documents for Navigator', e)
                if (!mounted) return
                setError(e instanceof Error ? e : new Error(String(e)))
                setFetchedDocs([])
            } finally {
                if (mounted) setLoading(false)
            }
        }

        loadDocs()

        return () => { mounted = false }
    }, [applicantId, propDocs, fetchedDocs])

    // Reset fetched docs when applicant changes
    useEffect(() => {
        setFetchedDocs(null)
        setError(null)
    }, [applicantId])

    return {
        documents: effectiveDocs,
        loading,
        error,
        getLatestDocByType
    }
}
