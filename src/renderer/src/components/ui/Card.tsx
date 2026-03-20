/**
 * Card Component
 *
 * A flexible container with a bordered surface, shadow, and rounded corners.
 * Composed of: Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
 *
 * Usage:
 *   <Card>
 *     <CardHeader>
 *       <CardTitle>Settings</CardTitle>
 *       <CardDescription>Manage your preferences</CardDescription>
 *     </CardHeader>
 *     <CardContent>
 *       <p>Content goes here</p>
 *     </CardContent>
 *     <CardFooter>
 *       <Button>Save</Button>
 *     </CardFooter>
 *   </Card>
 */

import React from 'react'
import { cn } from '@/utils/cn'

// ── Card (root) ───────────────────────────────────────────────────────────────

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Remove inner padding from CardContent when true */
  noPadding?: boolean
}

export function Card({ className, noPadding: _noPadding, ...props }: CardProps): React.ReactElement {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-background text-foreground shadow-sm',
        className
      )}
      {...props}
    />
  )
}

// ── CardHeader ────────────────────────────────────────────────────────────────

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn('flex flex-col gap-1 p-6 pb-0', className)}
      {...props}
    />
  )
}

// ── CardTitle ─────────────────────────────────────────────────────────────────

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>): React.ReactElement {
  return (
    <h3
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
}

// ── CardDescription ───────────────────────────────────────────────────────────

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>): React.ReactElement {
  return (
    <p
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

// ── CardContent ───────────────────────────────────────────────────────────────

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn('p-6', className)}
      {...props}
    />
  )
}

// ── CardFooter ────────────────────────────────────────────────────────────────

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn('flex items-center p-6 pt-0', className)}
      {...props}
    />
  )
}
