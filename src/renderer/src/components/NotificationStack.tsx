/**
 * NotificationStack Component
 *
 * Renders the global in-app notification toasts in the bottom-right corner.
 * Notifications are managed by the app store (useAppStore).
 */

import React from 'react'
import { useNotifications } from '@/hooks/useNotifications'
import type { Notification, NotificationType } from '@/types'
import { cn } from '@/utils/cn'

// ── Icon per notification type ────────────────────────────────────────────────

function NotificationIcon({ type }: { type: NotificationType }): React.ReactElement {
  const icons: Record<NotificationType, React.ReactElement> = {
    info: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
      </svg>
    ),
    success: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
    warning: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
    ),
    error: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    )
  }
  return icons[type]
}

// ── Color per type ────────────────────────────────────────────────────────────

const typeStyles: Record<NotificationType, string> = {
  info: 'text-blue-500',
  success: 'text-green-500',
  warning: 'text-yellow-500',
  error: 'text-destructive'
}

// ── Single Notification Toast ─────────────────────────────────────────────────

function NotificationToast({
  notification,
  onDismiss
}: {
  notification: Notification
  onDismiss: (id: string) => void
}): React.ReactElement {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'flex items-start gap-3 w-80 rounded-lg border border-border',
        'bg-background shadow-lg p-4',
        'animate-in slide-in-from-right-full duration-300'
      )}
    >
      {/* Icon */}
      <span className={cn('shrink-0 mt-0.5', typeStyles[notification.type])}>
        <NotificationIcon type={notification.type} />
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{notification.title}</p>
        {notification.message && (
          <p className="text-xs text-muted-foreground mt-0.5">{notification.message}</p>
        )}
      </div>

      {/* Dismiss button */}
      <button
        onClick={() => onDismiss(notification.id)}
        className={cn(
          'shrink-0 p-1 rounded text-muted-foreground',
          'hover:text-foreground hover:bg-accent',
          'transition-colors duration-150'
        )}
        aria-label="Dismiss notification"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ── Stack Component ───────────────────────────────────────────────────────────

export function NotificationStack(): React.ReactElement | null {
  const { notifications, remove } = useNotifications()

  if (notifications.length === 0) return null

  return (
    <div
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
    >
      {notifications.map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onDismiss={remove}
        />
      ))}
    </div>
  )
}
