/**
 * Home Page — Dashboard do vault
 *
 * Quando o vault está carregado: exibe todas as timelines disponíveis.
 * Clicar numa timeline carrega ela e navega para /timeline.
 */

import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, ChevronRight, FolderOpen, RefreshCw, X, Library, Pencil, Check } from 'lucide-react'
import { useVaultStore } from '@/stores/useVaultStore'
import { useVault } from '@/hooks/useVault'
import { useTimeline } from '@/hooks/useTimeline'
import { useTimelineStore } from '@/stores/useTimelineStore'
import { useNavigationStore } from '@/stores/useNavigationStore'
import { useI18n } from '@/hooks/useI18n'
import { cn } from '@/utils/cn'
import type { TimelineRef } from '@/types/chronicler'

// ── Card de timeline ──────────────────────────────────────────────────────────

function TimelineCard({ timeline, onClick }: { timeline: TimelineRef; onClick: () => void }) {
  const { t, nEvents } = useI18n()
  return (
    <button
      onClick={onClick}
      className={cn(
        'chr-card group w-full text-left p-5',
        'flex items-start justify-between gap-4',
        'hover:border-chr-strong hover:shadow-card-hover',
        'transition-all duration-150 cursor-pointer'
      )}
    >
      <div className="flex items-start gap-4 min-w-0">
        {/* Ícone */}
        <div className="w-8 h-8 border border-chr-subtle flex items-center justify-center shrink-0 mt-0.5">
          <BookOpen size={14} className="text-chr-muted" strokeWidth={1.5} />
        </div>

        {/* Textos */}
        <div className="min-w-0">
          <h3 className="font-serif text-lg text-chr-primary leading-tight group-hover:text-chr-primary truncate">
            {timeline.title}
          </h3>
          <p className="chr-date mt-1">
            {nEvents(timeline.eventCount)}
          </p>
          {timeline.period && (
            <p className="font-mono text-2xs text-chr-muted mt-0.5">{timeline.period}</p>
          )}
        </div>
      </div>

      {/* Seta */}
      <ChevronRight
        size={16}
        strokeWidth={1.5}
        className="text-chr-muted shrink-0 mt-1 group-hover:text-chr-secondary transition-colors"
      />
    </button>
  )
}

// ── Home Page ─────────────────────────────────────────────────────────────────

