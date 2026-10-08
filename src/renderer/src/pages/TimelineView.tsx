import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, X, Filter, ChevronRight, Pencil, Trash2, AlertTriangle, GitBranch, Download } from 'lucide-react'
import { BreadcrumbBar, TimelineCanvas, TimelineList, ViewToggle } from '../components/timeline'
import { useTimeline } from '../hooks/useTimeline'
import { useVault } from '../hooks/useVault'
import { useNavigationStore } from '../stores/useNavigationStore'
import { useI18n } from '../hooks/useI18n'
import { cn } from '../utils/cn'
import { DateInput } from '../components/DateInput'
import type { ChroniclerEvent } from '../types/chronicler'
import { isMultiPart } from '../utils/events'
import { MapView } from '../components/map/MapView'
import { useTimelineStore } from '../stores/useTimelineStore'
import { useVaultStore } from '../stores/useVaultStore'
import { toTimelineData } from '../hooks/useTimeline'
import type { TimelineData } from '../types/chronicler'
import type { RawTimeline } from '../types/ipc'
import { useNotifications } from '../hooks/useNotifications'
import { buildTimelineExportHtml } from '../utils/exportTimeline'

// ── NewEventModal ──────────────────────────────────────────────────────────────

interface NewEventModalProps {
  timelineDirPath: string
  onConfirm: (title: string, date: string, filename: string) => Promise<void>
  onCancel: () => void
  isLoading: boolean
}

