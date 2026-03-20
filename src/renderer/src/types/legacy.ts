/**
 * Shared Application Types — Legacy
 *
 * Original types preserved here to avoid breaking existing imports.
 * New domain types live in chronicler.ts.
 */

// ── Theme ────────────────────────────────────────────────────────────────────
export type Theme = 'light' | 'dark' | 'system'

// ── Notifications ─────────────────────────────────────────────────────────────
export type NotificationType = 'info' | 'success' | 'warning' | 'error'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  duration?: number // milliseconds; undefined = persistent
  createdAt: number
}

// ── Navigation ────────────────────────────────────────────────────────────────
export interface NavItem {
  label: string
  path: string
  icon?: React.ComponentType<{ className?: string }>
}

// ── API Response ──────────────────────────────────────────────────────────────
export interface ApiResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

// ── Platform ──────────────────────────────────────────────────────────────────
export type Platform = 'darwin' | 'win32' | 'linux'
