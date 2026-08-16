import { useQuery } from '@tanstack/react-query'
import { fetchContacts } from '../client'
import type { Contact, PaginatedResponse } from '../types'

export function useContacts(page = 1, pageSize = 20) {
    // Keys are stable and include pagination params
    return useQuery<PaginatedResponse<Contact>, Error>(['contacts', page, pageSize], () =>
        fetchContacts(page, pageSize)
    )
}