function NewEventModal({ timelineDirPath: _timelineDirPath, onConfirm, onCancel, isLoading }: NewEventModalProps) {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayStr)
  const [customFilename, setCustomFilename] = useState('')
  const [showFilename, setShowFilename] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const { t } = useI18n()

  useEffect(() => {
    titleRef.current?.focus()
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  const autoSlug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-') || t('default_event_slug')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onConfirm(title.trim(), date, showFilename && customFilename.trim() ? customFilename.trim() : '')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative z-10 w-[440px] chr-card p-5 shadow-card-hover">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-base text-chr-primary">{t('new_event_title')}</h3>
          <button onClick={onCancel} className="text-chr-muted hover:text-chr-secondary transition-colors">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Título */}
          <div>
            <label className="block font-mono text-2xs text-chr-muted mb-1">{t('event_title_required')}</label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('event_name_ph')}
              className={cn(
                'w-full px-3 py-2 rounded-sm text-sm font-serif',
                'bg-vault border border-chr-subtle text-chr-primary',
                'focus:outline-none focus:border-chr transition-colors',
                'placeholder:text-chr-muted'
              )}
            />
          </div>

          {/* Data */}
          <div>
            <label className="block font-mono text-2xs text-chr-muted mb-1">{t('event_date')}</label>
            <DateInput
              value={date}
              onChange={setDate}
              className={cn(
                'w-full px-3 py-2 rounded-sm text-sm font-mono',
                'bg-vault border border-chr-subtle text-chr-primary',
                'focus:outline-none focus:border-chr transition-colors',
                'placeholder:text-chr-muted'
              )}
            />
          </div>

          {/* Arquivo .md */}
          <div>
            <button
              type="button"
              onClick={() => setShowFilename((v) => !v)}
              className="font-mono text-2xs text-chr-muted hover:text-chr-secondary transition-colors"
            >
              {showFilename ? '▾' : '▸'} {t('md_filename')}
            </button>
            {showFilename ? (
              <div className="mt-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customFilename}
                    onChange={(e) => setCustomFilename(e.target.value)}
                    placeholder={autoSlug}
                    className={cn(
                      'flex-1 px-3 py-1.5 rounded-sm text-xs font-mono',
                      'bg-vault border border-chr-subtle text-chr-primary',
                      'focus:outline-none focus:border-chr transition-colors',
                      'placeholder:text-chr-muted'
                    )}
                  />
                  <span className="font-mono text-2xs text-chr-muted shrink-0">.md</span>
                </div>
              </div>
            ) : (
              <p className="mt-1 font-mono text-2xs text-chr-muted">
                {t('will_be_created_as')} <span className="text-chr-secondary">{autoSlug}.md</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="px-3 py-1.5 font-mono text-xs rounded-sm border border-chr-subtle text-chr-muted hover:text-chr-secondary hover:border-chr transition-colors disabled:opacity-40"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={isLoading || !title.trim()}
              className="px-3 py-1.5 font-mono text-xs rounded-sm bg-chr-primary text-surface hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {isLoading ? t('creating') : t('create_event')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── ClusterPanel ───────────────────────────────────────────────────────────────

interface ClusterPanelProps {
  events: ChroniclerEvent[]
  onEventClick: (event: ChroniclerEvent) => void
  onContextMenu: (event: ChroniclerEvent, x: number, y: number) => void
  onClose: () => void
}

function ClusterPanel({ events, onEventClick, onContextMenu, onClose }: ClusterPanelProps) {
  const { t } = useI18n()
  const allChronicle = events.every(isMultiPart)
  const hasChronicle  = events.some(isMultiPart)

  // Calcula o range de datas do cluster
  const sorted = [...events].sort((a, b) => a.date.sortKey - b.date.sortKey)
  const firstDate = sorted[0]?.date.display ?? ''
  const lastDate  = sorted[sorted.length - 1]?.date.display ?? ''
  const sameDate  = firstDate === lastDate
  const dateLabel = sameDate ? firstDate : `${firstDate} – ${lastDate}`

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="w-64 shrink-0 border-l border-chr-subtle bg-surface flex flex-col overflow-hidden">

      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-chr-subtle flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-2xs text-chr-muted truncate">{dateLabel}</p>
          <p className="font-mono text-xs text-chr-secondary mt-0.5">
            {t(sameDate ? (events.length === 1 ? 'cluster_date_one' : 'cluster_date_other') : (events.length === 1 ? 'cluster_period_one' : 'cluster_period_other'), { count: events.length })}
          </p>
          {hasChronicle && !allChronicle && (
            <p className="font-mono text-2xs text-chr-muted mt-1">{t('legend_chronicle_event')}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 text-chr-muted hover:text-chr-primary transition-colors mt-0.5"
          aria-label={t('close')}
        >
          <X size={13} strokeWidth={1.5} />
        </button>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {events.map((e) => (
          <button
            key={e.slug}
            onClick={() => { onEventClick(e); onClose() }}
            onContextMenu={(ev) => { ev.preventDefault(); onContextMenu(e, ev.clientX, ev.clientY) }}
            className={cn(
              'w-full text-left px-4 py-3 flex items-start gap-3',
              'border-b border-chr-subtle last:border-b-0',
              'hover:bg-hover transition-colors duration-100'
            )}
          >
            {isMultiPart(e) ? (
              <div className="w-2 h-2 border border-timeline-chronicle rotate-45 shrink-0 mt-1 opacity-80" />
            ) : (
              <div className="w-1.5 h-1.5 rounded-full bg-timeline-dot shrink-0 mt-1.5 opacity-60" />
            )}
            <div className="flex-1 min-w-0">
              <span className="text-sm text-chr-secondary block leading-snug truncate">
                {e.frontmatter.title}
              </span>
              {isMultiPart(e) && (
                <span className="font-mono text-2xs text-timeline-chronicle-text opacity-70 block truncate mt-0.5">
                  {e.chronicle!.title}
                </span>
              )}
              {e.frontmatter.category && (
                <span className="font-mono text-2xs text-chr-muted block truncate mt-0.5">
                  {e.frontmatter.category}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── CanvasContextMenu + modals ─────────────────────────────────────────────────

interface CanvasCtxState { x: number; y: number; event: ChroniclerEvent }

function CanvasContextMenu({
  state, onRename, onFilter, onDelete, onClose,
}: { state: CanvasCtxState; onRename: () => void; onFilter: () => void; onDelete: () => void; onClose: () => void }) {
  const { t } = useI18n()
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: state.x, y: state.y })

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    setPos({
      x: Math.max(4, Math.min(state.x, vw - width - 8)),
      y: Math.max(4, Math.min(state.y, vh - height - 8)),
    })
  }, [state.x, state.y])

  return (
    <>
      <div className="fixed inset-0 z-[99]" onMouseDown={onClose} />
      <div
        ref={menuRef}
        style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex: 100 }}
        className="w-48 chr-card py-1 shadow-card-hover"
      >
        <button onClick={() => { onRename(); onClose() }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-mono text-xs text-chr-secondary hover:bg-hover hover:text-chr-primary transition-colors">
          <Pencil size={12} strokeWidth={1.5} className="shrink-0" />{t('rename_file')}
        </button>
        <button onClick={() => { onFilter(); onClose() }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-mono text-xs text-chr-secondary hover:bg-hover hover:text-chr-primary transition-colors">
          <Filter size={12} strokeWidth={1.5} className="shrink-0" />{t('filter_by_file')}
        </button>
        <div className="h-px bg-chr-subtle mx-2 my-1" />
        <button onClick={() => { onDelete(); onClose() }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-mono text-xs text-red-500/80 hover:bg-red-500/5 hover:text-red-500 transition-colors">
          <Trash2 size={12} strokeWidth={1.5} className="shrink-0" />{t('send_to_trash')}
        </button>
      </div>
    </>
  )
}

function CanvasConfirmDeleteModal({
  event, isLoading, onConfirm, onCancel,
}: { event: ChroniclerEvent; isLoading: boolean; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useI18n()
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onCancel])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative z-10 w-96 chr-card p-5 shadow-card-hover">
        <div className="flex items-start gap-3 mb-3">
          <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" strokeWidth={1.5} />
          <h3 className="font-serif text-base text-chr-primary">{t('send_to_trash_title')}</h3>
        </div>
        <p className="font-mono text-xs text-chr-muted mb-5 leading-relaxed pl-7">
          {t('send_to_trash_desc', { title: event.frontmatter.title })}
        </p>
        <div className="flex items-center gap-2 justify-end">
          <button onClick={onCancel} disabled={isLoading}
            className="px-3 py-1.5 font-mono text-xs rounded-sm border border-chr-subtle text-chr-muted hover:text-chr-secondary hover:border-chr transition-colors disabled:opacity-40">
            {t('cancel')}
          </button>
          <button onClick={onConfirm} disabled={isLoading}
            className="px-3 py-1.5 font-mono text-xs rounded-sm bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-40">
            {isLoading ? t('please_wait') : t('send_to_trash')}
          </button>
        </div>
      </div>
    </div>
  )
}

function CanvasRenameModal({
  event, isLoading, onConfirm, onCancel,
}: { event: ChroniclerEvent; isLoading: boolean; onConfirm: (name: string) => void; onCancel: () => void }) {
  const currentSlug = event.filePath.replace(/\\/g, '/').split('/').pop()?.replace(/\.md$/i, '') ?? event.slug
  const [value, setValue] = useState(currentSlug)
  const inputRef = useRef<HTMLInputElement>(null)
  const { t } = useI18n()
  useEffect(() => {
    inputRef.current?.select()
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onCancel])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative z-10 w-[420px] chr-card p-5 shadow-card-hover">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-serif text-base text-chr-primary">{t('rename_file_modal_title')}</h3>
          <button onClick={onCancel} className="text-chr-muted hover:text-chr-secondary transition-colors">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
        <p className="font-mono text-2xs text-chr-muted mb-3 leading-relaxed">
          {t('file_title_in')} <span className="text-chr-secondary">{event.frontmatter.title}</span>
        </p>
        <form onSubmit={(e) => { e.preventDefault(); if (value.trim() && value.trim() !== currentSlug) { onConfirm(value.trim()) } else { onCancel() } }} className="space-y-3">
          <div className="flex items-center gap-2">
            <input ref={inputRef} type="text" value={value} onChange={(e) => setValue(e.target.value)}
              className="flex-1 px-3 py-2 rounded-sm text-sm font-mono bg-vault border border-chr-subtle text-chr-primary focus:outline-none focus:border-chr transition-colors" />
            <span className="font-mono text-xs text-chr-muted shrink-0">.md</span>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button type="button" onClick={onCancel} disabled={isLoading}
              className="px-3 py-1.5 font-mono text-xs rounded-sm border border-chr-subtle text-chr-muted hover:text-chr-secondary transition-colors disabled:opacity-40">
              {t('cancel')}
            </button>
            <button type="submit" disabled={isLoading || !value.trim()}
              className="px-3 py-1.5 font-mono text-xs rounded-sm bg-chr-primary text-surface hover:opacity-90 transition-opacity disabled:opacity-40">
              {isLoading ? t('renaming') : t('rename')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── TimelineView ───────────────────────────────────────────────────────────────

interface TimelineViewProps {
  initialPath?: string
  initialTitle?: string
}

export default function TimelineView({ initialPath, initialTitle }: TimelineViewProps) {
  const navigate = useNavigate()
  const { reloadVault } = useVault()
  const {
    currentTimeline,
    selectedEvent,
    isLoadingTimeline,
    viewMode,
    loadTimeline,
    loadEvent,
    goBack,
    enterSubtimeline,
    setViewMode,
    reloadTimeline,
    createEvent,
    deleteEvent,
    renameEventFile,
    clearSelection,
  } = useTimeline()
  const stack = useNavigationStore((s) => s.stack)
  const truncateNav = useNavigationStore((s) => s.truncate)
  const canGoBack = stack.length > 1
  const { t, nEvents } = useI18n()

  const [showNewEvent, setShowNewEvent] = useState(false)
  const [creatingEvent, setCreatingEvent] = useState(false)
  const [clusterEvents, setClusterEvents] = useState<ChroniclerEvent[] | null>(null)

  // ── Filtro de arquivo (via menu de contexto) ───────────────────────────
  const [fileFilter, setFileFilter] = useState<string[] | null>(null)

  // ── Context menu do canvas ──────────────────────────────────────────────
  const [canvasCtxMenu, setCanvasCtxMenu] = useState<CanvasCtxState | null>(null)
  const [canvasConfirmDelete, setCanvasConfirmDelete] = useState<ChroniclerEvent | null>(null)
  const [canvasRenaming, setCanvasRenaming] = useState<ChroniclerEvent | null>(null)
  const [canvasActionLoading, setCanvasActionLoading] = useState(false)

  // Reseta filtro e painel ao trocar de timeline
  useEffect(() => {
    setFileFilter(null)
    setClusterEvents(null)
  }, [currentTimeline?.dirPath])

  useEffect(() => {
    if (initialPath && initialTitle) {
      loadTimeline(initialPath, initialTitle)
    }
  }, [initialPath, initialTitle]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClearFileFilter = () => {
    setFileFilter(null)
  }

  const undatedEvents = currentTimeline?.events.filter((e) => e.undated) ?? []

  // ── Exportar a timeline inteira (PDF ou página web) ──────────────────────
  const { notify } = useNotifications()
  const [exportMenu, setExportMenu] = useState(false)
  const [exporting, setExporting] = useState(false)
  const handleExport = async (format: 'pdf' | 'html') => {
    if (!currentTimeline) return
    setExportMenu(false)
    setExporting(true)
    try {
      const bodyHtml = await buildTimelineExportHtml(currentTimeline, { events: nEvents, noContent: t('no_content') })
      const r = await window.electronAPI.invoke<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>(
        'app:export-timeline', { format, suggestedName: currentTimeline.meta.title, title: currentTimeline.meta.title, bodyHtml })
      if (r.success) notify.success(t('export_done_title'), r.filePath ?? '')
      else if (!r.canceled) notify.error(t('export_error'), r.error ?? '')
    } catch (e) {
      notify.error(t('export_error'), String(e))
    } finally {
      setExporting(false)
    }
  }

  // ── Comparar com outra timeline (faixa extra na visão horizontal) ─────────
  const vaultTimelines = useVaultStore((s) => s.vaultInfo?.timelines ?? [])
  const [compareDir, setCompareDir] = useState<string | null>(null)
  const [compareData, setCompareData] = useState<TimelineData | null>(null)
  const compareOptions = [
    ...vaultTimelines.map((tl) => ({ dirPath: tl.dirPath, title: tl.title })),
    ...(currentTimeline?.subtimelines ?? []).map((tl) => ({ dirPath: tl.dirPath, title: tl.title })),
  ].filter((o, i, arr) => o.dirPath !== currentTimeline?.dirPath && arr.findIndex((x) => x.dirPath === o.dirPath) === i)
  useEffect(() => {
    if (!compareDir || compareDir === currentTimeline?.dirPath) { setCompareData(null); return }
    let alive = true
    window.electronAPI.invoke<{ success: boolean; data?: RawTimeline }>('fs:read-timeline', compareDir)
      .then((r) => { if (alive) setCompareData(r.success && r.data ? toTimelineData(r.data) : null) })
      .catch(() => { if (alive) setCompareData(null) })
    return () => { alive = false }
  }, [compareDir, currentTimeline?.dirPath])

  const handleEventClick = async (event: ChroniclerEvent) => {
    // Evento da timeline comparada: abre a timeline dele primeiro (anterior/próximo
    // e o caminho no topo passam a ser os dela)
    const isOther = currentTimeline && !currentTimeline.events.some((e) => e.filePath === event.filePath && e.slug === event.slug)
    if (isOther && currentTimeline && compareData?.events.some((e) => e.filePath === event.filePath)) {
      setCompareDir(currentTimeline.dirPath)   // e passa a comparar com a de onde veio
      await loadTimeline(compareData.dirPath, compareData.meta.title, true)
      const loaded = useTimelineStore.getState().currentTimeline?.events.find((e) => e.filePath === event.filePath && e.slug === event.slug)
      if (loaded) { loadEvent(loaded); navigate('/event') }
      return
    }
    loadEvent(event)
    navigate('/event')
  }

  const handleEnterSubtimeline = (event: ChroniclerEvent) => {
    enterSubtimeline(event)
  }

  const handleCreateEvent = async (title: string, date: string, filename: string) => {
    if (!currentTimeline) return
    setCreatingEvent(true)
    try {
      const result = await createEvent(currentTimeline.dirPath, title, filename || undefined, date || undefined)
      if (result) {
        setShowNewEvent(false)
        await reloadTimeline()
        await reloadVault()
        // Abre o evento recém-criado para escrever o conteúdo (na lista ele podia
        // cair num grupo recolhido e o usuário não o encontrava)
        const created = useTimelineStore.getState().currentTimeline?.events.find((e) => e.filePath === result.filePath)
        if (created) handleEventClick(created)
      }
    } finally {
      setCreatingEvent(false)
    }
  }

  const handleDeleteEvent = async (event: ChroniclerEvent) => {
    await deleteEvent(event.filePath)
    clearSelection()
    await reloadTimeline()
    await reloadVault()
    // Remove do painel de cluster se estiver aberto
    setClusterEvents((prev) => {
      if (!prev) return null
      const next = prev.filter((e) => e.filePath !== event.filePath)
      return next.length > 0 ? next : null
    })
  }

  const handleRenameEventFile = async (event: ChroniclerEvent, newFilename: string) => {
    const result = await renameEventFile(event.filePath, newFilename)
    // Mantém o filtro por arquivo apontando para o novo nome
    if (result) setFileFilter((prev) => prev?.map((p) => (p === event.filePath ? result.newFilePath : p)) ?? null)
    clearSelection()
    await reloadTimeline()
  }

  const handleFilterByFile = (filePath: string) => {
    setFileFilter([filePath])
  }

  const handleCanvasConfirmDelete = async () => {
    if (!canvasConfirmDelete) return
    setCanvasActionLoading(true)
    try { await handleDeleteEvent(canvasConfirmDelete); setCanvasConfirmDelete(null) }
    finally { setCanvasActionLoading(false) }
  }

  const handleCanvasConfirmRename = async (newFilename: string) => {
    if (!canvasRenaming) return
    setCanvasActionLoading(true)
    try { await handleRenameEventFile(canvasRenaming, newFilename); setCanvasRenaming(null) }
    finally { setCanvasActionLoading(false) }
  }

  if (isLoadingTimeline || !currentTimeline) {
    return (
      <div className="flex-1 flex flex-col h-full">
        <BreadcrumbBar />
        <div className="flex-1 flex items-center justify-center">
          <span className="font-mono text-xs text-chr-muted animate-pulse">{t('loading_timeline')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header unificado ─────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-chr-subtle bg-surface">
        <div className="flex items-center justify-between px-6 py-3 gap-4">

          {/* Esquerda: ancestors + título + descrição */}
          <div className="min-w-0 flex-1">
            {/* Breadcrumb de ancestrais (só em sub-timelines) */}
            {stack.length > 1 && (
              <div className="flex items-center gap-1 mb-0.5">
                {stack.slice(0, -1).map((item, i) => (
                  <span key={`${i}-${item.dirPath}`} className="flex items-center gap-1 shrink-0">
                    {i > 0 && <ChevronRight size={9} strokeWidth={1.5} className="text-chr-muted" />}
                    <button
                      onClick={() => { truncateNav(i + 1); loadTimeline(item.dirPath, item.title, false) }}
                      className="font-mono text-2xs text-chr-muted hover:text-chr-secondary transition-colors whitespace-nowrap"
                    >
                      {item.title}
                    </button>
                  </span>
                ))}
                <ChevronRight size={9} strokeWidth={1.5} className="text-chr-muted shrink-0" />
              </div>
            )}

            <h1 className="font-mono text-sm font-medium text-chr-primary truncate leading-none">
              {currentTimeline.meta.title}
            </h1>

            {currentTimeline.meta.description && (
              <p className="font-mono text-2xs text-chr-muted mt-0.5 truncate">
                {currentTimeline.meta.description}
              </p>
            )}
          </div>

          {/* Direita: ações */}
          <div className="flex items-center gap-2 shrink-0">
            {canGoBack && (
              <button
                onClick={goBack}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-sm text-chr-muted hover:text-chr-primary hover:bg-hover transition-colors text-xs font-mono"
              >
                <ArrowLeft size={13} strokeWidth={1.5} />
                {t('back')}
              </button>
            )}

            <button
              onClick={() => setShowNewEvent(true)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-xs font-mono',
                // Ação principal da tela: âmbar do sistema (mesmo token das datas/chronicles)
                'border border-timeline-chronicle bg-timeline-chronicle text-surface',
                'hover:bg-timeline-chronicle/85',
                'transition-colors duration-150'
              )}
              title={t('create_event_hint')}
            >
              <Plus size={12} strokeWidth={1.5} />
              {t('new_event_btn')}
            </button>

            {/* Exportar a timeline inteira */}
            <div className="relative">
              <button type="button" onClick={() => setExportMenu((v) => !v)} disabled={exporting}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-xs font-mono border border-chr-subtle text-chr-secondary hover:text-chr-primary hover:border-chr transition-colors disabled:opacity-50"
                title={t('export_timeline_hint')} data-testid="export-timeline">
                <Download size={12} strokeWidth={1.5} />
                {exporting ? t('exporting') : t('export_timeline')}
              </button>
              {exportMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setExportMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 w-48 chr-card shadow-card-hover py-1" data-testid="export-menu">
                    <button type="button" onClick={() => void handleExport('pdf')} className="w-full text-left px-3 py-1.5 text-xs font-mono text-chr-secondary hover:bg-hover hover:text-chr-primary">{t('export_as_pdf')}</button>
                    <button type="button" onClick={() => void handleExport('html')} className="w-full text-left px-3 py-1.5 text-xs font-mono text-chr-secondary hover:bg-hover hover:text-chr-primary">{t('export_as_html')}</button>
                  </div>
                </>
              )}
            </div>

            <ViewToggle mode={viewMode} onChange={setViewMode} />
          </div>
        </div>
      </header>

      {/* ── Área principal ───────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Banner de filtro ativo */}
        {fileFilter && (
          <div className="shrink-0 px-8 py-2 flex items-center gap-2 bg-active border-b border-chr-subtle">
            <Filter size={11} strokeWidth={1.5} className="text-chr-muted shrink-0" />
            <span className="font-mono text-2xs text-chr-secondary flex-1">
              {t('files_filter_on')
                .replace('{count}', String(fileFilter.length))
                .replace('{s}', fileFilter.length === 1 ? '' : 's')}
            </span>
            <button
              onClick={handleClearFileFilter}
              className="flex items-center gap-1 font-mono text-2xs text-chr-muted hover:text-chr-primary transition-colors"
            >
              <X size={10} strokeWidth={2} />
              {t('files_clear_filter')}
            </button>
          </div>
        )}

        {/* Sub-timelines (pastas com _timeline.md dentro desta) e eventos sem data */}
        {(currentTimeline.subtimelines.length > 0 || (viewMode !== 'list' && undatedEvents.length > 0)
          || (viewMode === 'horizontal' && compareOptions.length > 0)) && (
          <div className="shrink-0 px-5 py-2 border-b border-chr-subtle bg-surface flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-2xs" data-testid="timeline-extras">
            {currentTimeline.subtimelines.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap" data-testid="subtimelines">
                <span className="text-chr-muted">{t('subtimelines_label')}</span>
                {currentTimeline.subtimelines.map((sub) => (
                  <button key={sub.dirPath} type="button" onClick={() => loadTimeline(sub.dirPath, sub.title, true)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border border-chr-subtle text-chr-secondary hover:text-chr-primary hover:border-chr transition-colors">
                    <GitBranch size={10} strokeWidth={1.5} />
                    {sub.title}
                    <span className="text-chr-muted">· {nEvents(sub.eventCount)}</span>
                  </button>
                ))}
              </div>
            )}
            {viewMode === 'horizontal' && compareOptions.length > 0 && (
              <label className="flex items-center gap-1.5 text-chr-muted" data-testid="compare-select">
                {t('compare_with')}
                <select value={compareDir ?? ''} onChange={(e) => setCompareDir(e.target.value || null)}
                  className="px-1.5 py-0.5 rounded-sm bg-vault border border-chr-subtle text-chr-primary focus:outline-none focus:border-chr max-w-[16rem]">
                  <option value="">{t('compare_none')}</option>
                  {compareOptions.map((o) => <option key={o.dirPath} value={o.dirPath}>{o.title}</option>)}
                </select>
              </label>
            )}
            {viewMode !== 'list' && undatedEvents.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap text-amber-500" data-testid="undated-notice">
                <AlertTriangle size={11} strokeWidth={1.5} className="shrink-0" />
                <span>{t(undatedEvents.length === 1 ? 'undated_notice_one' : 'undated_notice_other', { count: undatedEvents.length })}</span>
                {undatedEvents.map((ev) => (
                  <button key={ev.filePath + ev.slug} type="button" onClick={() => handleEventClick(ev)}
                    className="underline underline-offset-2 decoration-dotted hover:text-chr-primary">
                    {ev.frontmatter.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">

          {viewMode === 'horizontal' && (
            <TimelineCanvas
              timeline={currentTimeline}
              selectedEvent={selectedEvent}
              onEventClick={handleEventClick}
              onEnterSubtimeline={handleEnterSubtimeline}
              onClusterClick={setClusterEvents}
              onContextMenu={(event, x, y) => setCanvasCtxMenu({ x, y, event })}
              filterPaths={fileFilter ?? undefined}
              compare={compareData}
            />
          )}

          {viewMode === 'list' && (
            <TimelineList
              timeline={currentTimeline}
              selectedEvent={selectedEvent}
              onEventClick={handleEventClick}
              onEnterSubtimeline={handleEnterSubtimeline}
              onDeleteEvent={handleDeleteEvent}
              onRenameEventFile={handleRenameEventFile}
              onFilterByFile={handleFilterByFile}
              filterPaths={fileFilter ?? undefined}
            />
          )}

          {viewMode === 'map' && (
            <MapView timeline={currentTimeline} onEventClick={handleEventClick} />
          )}

          {/* Painel lateral direito — abre ao clicar em cluster */}
          {clusterEvents && (() => {
            const visibleCluster = fileFilter
              ? clusterEvents.filter((e) => fileFilter.includes(e.filePath))
              : clusterEvents
            if (visibleCluster.length === 0) return null
            return (
              <ClusterPanel
                events={visibleCluster}
                onEventClick={handleEventClick}
                onContextMenu={(event, x, y) => setCanvasCtxMenu({ x, y, event })}
                onClose={() => setClusterEvents(null)}
              />
            )
          })()}

        </div>
      </div>

      {/* ── Modal: criar novo evento ─────────────────────────────────────── */}
      {showNewEvent && (
        <NewEventModal
          timelineDirPath={currentTimeline.dirPath}
          onConfirm={handleCreateEvent}
          onCancel={() => setShowNewEvent(false)}
          isLoading={creatingEvent}
        />
      )}

      {/* ── Context menu do canvas ────────────────────────────────────────── */}
      {canvasCtxMenu && (
        <CanvasContextMenu
          state={canvasCtxMenu}
          onRename={() => setCanvasRenaming(canvasCtxMenu.event)}
          onFilter={() => handleFilterByFile(canvasCtxMenu.event.filePath)}
          onDelete={() => setCanvasConfirmDelete(canvasCtxMenu.event)}
          onClose={() => setCanvasCtxMenu(null)}
        />
      )}

      {canvasConfirmDelete && (
        <CanvasConfirmDeleteModal
          event={canvasConfirmDelete}
          isLoading={canvasActionLoading}
          onConfirm={handleCanvasConfirmDelete}
          onCancel={() => setCanvasConfirmDelete(null)}
        />
      )}

      {canvasRenaming && (
        <CanvasRenameModal
          event={canvasRenaming}
          isLoading={canvasActionLoading}
          onConfirm={handleCanvasConfirmRename}
          onCancel={() => setCanvasRenaming(null)}
        />
      )}
    </div>
  )
}
