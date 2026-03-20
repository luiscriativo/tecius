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
import { ChevronDown, ChevronRight, Search, X, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useI18n } from '../../hooks/useI18n'
import type { TimelineData, ChroniclerEvent } from '../../types/chronicler'

// ── Tipos ──────────────────────────────────────────────────────────────────────

type GroupLevel = 'year' | 'decade' | 'century'
type GroupBy = 'auto' | 'year' | 'decade' | 'century' | 'category' | 'importance'

// ── Lógica de agrupamento ─────────────────────────────────────────────────────

function getGroupLevel(spanYears: number): GroupLevel {
  if (spanYears <= 100) return 'year'
  if (spanYears <= 1000) return 'decade'
  return 'century'
}

function getPeriodKey(year: number, level: GroupLevel): number {
  if (level === 'year') return year
  if (level === 'decade') return Math.floor(year / 10) * 10
  return Math.floor(year / 100) * 100
}

function getPeriodLabel(key: number, level: GroupLevel): string {
  if (level === 'year') return String(key)
  return `${key}s`
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
  onDelete: () => void
  onClose: () => void
}

function ContextMenu({ state, onRename, onDelete, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const { t } = useI18n()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const style: React.CSSProperties = { position: 'fixed', top: state.y, left: state.x, zIndex: 100 }

  return (
    <>
      <div className="fixed inset-0 z-[99]" onMouseDown={onClose} />
      <div
        ref={menuRef}
        style={style}
        className="z-[100] relative w-44 chr-card py-1 shadow-card-hover text-sm"
      >
        <button
          onClick={() => { onRename(); onClose() }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-left font-mono text-xs text-chr-secondary hover:bg-hover hover:text-chr-primary transition-colors"
        >
          <Pencil size={12} strokeWidth={1.5} className="shrink-0" />
          {t('rename_file')}
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
}: EventRowProps) {
  const highlighted = selectionMode ? isPicked : isSelected

  return (
    <div
      onClick={selectionMode ? onTogglePick : onClick}
      onContextMenu={selectionMode ? undefined : onContextMenu}
      className={cn(
        'group flex items-center gap-4 px-3 py-2.5 rounded-sm cursor-pointer',
        'border-l-2 transition-all duration-150',
        highlighted
          ? 'bg-active border-chr-strong'
          : 'border-transparent hover:bg-hover hover:border-chr-subtle'
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
          title="Entrar na sub-timeline"
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
}: CollapsibleGroupProps) {
  const [open, setOpen] = useState(defaultOpen)
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
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-2xs text-chr-muted">{year}</span>
                <div className="flex-1 h-px bg-chr-subtle opacity-50" />
              </div>
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
  filterPaths,
}: TimelineListProps) {
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('auto')
  const { t, nEvents, nResults } = useI18n()

  const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
    { value: 'auto',       label: t('group_auto') },
    { value: 'year',       label: t('group_year') },
    { value: 'decade',     label: t('group_decade') },
    { value: 'century',    label: t('group_century') },
    { value: 'category',   label: t('group_category') },
    { value: 'importance', label: t('group_importance') },
  ]

  const IMPORTANCE_LABEL: Record<number, string> = {
    5: t('importance_max'), 4: t('importance_high'), 3: t('importance_mid'), 2: t('importance_low'), 1: t('importance_min'),
  }

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

  if (baseEvents.length === 0 && timeline.events.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-mono text-xs text-chr-muted">{t('no_events')}</p>
      </div>
    )
  }

  const spanYears = timeline.dateRange.spanYears
  const effectiveGroupBy: GroupBy = groupBy === 'auto' ? getGroupLevel(spanYears) : groupBy
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
    for (const event of filtered) {
      const key = getPeriodKey(event.date.year, level)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(event)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([k, evs]) => [getPeriodLabel(k, level), evs])
  }, [filtered, effectiveGroupBy, t])

  const footerGroupLabel = (() => {
    if (groupBy === 'auto') {
      const autoLevel = getGroupLevel(spanYears)
      if (autoLevel === 'year') return null
      return autoLevel === 'decade' ? t('grouped_decades_auto') : t('grouped_centuries_auto')
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
            {nResults(filtered.length)} {t('grouped_by').includes('agrupado') ? 'de' : 'of'} {timeline.events.length}
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
      <div className="flex-1 overflow-y-auto px-8 py-2">

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
                defaultOpen={idx === 0}
              />
            ))}
          </>
        )}

        {/* Rodapé */}
        <div className="pt-4 border-t border-chr-subtle">
          <span className="font-mono text-2xs text-chr-muted">
            {filterPaths
              ? <>{nEvents(baseEvents.length)}<span className="opacity-60"> de {timeline.events.length}</span></>
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
