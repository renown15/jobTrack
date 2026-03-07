import React from 'react'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import HomeIcon from '@mui/icons-material/Home'
import BarChartIcon from '@mui/icons-material/BarChart'
import DescriptionIcon from '@mui/icons-material/Description'
import PeopleIcon from '@mui/icons-material/People'
import ExploreIcon from '@mui/icons-material/Explore'
import ShareIcon from '@mui/icons-material/Share'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import SettingsIcon from '@mui/icons-material/Settings'
import LightbulbIcon from '@mui/icons-material/Lightbulb'
import SchoolIcon from '@mui/icons-material/School'
import { NavLink } from 'react-router-dom'

export default function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
    const links: Array<{ to: string; label: string; icon: React.ReactNode; end?: boolean }> = [
        { to: '/', label: 'Hub', icon: <HomeIcon />, end: true },
        { to: '/navigator', label: 'Navigator Insights', icon: <ExploreIcon /> },
        { to: '/analytics', label: 'Analytics Studio', icon: <BarChartIcon /> },
        { to: '/networking', label: 'Networking', icon: <ShareIcon /> },
        { to: '/documents', label: 'Documents', icon: <DescriptionIcon /> },
        { to: '/coaching', label: 'Coaching', icon: <SchoolIcon /> },
        { to: '/leads', label: 'LinkedIn Leads', icon: <PeopleIcon /> },
        { to: '/settings', label: 'Settings', icon: <SettingsIcon /> },
        { to: '/get-started', label: 'Get Started', icon: <LightbulbIcon /> },
    ]

    return (
        <Drawer anchor="left" open={open} onClose={onClose} ModalProps={{ keepMounted: true }}>
            <nav style={{ width: 280 }} aria-label="mobile navigation">
                <List>
                    {links.map((l) => (
                        <ListItem key={l.to} disablePadding onClick={onClose}>
                            <ListItemButton component={NavLink} to={l.to} end={l.end}>
                                <ListItemIcon>{l.icon}</ListItemIcon>
                                <ListItemText primary={l.label} />
                            </ListItemButton>
                        </ListItem>
                    ))}
                </List>
            </nav>
        </Drawer>
    )
}
