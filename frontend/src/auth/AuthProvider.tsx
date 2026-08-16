import React, { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../api/client'
import { setApplicantId } from './currentApplicant'
import { useQueryClient } from '@tanstack/react-query'

type Applicant = {
    applicantid: number
    email?: string
    firstname?: string
    lastname?: string
}

type AuthContextType = {
    isAuthenticated: boolean
    applicant: Applicant | null
    login: (email: string, password: string) => Promise<void>
    logout: () => Promise<void>
    // Refresh the current authenticated applicant info from the server
    refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [applicant, setApplicant] = useState<Applicant | null>(null)
    const [authChecked, setAuthChecked] = useState(false)
    const queryClient = useQueryClient()
    const isAuthenticated = Boolean(applicant)

    useEffect(() => {
        // On mount, check session
        let mounted = true
        // If there's no Flask session cookie present, skip the network call entirely
        // to avoid an expected 401 appearing in the browser network panel.
        const hasSessionCookie = () => {
            try {
                // Flask default session cookie name is 'session'. Check for it.
                return typeof document !== 'undefined' && document.cookie && document.cookie.indexOf('session=') !== -1
            } catch (e) {
                return false
            }
        }

            ; (async () => {
                if (!hasSessionCookie()) {
                    // No session cookie -> not authenticated. Avoid calling /api/auth/me which
                    // would return 401 and show as a failed network request in DevTools.
                    if (mounted) setApplicant(null)
                    if (mounted) setAuthChecked(true)
                    return
                }

                try {
                    const res = await api.get('/api/auth/me')
                    if (mounted && res.data && res.data.ok) {
                        setApplicant(res.data.applicant)
                        // Ensure react-query cached applicant settings reflect auth.me payload
                        try {
                            const app = res.data.applicant || {}
                            queryClient.setQueryData(['settings', 'applicant'], (old: any) => {
                                const merged = Object.assign({}, old || {}, {
                                    applicantId: app.applicantid ?? old?.applicantId ?? null,
                                    firstName: app.firstname ?? old?.firstName,
                                    lastName: app.lastname ?? old?.lastName,
                                    email: app.email ?? old?.email,
                                    avatarUrl: app.avatarurl ?? old?.avatarUrl,
                                    isSuperuser: app.issuperuser === true || app.issuperuser === 'true' || app.isSuperuser === true,
                                })
                                return merged
                            })
                        } catch (e) { /* ignore cache write errors */ }
                        // Store CSRF token (double-submit) for API requests
                        try {
                            if (typeof window !== 'undefined' && res.data.csrf_token) {
                                window.sessionStorage.setItem('JOBTRACK_CSRF', res.data.csrf_token)
                            }
                        } catch (e) { /* ignore */ }
                        // Ensure current applicant id is available to non-React modules
                        setApplicantId(res.data.applicant?.applicantid ?? null)
                    }
                } catch (e) {
                    // not authenticated
                    if (mounted) setApplicant(null)
                } finally {
                    if (mounted) setAuthChecked(true)
                }
            })()
        return () => {
            mounted = false
        }
    }, [])

    async function login(email: string, password: string) {
        // POST credentials and wait for server to set session cookie
        const res = await api.post('/api/auth/login', { email, password })
        if (!res.data || !res.data.ok) {
            throw new Error(res.data?.error || 'Login failed')
        }

        // Confirm server-side session is established and fetch authoritative applicant
        const me = await api.get('/api/auth/me')
        if (me.data && me.data.ok) {
            setApplicant(me.data.applicant)
            // Store CSRF token for API requests (double-submit). Stored in sessionStorage
            try {
                if (typeof window !== 'undefined' && me.data.csrf_token) {
                    window.sessionStorage.setItem('JOBTRACK_CSRF', me.data.csrf_token)
                }
            } catch (e) { /* ignore */ }
            // Debug log to trace applicant changes
            // eslint-disable-next-line no-console
            console.debug('[AuthProvider] login -> applicant (me)', me.data.applicant)
            setApplicantId(me.data.applicant?.applicantid ?? null)
            // Populate settings cache from auth.me so UI sees isSuperuser immediately
            try {
                const app = me.data.applicant || {}
                queryClient.setQueryData(['settings', 'applicant'], (old: any) => {
                    const merged = Object.assign({}, old || {}, {
                        applicantId: app.applicantid ?? old?.applicantId ?? null,
                        firstName: app.firstname ?? old?.firstName,
                        lastName: app.lastname ?? old?.lastName,
                        email: app.email ?? old?.email,
                        avatarUrl: app.avatarurl ?? old?.avatarUrl,
                        isSuperuser: app.issuperuser === true || app.issuperuser === 'true' || app.isSuperuser === true,
                    })
                    return merged
                })
            } catch (e) { /* ignore */ }
            // Invalidate cached queries so UI refetches with the new applicant context
            try {
                queryClient.invalidateQueries()
            } catch (e) {
                // ignore if react-query isn't present in a given environment
            }
            return
        }
        throw new Error('Failed to confirm authenticated session')
    }

    async function refresh() {
        try {
            const me = await api.get('/api/auth/me')
            if (me.data && me.data.ok) {
                setApplicant(me.data.applicant)
                try { setApplicantId(me.data.applicant?.applicantid ?? null) } catch (e) { }
                try {
                    const app = me.data.applicant || {}
                    queryClient.setQueryData(['settings', 'applicant'], (old: any) => {
                        const merged = Object.assign({}, old || {}, {
                            applicantId: app.applicantid ?? old?.applicantId ?? null,
                            firstName: app.firstname ?? old?.firstName,
                            lastName: app.lastname ?? old?.lastName,
                            email: app.email ?? old?.email,
                            avatarUrl: app.avatarurl ?? old?.avatarUrl,
                            isSuperuser: app.issuperuser === true || app.issuperuser === 'true' || app.isSuperuser === true,
                        })
                        return merged
                    })
                } catch (e) { /* ignore */ }
                try { queryClient.invalidateQueries() } catch (e) { }
            }
        } catch (e) {
            // ignore refresh errors
        }
    }

    async function logout() {
        await api.post('/api/auth/logout')
        // Debug log to trace logout flow
        // eslint-disable-next-line no-console
        console.debug('[AuthProvider] logout')
        setApplicant(null)
        setApplicantId(null)
        try {
            // Cancel any in-flight queries and remove cached queries so react-query
            // does not attempt background refetches that call endpoints requiring
            // an applicant id (which would throw 'Applicant not selected').
            queryClient.cancelQueries()
            queryClient.removeQueries()
        } catch (e) {
            // ignore
        }
        try { if (typeof window !== 'undefined') window.sessionStorage.removeItem('JOBTRACK_CSRF') } catch (e) { }
    }

    if (!authChecked) return null

    return (
        <AuthContext.Provider value={{ isAuthenticated, applicant, login, logout, refresh }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}
