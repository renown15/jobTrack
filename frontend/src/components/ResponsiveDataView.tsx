import React from 'react'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { Breakpoint } from '@mui/material/styles'

interface ResponsiveDataViewProps {
    /**
     * Component/content to render on desktop viewports (≥ breakpoint)
     */
    desktopView: React.ReactNode

    /**
     * Component/content to render on mobile viewports (< breakpoint)
     */
    mobileView: React.ReactNode

    /**
     * Breakpoint at which to switch between mobile and desktop views
     * @default 'md' (900px)
     * 
     * Recommended: 'md' for most use cases (matches industry standard)
     * Use 'sm' if you want to show desktop view on landscape phones
     * Use 'lg' if you want mobile view on tablets
     */
    breakpoint?: Breakpoint
}

/**
 * Adaptive component wrapper that conditionally renders mobile or desktop views
 * based on viewport size.
 * 
 * This follows the industry-standard "Adaptive Design" pattern where different
 * UI components are rendered for different device classes, rather than trying
 * to make a single component responsive with CSS.
 * 
 * **Why use this pattern:**
 * - Mobile users need different interaction patterns (cards vs tables)
 * - Cleaner separation of concerns (mobile/desktop logic isolated)
 * - Better performance (load only what's needed)
 * - Easier to maintain and test
 * 
 * @example
 * ```tsx
 * // Basic usage with default breakpoint (md = 900px)
 * <ResponsiveDataView
 *   desktopView={<ContactsTable data={contacts} />}
 *   mobileView={<MobileContactsList data={contacts} />}
 * />
 * ```
 * 
 * @example
 * ```tsx
 * // Custom breakpoint (show mobile view on tablets too)
 * <ResponsiveDataView
 *   desktopView={<DataTable columns={cols} rows={rows} />}
 *   mobileView={<MobileCardList items={rows} />}
 *   breakpoint="lg"  // 1200px
 * />
 * ```
 */
export default function ResponsiveDataView({
    desktopView,
    mobileView,
    breakpoint = 'md',
}: ResponsiveDataViewProps) {
    const theme = useTheme()
    const isMobileQuery = useMediaQuery(theme.breakpoints.down(breakpoint))
    // Standard responsive behaviour — don't include any developer force flags
    // or debug UI in production builds. Use the media query result directly.
    const isMobile = isMobileQuery

    const viewToRender = isMobile ? mobileView : desktopView

    return <>{viewToRender}</>
}
