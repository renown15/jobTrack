import React from 'react'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Avatar from '@mui/material/Avatar'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'

export interface MobileCardMetadataItem {
    label: string
    value: string | React.ReactNode
    icon?: React.ReactNode
    onClick?: () => void
    color?: string
}

export interface MobileCardProps {
    /**
     * Avatar image URL or avatar component (top-left)
     */
    avatar?: string | React.ReactNode

    /**
     * Primary text (large, bold)
     */
    title: string

    /**
     * Secondary text (below title, gray)
     */
    subtitle?: string | React.ReactNode

    /**
     * Badge component to show next to title (optional)
     */
    badge?: React.ReactNode

    /**
     * Array of metadata items to display below subtitle
     */
    metadata?: MobileCardMetadataItem[]

    /**
     * Action buttons or custom component for bottom of card
     */
    actions?: React.ReactNode

    /**
     * Menu icon button in top-right corner
     */
    menuButton?: React.ReactNode

    /**
     * Callback when card is tapped (makes entire card interactive)
     */
    onClick?: () => void

    /**
     * Dense mode reduces padding for compact layouts
     * @default false
     */
    dense?: boolean

    /**
     * Show loading skeleton
     * @default false
     */
    loading?: boolean

    /**
     * Additional sx prop for customization
     */
    sx?: any
}

/**
 * Base mobile card component following Material Design guidelines
 * 
 * **Design Pattern:**
 * ```
 * ┌─────────────────────────────────────┐
 * │ [Avatar] Title               Badge ⋮│  ← Header row (44px height)
 * │          Subtitle                   │  ← Secondary info
 * │          ──────────────────          │
 * │          • Metadata item 1          │  ← Metadata rows
 * │          • Metadata item 2          │
 * │          ──────────────────          │
 * │          [Action] [Action]          │  ← Action buttons (44px height)
 * └─────────────────────────────────────┘
 * ```
 * 
 * **Accessibility:**
 * - Touch targets are 44x44px minimum
 * - Tappable cards have role="button"
 * - Semantic HTML structure for screen readers
 * 
 * @example
 * ```tsx
 * <MobileCard
 *   avatar="https://example.com/avatar.jpg"
 *   title="John Doe"
 *   subtitle="Software Engineer"
 *   badge={<Chip label="Hot" size="small" color="error" />}
 *   metadata={[
 *     { label: 'Company', value: 'Acme Corp' },
 *     { label: 'Last Contact', value: '5 days ago' }
 *   ]}
 *   actions={
 *     <>
 *       <Button size="small">Edit</Button>
 *       <Button size="small">Delete</Button>
 *     </>
 *   }
 *   onClick={() => navigate(`/contacts/${id}`)}
 * />
 * ```
 */
export default function MobileCard({
    avatar,
    title,
    subtitle,
    badge,
    metadata = [],
    actions,
    menuButton,
    onClick,
    dense = false,
    loading = false,
    sx = {},
}: MobileCardProps) {
    const padding = dense ? 1.5 : 2
    const isClickable = Boolean(onClick)

    // Loading skeleton
    if (loading) {
        return (
            <Card sx={{ mb: 1, ...sx }}>
                <CardContent sx={{ p: padding, '&:last-child': { pb: padding } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box
                            sx={{
                                width: 40,
                                height: 40,
                                borderRadius: '50%',
                                bgcolor: 'action.hover',
                            }}
                        />
                        <Box flex={1}>
                            <Box
                                sx={{
                                    height: 20,
                                    width: '60%',
                                    bgcolor: 'action.hover',
                                    borderRadius: 1,
                                    mb: 0.5,
                                }}
                            />
                            <Box
                                sx={{
                                    height: 16,
                                    width: '40%',
                                    bgcolor: 'action.hover',
                                    borderRadius: 1,
                                }}
                            />
                        </Box>
                    </Box>
                </CardContent>
            </Card>
        )
    }

    const renderAvatar = () => {
        if (!avatar) return null
        if (typeof avatar === 'string') {
            return <Avatar src={avatar} sx={{ width: 40, height: 40 }} />
        }
        return avatar
    }

    return (
        <Card
            onClick={isClickable ? onClick : undefined}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            sx={{
                mb: 1,
                cursor: isClickable ? 'pointer' : 'default',
                // Touch feedback
                '&:active': {
                    bgcolor: isClickable ? 'action.selected' : 'background.paper',
                },
                // Hover feedback (for mouse users)
                '&:hover': {
                    bgcolor: isClickable ? 'action.hover' : 'background.paper',
                },
                // Focus indicator for keyboard navigation
                '&:focus-visible': {
                    outline: '2px solid',
                    outlineColor: 'primary.main',
                    outlineOffset: 2,
                },
                transition: 'background-color 150ms ease',
                ...sx,
            }}
            onKeyDown={
                isClickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onClick?.()
                        }
                    }
                    : undefined
            }
        >
            <CardContent sx={{ p: padding, '&:last-child': { pb: padding } }}>
                {/* Header Row: Avatar + Title + Badge + Menu */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: subtitle || metadata.length > 0 ? 1 : 0 }}>
                    {renderAvatar()}

                    {/* Title + Badge */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography
                                variant="h6"
                                component="div"
                                sx={{
                                    fontSize: dense ? '1rem' : '1.125rem',
                                    fontWeight: 600,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {title}
                            </Typography>
                            {badge}
                        </Box>
                    </Box>

                    {/* Menu button (44x44px touch target) */}
                    {menuButton && (
                        <Box
                            onClick={(e) => e.stopPropagation()}
                            sx={{ flexShrink: 0 }}
                        >
                            {menuButton}
                        </Box>
                    )}
                </Box>

                {/* Subtitle */}
                {subtitle && (
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                            mb: metadata.length > 0 ? 1 : 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {subtitle}
                    </Typography>
                )}

                {/* Metadata items */}
                {metadata.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                        {metadata.map((item, index) => (
                            <Box
                                key={index}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    mb: index < metadata.length - 1 ? 0.5 : 0
                                }}
                            >
                                {item.icon && (
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            color: 'text.secondary',
                                            fontSize: '0.875rem',
                                        }}
                                    >
                                        {item.icon}
                                    </Box>
                                )}
                                <Typography variant="caption" color="text.secondary">
                                    {item.label}:
                                </Typography>
                                {item.onClick ? (
                                    <Typography
                                        variant="caption"
                                        color="primary"
                                        role="button"
                                        aria-label={`${item.label} for ${title}`}
                                        tabIndex={0}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            item.onClick!()
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                item.onClick!()
                                            }
                                        }}
                                        sx={{
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            textDecoration: 'underline',
                                            '&:hover': { color: 'primary.dark' }
                                        }}
                                    >
                                        {item.value}
                                    </Typography>
                                ) : (
                                    <Typography variant="caption" sx={{ fontWeight: 500 }}>
                                        {item.value}
                                    </Typography>
                                )}
                            </Box>
                        ))}
                    </Box>
                )}

                {/* Action buttons */}
                {actions && (
                    <Box
                        sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {actions}
                    </Box>
                )}
            </CardContent>
        </Card>
    )
}
