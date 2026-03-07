/**
 * Barrel export for Mobile components
 * 
 * This makes importing mobile components cleaner:
 * 
 * ```tsx
 * import { MobileCard, MobileContactCard } from '@/components/Mobile'
 * ```
 * 
 * instead of:
 * 
 * ```tsx
 * import MobileCard from '@/components/Mobile/MobileCard'
 * import MobileContactCard from '@/components/Mobile/MobileContactCard'
 * ```
 */

export { default as MobileCard } from './MobileCard'
export type { MobileCardProps, MobileCardMetadataItem } from './MobileCard'

export { default as MobileContactCard } from './MobileContactCard'
export { default as MobileOrganisationCard } from './MobileOrganisationCard'
export { default as MobileJobRoleCard } from './MobileJobRoleCard'
export { default as MobileEngagementCard } from './MobileEngagementCard'

// Additional mobile components will be exported here as they're created:
// export { default as MobileLeadCard } from './MobileLeadCard'
// export { default as MobileDocumentCard } from './MobileDocumentCard'
