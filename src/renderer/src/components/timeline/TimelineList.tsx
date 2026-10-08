/**
 * TimelineList — Visão vertical com agrupamento adaptativo e virtualização nativa
 *
 * Otimizações para grandes volumes (milhares de eventos, séculos de span):
 *
 * 1. Agrupamento configurável pelo usuário:
 *    - Auto: detecta o melhor nível pelo span da timeline
 *      · span ≤ 100 anos  → por Ano   (flat, sem colapso)
 *      · span 101–1000    → por Década (colapsável)
 *      · span > 1000      → por Século (colapsável)
 *    - Manual: Ano · Década · Século · Categoria · Importância
 *
 * 2. content-visibility: auto (virtualização nativa do browser):
 *    Aplicado em cada grupo de ano. O browser pula rendering, layout e paint
 *    dos elementos fora do viewport — sem JavaScript extra.
 *
 * 3. useMemo em todas as derivações:
 *    filtered e groupedEntries só recalculam quando deps mudam.
 *
 * 4. Barra de busca:
 *    Filtra por título, categoria e ano antes de qualquer agrupamento.
 */

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { eventSpan } from '../../utils/mapTime'
import { ChevronDown, ChevronRight, Search, X, Pencil, Trash2, AlertTriangle, Filter } from 'lucide-react'
import { cn } from '../../utils/cn'
import { formatYear, undatedLabel } from '../../utils/chroniclerDate'
import { useI18n } from '../../hooks/useI18n'
import type { TimelineData, ChroniclerEvent } from '../../types/chronicler'
import { usePref } from '../../hooks/usePref'
import { oneOf } from '../../utils/prefs'

// ── Tipos ──────────────────────────────────────────────────────────────────────

type GroupLevel = 'year' | 'decade' | 'century' | 'millennium' | 'myr'
type GroupBy = 'auto' | 'year' | 'decade' | 'century' | 'category' | 'importance'

// ── Lógica de agrupamento ─────────────────────────────────────────────────────

// Largura (em anos) de cada nível
const LEVEL_WIDTH: Record<GroupLevel, number> = { year: 1, decade: 10, century: 100, millennium: 1000, myr: 1_000_000 }

/** Com poucos eventos, todos os grupos já abrem expandidos (nada fica escondido) */
const OPEN_ALL_GROUPS_UP_TO = 60

function getGroupLevel(spanYears: number): GroupLevel {
  if (spanYears <= 100) return 'year'
  if (spanYears <= 1000) return 'decade'
  if (spanYears <= 20_000) return 'century'
  if (spanYears <= 2_000_000) return 'millennium'
  return 'myr'   // tempo profundo: agrupa por milhão de anos
}

function getPeriodKey(year: number, level: GroupLevel): number {
  const w = LEVEL_WIDTH[level]
  return Math.floor(year / w) * w
}

function getPeriodLabel(key: number, level: GroupLevel): string {
  if (level === 'year') return formatYear(key)
  if (level === 'myr') return key >= 0 ? '< 1 Ma' : formatYear(key)
  if (key >= 0) return `${key}s`
  // Antes de Cristo: mostra o intervalo ("500 a.C. – 401 a.C.")
  return `${formatYear(key)} – ${formatYear(key + LEVEL_WIDTH[level] - 1)}`
}

// ── ContextMenu ───────────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number
  y: number
  event: ChroniclerEvent
}

interface ContextMenuProps {
  state: ContextMenuState
  onRename: () => void
  onFilter: () => void
  onDelete: () => void
  onClose: () => void
}

