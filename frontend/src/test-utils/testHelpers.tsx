import { act } from 'react-dom/test-utils'
import userEvent from '@testing-library/user-event'

// Small helpers that wrap user-event calls in act(...) so tests don't need
// to remember to do this in every place where async state updates occur.
// Tests can import these helpers if they prefer explicit act-wrapping.
export async function click(element: Element) {
    await act(async () => {
        await userEvent.click(element)
    })
}

export async function type(element: Element, text: string) {
    await act(async () => {
        await userEvent.type(element as any, text)
    })
}

export async function clear(element: Element) {
    await act(async () => {
        await userEvent.clear(element as any)
    })
}
