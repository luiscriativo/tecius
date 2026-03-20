/**
 * cn — ClassName Utility
 *
 * Merges Tailwind CSS class names, handling conditional classes and
 * deduplication of conflicting utilities (e.g., two different bg-* classes).
 *
 * This is a lightweight implementation that does not require the
 * `clsx` or `tailwind-merge` packages. If the project grows complex,
 * consider adding those packages:
 *   npm install clsx tailwind-merge
 *   import { clsx } from 'clsx'
 *   import { twMerge } from 'tailwind-merge'
 *   export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
 *
 * Usage:
 *   cn('px-4 py-2', isActive && 'bg-primary', 'text-sm')
 */

type ClassValue = string | number | boolean | null | undefined | ClassValue[]

export function cn(...inputs: ClassValue[]): string {
  const classes: string[] = []

  for (const input of inputs) {
    if (!input && input !== 0) continue

    if (typeof input === 'string' || typeof input === 'number') {
      classes.push(String(input))
    } else if (Array.isArray(input)) {
      const result = cn(...input)
      if (result) classes.push(result)
    }
  }

  return classes.join(' ')
}
