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
    fetchTasks: vi.fn(),
    fetchTaskTargets: vi.fn(),
    fetchTaskLogs: vi.fn(),
    addTaskTarget: vi.fn(),
}))

// Mock data
const mockContacts = [
    {
        contactid: 1,
        name: 'John Doe',
        email: 'john@example.com',
        current_organization: 'Acme Corp',
        currentorgid: 1,
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
        current_organization: 'Tech Inc',
        currentorgid: 2,
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
    // Prefer accessible selector on clickable count: role=button with aria-label "<Label> for <CardName>"
    try {
        const btn = screen.getByRole('button', { name: new RegExp(`${label} for ${cardName}`, 'i') })
        return btn
    } catch (err) {
        // Fallback to legacy DOM traversal for older renderings
    }

    const candidates = screen.getAllByText(cardName)
    for (const candidate of candidates) {
        const card = candidate.closest('[role="article"]') || candidate.closest('div[class*="MuiPaper"]') || candidate.closest('div')
        if (!card) continue
        const section = within(card).queryByText(new RegExp(`${label}:`, 'i'))?.parentElement
        if (section) {
            const found = within(section).queryByText(count)
            if (found) return found
        }
    }
    throw new Error(`Could not find clickable count for ${cardName} ${label} ${count}`)
}

function renderHubMainView(props = {}) {
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

describe('HubMainView Mobile Modals', () => {
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
        vi.mocked(client.fetchTasks).mockResolvedValue([])
        vi.mocked(client.fetchTaskTargets).mockResolvedValue([])
        vi.mocked(client.fetchTaskLogs).mockResolvedValue([])

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
            renderHubMainView({ activeKey: 'contacts' })

            // Wait for contacts to load
            await waitFor(() => {
                expect(screen.getByText('John Doe')).toBeInTheDocument()
            })

            // Find and click the engagements count (should be "3")
            // The count is rendered near "Engagements:" label in the card
            // Use getAllByText and find the one in a card that also has "Engagements"
            // Find the card container robustly (may be wrapped differently across views)
            const johnCandidates = screen.getAllByText('John Doe')
            let johnCard: Element | null = null
            for (const c of johnCandidates) {
                johnCard = c.closest('[role="article"]') || c.closest('div[class*="MuiPaper"]') || c.closest('div')
                if (johnCard) break
            }
            expect(johnCard).toBeTruthy()

            // Within John's card, find the "3" text that's near "Engagements"
            // Prefer clicking the interactive element (role=button + aria-label) added to metadata.
            // Fall back to legacy text node lookup if the accessible button isn't present.
            const engagementsButton = within(johnCard).queryByRole('button', { name: /Engagements for John Doe/i }) || within(johnCard).getByText('3')
            await user.click(engagementsButton)

            // Modal should open with title
            await waitFor(() => {
                const dialog = document.querySelector('[role="dialog"]')
                expect(dialog).toBeTruthy()
                expect(within(dialog!).getByText(/Engagements/i)).toBeInTheDocument()
            })

            // Should show engagements for John Doe only
            await waitFor(() => {
                expect(screen.getByText('Follow up discussion')).toBeInTheDocument()
                expect(screen.getByText('Initial outreach')).toBeInTheDocument()
            })

            // Should NOT show Jane Smith's engagement
            expect(screen.queryByText('Interview prep')).not.toBeInTheDocument()
        })

        it('should close engagements modal when clicking close button', async () => {
            const user = userEvent.setup()
            renderHubMainView({ activeKey: 'contacts' })

            await waitFor(() => {
                expect(screen.getByText('John Doe')).toBeInTheDocument()
            })

            // Click engagements count
            const engagementsLink = findClickableCount('John Doe', 'Engagements', '3')
            await user.click(engagementsLink)

            // Modal opens
            await waitFor(() => {
                const dialog = document.querySelector('[role="dialog"]')
                expect(dialog).toBeTruthy()
                expect(within(dialog!).getByText(/Engagements/i)).toBeInTheDocument()
            })

            // Click close button
            const closeButton = screen.getByRole('button', { name: /close/i })
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
            renderHubMainView({ activeKey: 'contacts' })

            await waitFor(() => {
                expect(screen.getByText('John Doe')).toBeInTheDocument()
            })

            // Find and click the applications/roles count (should be "2")
            const rolesLink = findClickableCount('John Doe', 'Applications', '2')
            await user.click(rolesLink)

            // Modal should open with title
            await waitFor(() => {
                const dialog = document.querySelector('[role="dialog"]')
                expect(dialog).toBeTruthy()
                expect(within(dialog!).getByText(/Applications/i)).toBeInTheDocument()
            })

            // Should show roles for John Doe
            await waitFor(() => {
                expect(screen.getByText('Senior Engineer')).toBeInTheDocument()
                expect(screen.getByText('Lead Developer')).toBeInTheDocument()
            }, { timeout: 5000 })
        })
    })

    describe('Organisation Contacts Modal', () => {
        it('should open contacts modal when clicking contacts count on organisation card', async () => {
            const user = userEvent.setup()
            renderHubMainView({ activeKey: 'organisations' })

            await waitFor(() => {
                expect(screen.getByText('Acme Corp')).toBeInTheDocument()
            })

            // Click the contacts count (should be "3")
            const contactsLink = findClickableCount('Acme Corp', 'Contacts', '3')
            await user.click(contactsLink)

            // Modal should open with title (specific match to avoid ambiguous 'Contacts' matches)
            await waitFor(() => {
                const dialog = document.querySelector('[role="dialog"]')
                expect(dialog).toBeTruthy()
                expect(within(dialog!).getByText(/Acme Corp.*Contacts/i)).toBeInTheDocument()
            })

            // Should show contacts from Acme Corp (scope to active dialog)
            const dialog = await screen.findByRole('dialog')
            await within(dialog).findByText('John Doe')
        })

        it('should close contacts modal when clicking close button', async () => {
            const user = userEvent.setup()
            renderHubMainView({ activeKey: 'organisations' })

            await waitFor(() => {
                expect(screen.getByText('Acme Corp')).toBeInTheDocument()
            })

            // Click contacts count
            const contactsLink = findClickableCount('Acme Corp', 'Contacts', '3')
            await user.click(contactsLink)

            // Modal opens (scope to dialog)
            await waitFor(() => {
                const dialog = document.querySelector('[role="dialog"]')
                expect(dialog).toBeTruthy()
                expect(within(dialog!).getByText(/Acme Corp.*Contacts/i)).toBeInTheDocument()
            })

            // Click close button
            const closeButton = screen.getByRole('button', { name: /close/i })
            await user.click(closeButton)

            // Modal should close (dialog removed)
            await waitFor(() => {
                expect(document.querySelector('[role="dialog"]')).toBeNull()
            })
        })
    })

    describe('Organisation Roles Modal', () => {
        it('should open roles modal when clicking roles count on organisation card', async () => {
            const user = userEvent.setup()
            renderHubMainView({ activeKey: 'organisations' })

            await waitFor(() => {
                expect(screen.getByText('Acme Corp')).toBeInTheDocument()
            })

            // Click the roles count (should be "5")
            const rolesLink = findClickableCount('Acme Corp', 'Roles', '5')
            await user.click(rolesLink)

            // Modal should open with title
            await waitFor(() => {
                expect(screen.getByText(/Acme Corp.*Roles/i)).toBeInTheDocument()
            })

            // Should show role for Acme Corp
            await waitFor(() => {
                expect(screen.getByText('Senior Engineer')).toBeInTheDocument()
            })
        })
    })

    describe('Recruiters View', () => {
        it.skip('should open engagements modal from recruiter contact card', async () => {
            const user = userEvent.setup()
            renderHubMainView({ activeKey: 'recruiters', recruiterRefId: 1 })

            await waitFor(() => {
                expect(screen.getByText('John Doe')).toBeInTheDocument()
            })

            // Click engagements count: ensure we click the count for the John Doe card that belongs to Acme Corp
            const johnCandidates = screen.getAllByText('John Doe')
            let clicked = false
            for (const c of johnCandidates) {
                const johnCard = c.closest('[role="article"]') || c.closest('div[class*="MuiPaper"]') || c.closest('div')
                if (!johnCard) continue
                // Ensure this card is the one from Acme Corp
                try {
                    within(johnCard).getByText('Acme Corp')
                    const engagementsSection = within(johnCard).getByText(/Engagements:/i).parentElement
                    const engagementsCount = within(engagementsSection!).getByText('3')
                    await user.click(engagementsCount)
                    clicked = true
                    break
                } catch (err) {
                    // not the right card, continue
                }
            }
            expect(clicked).toBeTruthy()
            // Modal should open and show engagements for John Doe (scope to active dialog)
            await waitFor(() => {
                const dialogEl = document.querySelector('[role="dialog"]')
                expect(dialogEl).toBeTruthy()
            }, { timeout: 5000 })
            const dialog = document.querySelector('[role="dialog"]') as Element
            await within(dialog).findByText(/Engagements/i)
            await within(dialog).findByText('Follow up discussion')
            await within(dialog).findByText('Initial outreach')
        })

        it.skip('should open roles modal from recruiter contact card', async () => {
            const user = userEvent.setup()
            renderHubMainView({ activeKey: 'recruiters', recruiterRefId: 1 })

            await waitFor(() => {
                expect(screen.getByText('John Doe')).toBeInTheDocument()
            })

            // Click roles count
            const rolesLink = findClickableCount('John Doe', 'Applications', '2')
            await user.click(rolesLink)

            // Modal should open (allow title to be split across nodes)
            await waitFor(() => {
                const dialogEl = document.querySelector('[role="dialog"]')
                expect(dialogEl).toBeTruthy()
            })
            const dialog2 = document.querySelector('[role="dialog"]') as Element
            // accept Applications or Roles title within the active dialog
            await within(dialog2).findByText((content, node) => {
                const text = node?.textContent || ''
                return /Applications/i.test(text) || /Roles/i.test(text)
            })
        })
    })

    describe('Multiple Modals', () => {
        it('should allow opening different modals sequentially', async () => {
            const user = userEvent.setup()
            renderHubMainView({ activeKey: 'contacts' })

            await waitFor(() => {
                expect(screen.getByText('John Doe')).toBeInTheDocument()
            })

            // Open engagements modal
            const engagementsLink = findClickableCount('John Doe', 'Engagements', '3')
            await user.click(engagementsLink)

            await waitFor(() => {
                const dialog = document.querySelector('[role="dialog"]')
                expect(dialog).toBeTruthy()
                expect(within(dialog!).getByText(/Engagements/i)).toBeInTheDocument()
            })

            // Close it
            const closeButton1 = screen.getByRole('button', { name: /close/i })
            await user.click(closeButton1)

            // Open roles modal
            const rolesLink = findClickableCount('John Doe', 'Applications', '2')
            await user.click(rolesLink)

            // Roles modal should open
            await waitFor(() => {
                const dialog = document.querySelector('[role="dialog"]')
                expect(dialog).toBeTruthy()
                expect(within(dialog!).getByText(/Applications|Roles/i)).toBeInTheDocument()
            })
        })
    })

    describe('Mobile Card Display in Modals', () => {
        it('should display mobile card list in engagements modal on mobile viewport', async () => {
            const user = userEvent.setup()
            renderHubMainView({ activeKey: 'contacts' })

            await waitFor(() => {
                expect(screen.getByText('John Doe')).toBeInTheDocument()
            })

            // Open engagements modal
            const engagementsLink = findClickableCount('John Doe', 'Engagements', '3')
            await user.click(engagementsLink)

            // Should show engagement cards, not table
            await waitFor(() => {
                expect(screen.getByText('Follow up discussion')).toBeInTheDocument()
                expect(screen.getByText('Initial outreach')).toBeInTheDocument()
            })

            // Should have card-like structure (check for metadata labels)
            // Scope the search to the active dialog to avoid matching other cards on the page
            const dialog = document.querySelector('[role="dialog"]')
            expect(dialog).toBeTruthy()
            expect(within(dialog!).getAllByText(/kind/i).length).toBeGreaterThan(0)
        })

        it('should display mobile card list in roles modal on mobile viewport', async () => {
            const user = userEvent.setup()
            renderHubMainView({ activeKey: 'contacts' })

            await waitFor(() => {
                expect(screen.getByText('John Doe')).toBeInTheDocument()
            })

            // Open roles modal
            const rolesLink = findClickableCount('John Doe', 'Applications', '2')
            await user.click(rolesLink)

            // Should show role cards
            await waitFor(() => {
                expect(screen.getByText('Senior Engineer')).toBeInTheDocument()
            })
        })
    })
})
