import React, { useState } from 'react'
// DEBUG: module load
// eslint-disable-next-line no-console
console.log('MODULE: ExportToSpreadsheet loaded')
import { getApplicantId } from '../../auth/currentApplicant'
import AppButton from '../Shared/AppButton'
import CircularProgress from '@mui/material/CircularProgress'

type Props = {
    label?: string
    white?: boolean
}

const ExportToSpreadsheet: React.FC<Props> = ({ label = 'Export to Spreadsheet', white = false }) => {
    const [loading, setLoading] = useState(false)

    const handleExport = async () => {
        setLoading(true)
        try {
            // Request server-generated Excel file and download from the API server.
            // Use the Vite env var if provided, otherwise default to same-origin (empty string).
            const rawBase = (import.meta as any).env?.VITE_API_BASE_URL || ''
            const BASE_URL = rawBase.replace(/\/$/, '')
            const headers: Record<string, string> = {}
            const aid = getApplicantId()
            if (aid == null) throw new Error('No applicant selected')

            const res = await fetch(`${BASE_URL}/api/${aid}/export/spreadsheet.xlsx`, { credentials: 'include', headers })
            if (!res.ok) {
                const txt = await res.text()
                throw new Error('Export failed: ' + txt)
            }

            // Basic validation: ensure response is an OOXML spreadsheet (a ZIP with PK.. signature)
            const contentType = res.headers.get('content-type') || ''
            const blob = await res.blob()

            // If content-type is not the expected spreadsheet mime-type, try to surface the server error
            const expectedMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            if (!contentType.includes(expectedMime)) {
                // attempt to read the blob as text to show server-provided error payload
                try {
                    const txt = await blob.text()
                    throw new Error('Export failed: server returned unexpected content-type: ' + contentType + '\n' + txt)
                } catch (e) {
                    throw new Error('Export failed: server returned unexpected content-type: ' + contentType)
                }
            }

            // Check first 2 bytes for ZIP file signature (PK)
            try {
                const buf = await blob.slice(0, 4).arrayBuffer()
                const view = new Uint8Array(buf)
                if (!(view[0] === 0x50 && view[1] === 0x4b)) {
                    // Not a ZIP / OOXML file — read text for possible error message
                    const txt = await blob.text()
                    throw new Error('Export failed: response did not appear to be a valid .xlsx file. Server said:\n' + txt)
                }
            } catch (e) {
                // If validation fails, surface readable error
                const msg = e && (e as any).message ? (e as any).message : String(e)
                throw new Error(msg)
            }
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url

            // Try to get filename from content-disposition if provided
            const cd = res.headers.get('content-disposition')
            let filename = 'jobtrack_export.xlsx'
            if (cd) {
                const m = cd.match(/filename\*=UTF-8''([^;\n]+)/)
                if (m && m[1]) filename = decodeURIComponent(m[1])
                else {
                    const m2 = cd.match(/filename="?([^";]+)"?/)
                    if (m2 && m2[1]) filename = m2[1]
                }
            }
            a.download = filename
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Failed to export spreadsheet', err)
            // err typing may be unknown in TS; coerce safely
            const errMsg = err && (err as any).message ? (err as any).message : String(err)
            // Use window.alert to surface the error to the user in dev
            alert('Failed to export spreadsheet: ' + errMsg)
        } finally {
            setLoading(false)
        }
    }

    const content = loading ? (
        <>
            <CircularProgress size={16} sx={{ mr: 1 }} /> Exporting...
        </>
    ) : (
        label
    )

    return (
        <div>
            {white ? (
                <AppButton colorScheme="white" onClick={handleExport} disabled={loading}>
                    {content}
                </AppButton>
            ) : (
                <AppButton colorScheme="purple" onClick={handleExport} disabled={loading}>
                    {content}
                </AppButton>
            )}
        </div>
    )
}

export default ExportToSpreadsheet
