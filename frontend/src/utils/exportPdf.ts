// Utility to export a list of DOM nodes to a multi-page A4 PDF using html2canvas + jsPDF
// Accepts either (nodes, filename) or (nodes, options) where options may include:
// { filename?: string, header?: { role?: string, title?: string }, heatNode?: HTMLElement }
export default async function exportNodesToPdf(nodes: Array<HTMLElement | null>, filenameOrOptions: string | { filename?: string; header?: { role?: string; title?: string }; heatNode?: HTMLElement | null } = 'analytics.pdf') {
    if (!Array.isArray(nodes) || nodes.filter(Boolean).length === 0) {
        throw new Error('No nodes provided for export')
    }

    const options: { filename?: string; header?: { role?: string; title?: string }; heatNode?: HTMLElement | null } = typeof filenameOrOptions === 'string' ? { filename: filenameOrOptions } : (filenameOrOptions || {})

    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
    ])

    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const margin = 10 // mm
    let first = true

    for (const node of nodes) {
        if (!node) continue

        // Build a temporary wrapper so we can prepend header information (role/title)
        // and optionally include a cloned heat slider without mutating the original DOM.
        const wrapper = document.createElement('div')
        wrapper.style.background = '#ffffff'
        wrapper.style.padding = '8px'
        wrapper.style.boxSizing = 'border-box'

        if (options.header && (options.header.role || options.header.title)) {
            const hdr = document.createElement('div')
            hdr.style.marginBottom = '8px'
            hdr.style.display = 'flex'
            hdr.style.flexDirection = 'column'
            hdr.style.gap = '4px'
            const roleEl = document.createElement('div')
            roleEl.style.fontWeight = '700'
            roleEl.textContent = options.header.role || ''
            const titleEl = document.createElement('div')
            titleEl.style.fontSize = '0.95em'
            titleEl.textContent = options.header.title || ''
            hdr.appendChild(roleEl)
            hdr.appendChild(titleEl)
            wrapper.appendChild(hdr)
        }

        if (options.heatNode instanceof HTMLElement) {
            try {
                const heatClone = options.heatNode.cloneNode(true) as HTMLElement
                // ensure cloned node displays inline-block so layout is predictable
                heatClone.style.display = heatClone.style.display || 'block'
                heatClone.style.marginBottom = '8px'
                wrapper.appendChild(heatClone)
            } catch (e) {
                // ignore cloning errors
            }
        }

        // clone the node to avoid changing original layout or styles
        let cloned: HTMLElement
        try {
            cloned = (node as HTMLElement).cloneNode(true) as HTMLElement
        } catch (e) {
            // fallback to using the node directly (last resort)
            cloned = node as HTMLElement
        }
        wrapper.appendChild(cloned)

        // temporarily append to body so html2canvas can render computed styles
        document.body.appendChild(wrapper)

        try {
            // render at 2x for decent quality
            // @ts-ignore
            const canvas = await html2canvas(wrapper as HTMLElement, { scale: 2, useCORS: true })
            const imgData = canvas.toDataURL('image/png')
            const imgProps = pdf.getImageProperties(imgData)
            const imgWidthMm = pageWidth - margin * 2
            const imgHeightMm = (imgProps.height * imgWidthMm) / imgProps.width

            if (!first) pdf.addPage()
            first = false
            pdf.addImage(imgData, 'PNG', margin, margin, imgWidthMm, imgHeightMm)
        } finally {
            // remove temporary wrapper
            try { document.body.removeChild(wrapper) } catch (e) { /* ignore */ }
        }
    }

    pdf.save(options.filename || 'analytics.pdf')
}
