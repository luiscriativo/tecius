/**
 * About Page
 */

import React from 'react'
import { Info } from 'lucide-react'
import { useElectron } from '@/hooks/useElectron'
import { useAppStore } from '@/stores/useAppStore'
import { useI18n } from '@/hooks/useI18n'

// ── TechBadge ─────────────────────────────────────────────────────────────────

function TechBadge({ name, version }: { name: string; version: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between py-2 border-b border-chr-subtle last:border-0">
      <span className="font-mono text-xs text-chr-secondary">{name}</span>
      <span className="font-mono text-2xs text-chr-muted bg-subtle px-2 py-0.5 rounded-sm">{version}</span>
    </div>
  )
}

// ── Section Card ──────────────────────────────────────────────────────────────

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
      <div className="px-5 py-3">{children}</div>
    </div>
  )
}

// ── AboutPage ─────────────────────────────────────────────────────────────────

export function AboutPage(): React.ReactElement {
  const { invoke, isElectron } = useElectron()
  const appVersion = useAppStore((s) => s.appVersion)
  const platform = useAppStore((s) => s.platform)
  const { t } = useI18n()

  const handleOpenGitHub = (): void => {
    if (isElectron) invoke('app:open-external', 'https://github.com/electron/electron')
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-vault">

      {/* Cabeçalho */}
      <header className="shrink-0 border-b border-chr-subtle bg-surface">
        <div className="flex items-center justify-between px-6 py-3 gap-4">
          <div className="flex items-center gap-3">
            <Info size={16} strokeWidth={1.5} className="text-chr-muted" />
            <div>
              <h1 className="font-mono text-sm font-medium text-chr-primary leading-none">{t('about_title')}</h1>
              <p className="font-mono text-2xs text-chr-muted mt-0.5">{t('about_desc')}</p>
            </div>
          </div>

          <button
            onClick={handleOpenGitHub}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-xs border border-chr-subtle text-chr-muted hover:border-chr hover:text-chr-secondary transition-colors duration-150"
          >
            {t('view_on_github')}
          </button>
        </div>
      </header>

      {/* Corpo */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-6 space-y-4 max-w-2xl">

          <SectionCard title={t('app_card_title')} description={t('app_card_desc')}>
            <TechBadge name={t('app_version_label')} version={appVersion || '0.1.0'} />
            <TechBadge name={t('platform_label')}    version={platform ?? 'unknown'} />
            <TechBadge name="Node.js"                version={window.electronAPI?.versions?.node     ?? 'N/A'} />
            <TechBadge name="Chrome"                 version={window.electronAPI?.versions?.chrome   ?? 'N/A'} />
            <TechBadge name="Electron"               version={window.electronAPI?.versions?.electron ?? 'N/A'} />
          </SectionCard>

          <SectionCard title={t('tech_stack')} description={t('tech_stack_desc')}>
            <TechBadge name="Electron"             version="33.x" />
            <TechBadge name="React"                version="18.x" />
            <TechBadge name="TypeScript"           version="5.x"  />
            <TechBadge name="Tailwind CSS"         version="3.x"  />
            <TechBadge name="Vite (electron-vite)" version="2.x"  />
            <TechBadge name="Zustand"              version="5.x"  />
            <TechBadge name="React Router"         version="6.x"  />
          </SectionCard>

        </div>
      </div>
    </div>
  )
}
