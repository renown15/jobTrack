import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatPanel from '../ChatPanel'
import * as api from '../../api/client'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'

describe('ChatPanel health & send button', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('calls navigator health with applicant id and enables Send when OK', async () => {
        const fetchApplicantSpy = vi.spyOn(api, 'fetchApplicantSettings').mockResolvedValue({ applicantid: 42 })
        const fetchHealthSpy = vi.spyOn(api, 'fetchNavigatorHealth').mockResolvedValue({ ok: true, llm: { ok: true } })

        render(<ChatPanel />)

        // Open the chat panel by clicking the floating icon
        const openBtn = screen.getByRole('button')
        await userEvent.click(openBtn)

        // Find the textbox (use role so tests are robust to placeholder text changes)
        const input = await screen.findByRole('textbox')
        await userEvent.type(input, 'Hello')

        // Wait for health probe to be invoked with the applicant id
        await waitFor(() => expect(fetchHealthSpy).toHaveBeenCalledWith(42))

        // Send button should be enabled once llmOk is true and input is present
        const sendBtn = screen.getByRole('button', { name: /Send/i })
        await waitFor(() => expect(sendBtn).not.toBeDisabled())
    })

    it('keeps Send disabled when health report indicates unavailable', async () => {
        vi.spyOn(api, 'fetchApplicantSettings').mockResolvedValue({ applicantid: 7 })
        const fetchHealthSpy = vi.spyOn(api, 'fetchNavigatorHealth').mockResolvedValue({ ok: false, llm: { ok: false } })

        render(<ChatPanel />)
        const openBtn = screen.getByRole('button')
        await userEvent.click(openBtn)

        // Wait for the health probe to be invoked for the given applicant
        await waitFor(() => expect(fetchHealthSpy).toHaveBeenCalledWith(7))

        const sendBtn = screen.getByRole('button', { name: /Send/i })
        // Assert disabled once health indicates unavailable
        await waitFor(() => expect(sendBtn).toBeDisabled())
    })
})
