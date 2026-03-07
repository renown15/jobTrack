import React, { useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Hub from './pages/Hub'
import Contacts from './pages/Contacts'
import Organisations from './pages/Organisations'
import JobApplications from './pages/JobApplications'
import Engagements from './pages/Engagements'
import Settings from './pages/Settings'
import GetStarted from './pages/GetStarted'
import Analytics from './pages/Analytics'
import Documents from './pages/Documents'
import Leads from './pages/Leads'
import ActionCanvas from './pages/ActionCanvas'
import NetworkingPage from './pages/Networking'
import Navigator from './pages/Navigator'
import Coaching from './pages/Coaching'
import Login from './pages/Login'
import ApplicantManager from './components/Admin/ApplicantManager'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { useQuery } from '@tanstack/react-query'
import { fetchApplicantSettings } from './api/client'
import Avatar from '@mui/material/Avatar'
import Sidebar from './components/Sidebar'
import ChatPanel from './components/ChatPanel'
import IconButton from '@mui/material/IconButton'
import MenuIcon from '@mui/icons-material/Menu'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import MobileSidebar from './components/MobileSidebar'

function ProtectedRoute({ children }: { children: JSX.Element }) {
    const { isAuthenticated } = useAuth()
    console.debug('[jobtrack] ProtectedRoute render, isAuthenticated=', isAuthenticated)
    if (!isAuthenticated) return <Navigate to="/login" replace />
    return children
}

const BRAND_PURPLE = '#3f0071'

function Header({ onOpenMenu }: { onOpenMenu?: () => void }) {
    const { isAuthenticated, applicant, logout } = useAuth()
    const navigate = useNavigate()
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))

    console.debug('[jobtrack] Header render, isAuthenticated=', isAuthenticated, 'applicant=', applicant)

    const handleLogout = async () => {
        await logout()
        navigate('/login')
    }

    return (
        <header style={{ padding: 16, borderBottom: `1px solid ${BRAND_PURPLE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: BRAND_PURPLE, color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {isMobile && onOpenMenu ? (
                    <IconButton onClick={onOpenMenu} sx={{ color: '#fff' }} aria-label="open menu">
                        <MenuIcon />
                    </IconButton>
                ) : null}
                <div data-jobtrack-logo style={{ display: 'inline-block', background: '#fff', padding: '8px 12px', borderRadius: 6 }}>
                    <span style={{ color: BRAND_PURPLE, fontWeight: 400, fontSize: 16 }}>
                        Job
                    </span>
                    <span style={{ color: BRAND_PURPLE, fontWeight: 700, fontSize: 16, marginLeft: 2 }}>
                        Track
                    </span>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 400 }}>
                    Powering your Exectuvie Job Search
                </div>
            </div>
            <div>
                {isAuthenticated && applicant ? (
                    <HeaderAccountSection onLogout={handleLogout} applicant={applicant} />
                ) : null}
            </div>
        </header>
    )
}

function HeaderAccountSection({ onLogout, applicant }: { onLogout: () => void, applicant: any }) {
    const [hovered, setHovered] = useState(false)
    const bg = hovered ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'
    const transform = hovered ? 'translateY(-2px) scale(1.01)' : 'none'
    const { data: settings = {} } = useQuery(['settings', 'applicant'], fetchApplicantSettings)
    console.debug('[jobtrack] HeaderAccountSection settings=', settings)
    return (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Avatar src={settings.avatarUrl || ''} alt={applicant.firstname || ''} sx={{ width: 28, height: 28 }} />
            <span>Signed in as <strong>{applicant.firstname || applicant.email}</strong></span>
            <button
                onClick={onLogout}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    background: bg,
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#fff',
                    padding: '6px 8px',
                    borderRadius: 4,
                    transition: 'background 150ms ease, transform 150ms ease',
                    transform,
                    cursor: 'pointer'
                }}
            >
                Log out
            </button>
        </div>
    )
}

function MainLayout({ children }: { children: React.ReactNode }) {
    console.debug('[jobtrack] MainLayout render')
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const [drawerOpen, setDrawerOpen] = useState(false)

    return (
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
            {!isMobile && <Sidebar />}
            {isMobile && <MobileSidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', backgroundColor: BRAND_PURPLE }}>
                <Header onOpenMenu={() => setDrawerOpen(true)} />
                <main style={{ flex: 1, overflow: 'auto', backgroundColor: '#fff', padding: 24 }}>{children}</main>
            </div>
            <ChatPanel />
        </div>
    )
}

export default function App() {
    console.debug('[jobtrack] App render')
    React.useEffect(() => {
        console.debug('[jobtrack] App mounted')
        return () => console.debug('[jobtrack] App unmounted')
    }, [])

    return (
        <AuthProvider>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route
                    path="/"
                    element={
                        <ProtectedRoute>
                            <MainLayout>
                                <Hub />
                            </MainLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/hub"
                    element={
                        <ProtectedRoute>
                            <MainLayout>
                                <Hub />
                            </MainLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/contacts"
                    element={
                        <ProtectedRoute>
                            <MainLayout>
                                <Contacts />
                            </MainLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/organisations"
                    element={
                        <ProtectedRoute>
                            <MainLayout>
                                <Organisations />
                            </MainLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/applications"
                    element={
                        <ProtectedRoute>
                            <MainLayout>
                                <JobApplications />
                            </MainLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/engagements"
                    element={
                        <ProtectedRoute>
                            <MainLayout>
                                <Engagements />
                            </MainLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/analytics"
                    element={
                        <ProtectedRoute>
                            <MainLayout>
                                <Analytics />
                            </MainLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/networking"
                    element={
                        <ProtectedRoute>
                            <MainLayout>
                                <NetworkingPage />
                            </MainLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/documents"
                    element={
                        <ProtectedRoute>
                            <MainLayout>
                                <Documents />
                            </MainLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/leads"
                    element={
                        <ProtectedRoute>
                            <MainLayout>
                                <Leads />
                            </MainLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/action-plan"
                    element={
                        <ProtectedRoute>
                            <MainLayout>
                                <ActionCanvas />
                            </MainLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/action-canvas"
                    element={
                        <ProtectedRoute>
                            <MainLayout>
                                <ActionCanvas />
                            </MainLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/navigator"
                    element={
                        <ProtectedRoute>
                            <MainLayout>
                                <Navigator />
                            </MainLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/settings"
                    element={
                        <ProtectedRoute>
                            <MainLayout>
                                <Settings />
                            </MainLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/admin/applicants"
                    element={
                        <ProtectedRoute>
                            <MainLayout>
                                <ApplicantManager />
                            </MainLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/get-started"
                    element={
                        <ProtectedRoute>
                            <MainLayout>
                                <GetStarted />
                            </MainLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/coaching"
                    element={
                        <ProtectedRoute>
                            <MainLayout>
                                <Coaching />
                            </MainLayout>
                        </ProtectedRoute>
                    }
                />
            </Routes>
        </AuthProvider>
    )
}
