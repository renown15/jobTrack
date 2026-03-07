import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'

/**
 * Custom hook for responsive breakpoint detection
 * 
 * Breakpoint strategy:
 * - xs: 0px - Phone portrait
 * - sm: 600px - Phone landscape / Small tablet
 * - md: 900px - Tablet portrait (MOBILE/DESKTOP THRESHOLD)
 * - lg: 1200px - Desktop
 * - xl: 1536px - Large desktop
 * 
 * @returns Object with boolean flags for each breakpoint category
 * 
 * @example
 * ```tsx
 * const { isMobile, isDesktop } = useResponsive()
 * 
 * return isMobile ? <MobileView /> : <DesktopView />
 * ```
 */
export function useResponsive() {
    const theme = useTheme()

    return {
        /**
         * True when viewport width is less than 900px (mobile/small tablet)
         * Use this as primary mobile/desktop switch
         */
        isMobile: useMediaQuery(theme.breakpoints.down('md')),

        /**
         * True when viewport width is between 900px and 1200px (tablet)
         */
        isTablet: useMediaQuery(theme.breakpoints.between('md', 'lg')),

        /**
         * True when viewport width is 1200px or more (desktop)
         */
        isDesktop: useMediaQuery(theme.breakpoints.up('lg')),

        /**
         * True when viewport width is less than 600px (small phone)
         * Use for extra-compact layouts or special handling
         */
        isSmallMobile: useMediaQuery(theme.breakpoints.down('sm')),

        /**
         * True when viewport width is 1536px or more (large desktop)
         * Use for expanded layouts with extra columns
         */
        isLargeDesktop: useMediaQuery(theme.breakpoints.up('xl')),
    }
}

/**
 * Hook to get current breakpoint name
 * 
 * @returns Current breakpoint: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
 * 
 * @example
 * ```tsx
 * const breakpoint = useBreakpoint()
 * 
 * if (breakpoint === 'xs') {
 *   // Extra small layout
 * }
 * ```
 */
export function useBreakpoint() {
    const theme = useTheme()
    const isXs = useMediaQuery(theme.breakpoints.only('xs'))
    const isSm = useMediaQuery(theme.breakpoints.only('sm'))
    const isMd = useMediaQuery(theme.breakpoints.only('md'))
    const isLg = useMediaQuery(theme.breakpoints.only('lg'))
    const isXl = useMediaQuery(theme.breakpoints.only('xl'))

    if (isXs) return 'xs'
    if (isSm) return 'sm'
    if (isMd) return 'md'
    if (isLg) return 'lg'
    if (isXl) return 'xl'

    return 'md' // fallback
}

/**
 * Hook to check if viewport is at or above a specific breakpoint
 * 
 * @param breakpoint - Breakpoint to check: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
 * @returns True if viewport is at or above the specified breakpoint
 * 
 * @example
 * ```tsx
 * const isLargeScreen = useBreakpointUp('lg')
 * ```
 */
export function useBreakpointUp(breakpoint: 'xs' | 'sm' | 'md' | 'lg' | 'xl') {
    const theme = useTheme()
    return useMediaQuery(theme.breakpoints.up(breakpoint))
}

/**
 * Hook to check if viewport is below a specific breakpoint
 * 
 * @param breakpoint - Breakpoint to check: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
 * @returns True if viewport is below the specified breakpoint
 * 
 * @example
 * ```tsx
 * const isMobileOrTablet = useBreakpointDown('lg')
 * ```
 */
export function useBreakpointDown(breakpoint: 'xs' | 'sm' | 'md' | 'lg' | 'xl') {
    const theme = useTheme()
    return useMediaQuery(theme.breakpoints.down(breakpoint))
}