export function HomePage(): React.ReactElement {
  const navigate = useNavigate()
  const vaultInfo = useVaultStore((s) => s.vaultInfo)
  const isLoading = useVaultStore((s) => s.isLoading)
  const { pickAndLoadVault, reloadVault, clearVault, renameVault } = useVault()
  const { openTimeline } = useTimeline()
  const setCurrentTimeline = useTimelineStore((s) => s.setCurrentTimeline)
  const resetNav = useNavigationStore((s) => s.reset)
  const { t, nEvents } = useI18n()

  // ── Rename inline ──────────────────────────────────────────────────────────
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [isSavingRename, setIsSavingRename] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const startRename = () => {
    setRenameValue(vaultInfo?.title ?? '')
    setIsRenaming(true)
  }

  useEffect(() => {
    if (isRenaming) renameInputRef.current?.select()
  }, [isRenaming])

  const confirmRename = async () => {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === vaultInfo?.title) { setIsRenaming(false); return }
    setIsSavingRename(true)
    await renameVault(trimmed)
    setIsSavingRename(false)
    setIsRenaming(false)
  }

  const cancelRename = () => setIsRenaming(false)

  const handleRenameKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') confirmRename()
    if (e.key === 'Escape') cancelRename()
  }

  const handleCloseVault = () => {
    setCurrentTimeline(null)
    resetNav({ title: '', dirPath: '' })
    clearVault()
    navigate('/')
  }

  const handleOpenTimeline = async (timeline: TimelineRef) => {
    await openTimeline(timeline.dirPath, timeline.title)
    navigate('/timeline')
  }

  // ── Vault não carregado ──
  if (!vaultInfo) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
        <h1 className="font-serif text-2xl text-chr-primary">{t('no_vault')}</h1>
        <button
          onClick={pickAndLoadVault}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-5 py-2 border border-chr-strong text-chr-primary text-sm rounded-sm hover:bg-active transition-colors"
        >
          <FolderOpen size={14} strokeWidth={1.5} />
          {isLoading ? t('loading') : t('choose_vault')}
        </button>
      </div>
    )
  }

  // ── Dashboard do vault ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden bg-vault">
      {/* Cabeçalho */}
      <header className="shrink-0 border-b border-chr-subtle bg-surface">
        <div className="flex items-center justify-between px-6 py-3 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Library size={16} strokeWidth={1.5} className="text-chr-muted shrink-0" />
            <div className="min-w-0">
              {isRenaming ? (
                <div className="flex items-center gap-1.5">
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={handleRenameKey}
                    disabled={isSavingRename}
                    className={cn(
                      'font-mono text-sm font-medium text-chr-primary leading-none bg-transparent',
                      'border-b border-chr-strong outline-none w-48',
                      'disabled:opacity-50'
                    )}
                    autoFocus
                  />
                  <button
                    onClick={confirmRename}
                    disabled={isSavingRename}
                    className="text-chr-muted hover:text-chr-primary transition-colors disabled:opacity-40"
                    title="Confirmar"
                  >
                    <Check size={12} strokeWidth={2} />
                  </button>
                  <button
                    onClick={cancelRename}
                    disabled={isSavingRename}
                    className="text-chr-muted hover:text-chr-primary transition-colors disabled:opacity-40"
                    title="Cancelar"
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </div>
              ) : (
                <h1 className="font-mono text-sm font-medium text-chr-primary leading-none truncate">
                  {vaultInfo.title}
                </h1>
              )}
              <p className="font-mono text-2xs text-chr-muted mt-0.5 truncate max-w-xs" title={vaultInfo.rootPath}>
                {vaultInfo.rootPath}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Stats */}
            <div className="flex items-center gap-2 font-mono text-2xs text-chr-muted hidden sm:flex">
              <span>{vaultInfo.totalEvents} {t('events_label')}</span>
              <span className="text-chr-subtle">·</span>
              <span>{vaultInfo.timelines.length} {t('timelines_label')}</span>
            </div>

            <div className="w-px h-4 bg-chr-subtle hidden sm:block" />

            {/* Renomear */}
            {!isRenaming && (
              <button
                onClick={startRename}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm',
                  'font-mono text-xs text-chr-muted',
                  'border border-chr-subtle',
                  'hover:border-chr hover:text-chr-secondary',
                  'transition-colors duration-150'
                )}
                title="Renomear vault"
              >
                <Pencil size={11} strokeWidth={1.5} />
                Renomear
              </button>
            )}

            {/* Fechar vault */}
            <button
              onClick={handleCloseVault}
              title={t('close_vault')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm',
                'font-mono text-xs text-chr-muted',
                'border border-chr-subtle',
                'hover:border-chr hover:text-chr-secondary',
                'transition-colors duration-150'
              )}
            >
              <X size={11} strokeWidth={1.5} />
              {t('close_vault')}
            </button>
          </div>
        </div>
      </header>

      {/* Conteúdo principal */}
      <div className="flex-1 overflow-y-auto px-8 py-6">

        {/* Cabeçalho da seção */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-mono text-xs text-chr-muted tracking-wider uppercase">
            {t('available_timelines')}
          </h2>
          <button
            onClick={reloadVault}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-2 py-1 rounded-sm text-chr-muted hover:text-chr-secondary hover:bg-hover transition-colors text-xs font-mono disabled:opacity-50"
            title={t('reload_vault')}
          >
            <RefreshCw size={11} strokeWidth={1.5} className={isLoading ? 'animate-spin' : ''} />
            {t('refresh')}
          </button>
        </div>

        {/* Grid de timelines — auto-fill para ser responsivo sem breakpoints fixos */}
        {vaultInfo.timelines.length > 0 ? (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}
          >
            {vaultInfo.timelines.map((timeline) => (
              <TimelineCard
                key={timeline.dirPath}
                timeline={timeline}
                onClick={() => handleOpenTimeline(timeline)}
              />
            ))}
          </div>
        ) : (
          <div className="chr-card p-8 text-center max-w-md">
            <p className="text-chr-muted text-sm">
              {t('no_timelines')}
            </p>
            <p className="font-mono text-2xs text-chr-muted mt-2">
              {t('create_timeline_hint').split('_timeline.md')[0]}
              <span className="text-chr-secondary">_timeline.md</span>
              {t('create_timeline_hint').split('_timeline.md')[1]}
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
