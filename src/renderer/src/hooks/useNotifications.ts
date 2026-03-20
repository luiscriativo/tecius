/**
 * useNotifications Hook
 *
 * Convenience wrapper around the notification slice of the app store.
 *
 * Usage:
 *   const { notify, notifications, remove } = useNotifications()
 *   notify.success('Saved!', 'Your file has been saved.')
 */

import { useAppStore } from '@/stores/useAppStore'
import type { Notification, NotificationType } from '@/types'

interface NotifyFn {
  (title: string, message?: string, duration?: number): string
}

interface UseNotificationsReturn {
  notifications: Notification[]
  remove: (id: string) => void
  clear: () => void
  notify: {
    info: NotifyFn
    success: NotifyFn
    warning: NotifyFn
    error: NotifyFn
  }
}

export function useNotifications(): UseNotificationsReturn {
  const { notifications, addNotification, removeNotification, clearNotifications } = useAppStore()

  const createNotifier = (type: NotificationType): NotifyFn => {
    return (title, message, duration) => addNotification(type, title, message, duration)
  }

  return {
    notifications,
    remove: removeNotification,
    clear: clearNotifications,
    notify: {
      info: createNotifier('info'),
      success: createNotifier('success'),
      warning: createNotifier('warning'),
      error: createNotifier('error')
    }
  }
}
