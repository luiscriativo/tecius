/**
 * Header Component
 */

import React from 'react'
import { useLocation } from 'react-router-dom'
import { useTheme } from '@/hooks/useTheme'
import { useAppStore } from '@/stores/useAppStore'
import { useI18n } from '@/hooks/useI18n'
import { cn } from '@/utils/cn'

function ThemeToggle(): React.ReactElement {
  const { theme, setTheme, isDark } = useTheme()
  const cycleTheme = (): void => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }
  return (
    <button
      onClick={cycleTheme}
      className={cn('p-2 rounded-md text-foreground/70','hover:bg-accent hover:text-accent-foreground','transition-colors duration-150','focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
      title={`Theme: ${theme} (click to cycle)`}
      aria-label="Toggle theme"
    >
      {theme === 'system' ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3" />
        </svg>
      ) : isDark ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
      )}
    </button>
  )
}

export function Header(): React.ReactElement {
  const location = useLocation()
  const notifications = useAppStore((s) => s.notifications)
  const { t } = useI18n()
  const unreadCount = notifications.length

  const PAGE_TITLES: Record<string, string> = {
    '/': t('page_home'),
    '/settings': t('page_settings'),
    '/about': t('page_about'),
  }
  const pageTitle = PAGE_TITLES[location.pathname] ?? t('page_fallback')

  return (
    <header className="flex items-center justify-between h-14 px-6 border-b border-header-border bg-header text-header-foreground shrink-0">
      <h1 className="text-sm font-semibold">{pageTitle}</h1>
      <div className="flex items-center gap-1">
        <button
          className={cn('relative p-2 rounded-md text-foreground/70','hover:bg-accent hover:text-accent-foreground','transition-colors duration-150','focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
          aria-label={`${unreadCount} notifications`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        <ThemeToggle />
      </div>
    </header>
  )
}
