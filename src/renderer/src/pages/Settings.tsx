/**
 * Settings Page — Appearance (theme) and Language
 */

import React from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { useNotifications } from '@/hooks/useNotifications'
import { useAppStore } from '@/stores/useAppStore'
import { useI18n } from '@/hooks/useI18n'
import { cn } from '@/utils/cn'
import type { Theme } from '@/types'
import type { Language } from '@/i18n/translations'

// ── OptionButton ──────────────────────────────────────────────────────────────

function OptionButton<T extends string>({
  value, current, label, description, onSelect
}: {
  value: T; current: T; label: string; description: string; onSelect: (v: T) => void
}): React.ReactElement {
  const isSelected = value === current
  return (
    <button
      onClick={() => onSelect(value)}
      className={cn(
        'w-full text-left px-4 py-3 rounded-sm border transition-colors duration-150',
        isSelected
          ? 'border-chr-strong bg-active'
          : 'border-chr-subtle hover:border-chr hover:bg-hover'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={cn('font-serif text-sm leading-none', isSelected ? 'text-chr-primary' : 'text-chr-secondary')}>
            {label}
          </p>
          <p className="font-mono text-2xs text-chr-muted mt-1">{description}</p>
        </div>
        {isSelected && (
          <svg className="w-4 h-4 text-chr-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        )}
      </div>
    </button>
  )
}

// ── SectionCard ───────────────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="chr-card overflow-hidden">
      <div className="px-5 py-4 border-b border-chr-subtle">
        <h2 className="font-serif text-base text-chr-primary leading-none">{title}</h2>
        {description && (
          <p className="font-mono text-2xs text-chr-muted mt-1">{description}</p>
        )}
      </div>
      <div className="px-5 py-4 space-y-2">{children}</div>
    </div>
  )
}

// ── SettingsPage ──────────────────────────────────────────────────────────────

export function SettingsPage(): React.ReactElement {
  const { theme, setTheme } = useTheme()
  const { notify } = useNotifications()
  const language = useAppStore((s) => s.language)
  const setLanguage = useAppStore((s) => s.setLanguage)
  const { t } = useI18n()

  const handleSave = (): void => {
    notify.success(t('settings_saved_title'), t('settings_saved_msg'))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-vault">

      {/* Cabeçalho */}
      <header className="shrink-0 border-b border-chr-subtle bg-surface">
        <div className="flex items-center justify-between px-6 py-3 gap-4">
          <div className="flex items-center gap-3">
            <SlidersHorizontal size={16} strokeWidth={1.5} className="text-chr-muted" />
            <div>
              <h1 className="font-mono text-sm font-medium text-chr-primary leading-none">{t('settings_title')}</h1>
              <p className="font-mono text-2xs text-chr-muted mt-0.5">{t('settings_desc')}</p>
            </div>
          </div>

          <button
            onClick={handleSave}
            className="px-3 py-1.5 font-mono text-xs rounded-sm border border-chr-subtle text-chr-muted hover:border-chr hover:text-chr-secondary transition-colors duration-150"
          >
            {t('save_settings')}
          </button>
        </div>
      </header>

      {/* Corpo */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-6 space-y-4 max-w-2xl">

          {/* Aparência */}
          <SectionCard title={t('appearance')} description={t('appearance_desc')}>
            <OptionButton<Theme> value="light"  current={theme} label={t('theme_light')}  description={t('theme_light_desc')}  onSelect={setTheme} />
            <OptionButton<Theme> value="dark"   current={theme} label={t('theme_dark')}   description={t('theme_dark_desc')}   onSelect={setTheme} />
            <OptionButton<Theme> value="system" current={theme} label={t('theme_system')} description={t('theme_system_desc')} onSelect={setTheme} />
          </SectionCard>

          {/* Idioma */}
          <SectionCard title={t('language_section')} description={t('language_section_desc')}>
            <OptionButton<Language> value="pt" current={language} label={t('language_pt')} description={t('language_pt_desc')} onSelect={setLanguage} />
            <OptionButton<Language> value="en" current={language} label={t('language_en')} description={t('language_en_desc')} onSelect={setLanguage} />
          </SectionCard>

        </div>
      </div>
    </div>
  )
}
