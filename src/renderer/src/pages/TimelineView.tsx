import { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, X, Filter, Search, ChevronDown, ChevronRight, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { BreadcrumbBar, TimelineCanvas, TimelineList, ViewToggle } from '../components/timeline'
import { useTimeline } from '../hooks/useTimeline'
import { useVault } from '../hooks/useVault'
import { useNavigationStore } from '../stores/useNavigationStore'
import { useI18n } from '../hooks/useI18n'
import { cn } from '../utils/cn'
import { DateInput } from '../components/DateInput'
import type { ChroniclerEvent, TimelineData } from '../types/chronicler'

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
    .replace(/-+/g, '-') || 'novo-evento'

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
              <p className="mt-1 font-mono text-2xs text-chr-muted opacity-60">
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
  const allChronicle = events.every((e) => !!e.chronicle)
  const hasChronicle  = events.some((e) => !!e.chronicle)

  // Calcula o range de datas do cluster
  const sorted = [...events].sort((a, b) => a.date.sortKey - b.date.sortKey)
  const firstDate = sorted[0]?.date.display ?? ''
  const lastDate  = sorted[sorted.length - 1]?.date.display ?? ''
  const sameDate  = firstDate === lastDate
  const dateLabel = sameDate ? firstDate : `${firstDate} – ${lastDate}`
  const dateHint  = sameDate ? 'nesta data' : 'neste período'

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
            {events.length} evento{events.length !== 1 ? 's' : ''} {dateHint}
          </p>
          {hasChronicle && !allChronicle && (
            <p className="font-mono text-2xs text-chr-muted mt-1 opacity-50">◆ chronicle · ● evento</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 text-chr-muted hover:text-chr-primary transition-colors mt-0.5"
          aria-label="Fechar"
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
            {e.chronicle ? (
              <div className="w-2 h-2 border border-timeline-chronicle rotate-45 shrink-0 mt-1 opacity-80" />
            ) : (
              <div className="w-1.5 h-1.5 rounded-full bg-timeline-dot shrink-0 mt-1.5 opacity-60" />
            )}
            <div className="flex-1 min-w-0">
              <span className="text-sm text-chr-secondary block leading-snug truncate">
                {e.frontmatter.title}
              </span>
              {e.chronicle && (
                <span className="font-mono text-2xs text-timeline-chronicle opacity-70 block truncate mt-0.5">
                  {e.chronicle.title}
                </span>
              )}
              {e.frontmatter.category && (
                <span className="font-mono text-2xs text-chr-muted opacity-60 block truncate mt-0.5">
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

// ── FilesView helpers ──────────────────────────────────────────────────────────

type FilesGroupBy    = 'auto' | 'year' | 'decade' | 'century' | 'category' | 'importance'
type FilesGroupLevel = 'year' | 'decade' | 'century'
type FileEntry       = { rep: ChroniclerEvent; count: number; slug: string }

function fGroupLevel(span: number): FilesGroupLevel {
  if (span <= 100) return 'year'
  if (span <= 1000) return 'decade'
  return 'century'
}
function fPeriodKey(year: number, level: FilesGroupLevel): number {
  if (level === 'decade')  return Math.floor(year / 10) * 10
  if (level === 'century') return Math.floor(year / 100) * 100
  return year
}
function fPeriodLabel(key: number, level: FilesGroupLevel): string {
  return level === 'year' ? String(key) : `${key}s`
}

// ── FileItemRow ────────────────────────────────────────────────────────────────

interface FileItemRowProps {
  entry: FileEntry
  isChecked: boolean
  onToggle: (filePath: string) => void
}
function FileItemRow({ entry: { rep: event, count: sectionCount, slug }, isChecked, onToggle }: FileItemRowProps) {
  return (
    <label
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-sm cursor-pointer',
        'border-l-2 transition-all duration-150',
        isChecked ? 'bg-active border-chr-strong' : 'border-transparent hover:bg-hover hover:border-chr-subtle'
      )}
    >
      <input type="checkbox" checked={isChecked} onChange={() => onToggle(event.filePath)} className="shrink-0 accent-[var(--color-chr)]" />
      <span className="chr-date w-20 shrink-0 text-right">{event.date.displayShort}</span>
      <div className={cn('w-1.5 h-1.5 rounded-full shrink-0 bg-timeline-dot transition-opacity', isChecked ? 'opacity-100' : 'opacity-40')} />
      <span className={cn('flex-1 text-sm leading-snug truncate transition-colors', isChecked ? 'text-chr-primary font-medium' : 'text-chr-secondary')}>
        {event.frontmatter.title}
      </span>
      {sectionCount > 1 && <span className="font-mono text-2xs text-chr-muted shrink-0">{sectionCount} seções</span>}
      <span className="font-mono text-2xs text-chr-muted shrink-0 hidden md:block">{slug}.md</span>
      {event.frontmatter.category && <span className="chr-badge hidden md:block">{event.frontmatter.category}</span>}
    </label>
  )
}

// ── FilesCollapsibleGroup ──────────────────────────────────────────────────────

interface FilesCollapsibleGroupProps {
  label: string
  entries: FileEntry[]
  pickedFiles: Set<string>
  onToggle: (filePath: string) => void
  defaultOpen: boolean
}
function FilesCollapsibleGroup({ label, entries, pickedFiles, onToggle, defaultOpen }: FilesCollapsibleGroupProps) {
  const [open, setOpen] = useState(defaultOpen)
  const { nEvents } = useI18n()

  const byYear = useMemo(() => {
    const map = new Map<number, FileEntry[]>()
    for (const entry of entries) {
      const y = entry.rep.date.year
      if (!map.has(y)) map.set(y, [])
      map.get(y)!.push(entry)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b)
  }, [entries])

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-sm text-left hover:bg-hover transition-colors"
      >
        <span className="text-chr-muted shrink-0">
          {open ? <ChevronDown size={12} strokeWidth={2} /> : <ChevronRight size={12} strokeWidth={2} />}
        </span>
        <span className="font-mono text-xs font-medium text-chr-muted tracking-wider uppercase flex-1">{label}</span>
        <span className="font-mono text-2xs text-chr-muted shrink-0">{nEvents(entries.length)}</span>
      </button>
      <div className="h-px bg-chr-subtle mx-2 mb-1" />
      {open && (
        <div className="ml-4 mb-6">
          {byYear.map(([year, yearEntries]) => (
            <div
              key={year}
              className="mb-4"
              style={{ contentVisibility: 'auto', containIntrinsicSize: `0 auto ${28 + yearEntries.length * 44}px` } as React.CSSProperties}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-2xs text-chr-muted">{year}</span>
                <div className="flex-1 h-px bg-chr-subtle opacity-50" />
              </div>
              <div className="space-y-px ml-2">
                {yearEntries.map(entry => (
                  <FileItemRow key={entry.rep.filePath} entry={entry} isChecked={pickedFiles.has(entry.rep.filePath)} onToggle={onToggle} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── FilesView ──────────────────────────────────────────────────────────────────

interface FilesViewProps {
  timeline: TimelineData
  pickedFiles: Set<string>
  onToggle: (filePath: string) => void
  onApply: () => void
  onSelectAll: () => void
  onClearAll: () => void
}

function FilesView({ timeline, pickedFiles, onToggle, onApply, onSelectAll, onClearAll }: FilesViewProps) {
  const { t } = useI18n()
  const [search,  setSearch]  = useState('')
  const [groupBy, setGroupBy] = useState<FilesGroupBy>('auto')

  const FILE_GROUP_OPTIONS: { value: FilesGroupBy; label: string }[] = [
    { value: 'auto',       label: t('group_auto')      },
    { value: 'year',       label: t('group_year')      },
    { value: 'decade',     label: t('group_decade')    },
    { value: 'century',    label: t('group_century')   },
    { value: 'category',   label: t('group_category')  },
    { value: 'importance', label: t('group_importance')},
  ]

  const IMPORTANCE_LABEL: Record<number, string> = {
    5: t('importance_max'), 4: t('importance_high'), 3: t('importance_mid'),
    2: t('importance_low'), 1: t('importance_min'),
  }

  // Dedup por filePath e pré-calcula slug — O(N) uma vez
  const uniqueFiles = useMemo(() => {
    const seen = new Map<string, FileEntry>()
    for (const ev of timeline.events) {
      const slug = ev.filePath.replace(/\\/g, '/').split('/').pop()?.replace(/\.md$/i, '') ?? ev.slug
      if (!seen.has(ev.filePath)) seen.set(ev.filePath, { rep: ev, count: 1, slug })
      else seen.get(ev.filePath)!.count++
    }
    return Array.from(seen.values())
  }, [timeline.events])

  // Filtro de busca (título · slug · categoria)
  const filteredFiles = useMemo(() => {
    if (!search.trim()) return uniqueFiles
    const q = search.trim().toLowerCase()
    return uniqueFiles.filter(({ rep: ev, slug }) =>
      String(ev.frontmatter.title    ?? '').toLowerCase().includes(q) ||
      slug.toLowerCase().includes(q) ||
      String(ev.frontmatter.category ?? '').toLowerCase().includes(q)
    )
  }, [uniqueFiles, search])

  // Agrupamento (mesma lógica do TimelineList mas sobre FileEntry)
  const spanYears       = timeline.dateRange.spanYears
  const effectiveGroupBy = groupBy === 'auto' ? fGroupLevel(spanYears) : groupBy
  const useFlat          = effectiveGroupBy === 'year'

  const groupedEntries = useMemo((): [string, FileEntry[]][] => {
    const noCat = t('no_category')

    if (effectiveGroupBy === 'category') {
      const map = new Map<string, FileEntry[]>()
      for (const e of filteredFiles) {
        const k = e.rep.frontmatter.category ?? noCat
        if (!map.has(k)) map.set(k, [])
        map.get(k)!.push(e)
      }
      return Array.from(map.entries()).sort(([a], [b]) => {
        if (a === noCat) return 1; if (b === noCat) return -1
        return a.localeCompare(b, 'pt')
      })
    }

    if (effectiveGroupBy === 'importance') {
      const map = new Map<number, FileEntry[]>()
      for (const e of filteredFiles) {
        const k = e.rep.frontmatter.importance ?? 3
        if (!map.has(k)) map.set(k, [])
        map.get(k)!.push(e)
      }
      return Array.from(map.entries())
        .sort(([a], [b]) => b - a)
        .map(([k, es]) => [IMPORTANCE_LABEL[k] ?? `${t('grouped_importance_label')} ${k}`, es])
    }

    const level = effectiveGroupBy as FilesGroupLevel
    const map = new Map<number, FileEntry[]>()
    for (const e of filteredFiles) {
      const k = fPeriodKey(e.rep.date.year, level)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(e)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([k, es]) => [fPeriodLabel(k, level), es])
  }, [filteredFiles, effectiveGroupBy, t])

  const footerGroupLabel = (() => {
    if (groupBy === 'auto') {
      const l = fGroupLevel(spanYears)
      if (l === 'year') return null
      return l === 'decade' ? t('grouped_decades_auto') : t('grouped_centuries_auto')
    }
    const labels: Partial<Record<FilesGroupBy, string>> = {
      decade: t('grouped_decades'), century: t('grouped_centuries'),
      category: t('grouped_categories'), importance: t('grouped_importance_label'),
    }
    return labels[groupBy] ?? null
  })()

  const count = pickedFiles.size
  const selectedLabel = count === 0
    ? t('files_view_hint')
    : t('files_selected_count').replace('{count}', String(count)).replace('{s}', count === 1 ? '' : 's')

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <div className="shrink-0 px-8 pt-4 pb-3 flex items-center justify-between gap-4 border-b border-chr-subtle">
        <span className="font-mono text-xs text-chr-muted">{selectedLabel}</span>
        <div className="flex items-center gap-2">
          <button onClick={onSelectAll} className="font-mono text-2xs text-chr-muted hover:text-chr-secondary transition-colors">
            {t('files_select_all')}
          </button>
          {count > 0 && (
            <button onClick={onClearAll} className="font-mono text-2xs text-chr-muted hover:text-chr-secondary transition-colors">
              {t('files_clear_sel')}
            </button>
          )}
          <button
            onClick={onApply}
            disabled={count === 0}
            className={cn(
              'px-2.5 py-1.5 rounded-sm font-mono text-xs transition-colors',
              count > 0 ? 'bg-chr-primary text-surface hover:opacity-90' : 'border border-chr-subtle text-chr-muted opacity-40 cursor-not-allowed'
            )}
          >
            {t('files_view_sel')}
          </button>
        </div>
      </div>

      {/* ── Busca ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-8 pt-3 pb-1">
        <div className="relative max-w-sm">
          <Search size={12} strokeWidth={1.5} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-chr-muted pointer-events-none" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search_event_ph')}
            className={cn(
              'w-full pl-7 pr-7 py-1.5 rounded-sm bg-vault border border-chr-subtle',
              'font-mono text-xs text-chr-primary placeholder:text-chr-muted',
              'focus:outline-none focus:border-chr transition-colors'
            )}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-chr-muted hover:text-chr-secondary">
              <X size={11} strokeWidth={2} />
            </button>
          )}
        </div>
        {search && <p className="font-mono text-2xs text-chr-muted mt-1">{filteredFiles.length} de {uniqueFiles.length}</p>}
      </div>

      {/* ── Agrupamento ───────────────────────────────────────────────── */}
      <div className="shrink-0 px-8 py-2 flex items-center gap-2.5">
        <span className="font-mono text-2xs text-chr-muted select-none">{t('groupby')}</span>
        <div className="flex items-center gap-1 flex-wrap">
          {FILE_GROUP_OPTIONS.map(opt => (
            <button
              key={opt.value} onClick={() => setGroupBy(opt.value)}
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

      {/* ── Lista de arquivos ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-8 py-2">

        {filteredFiles.length === 0 ? (
          <p className="font-mono text-xs text-chr-muted text-center py-8">{t('no_events_found')}</p>

        ) : useFlat ? (
          <>
            {groupedEntries.map(([label, entries]) => (
              <div
                key={label} className="mb-8"
                style={{ contentVisibility: 'auto', containIntrinsicSize: `0 auto ${28 + entries.length * 44}px` } as React.CSSProperties}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="font-mono text-xs font-medium text-chr-muted tracking-wider uppercase">{label}</span>
                  <div className="flex-1 h-px bg-chr-subtle" />
                </div>
                <div className="space-y-px ml-2">
                  {entries.map(entry => (
                    <FileItemRow key={entry.rep.filePath} entry={entry} isChecked={pickedFiles.has(entry.rep.filePath)} onToggle={onToggle} />
                  ))}
                </div>
              </div>
            ))}
          </>

        ) : (
          <>
            {groupedEntries.map(([label, entries], idx) => (
              <FilesCollapsibleGroup
                key={label} label={label} entries={entries}
                pickedFiles={pickedFiles} onToggle={onToggle} defaultOpen={idx === 0}
              />
            ))}
          </>
        )}

        {/* Rodapé */}
        <div className="pt-4 border-t border-chr-subtle">
          <span className="font-mono text-2xs text-chr-muted">
            {uniqueFiles.length} arquivo{uniqueFiles.length !== 1 ? 's' : ''}
            {footerGroupLabel && <span className="opacity-60">{' · '}{t('grouped_by')} {footerGroupLabel}</span>}
          </span>
        </div>
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
  const canGoBack = stack.length > 1
  const { t } = useI18n()

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
  }, [currentTimeline?.dirPath]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialPath && initialTitle) {
      loadTimeline(initialPath, initialTitle)
    }
  }, [initialPath, initialTitle]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClearFileFilter = () => {
    setFileFilter(null)
  }

  const handleEventClick = (event: ChroniclerEvent) => {
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
    await renameEventFile(event.filePath, newFilename)
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
                      onClick={() => loadTimeline(item.dirPath, item.title, false)}
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
                'border border-chr-subtle text-chr-muted',
                'hover:border-chr hover:text-chr-primary hover:bg-hover',
                'transition-colors duration-150'
              )}
              title={t('create_event_hint')}
            >
              <Plus size={12} strokeWidth={1.5} />
              {t('new_event_btn')}
            </button>

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
