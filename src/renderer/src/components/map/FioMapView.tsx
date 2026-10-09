/**
 * FioMapView — o mapa de um fio: as paradas com data e local viram uma
 * "timeline" própria, e o MapView faz o resto (régua, Play, rastro e a rota
 * desenhada até o momento, como num chronicle). Clicar abre o evento de verdade.
 */

import { useMemo } from 'react'
import { Spline, X } from 'lucide-react'
import { MapView } from './MapView'
import { useFio } from '@/hooks/useFio'
import { useOpenEvent } from '@/hooks/useOpenEvent'
import { useI18n } from '@/hooks/useI18n'
import { useTimelineStore } from '@/stores/useTimelineStore'
import { toTimelineData } from '@/hooks/useTimeline'
import { docKey, type VaultEventDoc } from '@/utils/wikiLinks'
import type { ChroniclerEvent } from '@/types/chronicler'

export function FioMapView({ target }: { target: { filePath: string; slug: string } }) {
  const { t } = useI18n()
  const { self, fio } = useFio(target)
  const openDoc = useOpenEvent()
  const setMapFio = useTimelineStore((s) => s.setMapFio)

  const stops = useMemo(() => (fio?.stops.map((s) => s.doc).filter((d): d is VaultEventDoc => !!d) ?? []), [fio])
  const key = `fio:${docKey(target)}`
  const timeline = useMemo(() => toTimelineData({
    dirPath: key, relativePath: '', meta: { title: self?.title ?? '' }, subtimelines: [],
    // Todas no mesmo "arquivo" e marcadas como trechos: o mapa liga as paradas pela rota
    events: stops.map((d, i) => ({
      filePath: key, relativePath: '', slug: docKey(d), hasSubtimeline: false,
      frontmatter: { title: d.title, date: d.date || undefined, location: d.location },
      chronicle: { title: self?.title ?? '', entryIndex: i, totalEntries: 1 },
    })),
  }), [key, stops, self?.title])
  const byKey = useMemo(() => new Map(stops.map((d) => [docKey(d), d])), [stops])
  const onEventClick = (e: ChroniclerEvent) => { const d = byKey.get(e.slug); if (d) void openDoc(d) }

  const total = fio?.stops.length ?? 0
  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 chr-card shadow-card" data-testid="map-fio-bar">
      <Spline size={13} strokeWidth={1.5} className="text-timeline-chronicle-text shrink-0" />
      <span className="text-sm text-chr-primary truncate">{t('fio_label')} <span className="font-serif">“{self?.title ?? '…'}”</span></span>
      <span className="font-mono text-2xs text-chr-muted">{(total === 1 ? t('fio_stops_one') : t('fio_stops_count', { count: total }))}</span>
      <button type="button" onClick={() => setMapFio(null)} data-testid="map-fio-exit"
        className="flex items-center gap-1 px-2 py-0.5 rounded-sm border border-chr-subtle font-mono text-2xs text-chr-primary hover:bg-hover">
        <X size={11} /> {t('fio_exit')}
      </button>
    </div>
  )
  return <MapView timeline={timeline} onEventClick={onEventClick} header={header} />
}
