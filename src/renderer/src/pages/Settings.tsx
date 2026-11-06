/**
 * Settings Page — Appearance (theme) and Language
 */

import React, { useState } from 'react'
import { RefreshCw, SlidersHorizontal } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { useAppStore } from '@/stores/useAppStore'
import { useI18n } from '@/hooks/useI18n'
import { cn } from '@/utils/cn'
import type { Theme } from '@/types'
import type { Language } from '@/i18n/translations'
import type { DateFormatPref } from '@/utils/chroniclerDate'

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

// ── ToggleRow ─────────────────────────────────────────────────────────────────

function ToggleRow({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void
}): React.ReactElement {
  return (
    <label className="flex items-start justify-between gap-4 px-4 py-3 rounded-sm border border-chr-subtle hover:bg-hover cursor-pointer transition-colors">
      <div>
        <p className="font-serif text-sm leading-none text-chr-primary">{label}</p>
        <p className="font-mono text-2xs text-chr-muted mt-1 leading-relaxed">{description}</p>
      </div>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 shrink-0 accent-[rgb(var(--chronicle-dot))]"
      />
    </label>
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

// ── UpdateCheck ───────────────────────────────────────────────────────────────

type CheckResult = { ok: boolean; current: string; available?: boolean; version?: string | null }

/** "Verificar atualizações": o processo principal consulta o GitHub Releases na hora */
function UpdateCheck(): React.ReactElement {
  const { t } = useI18n()
  const appVersion = useAppStore((s) => s.appVersion)
  const [state, setState] = useState<'idle' | 'checking' | 'none' | 'found' | 'failed'>('idle')
  const [found, setFound] = useState<string | null>(null)

  const check = async () => {
    setState('checking')
    try {
      const r = await window.electronAPI.invoke<CheckResult | null>('update:check')
      if (!r || !r.ok) setState('failed')
      else if (r.available && r.version) { setFound(r.version); setState('found') }
      else setState('none')
    } catch {
      setState('failed')
    }
  }

  const message = state === 'checking' ? t('update_checking')
    : state === 'none' ? t('update_none', { version: appVersion })
    : state === 'found' ? t('update_found', { version: found ?? '' })
    : state === 'failed' ? t('update_check_failed')
    : ''

  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3 rounded-sm border border-chr-subtle">
      <div className="min-w-0">
        <p className="font-serif text-sm leading-none text-chr-primary">{t('update_check')}</p>
        <p className="font-mono text-2xs text-chr-muted mt-1 leading-relaxed">
          {appVersion ? `v${appVersion}` : ''}{message ? ` · ${message}` : ''}
        </p>
      </div>
      <button type="button" onClick={check} disabled={state === 'checking'} data-testid="check-updates"
        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-mono border border-chr-subtle text-chr-secondary hover:border-chr hover:text-chr-primary transition-colors disabled:opacity-50">
        <RefreshCw size={11} strokeWidth={1.5} className={state === 'checking' ? 'animate-spin' : ''} />
        {t('update_check')}
      </button>
    </div>
  )
}

// ── SettingsPage ──────────────────────────────────────────────────────────────

export function SettingsPage(): React.ReactElement {
  const { theme, setTheme } = useTheme()
  const language = useAppStore((s) => s.language)
  const setLanguage = useAppStore((s) => s.setLanguage)
  const onlineGeocoding = useAppStore((s) => s.onlineGeocoding)
  const setOnlineGeocoding = useAppStore((s) => s.setOnlineGeocoding)
  const paleoMaps = useAppStore((s) => s.paleoMaps)
  const setPaleoMaps = useAppStore((s) => s.setPaleoMaps)
  const defaultImportance = useAppStore((s) => s.defaultImportance)
  const setDefaultImportance = useAppStore((s) => s.setDefaultImportance)
  const defaultCategory = useAppStore((s) => s.defaultCategory)
  const setDefaultCategory = useAppStore((s) => s.setDefaultCategory)
  const dateFormat = useAppStore((s) => s.dateFormat)
  const setDateFormatPref = useAppStore((s) => s.setDateFormatPref)
  const textSize = useAppStore((s) => s.textSize)
  const setTextSize = useAppStore((s) => s.setTextSize)
  const readingWidth = useAppStore((s) => s.readingWidth)
  const setReadingWidth = useAppStore((s) => s.setReadingWidth)
  const { t } = useI18n()
  const importanceLabels = ['', t('importance_min'), t('importance_low'), t('importance_mid'), t('importance_high'), t('importance_max')]

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

          {/* Cada opção vale na hora e fica salva — não há o que confirmar */}
          <span className="font-mono text-2xs text-chr-muted" data-testid="settings-autosave">{t('settings_autosave')}</span>
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

          {/* Eventos novos: importância e categoria padrão */}
          <SectionCard title={t('defaults_section')} description={t('defaults_section_desc')}>
            <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-sm border border-chr-subtle" data-testid="default-importance">
              <p className="font-serif text-sm leading-none text-chr-primary">{t('default_importance')}</p>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setDefaultImportance(n)} title={importanceLabels[n]} aria-pressed={n === defaultImportance}
                    className={cn('w-3.5 h-3.5 rounded-full border transition-all duration-100',
                      n <= defaultImportance ? 'bg-chr-primary border-chr-primary' : 'bg-transparent border-chr-subtle hover:border-chr-strong')} />
                ))}
                <span className="font-mono text-2xs text-chr-muted w-14">{importanceLabels[defaultImportance]}</span>
              </div>
            </div>
            <label className="flex items-center justify-between gap-4 px-4 py-3 rounded-sm border border-chr-subtle">
              <span className="font-serif text-sm leading-none text-chr-primary">{t('default_category')}</span>
              <input value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)} placeholder={t('default_category_ph')} spellCheck={false}
                className="w-40 px-2 py-1 rounded-sm bg-vault border border-chr-subtle font-mono text-2xs uppercase tracking-[0.06em] text-chr-primary focus:outline-none focus:border-chr placeholder:normal-case placeholder:tracking-normal placeholder:text-chr-muted"
                data-testid="default-category" />
            </label>
          </SectionCard>

          {/* Formato das datas */}
          <SectionCard title={t('date_format_section')} description={t('date_format_desc')}>
            <OptionButton<DateFormatPref> value="auto" current={dateFormat} label={t('date_format_auto')} description={t('date_format_auto_desc')} onSelect={setDateFormatPref} />
            <OptionButton<DateFormatPref> value="dmy"  current={dateFormat} label={t('date_format_dmy')}  description={t('date_format_dmy_desc')}  onSelect={setDateFormatPref} />
            <OptionButton<DateFormatPref> value="mdy"  current={dateFormat} label={t('date_format_mdy')}  description={t('date_format_mdy_desc')}  onSelect={setDateFormatPref} />
            <OptionButton<DateFormatPref> value="iso"  current={dateFormat} label={t('date_format_iso')}  description={t('date_format_iso_desc')}  onSelect={setDateFormatPref} />
          </SectionCard>

          {/* Tamanho do texto */}
          <SectionCard title={t('text_size_section')} description={t('text_size_desc')}>
            <div className="space-y-3" data-testid="text-size">
              <label className="flex items-center gap-3">
                <span className="font-mono text-2xs uppercase tracking-wider text-chr-muted w-28 shrink-0">{t('text_size_section')}</span>
                <input type="range" min={12} max={22} step={1} value={textSize} onChange={(e) => setTextSize(Number(e.target.value))} className="flex-1 accent-chr-primary cursor-pointer" />
                <span className="font-mono text-xs text-chr-secondary tabular-nums w-12 text-right">{textSize}px</span>
              </label>
              <label className="flex items-center gap-3">
                <span className="font-mono text-2xs uppercase tracking-wider text-chr-muted w-28 shrink-0">{t('reading_width')}</span>
                <input type="range" min={30} max={100} step={5} value={readingWidth} onChange={(e) => setReadingWidth(Number(e.target.value))} className="flex-1 accent-chr-primary cursor-pointer" />
                <span className="font-mono text-xs text-chr-secondary tabular-nums w-12 text-right">{readingWidth}%</span>
              </label>
            </div>
          </SectionCard>

          {/* Mapa e serviços online */}
          <SectionCard title={t('online_section')} description={t('online_section_desc')}>
            <ToggleRow label={t('online_geocoding')} description={t('online_geocoding_desc')} checked={onlineGeocoding} onChange={setOnlineGeocoding} />
            <ToggleRow label={t('paleo_maps')} description={t('paleo_maps_desc')} checked={paleoMaps} onChange={setPaleoMaps} />
          </SectionCard>

          {/* Atualizações */}
          <SectionCard title={t('update_section')} description={t('update_section_desc')}>
            <UpdateCheck />
          </SectionCard>

        </div>
      </div>
    </div>
  )
}
