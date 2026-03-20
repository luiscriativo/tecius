/**
 * Input Component
 *
 * A form input with optional label, helper text, and error state.
 *
 * Usage:
 *   <Input
 *     label="Email address"
 *     placeholder="you@example.com"
 *     type="email"
 *     error="Please enter a valid email"
 *   />
 */

import React from 'react'
import { cn } from '@/utils/cn'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Label displayed above the input */
  label?: string
  /** Helper text displayed below the input */
  helperText?: string
  /** Error message — replaces helperText and applies error styling */
  error?: string
  /** Icon displayed on the left side of the input */
  leftIcon?: React.ReactNode
  /** Icon or element displayed on the right side of the input */
  rightElement?: React.ReactNode
  /** When true, the input takes the full width of its container */
  fullWidth?: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      leftIcon,
      rightElement,
      fullWidth = true,
      className,
      id,
      ...props
    },
    ref
  ) => {
    // Generate a stable ID for linking label → input (for accessibility)
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    const hasError = Boolean(error)

    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {/* Label */}
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-foreground leading-none"
          >
            {label}
            {props.required && (
              <span className="ml-1 text-destructive" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}

        {/* Input wrapper (handles icon positioning) */}
        <div className="relative flex items-center">
          {/* Left icon */}
          {leftIcon && (
            <span className="absolute left-3 flex items-center pointer-events-none text-muted-foreground">
              {leftIcon}
            </span>
          )}

          {/* Input element */}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={hasError}
            aria-describedby={
              hasError
                ? `${inputId}-error`
                : helperText
                  ? `${inputId}-helper`
                  : undefined
            }
            className={cn(
              // Base
              'flex h-9 w-full rounded-md border bg-transparent px-3 py-1',
              'text-sm text-foreground placeholder:text-muted-foreground',
              'transition-colors duration-150',
              // Border and focus
              'border-input',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
              // Disabled
              'disabled:cursor-not-allowed disabled:opacity-50',
              // Error state
              hasError && 'border-destructive focus-visible:ring-destructive',
              // Icon padding adjustments
              leftIcon && 'pl-9',
              rightElement && 'pr-9',
              className
            )}
            {...props}
          />

          {/* Right element (icon, button, etc.) */}
          {rightElement && (
            <span className="absolute right-3 flex items-center text-muted-foreground">
              {rightElement}
            </span>
          )}
        </div>

        {/* Error or helper text */}
        {hasError ? (
          <p
            id={`${inputId}-error`}
            role="alert"
            className="text-xs text-destructive"
          >
            {error}
          </p>
        ) : helperText ? (
          <p id={`${inputId}-helper`} className="text-xs text-muted-foreground">
            {helperText}
          </p>
        ) : null}
      </div>
    )
  }
)

Input.displayName = 'Input'
