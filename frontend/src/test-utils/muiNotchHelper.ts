// Test helper to emulate browser layout measurements MUI relies on for
// outlined notches. jsdom doesn't provide the label/legend measurements
// MUI expects, so this helper stubs `getBoundingClientRect` for relevant
// elements to allow MUI to compute notched outlines during tests.

export function enableMuiNotchMock(): void {
    const orig = Element.prototype.getBoundingClientRect

    beforeAll(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ; (Element.prototype as any).getBoundingClientRect = function () {
            try {
                // Provide non-zero width for MUI label root and legend elements so
                // OutlinedInput can compute a notched outline in jsdom.
                if (this && this.classList && this.classList.contains && this.classList.contains('MuiInputLabel-root')) {
                    return { width: 60, height: 16, top: 0, left: 0, right: 60, bottom: 16, x: 0, y: 0, toJSON: () => { } }
                }
                if (this && this.tagName && String(this.tagName).toUpperCase() === 'LEGEND') {
                    return { width: 64, height: 10, top: 0, left: 0, right: 64, bottom: 10, x: 0, y: 0, toJSON: () => { } }
                }
            } catch (e) {
                // ignore and fallthrough to original
            }
            return orig.apply(this)
        }
    })

    afterAll(() => {
        ; (Element.prototype as any).getBoundingClientRect = orig
    })
}
