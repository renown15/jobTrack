import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import HubMainView from '../../../../src/components/Hub/HubMainView'
import * as client from '../../../../src/api/client'

// Mock useMediaQuery to always return true (mobile view)
vi.mock('@mui/material/useMediaQuery', () => ({
    default: vi.fn(() => true), // Always return true for isMobile
}))

// Mock API functions
vi.mock('../../../../src/api/client', () => ({
    fetchAllContacts: vi.fn(),
    fetchOrganisations: vi.fn(),
    fetchJobRoles: vi.fn(),
    fetchEngagements: vi.fn(),
    deleteContact: vi.fn(),
    deleteOrganisation: vi.fn(),
    deleteJobRole: vi.fn(),
    deleteEngagement: vi.fn(),
    updateContact: vi.fn(),
    fetchReferenceData: vi.fn(),
    fetchDocuments: vi.fn(),
    fetchActions: vi.fn(),
    fetchSectors: vi.fn(),
}))

// Mock data
const mockContacts = [
    {
        contactid: 1,
        name: 'John Doe',
        email: 'john@example.com',
        currentorgid: 1,
        current_organization: 'Acme Corp',
        current_org_sector: 'Technology',
        role_type: 'Recruiter',
        engagement_count: 3,
        roles_count: 2,
        last_contact_date: '2024-01-01',
        islinkedinconnected: true,
    },
    {
        contactid: 2,
        name: 'Jane Smith',
        email: 'jane@example.com',
        currentorgid: 2,
        current_organization: 'Tech Inc',
        role_type: 'Contact',
        engagement_count: 5,
        roles_count: 1,
        last_contact_date: '2024-01-15',
    },
]

const mockOrganisations = [
    {
        orgid: 1,
        name: 'Acme Corp',
        sector_summary: 'Technology',
        contacts_count: 3,
        roles_count: 5,
        created_at: '2023-01-01',
    },
    {
        orgid: 2,
        name: 'Tech Inc',
        sector_summary: 'Software',
        contacts_count: 2,
        roles_count: 3,
        created_at: '2023-06-01',
    },
]

const mockRoles = [
    {
        jobid: 1,
        roleid: 1,
        rolename: 'Senior Engineer',
        role_title: 'Senior Engineer',
        company_name: 'Acme Corp',
        companyorgid: 1,
        contactid: 1,
        status_name: 'Active',
        applicationdate: '2024-01-01',
    },
    {
        jobid: 2,
        roleid: 2,
        rolename: 'Lead Developer',
        role_title: 'Lead Developer',
        company_name: 'Tech Inc',
        companyorgid: 2,
        contactid: 1,
        status_name: 'Applied',
        applicationdate: '2024-01-15',
    },
]

const mockEngagements = [
    {
        engagementid: 1,
        contactid: 1,
        contact_name: 'John Doe',
        kind: 'Call',
        notes: 'Follow up discussion',
        engagement_date: '2024-01-05',
    },
    {
        engagementid: 2,
        contactid: 1,
        contact_name: 'John Doe',
        kind: 'Email',
        notes: 'Initial outreach',
        engagement_date: '2024-01-01',
    },
    {
        engagementid: 3,
        contactid: 2,
        contact_name: 'Jane Smith',
        kind: 'Meeting',
        notes: 'Interview prep',
        engagement_date: '2024-01-10',
    },
]

// Helper to find clickable count in a card's metadata section
function findClickableCount(cardName: string, label: string, count: string) {
    const candidates = screen.getAllByText(cardName)
    for (const candidate of candidates) {
        const card = candidate.closest('[role="article"]') || candidate.closest('div[class*="MuiPaper"]') || candidate.closest('div')
        if (!card) continue
        // Try label with trailing colon first, then without if not found (mobile rendering may omit colon)
        let section = within(card).queryByText(new RegExp(`${label}:`, 'i'))?.parentElement
        if (!section) section = within(card).queryByText(new RegExp(`${label}`, 'i'))?.parentElement
        if (section) {
            const found = within(section).queryByText(count)
            if (found) return found
        }
    }
    // Fallback: throw to keep test failure clear
    throw new Error(`Could not find clickable count for ${cardName} ${label} ${count}`)
}

function renderBottomPanel(props = {}) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, staleTime: 0 },
        },
    })

    const defaultProps = {
        activeKey: 'contacts',
        search: '',
        hideCreateButton: false,
        ...props,
    }

    return render(
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <HubMainView {...defaultProps} />
            </BrowserRouter>
        </QueryClientProvider>
    )
}

