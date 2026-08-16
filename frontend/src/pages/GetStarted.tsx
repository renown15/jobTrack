import React from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'

export default function GetStarted() {
    return (
        <Box>
            <h2 style={{ margin: 0 }}>Get Started with JobTrack</h2>
            <Paper sx={{ p: 2, mt: 2 }}>
                <Box sx={{ color: 'text.primary' }}>
                    <Box component="h3" sx={{ mt: 0, fontSize: '1.25rem', fontWeight: 600, color: '#4c1d95' }}>Welcome to JobTrack</Box>
                    <Box sx={{ mb: 2, color: 'text.secondary' }}>An online tool to help senior professionals find their next role.</Box>
                    <Box component="div" sx={{ fontWeight: 600, mb: 1, color: 'text.primary' }}>Use JobTrack to:</Box>
                    <Box component="ul" sx={{ pl: 3, m: 0, mb: 2, color: 'text.secondary' }}>
                        <li>Mine your LinkedIn network for key contacts</li>
                        <li>Use this as the basis of a curated job search contact list, identifying the right search consultants, sectors and companies to target</li>
                        <li>Record every message and conversation with your contact list, so you never forget what you said to whom when</li>
                        <li>Keep track of every job application, including the documents you’ve submitted</li>
                        <li>Draw up detailed Action Plans, including actions agreed with your career transition coach</li>
                        <li>Note the Networking events you attending, and what you got out of them</li>
                        <li>Review your progress when you need some inspiration using the comprehensive analytics</li>
                    </Box>
                </Box>
                <Box sx={{ mt: 2 }}>
                    <video controls style={{ width: '100%', maxHeight: 420, background: '#000' }} preload="metadata">
                        <source src="/videos/jobtrack-intro-video.mov" type="video/quicktime" />
                        Your browser does not support the video tag.
                    </video>
                </Box>
            </Paper>
        </Box>
    )
}
