/**
 * Global Application Store
 *
 * Built with Zustand — a minimal, fast, and scalable state management library.
 *
 * This store holds application-wide state:
 * - Theme preference (light / dark / system)
 * - Loading state
 * - In-app notifications
 * - Platform / app version info
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Theme, Notification, NotificationType, Platform } from '@/types'
import type { Language } from '@/i18n/translations'
import { setDateLanguage } from '@/utils/chroniclerDate'
import type { ScalePreference } from '@/utils/timelineScale'

// ── State shape ───────────────────────────────────────────────────────────────

interface AppState {
  // ── Theme ──────────────────────────────────────────────────────────────────
  theme: Theme
  resolvedTheme: 'light' | 'dark' // actual theme after resolving 'system'

  // ── Loading ────────────────────────────────────────────────────────────────
  isLoading: boolean
  loadingMessage: string

  // ── Notifications ──────────────────────────────────────────────────────────
  notifications: Notification[]

  // ── App info ───────────────────────────────────────────────────────────────
  appVersion: string
  platform: Platform | null

  // ── Sidebar ────────────────────────────────────────────────────────────────
  isSidebarCollapsed: boolean

  // ── Language ───────────────────────────────────────────────────────────────
  language: Language
  /** Escala da timeline horizontal: automática, linear ou comprimida */
  timelineScale: ScalePreference

  // ── Serviços online (desligados por padrão: enviam dados para fora) ───────
  /** Busca de endereços no OpenStreetMap (Nominatim) */
  onlineGeocoding: boolean
  /** Mapas paleogeográficos via GPlates Web Service */
  paleoMaps: boolean
}

// ── Actions shape ─────────────────────────────────────────────────────────────

interface AppActions {
  // Theme
  setTheme: (theme: Theme) => void

  // Loading
  setLoading: (isLoading: boolean, message?: string) => void

  // Notifications
  addNotification: (
    type: NotificationType,
    title: string,
    message?: string,
    duration?: number
  ) => string // returns the notification id
  removeNotification: (id: string) => void
  clearNotifications: () => void

  // App info
  setAppVersion: (version: string) => void
  setPlatform: (platform: Platform) => void

  // Sidebar
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void

  // Language
  setLanguage: (language: Language) => void
  setTimelineScale: (scale: ScalePreference) => void

  // Serviços online
  setOnlineGeocoding: (v: boolean) => void
  setPaleoMaps: (v: boolean) => void
}

type AppStore = AppState & AppActions

// ── Helper: apply theme to DOM ────────────────────────────────────────────────

function applyThemeToDom(theme: Theme): 'light' | 'dark' {
  const root = document.documentElement
  let resolved: 'light' | 'dark'

  if (theme === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } else {
    resolved = theme
  }

  if (resolved === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }

  return resolved
}

// ── Store definition ──────────────────────────────────────────────────────────

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // ── Initial state ───────────────────────────────────────────────────────
      theme: 'system',
      resolvedTheme: 'light',
      isLoading: false,
      loadingMessage: '',
      notifications: [],
      appVersion: '',
      platform: null,
      isSidebarCollapsed: false,
      language: 'pt' as Language,
      timelineScale: 'auto' as ScalePreference,
      onlineGeocoding: false,
      paleoMaps: false,

      // ── Theme ───────────────────────────────────────────────────────────────
      setTheme: (theme) => {
        const resolved = applyThemeToDom(theme)
        set({ theme, resolvedTheme: resolved })
      },

      // ── Loading ─────────────────────────────────────────────────────────────
      setLoading: (isLoading, message = '') => {
        set({ isLoading, loadingMessage: message })
      },

      // ── Notifications ────────────────────────────────────────────────────────
      addNotification: (type, title, message, duration = 5000) => {
        const id = `notification-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const notification: Notification = {
          id,
          type,
          title,
          message,
          duration,
          createdAt: Date.now()
        }

        set((state) => ({
          notifications: [...state.notifications, notification]
        }))

        // Auto-remove after duration (if not persistent)
        if (duration && duration > 0) {
          setTimeout(() => {
            get().removeNotification(id)
          }, duration)
        }

        return id
      },

      removeNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id)
        }))
      },

      clearNotifications: () => {
        set({ notifications: [] })
      },

      // ── App info ─────────────────────────────────────────────────────────────
      setAppVersion: (appVersion) => set({ appVersion }),
      setPlatform: (platform) => set({ platform }),

      // ── Sidebar ──────────────────────────────────────────────────────────────
      toggleSidebar: () => {
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed }))
      },

      setSidebarCollapsed: (isSidebarCollapsed) => {
        set({ isSidebarCollapsed })
      },

      // ── Language ─────────────────────────────────────────────────────────
      setLanguage: (language) => {
        setDateLanguage(language)
        // O processo principal também usa o idioma (títulos de diálogos, mensagens de erro)
        window.electronAPI?.invoke('app:set-language', language).catch(() => {})
        set({ language })
      },
      setOnlineGeocoding: (onlineGeocoding) => set({ onlineGeocoding }),
      setPaleoMaps: (paleoMaps) => set({ paleoMaps }),
      setTimelineScale: (timelineScale) => set({ timelineScale }),
    }),
    {
      name: 'electron-app-storage', // key in localStorage
      storage: createJSONStorage(() => localStorage),
      // Idioma salvo: aplica às datas e ao processo principal assim que o app abre
      onRehydrateStorage: () => (state) => {
        const language = state?.language ?? 'pt'
        setDateLanguage(language)
        window.electronAPI?.invoke('app:set-language', language).catch(() => {})
      },
      // Only persist user preferences — not transient state
      partialize: (state) => ({
        theme: state.theme,
        isSidebarCollapsed: state.isSidebarCollapsed,
        language: state.language,
        onlineGeocoding: state.onlineGeocoding,
        paleoMaps: state.paleoMaps,
        timelineScale: state.timelineScale,
      })
    }
  )
)
