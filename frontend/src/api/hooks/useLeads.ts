import { useQuery } from '@tanstack/react-query'
import { fetchLeads } from '../client'
import type { PaginatedResponse } from '../types'

export function useLeads(page = 1, pageSize = 20, q?: string, reviewOutcomeId?: number, excludeReviewed?: boolean) {
    return useQuery<PaginatedResponse<any>, Error>(['leads', page, pageSize, q, reviewOutcomeId, excludeReviewed], () =>
        fetchLeads(page, pageSize, q, reviewOutcomeId, excludeReviewed)
    )
}