function ContextMenu({ state, onRename, onFilter, onDelete, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const { t } = useI18n()
  const [pos, setPos] = useState({ x: state.x, y: state.y })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
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
        className="z-[100] relative w-48 chr-card py-1 shadow-card-hover text-sm"
      >
        <button
          onClick={() => { onRename(); onClose() }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-mono text-xs text-chr-secondary hover:bg-hover hover:text-chr-primary transition-colors"
        >
          <Pencil size={12} strokeWidth={1.5} className="shrink-0" />
          {t('rename_file')}
        </button>
        <button
          onClick={() => { onFilter(); onClose() }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-mono text-xs text-chr-secondary hover:bg-hover hover:text-chr-primary transition-colors"
        >
          <Filter size={12} strokeWidth={1.5} className="shrink-0" />
          {t('filter_by_file')}
        </button>
        <div className="h-px bg-chr-subtle mx-2 my-1" />
        <button
          onClick={() => { onDelete(); onClose() }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-mono text-xs text-red-500/80 hover:bg-red-500/5 hover:text-red-500 transition-colors"
        >
          <Trash2 size={12} strokeWidth={1.5} className="shrink-0" />
          {t('send_to_trash')}
        </button>
      </div>
    </>
  )
}

// ── ConfirmDeleteModal ────────────────────────────────────────────────────────

interface ConfirmDeleteModalProps {
  event: ChroniclerEvent
  isLoading: boolean
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDeleteModal({ event, isLoading, onConfirm, onCancel }: ConfirmDeleteModalProps) {
  const { t } = useI18n()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
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
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-3 py-1.5 font-mono text-xs rounded-sm border border-chr-subtle text-chr-muted hover:text-chr-secondary hover:border-chr transition-colors disabled:opacity-40"
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-3 py-1.5 font-mono text-xs rounded-sm bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-40"
          >
            {isLoading ? t('please_wait') : t('send_to_trash')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── RenameModal ───────────────────────────────────────────────────────────────

interface RenameModalProps {
  event: ChroniclerEvent
  isLoading: boolean
  onConfirm: (newFilename: string) => void
  onCancel: () => void
}

function RenameModal({ event, isLoading, onConfirm, onCancel }: RenameModalProps) {
  const currentSlug = event.filePath.replace(/\\/g, '/').split('/').pop()?.replace(/\.md$/i, '') ?? event.slug
  const [value, setValue] = useState(currentSlug)
  const inputRef = useRef<HTMLInputElement>(null)
  const { t } = useI18n()

  useEffect(() => {
    inputRef.current?.select()
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.trim() || value.trim() === currentSlug) { onCancel(); return }
    onConfirm(value.trim())
  }

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
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block font-mono text-2xs text-chr-muted mb-1">{t('md_filename')}</label>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className={cn(
                  'flex-1 px-3 py-2 rounded-sm text-sm font-mono',
                  'bg-vault border border-chr-subtle text-chr-primary',
                  'focus:outline-none focus:border-chr transition-colors'
                )}
              />
              <span className="font-mono text-xs text-chr-muted shrink-0">.md</span>
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
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
              disabled={isLoading || !value.trim()}
              className="px-3 py-1.5 font-mono text-xs rounded-sm bg-chr-primary text-surface hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {isLoading ? t('renaming') : t('rename')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── EventRow ──────────────────────────────────────────────────────────────────

interface EventRowProps {
  event: ChroniclerEvent
  isSelected: boolean
  onClick: () => void
  onSubtimeline: () => void
  onContextMenu: (e: React.MouseEvent) => void
  /** Quando ativo, a linha mostra checkbox e clique alterna seleção */
  selectionMode?: boolean
  isPicked?: boolean
  onTogglePick?: () => void
  /** Destaque temporário (evento do momento em que o mapa estava) */
  flash?: boolean
}

function EventRow({
  event,
  isSelected,
  onClick,
  onSubtimeline,
  onContextMenu,
  selectionMode,
  isPicked,
  onTogglePick,
  flash,
}: EventRowProps) {
  const { t } = useI18n()
  const highlighted = selectionMode ? isPicked : isSelected

  return (
    <div
      data-event-slug={event.slug}
      onClick={selectionMode ? onTogglePick : onClick}
      onContextMenu={selectionMode ? undefined : onContextMenu}
      className={cn(
        'group flex items-center gap-4 px-3 py-2.5 rounded-sm cursor-pointer',
        'border-l-2 transition-all duration-150',
        highlighted
          ? 'bg-active border-chr-strong'
          : 'border-transparent hover:bg-hover hover:border-chr-subtle',
        flash && 'bg-active border-timeline-chronicle-text'
      )}
    >
      {/* Checkbox — visível só no modo seleção */}
      {selectionMode && (
        <input
          type="checkbox"
          checked={isPicked ?? false}
          onChange={() => {}}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 accent-[var(--color-chr)] pointer-events-none"
        />
      )}

      <span className="chr-date w-20 shrink-0 text-right">{event.date.displayShort}</span>
      <div
        className={cn(
          'w-1.5 h-1.5 rounded-full shrink-0 bg-timeline-dot transition-opacity',
          highlighted ? 'opacity-100' : 'opacity-40 group-hover:opacity-70'
        )}
      />
      <span
        className={cn(
          'flex-1 text-sm leading-snug truncate transition-colors',
          highlighted
            ? 'text-chr-primary font-medium'
            : 'text-chr-secondary group-hover:text-chr-primary'
        )}
      >
        {event.frontmatter.title}
      </span>
      <div className="hidden md:flex items-center gap-1.5 shrink-0">
        {event.frontmatter.category && (
          <span className="chr-badge">{event.frontmatter.category}</span>
        )}
        {event.frontmatter.tags?.slice(0, 2).map((tag) => (
          <span key={tag} className="chr-tag">#{tag}</span>
        ))}
      </div>
      {event.hasSubtimeline && !selectionMode && (
        <button
          onClick={(e) => { e.stopPropagation(); onSubtimeline() }}
          className={cn(
            'shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm',
            'font-mono text-2xs text-chr-muted border border-chr-subtle',
            'hover:border-chr-strong hover:text-chr-secondary transition-colors'
          )}
          title={t('enter_subtimeline')}
        >
          <ChevronRight size={10} strokeWidth={2} />
        </button>
      )}
    </div>
  )
}

// ── CollapsibleGroup ──────────────────────────────────────────────────────────

interface CollapsibleGroupProps {
  label: string
  events: ChroniclerEvent[]
  selectedEvent: ChroniclerEvent | null
  onEventClick: (event: ChroniclerEvent) => void
  onEnterSubtimeline: (event: ChroniclerEvent) => void
  onEventContextMenu: (e: React.MouseEvent, event: ChroniclerEvent) => void
  defaultOpen: boolean
  selectionMode?: boolean
  pickedFiles?: Set<string>
  onTogglePick?: (filePath: string) => void
  flashSlug?: string | null
  /** Abre o grupo (quando ganha o evento em foco depois de montado) */
  forceOpen?: boolean
}

function CollapsibleGroup({
  label,
  events,
  selectedEvent,
  onEventClick,
  onEnterSubtimeline,
  onEventContextMenu,
  defaultOpen,
  selectionMode,
  pickedFiles,
  onTogglePick,
  flashSlug,
  forceOpen,
}: CollapsibleGroupProps) {
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => { if (forceOpen) setOpen(true) }, [forceOpen])
  const { nEvents } = useI18n()

  const byYear = useMemo(() => {
    const map = new Map<number, ChroniclerEvent[]>()
    for (const event of events) {
      const y = event.date.year
      if (!map.has(y)) map.set(y, [])
      map.get(y)!.push(event)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b)
  }, [events])

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-sm text-left hover:bg-hover transition-colors"
      >
        <span className="text-chr-muted shrink-0">
          {open
            ? <ChevronDown size={12} strokeWidth={2} />
            : <ChevronRight size={12} strokeWidth={2} />}
        </span>
        <span className="font-mono text-xs font-medium text-chr-muted tracking-wider uppercase flex-1">
          {label}
        </span>
        <span className="font-mono text-2xs text-chr-muted shrink-0">
          {nEvents(events.length)}
        </span>
      </button>
      <div className="h-px bg-chr-subtle mx-2 mb-1" />

      {open && (
        <div className="ml-4 mb-6">
          {byYear.map(([year, yearEvents]) => (
            <div
              key={year}
              className="mb-4"
              style={{ contentVisibility: 'auto', containIntrinsicSize: '0 auto 180px' } as React.CSSProperties}
            >
              {/* Eventos sem data não têm ano (senão apareceria "0") */}
              {!yearEvents[0]?.undated && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-2xs text-chr-muted">{formatYear(year)}</span>
                  <div className="flex-1 h-px bg-chr-subtle opacity-50" />
                </div>
              )}
              <div className="space-y-px ml-2">
                {yearEvents.map((event) => (
                  <EventRow
                    key={event.slug}
                    event={event}
                    isSelected={selectedEvent?.slug === event.slug}
                    onClick={() => onEventClick(event)}
                    onSubtimeline={() => onEnterSubtimeline(event)}
                    onContextMenu={(e) => onEventContextMenu(e, event)}
                    selectionMode={selectionMode}
                    isPicked={selectionMode ? pickedFiles?.has(event.filePath) : undefined}
                    onTogglePick={onTogglePick ? () => onTogglePick(event.filePath) : undefined}
                    flash={flashSlug === event.slug}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── TimelineList ───────────────────────────────────────────────────────────────

interface TimelineListProps {
  timeline: TimelineData
  selectedEvent: ChroniclerEvent | null
  onEventClick: (event: ChroniclerEvent) => void
  onEnterSubtimeline: (event: ChroniclerEvent) => void
  onDeleteEvent?: (event: ChroniclerEvent) => Promise<void>
  onRenameEventFile?: (event: ChroniclerEvent, newFilename: string) => Promise<void>
  onFilterByFile?: (filePath: string) => void
  /** Quando definido, exibe apenas os eventos cujos filePaths estão na lista */
  filterPaths?: string[]
}

export function TimelineList({
  timeline,
  selectedEvent,
  onEventClick,
  onEnterSubtimeline,
  onDeleteEvent,
  onRenameEventFile,
  onFilterByFile,
  filterPaths,
}: TimelineListProps) {
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = usePref<GroupBy>('list.groupBy', 'auto', oneOf(['auto', 'year', 'decade', 'century', 'category', 'importance']))
  const { t, nEvents } = useI18n()

  const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
    { value: 'auto',       label: t('group_auto') },
    { value: 'year',       label: t('group_year') },
    { value: 'decade',     label: t('group_decade') },
    { value: 'century',    label: t('group_century') },
    { value: 'category',   label: t('group_category') },
    { value: 'importance', label: t('group_importance') },
  ]

  // Vindo do modo Mapa: o primeiro evento do momento em que a régua estava
  // (ou o mais próximo dele) — abre o grupo dele, rola até ele e destaca.
  // Lido num efeito: o mapa só grava o momento ao desmontar, depois desta renderização.
  const [focusSlug, setFocusSlug] = useState<string | null>(null)
  const [flashSlug, setFlashSlug] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const { timelineFocus: focus, setTimelineFocus } = useTimelineStore.getState()
    if (!focus || focus.dirPath !== timeline.dirPath || timeline.events.length === 0) return
    setTimelineFocus(null)
    const spans = timeline.events.map((e) => ({ e, span: eventSpan(e) }))
    const inWindow = spans.filter(({ span }) => span[0] < focus.end && span[1] > focus.start)
      .sort((a, b) => a.span[0] - b.span[0])
    const target = inWindow[0]
      ?? spans.reduce((a, b) => (Math.abs(b.span[0] - focus.start) < Math.abs(a.span[0] - focus.start) ? b : a))
    setFocusSlug(target.e.slug)
    setFlashSlug(target.e.slug)
  }, [timeline])
  useEffect(() => {
    if (!focusSlug) return
    // Dois quadros: o grupo do evento abre e só então a linha existe para rolar até ela
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        listRef.current?.querySelector(`[data-event-slug="${CSS.escape(focusSlug)}"]`)?.scrollIntoView({ block: 'center' })
      })
    })
    const timer = setTimeout(() => setFlashSlug(null), 1800)
    return () => { cancelAnimationFrame(raf); clearTimeout(timer) }
  }, [focusSlug])

  const IMPORTANCE_LABEL = useMemo<Record<number, string>>(() => ({
    5: t('importance_max'), 4: t('importance_high'), 3: t('importance_mid'), 2: t('importance_low'), 1: t('importance_min'),
  }), [t])

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ChroniclerEvent | null>(null)
  const [renaming, setRenaming] = useState<ChroniclerEvent | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const handleContextMenu = useCallback((e: React.MouseEvent, event: ChroniclerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, event })
  }, [])

  const handleConfirmDelete = async () => {
    if (!confirmDelete || !onDeleteEvent) return
    setActionLoading(true)
    try {
      await onDeleteEvent(confirmDelete)
      setConfirmDelete(null)
    } finally {
      setActionLoading(false)
    }
  }

  const handleConfirmRename = async (newFilename: string) => {
    if (!renaming || !onRenameEventFile) return
    setActionLoading(true)
    try {
      await onRenameEventFile(renaming, newFilename)
      setRenaming(null)
    } finally {
      setActionLoading(false)
    }
  }

  // Aplica o filtro de arquivos selecionados (quando vem do modo FilesView)
  const baseEvents = useMemo(
    () =>
      filterPaths
        ? timeline.events.filter((e) => filterPaths.includes(e.filePath))
        : timeline.events,
    [timeline.events, filterPaths]
  )

  const spanYears = timeline.dateRange.spanYears
  const effectiveGroupBy: GroupBy | GroupLevel = groupBy === 'auto' ? getGroupLevel(spanYears) : groupBy
  const useFlat = effectiveGroupBy === 'year'

  const filtered = useMemo(() => {
    if (!search.trim()) return baseEvents
    const q = search.trim().toLowerCase()
    return baseEvents.filter((e) => {
      const title = String(e.frontmatter.title ?? '').toLowerCase()
      const category = String(e.frontmatter.category ?? '').toLowerCase()
      const year = String(e.date.year)
      return title.includes(q) || category.includes(q) || year.includes(q)
    })
  }, [baseEvents, search])

  const groupedEntries = useMemo((): [string, ChroniclerEvent[]][] => {
    const noCategoryLabel = t('no_category')

    if (effectiveGroupBy === 'category') {
      const map = new Map<string, ChroniclerEvent[]>()
      for (const event of filtered) {
        const key = event.frontmatter.category ?? noCategoryLabel
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(event)
      }
      return Array.from(map.entries()).sort(([a], [b]) => {
        if (a === noCategoryLabel) return 1
        if (b === noCategoryLabel) return -1
        return a.localeCompare(b, 'pt')
      })
    }

    if (effectiveGroupBy === 'importance') {
      const map = new Map<number, ChroniclerEvent[]>()
      for (const event of filtered) {
        const key = event.frontmatter.importance ?? 3
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(event)
      }
      return Array.from(map.entries())
        .sort(([a], [b]) => b - a)
        .map(([k, evs]) => [IMPORTANCE_LABEL[k] ?? `${t('grouped_importance_label')} ${k}`, evs])
    }

    const level = effectiveGroupBy as GroupLevel
    const map = new Map<number, ChroniclerEvent[]>()
    const undated: ChroniclerEvent[] = []
    for (const event of filtered) {
      if (event.undated) { undated.push(event); continue }
      const key = getPeriodKey(event.date.year, level)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(event)
    }
    const groups = Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([k, evs]): [string, ChroniclerEvent[]] => [getPeriodLabel(k, level), evs])
    // Sem data: grupo próprio no fim (antes caíam no "ano 0")
    return undated.length ? [...groups, [undatedLabel(), undated]] : groups
  }, [filtered, effectiveGroupBy, t, IMPORTANCE_LABEL])

  // Early return só depois de todos os hooks (regras dos hooks) — ver TimelineCanvas
  if (baseEvents.length === 0 && timeline.events.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-mono text-xs text-chr-muted">{t('no_events')}</p>
      </div>
    )
  }

  const focusGroupIdx = focusSlug ? groupedEntries.findIndex(([, evs]) => evs.some((e) => e.slug === focusSlug)) : -1

  const footerGroupLabel = (() => {
    if (groupBy === 'auto') {
      const autoLevel = getGroupLevel(spanYears)
      if (autoLevel === 'year') return null
      if (autoLevel === 'decade') return t('grouped_decades_auto')
      if (autoLevel === 'millennium') return t('grouped_millennia_auto')
      if (autoLevel === 'myr') return t('grouped_myr_auto')
      return t('grouped_centuries_auto')
    }
    const labels: Partial<Record<GroupBy, string>> = {
      decade: t('grouped_decades'),
      century: t('grouped_centuries'),
      category: t('grouped_categories'),
      importance: t('grouped_importance_label'),
    }
    return labels[groupBy] ?? null
  })()

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── Barra de busca ──────────────────────────────────────────────── */}
      <div className="shrink-0 px-8 pt-4 pb-2">
        <div className="relative max-w-sm">
          <Search
            size={12}
            strokeWidth={1.5}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-chr-muted pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search_event_ph')}
            className={cn(
              'w-full pl-7 pr-7 py-1.5 rounded-sm',
              'bg-vault border border-chr-subtle',
              'font-mono text-xs text-chr-primary placeholder:text-chr-muted',
              'focus:outline-none focus:border-chr transition-colors'
            )}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-chr-muted hover:text-chr-secondary"
            >
              <X size={11} strokeWidth={2} />
            </button>
          )}
        </div>
        {search && (
          <p className="font-mono text-2xs text-chr-muted mt-1">
            {t('results_of', { count: filtered.length, s: filtered.length === 1 ? '' : 's', total: timeline.events.length })}
          </p>
        )}
      </div>

      {/* ── Seletor de agrupamento ───────────────────────────────────────── */}
      <div className="shrink-0 px-8 pb-3 flex items-center gap-2.5">
        <span className="font-mono text-2xs text-chr-muted select-none">{t('groupby')}</span>
        <div className="flex items-center gap-1 flex-wrap">
          {GROUP_BY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setGroupBy(opt.value)}
              className={cn(
                'px-2 py-0.5 rounded-sm font-mono text-2xs transition-colors',
                groupBy === opt.value
                  ? 'bg-active text-chr-primary border border-chr-strong'
                  : 'text-chr-muted border border-chr-subtle hover:text-chr-secondary hover:border-chr-strong'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Lista principal ──────────────────────────────────────────────── */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-8 py-2">

        {filtered.length === 0 ? (
          <p className="font-mono text-xs text-chr-muted text-center py-8">
            {t('no_events_found')}
          </p>

        ) : useFlat ? (
          <>
            {groupedEntries.map(([label, events]) => (
              <div
                key={label}
                className="mb-8"
                style={{
                  contentVisibility: 'auto',
                  containIntrinsicSize: `0 auto ${28 + events.length * 44}px`,
                } as React.CSSProperties}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="font-mono text-xs font-medium text-chr-muted tracking-wider uppercase">
                    {label}
                  </span>
                  <div className="flex-1 h-px bg-chr-subtle" />
                </div>
                <div className="space-y-px ml-2">
                  {events.map((event) => (
                    <EventRow
                      key={event.slug}
                      event={event}
                      isSelected={selectedEvent?.slug === event.slug}
                      onClick={() => onEventClick(event)}
                      onSubtimeline={() => onEnterSubtimeline(event)}
                      onContextMenu={(e) => handleContextMenu(e, event)}
                      flash={flashSlug === event.slug}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>

        ) : (
          <>
            {groupedEntries.map(([label, events], idx) => (
              <CollapsibleGroup
                key={label}
                label={label}
                events={events}
                selectedEvent={selectedEvent}
                onEventClick={onEventClick}
                onEnterSubtimeline={onEnterSubtimeline}
                onEventContextMenu={handleContextMenu}
                defaultOpen={idx === 0 || filtered.length <= OPEN_ALL_GROUPS_UP_TO}
                forceOpen={idx === focusGroupIdx}
                flashSlug={flashSlug}
              />
            ))}
          </>
        )}

        {/* Rodapé */}
        <div className="pt-4 border-t border-chr-subtle">
          <span className="font-mono text-2xs text-chr-muted">
            {filterPaths
              ? <>{nEvents(baseEvents.length)}<span className="opacity-60"> {t('of_total', { total: timeline.events.length })}</span></>
              : nEvents(timeline.events.length)
            }
            {footerGroupLabel && (
              <span className="opacity-60">
                {' · '}{t('grouped_by')} {footerGroupLabel}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* ── Context Menu ─────────────────────────────────────────────────── */}
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onRename={() => setRenaming(contextMenu.event)}
          onFilter={() => onFilterByFile?.(contextMenu.event.filePath)}
          onDelete={() => setConfirmDelete(contextMenu.event)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* ── Modal: confirmar exclusão ────────────────────────────────────── */}
      {confirmDelete && (
        <ConfirmDeleteModal
          event={confirmDelete}
          isLoading={actionLoading}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* ── Modal: renomear arquivo ──────────────────────────────────────── */}
      {renaming && (
        <RenameModal
          event={renaming}
          isLoading={actionLoading}
          onConfirm={handleConfirmRename}
          onCancel={() => setRenaming(null)}
        />
      )}
    </div>
  )
}
