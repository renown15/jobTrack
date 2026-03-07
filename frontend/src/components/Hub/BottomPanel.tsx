import React from 'react'
import HubMainView from './HubMainView'

// Compatibility wrapper: BottomPanel was replaced by HubMainView.
// Keep a thin wrapper so existing imports/tests continue to work.
export default function BottomPanel(props: any) {
    return <HubMainView {...props} />
}

