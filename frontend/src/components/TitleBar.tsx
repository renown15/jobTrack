import React from 'react'
import Box from '@mui/material/Box'

const BRAND_PURPLE = '#3f0071'

export default function TitleBar() {
    return (
        <header style={{ padding: 16, borderBottom: `1px solid ${BRAND_PURPLE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: BRAND_PURPLE, color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
            <div />
        </header>
    )
}
