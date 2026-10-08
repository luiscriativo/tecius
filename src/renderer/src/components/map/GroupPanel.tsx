/**
 * GroupPanel — lista lateral dos eventos de um grupo grande do mapa (ex.:
 * milhares de eventos marcados só como "Brasil").
 *
 * - Ordem cronológica, com filtro por título, data ou local
 * - Lista virtualizada (linhas de altura fixa): só as linhas visíveis vão para
 *   o DOM, então milhares de itens rolam sem travar
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { useI18n } from '@/hooks/useI18n'
import { useAppStore } from '@/stores/useAppStore'
import type { ChroniclerEvent } from '@/types/chronicler'

/** Altura da linha: título + data (+ local, quando os eventos não o compartilham) */
const ROW_H_SHORT = 52
const ROW_H_TALL = 68
/** Linhas extras renderizadas acima/abaixo da área visível */
const OVERSCAN = 6

interface GroupPanelProps {
  events: ChroniclerEvent[]
  onClose: () => void
  onOpenEvent: (e: ChroniclerEvent) => void
}

export function GroupPanel({ events, onClose, onOpenEvent }: GroupPanelProps) {
  const { t } = useI18n()
  const language = useAppStore((s) => s.language)
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(0)

  const sorted = useMemo(() => [...events].sort((a, b) => a.date.sortKey - b.date.sortKey), [events])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((e) => e.frontmatter.title.toLowerCase().includes(q)
      || e.date.display.toLowerCase().includes(q)
      || (e.location?.name ?? '').toLowerCase().includes(q))
  }, [sorted, query])

  // Local em comum (quando todos compartilham o mesmo nome, vira o subtítulo)
  const place = useMemo(() => {
    const names = new Set(events.map((e) => e.location?.name ?? ''))
    return names.size === 1 ? [...names][0] : ''
  }, [events])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.clientHeight))
    ro.observe(el)
    setHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  // Outro grupo ou outro filtro: volta ao topo
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
    setScrollTop(0)
  }, [events, query])

  const ROW_H = place ? ROW_H_SHORT : ROW_H_TALL
  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const last = Math.min(shown.length, Math.ceil((scrollTop + height) / ROW_H) + OVERSCAN)
  const count = events.length.toLocaleString(language === 'en' ? 'en-US' : 'pt-BR')

  return (
    <aside className="w-[min(340px,40%)] shrink-0 border-l border-chr-subtle bg-surface flex flex-col min-h-0" data-testid="map-group-panel">
      <div className="shrink-0 flex items-start gap-3 px-4 pt-3 pb-2">
        <div className="flex-1 min-w-0">
          <span className="block font-serif text-lg text-chr-primary leading-tight">{t('map_group_title', { count })}</span>
          {place && (
            <span className="flex items-center gap-1 font-mono text-2xs text-chr-muted mt-0.5 truncate">
              <MapPin size={10} strokeWidth={1.5} className="shrink-0" />{place}
            </span>
          )}
        </div>
        <button type="button" onClick={onClose} title={t('close')} aria-label={t('close')}
          className="mt-0.5 text-chr-muted hover:text-chr-primary"><X size={15} strokeWidth={1.5} /></button>
      </div>
      <div className="shrink-0 px-4 pb-2 border-b border-chr-subtle">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('map_group_filter_ph')}
          className="w-full px-2 py-1 rounded-sm bg-vault border border-chr-subtle text-sm text-chr-primary placeholder:text-chr-muted focus:outline-none focus:border-chr"
          data-testid="map-group-filter" />
      </div>
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto" onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
        {shown.length === 0
          ? <p className="px-4 py-3 font-mono text-2xs text-chr-muted">{t('map_group_no_match')}</p>
          : (
            <div className="relative" style={{ height: shown.length * ROW_H }}>
              {shown.slice(first, last).map((e, i) => (
                <button key={e.filePath + e.slug} type="button" onClick={() => onOpenEvent(e)}
                  className="absolute inset-x-0 text-left px-4 py-2 hover:bg-hover transition-colors overflow-hidden"
                  style={{ top: (first + i) * ROW_H, height: ROW_H }}>
                  <span className="block text-sm text-chr-primary leading-snug truncate">{e.frontmatter.title}</span>
                  <span className="block font-mono text-2xs text-timeline-chronicle-text">{e.date.display}</span>
                  {e.location?.name && e.location.name !== place && (
                    <span className="block font-mono text-2xs text-chr-muted truncate">{e.location.name}</span>
                  )}
                </button>
              ))}
            </div>
          )}
      </div>
    </aside>
  )
}