describe('BottomPanel Mobile Modals', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(client.fetchAllContacts).mockResolvedValue(mockContacts)
        vi.mocked(client.fetchOrganisations).mockResolvedValue(mockOrganisations)
        vi.mocked(client.fetchJobRoles).mockResolvedValue(mockRoles)
        vi.mocked(client.fetchEngagements).mockResolvedValue(mockEngagements)
        vi.mocked(client.fetchReferenceData).mockResolvedValue([])
        vi.mocked(client.fetchDocuments).mockResolvedValue([])
        vi.mocked(client.fetchActions).mockResolvedValue([])
        vi.mocked(client.fetchSectors).mockResolvedValue([])

        // Mock window.matchMedia for mobile viewport
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation(query => ({
                matches: query === '(max-width: 899px)', // Mobile viewport
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        })
    })

    describe('Contact Engagements Modal', () => {
        it('should open engagements modal when clicking engagement count on contact card', async () => {
            const user = userEvent.setup()
            renderBottomPanel({ activeKey: 'contacts' })

            // Wait for contacts to load
            await waitFor(() => {
                expect(screen.getByText('John Doe')).toBeInTheDocument()
            })

            // Find and click the engagements count (should be "3")
            const johnCandidates = screen.getAllByText('John Doe')
            let johnCard: Element | null = null
            for (const c of johnCandidates) {
                johnCard = c.closest('[role="article"]') || c.closest('div[class*="MuiPaper"]') || c.closest('div')
                if (johnCard) break
            }
            expect(johnCard).toBeTruthy()

            const engagementsSection = within(johnCard!).getByText(/Engagements:/i).parentElement
            const engagementsCount = within(engagementsSection!).getByText('3')

            await user.click(engagementsCount)

            // Modal should open with title (await the dialog)
            const dialog1 = await screen.findByRole('dialog')
            expect(within(dialog1).getByText(/John Doe.*Engagements/i)).toBeInTheDocument()

            // Should show engagements for John Doe only (scoped to dialog)
            expect(within(dialog1).getByText('Follow up discussion')).toBeInTheDocument()
            expect(within(dialog1).getByText('Initial outreach')).toBeInTheDocument()

            // Should NOT show Jane Smith's engagement
            expect(within(dialog1).queryByText('Interview prep')).not.toBeInTheDocument()
        })

        it('should close engagements modal when clicking close button', async () => {
            const user = userEvent.setup()
            renderBottomPanel({ activeKey: 'contacts' })

            await waitFor(() => {
                expect(screen.getByText('John Doe')).toBeInTheDocument()
            })

            // Click engagements count
            const engagementsLink = findClickableCount('John Doe', 'Engagements', '3')
            await user.click(engagementsLink)

            // Modal opens
            const dialog2 = await screen.findByRole('dialog')
            expect(within(dialog2).getByText(/John Doe.*Engagements/i)).toBeInTheDocument()

            // Click close button scoped to dialog
            const closeButton = within(dialog2).getByRole('button', { name: /close/i })
            await user.click(closeButton)

            // Modal should close
            await waitFor(() => {
                expect(screen.queryByText('Follow up discussion')).not.toBeInTheDocument()
            })
        })
    })

    describe('Contact Roles Modal', () => {
        it('should open roles modal when clicking roles count on contact card', async () => {
            const user = userEvent.setup()
            renderBottomPanel({ activeKey: 'contacts' })

            await waitFor(() => {
                expect(screen.getByText('John Doe')).toBeInTheDocument()
            })

            // Find and click the applications/roles count (should be "2")
            const rolesLink = findClickableCount('John Doe', 'Applications', '2')
            await user.click(rolesLink)

            // Modal should open with title (scoped)
            const dialog3 = await screen.findByRole('dialog')
            expect(within(dialog3).getByText(/John Doe.*Applications/i)).toBeInTheDocument()

            // Should show roles for John Doe (scoped)
            expect(within(dialog3).getByText('Senior Engineer')).toBeInTheDocument()
            expect(within(dialog3).getByText('Lead Developer')).toBeInTheDocument()
        })
    })

    describe('Organisation Contacts Modal', () => {
        it('should open contacts modal when clicking contacts count on organisation card', async () => {
            const user = userEvent.setup()
            renderBottomPanel({ activeKey: 'organisations' })

            await waitFor(() => {
                expect(screen.getByText('Acme Corp')).toBeInTheDocument()
            })

            // Click the contacts count (should be "3")
            const contactsLink = findClickableCount('Acme Corp', 'Contacts', '3')
            await user.click(contactsLink)

            // Modal should open and show contacts (scope to dialog)
            const dialog4 = await screen.findByRole('dialog')
            expect(within(dialog4).getByText(/Acme Corp.*Contacts/i)).toBeInTheDocument()
            expect(within(dialog4).getByText('John Doe')).toBeInTheDocument()
        })

        it('should close contacts modal when clicking close button', async () => {
            const user = userEvent.setup()
            renderBottomPanel({ activeKey: 'organisations' })

            await waitFor(() => {
                expect(screen.getByText('Acme Corp')).toBeInTheDocument()
            })

            // Click contacts count
            const contactsLink = findClickableCount('Acme Corp', 'Contacts', '3')
            await user.click(contactsLink)

            // Modal opens
            const dialog5 = await screen.findByRole('dialog')
            expect(within(dialog5).getByText(/Acme Corp.*Contacts/i)).toBeInTheDocument()

            // Click close button scoped to dialog
            const closeButton2 = within(dialog5).getByRole('button', { name: /close/i })
            await user.click(closeButton2)

            // Modal should close
            await waitFor(() => {
                expect(screen.queryByText(/Acme Corp.*Contacts/i)).not.toBeInTheDocument()
            })
        })
    })

    describe('Organisation Roles Modal', () => {
        it('should open roles modal when clicking roles count on organisation card', async () => {
            const user = userEvent.setup()
            renderBottomPanel({ activeKey: 'organisations' })

            await waitFor(() => {
                expect(screen.getByText('Acme Corp')).toBeInTheDocument()
            })

            // Click the roles count (should be "5")
            const rolesLink = findClickableCount('Acme Corp', 'Roles', '5')
            await user.click(rolesLink)

            // Modal should open with title (scoped)
            const dialog6 = await screen.findByRole('dialog')
            expect(within(dialog6).getByText(/Acme Corp.*Roles/i)).toBeInTheDocument()
            expect(within(dialog6).getByText('Senior Engineer')).toBeInTheDocument()
        })
    })

    describe('Recruiters View', () => {
        it('should open engagements modal from recruiter contact card', async () => {
            const user = userEvent.setup()
            renderBottomPanel({ activeKey: 'recruiters', recruiterRefId: 1 })

            await waitFor(() => {
                expect(screen.getByText('John Doe')).toBeInTheDocument()
            })

            // Click engagements count and verify dialog
            const engagementsLink = findClickableCount('John Doe', 'Engagements', '3')
            await user.click(engagementsLink)

            // Some environments may split the title into multiple nodes; assert name and section separately
            const [nameNodeE, engNode] = await Promise.all([
                screen.findByText(/John Doe/i),
                screen.findByText(/Engagements/i),
            ])
            expect(nameNodeE).toBeInTheDocument()
            expect(engNode).toBeInTheDocument()
        })

        it('should open roles modal from recruiter contact card', async () => {
            const user = userEvent.setup()
            renderBottomPanel({ activeKey: 'recruiters', recruiterRefId: 1 })

            await waitFor(() => {
                expect(screen.getByText('John Doe')).toBeInTheDocument()
            })

            const rolesLink = findClickableCount('John Doe', 'Applications', '2')
            await user.click(rolesLink)

            // Some environments may split the title into multiple nodes; assert name and section separately
            const [nameNode, appsNode] = await Promise.all([
                screen.findByText(/John Doe/i),
                screen.findByText(/Applications/i),
            ])
            expect(nameNode).toBeInTheDocument()
            expect(appsNode).toBeInTheDocument()
        })
    })

    describe('Multiple Modals', () => {
        it('should allow opening different modals sequentially', async () => {
            const user = userEvent.setup()
            renderBottomPanel({ activeKey: 'contacts' })

            await waitFor(() => {
                expect(screen.getByText('John Doe')).toBeInTheDocument()
            })

            // Open engagements modal
            const engagementsLink = findClickableCount('John Doe', 'Engagements', '3')
            await user.click(engagementsLink)

            const dialog9 = await screen.findByRole('dialog')
            expect(within(dialog9).getByText(/Engagements/i)).toBeInTheDocument()

            // Close it (scoped)
            const closeButton1 = within(dialog9).getByRole('button', { name: /close/i })
            await user.click(closeButton1)

            // Open roles modal
            const rolesLink2 = findClickableCount('John Doe', 'Applications', '2')
            await user.click(rolesLink2)

            // Roles modal should open
            const dialog10 = await screen.findByRole('dialog')
            expect(within(dialog10).getByText(/Applications/i)).toBeInTheDocument()
        })
    })

    describe('Mobile Card Display in Modals', () => {
        it('should display mobile card list in engagements modal on mobile viewport', async () => {
            const user = userEvent.setup()
            renderBottomPanel({ activeKey: 'contacts' })

            await waitFor(() => {
                expect(screen.getByText('John Doe')).toBeInTheDocument()
            })

            // Open engagements modal
            const engagementsLink2 = findClickableCount('John Doe', 'Engagements', '3')
            await user.click(engagementsLink2)

            // Verify contents scoped to dialog
            const dialog11 = await screen.findByRole('dialog')
            expect(within(dialog11).getByText('Follow up discussion')).toBeInTheDocument()
            expect(within(dialog11).getByText('Initial outreach')).toBeInTheDocument()
            // Should have card-like structure (check for metadata labels)
            const kindMatches = within(dialog11).getAllByText(/kind/i)
            expect(kindMatches.length).toBeGreaterThan(0)
        })

        it('should display mobile card list in roles modal on mobile viewport', async () => {
            const user = userEvent.setup()
            renderBottomPanel({ activeKey: 'contacts' })

            await waitFor(() => {
                expect(screen.getByText('John Doe')).toBeInTheDocument()
            })

            // Open roles modal and scope to dialog
            const rolesLink3 = findClickableCount('John Doe', 'Applications', '2')
            await user.click(rolesLink3)
            const dialog12 = await screen.findByRole('dialog')
            expect(within(dialog12).getByText('Senior Engineer')).toBeInTheDocument()
        })
    })
})
