import React from 'react'
import Button, { ButtonProps } from '@mui/material/Button'
import { BRAND_PURPLE, BRAND_PURPLE_LIGHT } from '../../constants/colors'

type Props = ButtonProps & {
    colorScheme?: 'purple' | 'white'
}

export default function AppButton({ colorScheme = 'white', sx, children, ...rest }: Props) {
    const sizeProp = (rest as any).size as 'small' | 'medium' | undefined
    const base: any = {
        textTransform: 'none',
        borderRadius: 1,
        transition: 'all 120ms ease',
        // active press effect
        '&:active': {
            transform: 'translateY(1px)'
        }
    }
    const shadow = '0 6px 18px rgba(16,24,40,0.06)'
    const shadowHover = '0 10px 28px rgba(16,24,40,0.08)'
    const shadowActive = '0 4px 10px rgba(16,24,40,0.04)'

    const purple: any = {
        bgcolor: BRAND_PURPLE,
        color: '#fff',
        textTransform: 'uppercase',
        '&:hover': { bgcolor: BRAND_PURPLE, boxShadow: shadowHover },
        boxShadow: shadow,
        '&:active': { boxShadow: shadowActive },
        '&.Mui-disabled': { color: '#fff', bgcolor: BRAND_PURPLE, opacity: 0.6 }
    }

    const white: any = {
        bgcolor: 'transparent',
        color: BRAND_PURPLE_LIGHT,
        textTransform: 'uppercase',
        border: `1px solid ${BRAND_PURPLE_LIGHT}`,
        '&:hover': { bgcolor: 'rgba(106,52,193,0.04)' },
        boxShadow: 'none',
        '&:active': { boxShadow: 'none' },
        '&.Mui-disabled': { color: BRAND_PURPLE_LIGHT, opacity: 0.5, boxShadow: 'none' }
    }

    const sizeStyles: any = {}
    // Make small buttons match DatePicker small height (~40px) and medium slightly larger
    if (sizeProp === 'small') {
        sizeStyles.minHeight = 40
        sizeStyles.height = 40
        sizeStyles.padding = '6px 10px'
    } else if (sizeProp === 'medium') {
        sizeStyles.minHeight = 48
        sizeStyles.height = 48
        sizeStyles.padding = '8px 14px'
    }

    const applied = { ...base, ...sizeStyles, ...(colorScheme === 'purple' ? purple : white), ...(sx || {}) }

    return (
        <Button sx={applied} {...rest}>
            {children}
        </Button>
    )
}

