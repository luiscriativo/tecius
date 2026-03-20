/**
 * useTheme Hook
 *
 * Manages the application theme (light / dark / system).
 * Syncs theme changes to the DOM and persists the preference via Zustand.
 *
 * Usage:
 *   const { theme, resolvedTheme, setTheme } = useTheme()
 */

import { useEffect } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import type { Theme } from '@/types'

interface UseThemeReturn {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
  isDark: boolean
}

export function useTheme(): UseThemeReturn {
  const { theme, resolvedTheme, setTheme } = useAppStore()

  // Apply the initial theme on mount
  useEffect(() => {
    setTheme(theme)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for OS-level theme changes when using 'system' preference
  useEffect(() => {
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (): void => {
      setTheme('system') // re-run theme resolution
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme, setTheme])

  return {
    theme,
    resolvedTheme,
    setTheme,
    isDark: resolvedTheme === 'dark'
  }
}
