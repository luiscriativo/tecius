/**
 * Button Component
 *
 * A flexible button with multiple visual variants and sizes.
 *
 * Variants: primary | secondary | ghost | danger | outline
 * Sizes:    sm | md | lg
 *
 * Usage:
 *   <Button variant="primary" size="md" onClick={handleClick}>
 *     Save Changes
 *   </Button>
 *
 *   <Button variant="danger" isLoading>
 *     Deleting...
 *   </Button>
 */

import React from 'react'
import { cn } from '@/utils/cn'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

// ── Variant styles ────────────────────────────────────────────────────────────

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: [
    'bg-primary text-primary-foreground',
    'hover:bg-primary/90',
    'active:bg-primary/80',
    'shadow-sm'
  ].join(' '),

  secondary: [
    'bg-secondary text-secondary-foreground',
    'hover:bg-secondary/80',
    'active:bg-secondary/70',
    'border border-border'
  ].join(' '),

  ghost: [
    'bg-transparent text-foreground',
    'hover:bg-accent hover:text-accent-foreground',
    'active:bg-accent/70'
  ].join(' '),

  danger: [
    'bg-destructive text-destructive-foreground',
    'hover:bg-destructive/90',
    'active:bg-destructive/80',
    'shadow-sm'
  ].join(' '),

  outline: [
    'bg-transparent text-foreground',
    'border border-border',
    'hover:bg-accent hover:text-accent-foreground',
    'active:bg-accent/70'
  ].join(' ')
}

// ── Size styles ───────────────────────────────────────────────────────────────

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-6 text-base gap-2.5'
}

// ── Loading spinner ───────────────────────────────────────────────────────────

function Spinner({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={cn('animate-spin', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      className,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          // Base styles
          'inline-flex items-center justify-center font-medium rounded-md',
          'transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          'select-none whitespace-nowrap',
          // Variant and size
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <Spinner
            className={cn(size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4')}
          />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}

        {children && <span>{children}</span>}

        {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    )
  }
)

Button.displayName = 'Button'
