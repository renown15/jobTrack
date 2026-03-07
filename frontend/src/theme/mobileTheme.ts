import type { ThemeOptions } from '@mui/material/styles'

/**
 * Mobile-specific theme overrides for JobTrack
 * 
 * These values are applied in addition to the base theme when
 * rendering on mobile viewports (< 900px).
 * 
 * **Philosophy:**
 * - Larger touch targets (44x44px minimum per Apple HIG)
 * - More generous spacing for fat fingers
 * - Slightly larger text for readability
 * - Reduced density where appropriate
 */
export const mobileThemeOverrides: ThemeOptions = {
    spacing: 8, // Same as base, but documented here

    typography: {
        // Slightly larger base font on mobile for readability
        fontSize: 14, // vs 13 on desktop

        h1: {
            fontSize: '2rem', // Smaller than desktop
        },
        h2: {
            fontSize: '1.75rem',
        },
        h3: {
            fontSize: '1.5rem',
        },
        h4: {
            fontSize: '1.25rem',
        },
        h5: {
            fontSize: '1.125rem',
        },
        h6: {
            fontSize: '1rem',
        },
        body1: {
            fontSize: '1rem',
            lineHeight: 1.6, // More generous line height
        },
        body2: {
            fontSize: '0.875rem',
            lineHeight: 1.5,
        },
        button: {
            fontSize: '0.9375rem', // Slightly larger buttons
            fontWeight: 500,
        },
        caption: {
            fontSize: '0.75rem',
        },
    },

    components: {
        // Button component
        MuiButton: {
            defaultProps: {
                disableElevation: true, // Flatter on mobile
            },
            styleOverrides: {
                root: {
                    // Minimum touch target size (Apple HIG / Material Design)
                    minHeight: 44,
                    minWidth: 44,
                    padding: '10px 16px',
                },
                sizeSmall: {
                    minHeight: 36,
                    padding: '6px 12px',
                },
                sizeLarge: {
                    minHeight: 52,
                    padding: '12px 24px',
                },
            },
        },

        // IconButton component
        MuiIconButton: {
            styleOverrides: {
                root: {
                    // Ensure 44x44px touch target
                    minWidth: 44,
                    minHeight: 44,
                    padding: 10,
                },
                sizeSmall: {
                    minWidth: 36,
                    minHeight: 36,
                    padding: 6,
                },
                sizeLarge: {
                    minWidth: 52,
                    minHeight: 52,
                    padding: 14,
                },
            },
        },

        // Chip component (badges)
        MuiChip: {
            styleOverrides: {
                root: {
                    height: 28, // Slightly taller for touch
                },
                sizeSmall: {
                    height: 24,
                },
            },
        },

        // TextField component
        MuiTextField: {
            defaultProps: {
                size: 'medium', // Always medium on mobile (easier to tap)
            },
        },

        // Select component
        MuiSelect: {
            defaultProps: {
                size: 'medium',
            },
        },

        // Card component
        MuiCard: {
            styleOverrides: {
                root: {
                    // Subtle shadow for depth (but not too heavy)
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                },
            },
        },

        // CardContent component
        MuiCardContent: {
            styleOverrides: {
                root: {
                    padding: 16, // Generous padding
                    '&:last-child': {
                        paddingBottom: 16, // Override MUI's special last-child handling
                    },
                },
            },
        },

        // Dialog component (modals)
        MuiDialog: {
            styleOverrides: {
                paper: {
                    // Full-screen dialogs on mobile
                    margin: 8, // Small margin on very small screens
                },
            },
        },

        // Drawer component (navigation)
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    width: 280, // Comfortable drawer width on mobile
                },
            },
        },

        // List component
        MuiList: {
            styleOverrides: {
                root: {
                    padding: '8px 0', // Consistent list padding
                },
            },
        },

        // ListItem component
        MuiListItem: {
            styleOverrides: {
                root: {
                    minHeight: 48, // Taller list items for touch
                    padding: '12px 16px',
                },
            },
        },

        // ListItemButton component
        MuiListItemButton: {
            styleOverrides: {
                root: {
                    minHeight: 48, // 48px minimum (Material Design)
                    padding: '12px 16px',
                },
            },
        },

        // AppBar component (header)
        MuiAppBar: {
            styleOverrides: {
                root: {
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)', // Lighter shadow
                },
            },
        },

        // Toolbar component (in header)
        MuiToolbar: {
            styleOverrides: {
                root: {
                    minHeight: 56, // Standard mobile toolbar height
                    padding: '0 16px',
                },
            },
        },

        // BottomNavigation component (if used)
        MuiBottomNavigation: {
            styleOverrides: {
                root: {
                    height: 56, // Standard bottom nav height
                },
            },
        },

        // Fab (Floating Action Button)
        MuiFab: {
            styleOverrides: {
                root: {
                    width: 56,
                    height: 56,
                },
                sizeSmall: {
                    width: 40,
                    height: 40,
                },
                sizeMedium: {
                    width: 64,
                    height: 64,
                },
            },
        },

        // Slider component
        MuiSlider: {
            styleOverrides: {
                thumb: {
                    // Larger slider thumb for touch
                    width: 20,
                    height: 20,
                },
                track: {
                    height: 4, // Thicker track
                },
                rail: {
                    height: 4,
                },
            },
        },

        // Tabs component
        MuiTab: {
            styleOverrides: {
                root: {
                    minHeight: 48, // Taller tabs for touch
                    padding: '12px 16px',
                },
            },
        },

        // Accordion component
        MuiAccordion: {
            styleOverrides: {
                root: {
                    '&:before': {
                        display: 'none', // Remove default divider
                    },
                },
            },
        },

        // AccordionSummary component
        MuiAccordionSummary: {
            styleOverrides: {
                root: {
                    minHeight: 56, // Taller for touch
                    padding: '0 16px',
                },
            },
        },
    },
}

/**
 * Utility: Apply mobile theme overrides to base theme
 * 
 * @example
 * ```tsx
 * import { createTheme } from '@mui/material/styles'
 * import { applyMobileTheme } from './theme/mobileTheme'
 * import { useResponsive } from './hooks/useResponsive'
 * 
 * function App() {
 *   const { isMobile } = useResponsive()
 *   const baseTheme = createTheme({ ... })
 *   const theme = isMobile ? applyMobileTheme(baseTheme) : baseTheme
 *   
 *   return <ThemeProvider theme={theme}>...</ThemeProvider>
 * }
 * ```
 */
export function applyMobileTheme(baseTheme: any) {
    return {
        ...baseTheme,
        ...mobileThemeOverrides,
        // Deep merge components
        components: {
            ...baseTheme.components,
            ...mobileThemeOverrides.components,
        },
    }
}
