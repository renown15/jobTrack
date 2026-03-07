// Shared API types used by frontend API client and services

export interface PaginatedResponse<T> {
    items: T[]
    total: number
    page: number
    pageSize: number
}

export interface Contact {
    contactid?: number
    name?: string | null
    firstname?: string | null
    lastname?: string | null
    email?: string | null
    phone?: string | null
    currentorgid?: number | null
    current_organization?: string | null
    current_org_sector?: string | null
    first_contact_date?: string | null
    last_activity_date?: string | null
    last_engagement_date?: string | null
    engagement_count?: number
    roles_count?: number
    avatar_url?: string | null
    role_type_id?: number | null
    role_type?: string | null
    [k: string]: any
}

export interface CumulativeSeries {
    labels?: string[]
    values?: number[]
}

export interface TopHiringOrgs {
    labels?: string[]
    values?: number[]
    details?: any[]
}

export interface SectorOrgSummary {
    sector?: string
    name?: string
    orgid?: number
    contact_count?: number
    engagement_count?: number
    interview_count?: number
    [k: string]: any
}

export interface MonthlyKindEntry {
    month?: string
    kind?: string
    count?: number
    cnt?: number
}

export interface MonthlyRoleStatusEntry {
    month?: string
    status?: string
    count?: number
    cnt?: number
}

export interface AnalyticsSummary {
    min_date?: string | null
    max_date?: string | null
    topHiringOrgs?: TopHiringOrgs | null
    cumulativeContacts?: CumulativeSeries | null
    cumulativeEngagements?: CumulativeSeries | null
    cumulativeInterviews?: CumulativeSeries | null
    cumulativeRoles?: CumulativeSeries | null
    organizationsBySector?: SectorOrgSummary[]
    summary?: {
        total_contacts?: number
        total_engagements?: number
        total_interviews?: number
        total_applications?: number
        engagement_rate?: number
        interview_rate?: number
    }
    monthlyEngagementsByType?: MonthlyKindEntry[]
    monthlyRolesByStatus?: MonthlyRoleStatusEntry[]
    engagementsByType?: { kind?: string; count?: number }[]
    cumulativeRolesBySource?: any[]
    [k: string]: any
}

export interface Task {
    taskid?: number
    id?: number
    applicantid?: number | null
    name?: string
    taskname?: string
    duedate?: string | null
    notes?: string | null
    created_at?: string | null
    updated_at?: string | null
}

export interface TaskLog {
    id?: number
    taskid?: number
    commentary?: string
    logdate?: string | null
}

export interface TaskTarget {
    id?: number
    taskid?: number
    targettype?: number
    targetid?: number
    created_at?: string | null
}
