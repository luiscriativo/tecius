/**
 * Home Page — Dashboard do vault
 *
 * Quando o vault está carregado: exibe todas as timelines disponíveis.
 * Clicar numa timeline carrega ela e navega para /timeline.
 */

import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, ChevronRight, FolderOpen, RefreshCw, X, Library, Pencil, Check, Plus, MoreHorizontal, LogOut } from 'lucide-react'
import { useVaultStore } from '@/stores/useVaultStore'
import { useVault } from '@/hooks/useVault'
import { useTimeline } from '@/hooks/useTimeline'
import { useTimelineStore } from '@/stores/useTimelineStore'
import { useNavigationStore } from '@/stores/useNavigationStore'
import { useI18n } from '@/hooks/useI18n'
import { cn } from '@/utils/cn'
import { ConfirmModal } from '@/components/ConfirmModal'
import type { TimelineRef } from '@/types/chronicler'

// ── Card de timeline ──────────────────────────────────────────────────────────

function TimelineCard({ timeline, onClick }: { timeline: TimelineRef; onClick: () => void }) {
  const { nEvents } = useI18n()
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
          <h3 className="font-serif text-lg text-chr-primary leading-tight group-hover:text-chr-primary line-clamp-2 break-words">
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

// ── Criar timeline ────────────────────────────────────────────────────────────

/**
 * Criação de timeline direto na tela inicial: o botão vira um campo para o nome;
 * Enter cria e já abre a timeline nova. `variant="hero"` é o convite do vault
 * vazio; `variant="card"` é o cartão tracejado no fim da grade.
 */
function NewTimeline({ variant, onCreated }: { variant: 'hero' | 'card'; onCreated: (t: TimelineRef) => void }) {
  const { t } = useI18n()
  const { createTimeline } = useVault()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const cancel = () => { setEditing(false); setName('') }
  const submit = async () => {
    const title = name.trim()
    if (!title || busy) return
    setBusy(true)
    const before = new Set((useVaultStore.getState().vaultInfo?.timelines ?? []).map((tl) => tl.dirPath))
    try {
      if (await createTimeline(title)) {
        const created = (useVaultStore.getState().vaultInfo?.timelines ?? []).find((tl) => !before.has(tl.dirPath))
        cancel()
        if (created) onCreated(created)
      }
    } finally {
      setBusy(false)
    }
  }

  const primaryBtn = cn(
    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-mono shrink-0',
    'border border-timeline-chronicle bg-timeline-chronicle text-surface hover:bg-timeline-chronicle/85',
    'transition-colors duration-150 disabled:opacity-50'
  )
  const form = (
    <form className="flex items-center gap-2 w-full" onSubmit={(e) => { e.preventDefault(); void submit() }}>
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') cancel() }}
        placeholder={t('timeline_name_ph')}
        disabled={busy}
        className="flex-1 min-w-0 px-3 py-1.5 text-sm rounded-sm outline-none bg-vault border border-chr-subtle text-chr-primary placeholder:text-chr-muted focus:border-chr-strong transition-colors disabled:opacity-50"
        data-testid="new-timeline-name"
      />
      <button type="submit" disabled={busy || !name.trim()} className={primaryBtn}>{t('create_timeline_btn')}</button>
      <button type="button" onClick={cancel} className="px-2 py-1.5 text-xs font-mono text-chr-muted hover:text-chr-primary">{t('cancel')}</button>
    </form>
  )

  if (variant === 'card') {
    return editing ? (
      <div className="chr-card p-5 flex items-center">{form}</div>
    ) : (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="w-full min-h-[92px] flex items-center justify-center gap-2 rounded-sm border border-dashed border-chr text-chr-muted hover:text-chr-primary hover:border-chr-strong hover:bg-hover transition-colors font-mono text-xs"
        data-testid="new-timeline-card"
      >
        <Plus size={14} strokeWidth={1.5} /> {t('new_timeline')}
      </button>
    )
  }

  return (
    <div className="chr-card p-8 max-w-lg" data-testid="first-timeline">
      <h2 className="font-serif text-2xl text-chr-primary">{t('first_timeline_title')}</h2>
      <p className="text-sm text-chr-secondary mt-2 leading-relaxed">{t('first_timeline_desc')}</p>
      <div className="mt-5">
        {editing ? form : (
          <button type="button" onClick={() => setEditing(true)} className={primaryBtn} data-testid="first-timeline-btn">
            <Plus size={12} strokeWidth={1.5} /> {t('create_timeline_btn')}
          </button>
        )}
      </div>
      <p className="font-mono text-2xs text-chr-muted mt-6">
        {t('create_timeline_hint').split('_timeline.md')[0]}
        <span className="text-chr-secondary">_timeline.md</span>
        {t('create_timeline_hint').split('_timeline.md')[1]}
      </p>
    </div>
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
  const { t } = useI18n()

  // ── Rename inline ──────────────────────────────────────────────────────────
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [isSavingRename, setIsSavingRename] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const startRename = () => {
    setRenameValue(vaultInfo?.title || t('default_vault_title'))
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

  // ── Menu do vault (ações raras, longe do clique acidental) ─────────────────
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [menuOpen])

  const handleCloseVault = () => {
    setConfirmClose(false)
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
                    title={t('confirm')}
                  >
                    <Check size={12} strokeWidth={2} />
                  </button>
                  <button
                    onClick={cancelRename}
                    disabled={isSavingRename}
                    className="text-chr-muted hover:text-chr-primary transition-colors disabled:opacity-40"
                    title={t('cancel')}
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </div>
              ) : (
                <h1 className="font-mono text-sm font-medium text-chr-primary leading-none truncate">
                  {vaultInfo.title || t('default_vault_title')}
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
              <span>{vaultInfo.timelines.length} {t(vaultInfo.timelines.length === 1 ? 'timeline_label' : 'timelines_label')}</span>
            </div>

            <div className="w-px h-4 bg-chr-subtle hidden sm:block" />

            {/* Ações do vault: num menu (fechar ficava ao lado de renomear e era clicado sem querer) */}
            {!isRenaming && (
              <div ref={menuRef} className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  title={t('vault_actions')}
                  aria-label={t('vault_actions')}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  data-testid="vault-menu"
                  className={cn(
                    'flex items-center justify-center w-7 h-7 rounded-sm text-chr-muted',
                    'border border-chr-subtle hover:border-chr hover:text-chr-secondary transition-colors duration-150',
                    menuOpen && 'border-chr text-chr-secondary'
                  )}
                >
                  <MoreHorizontal size={14} strokeWidth={1.5} />
                </button>
                {menuOpen && (
                  <div role="menu" className="absolute right-0 top-full mt-1 z-30 w-52 chr-card shadow-card-hover py-1">
                    {([
                      ['rename', <Pencil key="i" size={12} strokeWidth={1.5} />, t('home_rename_vault'), () => startRename()],
                      ['reveal', <FolderOpen key="i" size={12} strokeWidth={1.5} />, t('vault_reveal'), () => window.electronAPI.send('fs:reveal-vault')],
                    ] as const).map(([id, icon, label, run]) => (
                      <button key={id} role="menuitem" data-testid={`vault-menu-${id}`}
                        onClick={() => { setMenuOpen(false); run() }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-chr-primary hover:bg-hover">
                        <span className="text-chr-muted">{icon}</span>{label}
                      </button>
                    ))}
                    <div className="my-1 h-px bg-chr-subtle" />
                    <button role="menuitem" data-testid="vault-menu-close"
                      onClick={() => { setMenuOpen(false); setConfirmClose(true) }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-chr-secondary hover:bg-hover">
                      <span className="text-chr-muted"><LogOut size={12} strokeWidth={1.5} /></span>{t('close_vault')}…
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {confirmClose && (
        <ConfirmModal
          title={t('close_vault_confirm_title', { name: vaultInfo.title || t('default_vault_title') })}
          description={t('close_vault_confirm_desc')}
          confirmLabel={t('close_vault')}
          onConfirm={handleCloseVault}
          onCancel={() => setConfirmClose(false)}
        />
      )}

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
            <NewTimeline variant="card" onCreated={handleOpenTimeline} />
          </div>
        ) : (
          <NewTimeline variant="hero" onCreated={handleOpenTimeline} />
        )}

      </div>
    </div>
  )
}
