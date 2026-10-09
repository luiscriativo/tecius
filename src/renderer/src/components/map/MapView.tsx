/**
 * MapView — modo "Mapa" da timeline: onde os eventos aconteceram, no tempo.
 *
 * - Régua de tempo arrastável (TimeScrubber): o cursor seleciona uma janela
 *   (dia, mês, ano...) e os eventos dela ficam em destaque; os anteriores
 *   ficam como rastro esmaecido e os posteriores somem. "Todos" desliga o filtro.
 * - "Seguir": a câmera enquadra, com transição, os eventos do momento
 * - Fronteiras históricas: em épocas humanas, o mapa político em vigor no
 *   momento do cursor (historical-basemaps, GPL-3.0), com transição entre épocas
 * - Play: avança de data em data (espera a era carregar em tempo profundo)
 * - O momento fica salvo no store: ao voltar de um evento ou de outra vista,
 *   o mapa reabre no mesmo ponto — ou na data do evento selecionado na timeline.
 *   Ao trocar para a timeline horizontal, ela enquadra esse mesmo momento.
 * - Tempo profundo: com "Mapas paleogeográficos" ativado, o mapa troca (com
 *   transição) para as linhas de costa da era do cursor. As eras dos eventos
 *   são pré-carregadas em segundo plano (GPlates, com cache local).
 * - Pontos com a mesma forma da timeline (bolinha / losango) e áreas por precisão
 * - Trechos de um mesmo evento ligados por uma linha (rota), desenhada até o momento
 * - Clicar num grupo de eventos no mesmo ponto abre a lista lateral virtualizada
 *   (GroupPanel), como o cluster da timeline — vale até para milhares "no Brasil"
 * - Tempo profundo: aviso de que as posições são atuais e, se ativado em
 *   Configurações, mapa paleogeográfico da época (GPlates, com cache local)
 * - Relações: um evento e os ligados a ele por [[…]], de qualquer data e timeline.
 *   Os que ele cita formam uma rota em ordem de data; os que citam ele, linhas
 *   pontilhadas até ele. Substitui o tempo até sair (faixa no topo).
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Layers, Link2, Pause, Play, Presentation, X } from 'lucide-react'
import { PresentationPanel } from './PresentationPanel'
import { GroupPanel } from './GroupPanel'
import { WorldMap, type MapArea, type MapLine, type MapMarker } from './WorldMap'
import { TimeScrubber } from './TimeScrubber'
import {
  GRANULARITIES, autoGranularity, buildTimeScale, eventSpan, nextStop, phaseOf, prevStop, stopIndexAt, trailOpacity,
  windowAt, type EventPhase, type TimeGranularity,
} from '@/utils/mapTime'
import { effectiveRadiusKm, parseLocation } from '@/utils/location'
import { DEEP_TIME_YEARS, geologicPeriod, keyframeAge, nearestKeyframe, supercontinent, yearToMa } from '@/utils/paleo'
import { formatYear, parseChroniclerDate } from '@/utils/chroniclerDate'
import { usePaleoFrames } from '@/hooks/usePaleoFrames'
import { BORDERS_SOURCE, bordersYearFor, loadBorderNames, loadBorders, type BorderFeatures } from '@/utils/historicalBorders'
import { cn } from '@/utils/cn'
import { isMultiPart } from '@/utils/events'
import { useAppStore } from '@/stores/useAppStore'
import { useTimelineStore } from '@/stores/useTimelineStore'
import { useI18n } from '@/hooks/useI18n'
import { usePref } from '@/hooks/usePref'
import { useEventRelations } from '@/hooks/useEventRelations'
import { useOpenEvent } from '@/hooks/useOpenEvent'
import { docKey, type VaultEventDoc } from '@/utils/wikiLinks'
import type { EventLocation } from '@/types/chronicler'
import { oneOf } from '@/utils/prefs'
import type { TranslationKey } from '@/i18n/translations'
import type { ChroniclerEvent, TimelineData } from '@/types/chronicler'

interface MapViewProps {
  timeline: TimelineData
  onEventClick: (event: ChroniclerEvent) => void
  /** Faixa no topo do mapa (modo Fio); desliga as relações */
  header?: ReactNode
}

const FOLLOW_DEBOUNCE_MS = 250
const PLAY_STEP_MS = 1800
/** No modo apresentação cada momento fica mais tempo na tela (dá para ler o texto) */
const PRESENT_STEP_MS = 7000
const SPEEDS = [0.5, 1, 2, 4]
/** Em tempo profundo o que importa é o desenho dos continentes: enquadramento aberto */
const DEEP_FOCUS_ZOOM = 1.6

const GRAN_LABEL: Record<TimeGranularity, TranslationKey> = {
  auto: 'map_gran_auto', day: 'map_gran_day', month: 'map_gran_month', year: 'map_gran_year',
  decade: 'map_gran_decade', century: 'map_gran_century', millennium: 'map_gran_millennium',
}

export function MapView({ timeline, onEventClick, header }: MapViewProps) {
  const { t } = useI18n()
  const language = useAppStore((s) => s.language)
  const paleoEnabled = useAppStore((s) => s.paleoMaps)
  const [popover, setPopover] = useState<{ ids: string[]; x: number; y: number } | null>(null)
  /** Grupo grande aberto na lista lateral */
  const [groupIds, setGroupIds] = useState<string[] | null>(null)

  const located = useMemo(() => timeline.events.filter((e) => e.location && !e.undated), [timeline.events])
  // ── Relações [[…]] ──────────────────────────────────────────────────────
  const relTargetStore = useTimelineStore((s) => s.mapRelations)
  const relTarget = header ? null : relTargetStore
  const setMapRelations = useTimelineStore((s) => s.setMapRelations)
  const rel = useEventRelations(relTarget)
  const relOn = relTarget !== null
  const openDoc = useOpenEvent()
  /** O evento e os ligados a ele, com local e papel (cada um uma vez) */
  const relItems = useMemo(() => {
    if (!rel) return []
    const seen = new Set<string>()
    const out: Array<{ doc: VaultEventDoc; loc: EventLocation | null; role: 'self' | 'cites' | 'citedBy' }> = []
    const add = (doc: VaultEventDoc, role: 'self' | 'cites' | 'citedBy') => {
      if (seen.has(docKey(doc))) return
      seen.add(docKey(doc))
      out.push({ doc, loc: parseLocation(doc.location), role })
    }
    add(rel.self, 'self')
    rel.cites.forEach((d) => add(d, 'cites'))
    rel.citedBy.forEach((d) => add(d, 'citedBy'))
    return out
  }, [rel])
  const relByKey = useMemo(() => new Map(relItems.map((r) => [docKey(r.doc), r])), [relItems])

  // Só eventos com data entram na conta (os sem data já aparecem no aviso acima)
  const withoutLocation = timeline.events.filter((e) => !e.undated && !e.location).length

  // ── Tempo: régua, cursor e janela ───────────────────────────────────────
  const selectedEvent = useTimelineStore((s) => s.selectedEvent)
  const setMapCursor = useTimelineStore((s) => s.setMapCursor)
  const selectedHere = selectedEvent && timeline.events.some((e) => e.filePath === selectedEvent.filePath && e.slug === selectedEvent.slug)
    ? selectedEvent : null

  /** Onde a régua abre: no evento recém-selecionado, senão onde ficou da última vez */
  const initialCursor = (): number | null => {
    const saved = useTimelineStore.getState().mapCursor
    const savedHere = saved?.dirPath === timeline.dirPath ? saved : null
    if (selectedHere && savedHere?.selectedSlug !== selectedHere.slug) return eventSpan(selectedHere)[0]
    return savedHere?.t ?? null
  }
  const [cursor, setCursor] = useState<number | null>(initialCursor)
  const [playing, setPlaying] = useState(false)
  // Preferências da barra do mapa: lembradas entre aberturas
  const [speed, setSpeed] = usePref('map.speed', 1, oneOf(SPEEDS))
  const [granularity, setGranularity] = usePref<TimeGranularity>('map.granularity', 'auto', oneOf(GRANULARITIES))
  const [showAll, setShowAll] = usePref('map.showAll', false)
  const [trail, setTrail] = usePref('map.trail', true)
  const [follow, setFollow] = usePref('map.follow', true)

  const spans = useMemo(() => new Map(located.map((e) => [e.slug, eventSpan(e)])), [located])
  // Modo apresentação: a régua passa por todos os eventos com data (a narrativa
  // inclui os que não têm local — o mapa só não mostra ponto para eles)
  const [presenting, setPresenting] = useState(false)
  const stopSpans = useMemo(() => (presenting
    ? timeline.events.filter((e) => !e.undated).map(eventSpan)
    : [...spans.values()]), [presenting, timeline.events, spans])
  const scale = useMemo(() => buildTimeScale(stopSpans.map((s) => s[0])), [stopSpans])
  const { stops } = scale
  const stopCounts = useMemo(() => {
    const counts = new Array<number>(stops.length).fill(0)
    for (const [start] of stopSpans) { const i = stopIndexAt(stops, start); if (i >= 0) counts[i]++ }
    return counts
  }, [stopSpans, stops])

  // Outra timeline: reabre onde ela estava (ou na primeira data); se os eventos
  // mudarem, o cursor é mantido dentro do intervalo
  const dirRef = useRef(timeline.dirPath)
  useEffect(() => {
    if (dirRef.current === timeline.dirPath) return
    dirRef.current = timeline.dirPath
    setPlaying(false)
    setCursor(initialCursor())
  }, [timeline.dirPath]) // eslint-disable-line react-hooks/exhaustive-deps
  const now = stops.length === 0 ? null
    : cursor === null ? stops[0]
    : Math.min(stops[stops.length - 1], Math.max(stops[0], cursor))

  const effGran = useMemo(() => {
    if (granularity !== 'auto') return granularity
    if (now === null) return 'year'
    // Precisão das datas da parada mais próxima do cursor
    const near = stops.reduce((a, b) => (Math.abs(b - now) < Math.abs(a - now) ? b : a), stops[0])
    return autoGranularity(located.filter((e) => Math.abs(spans.get(e.slug)![0] - near) < 1e-7).map((e) => e.date))
  }, [granularity, now, stops, located, spans])
  const win = useMemo(() => (now === null ? null : windowAt(now, effGran)), [now, effGran])

  // Fase de cada evento (ativo / rastro / futuro) e opacidade
  const view = useMemo(() => {
    const out = new Map<string, { phase: EventPhase; opacity: number }>()
    const cursorIdx = now === null ? -1 : stopIndexAt(stops, now)
    for (const e of located) {
      if (showAll || !win) { out.set(e.slug, { phase: 'active', opacity: 1 }); continue }
      const span = spans.get(e.slug)!
      const phase = phaseOf(span, win)
      const opacity = phase === 'active' ? 1
        : phase === 'past' && trail ? trailOpacity(cursorIdx - stopIndexAt(stops, span[0])) : 0
      out.set(e.slug, { phase, opacity })
    }
    return out
  }, [located, spans, stops, now, win, showAll, trail])
  const visible = useMemo(() => located.filter((e) => view.get(e.slug)!.opacity > 0), [located, view])
  const activeIds = useMemo(() => located.filter((e) => view.get(e.slug)!.phase === 'active').map((e) => e.slug), [located, view])
  // Tempo profundo "agora": o momento do cursor (ou, em "Todos", qualquer evento)
  const hasDeepTime = relOn ? false : showAll
    ? located.some((e) => e.date.year < DEEP_TIME_YEARS)
    : win !== null && win.start < DEEP_TIME_YEARS

  // Salva o momento (para voltar a ele depois)
  useEffect(() => {
    if (now !== null) setMapCursor({ dirPath: timeline.dirPath, t: now, selectedSlug: selectedHere?.slug ?? null })
  }, [now, timeline.dirPath, selectedHere?.slug, setMapCursor])

  // Trocou de vista (não só abriu um evento): a timeline enquadra o momento do mapa
  const focusRef = useRef<{ dirPath: string; start: number; end: number } | null>(null)
  focusRef.current = win && !showAll ? { dirPath: timeline.dirPath, start: win.start, end: win.end } : null
  useEffect(() => () => {
    const { viewMode, setTimelineFocus } = useTimelineStore.getState()
    if (viewMode !== 'map') setTimelineFocus(focusRef.current)
  }, [])

  const step = (dir: 1 | -1) => {
    setPlaying(false)
    if (now === null) return
    const s = dir > 0 ? nextStop(stops, now, win) : prevStop(stops, now, win)
    if (s !== null) setCursor(s)
  }

  // ── Paleogeografia ──────────────────────────────────────────────────────
  const [paleoOn, setPaleoOn] = usePref('map.paleo', true)
  const deepEvents = useMemo(() => located.filter((e) => e.date.year < DEEP_TIME_YEARS), [located])
  // Quadros-chave das eras dos eventos (0 = mapa atual; fora do modelo não entra)
  const keyframes = useMemo(() => [...new Set(deepEvents
    .map((e) => keyframeAge(yearToMa(e.date.year)))
    .filter((a): a is number => a !== null && a > 0))].sort((a, b) => a - b), [deepEvents])
  const deepPoints = useMemo(() => {
    const seen = new Map<string, [number, number]>()
    for (const e of deepEvents) seen.set(`${e.location!.lng},${e.location!.lat}`, [e.location!.lng, e.location!.lat])
    return [...seen.values()]
  }, [deepEvents])

  // Idade do momento do cursor (só em tempo profundo; "Todos" usa o mapa atual)
  const cursorMa = !showAll && !relOn && hasDeepTime && now !== null ? yearToMa(Math.floor(now)) : null
  const targetKey = cursorMa === null ? null : keyframeAge(cursorMa)
  const wantedFrame = targetKey === null || targetKey === 0 ? null : nearestKeyframe(keyframes, cursorMa!)
  const paleoActive = paleoEnabled && paleoOn
  const paleoFrames = usePaleoFrames(paleoActive, keyframes, deepPoints, wantedFrame)
  const { frameFor } = paleoFrames
  const paleo = useMemo(() => (paleoActive && wantedFrame !== null ? frameFor(wantedFrame) : null), [paleoActive, wantedFrame, frameFor])
  const paleoLoadingNow = paleoActive && wantedFrame !== null && !paleo && paleoFrames.loading !== null
  const paleoFailedNow = paleoActive && wantedFrame !== null && paleoFrames.failed.includes(wantedFrame)

  // ── Fronteiras históricas ───────────────────────────────────────────────
  const [bordersOn, setBordersOn] = usePref('map.borders', true)
  const bordersYear = bordersOn && !showAll && !relOn && !paleo && now !== null ? bordersYearFor(Math.floor(now)) : null
  const [borders, setBorders] = useState<{ year: number; fc: BorderFeatures } | null>(null)
  useEffect(() => {
    if (bordersYear === null) { setBorders(null); return }
    let alive = true
    // Mantém o mapa anterior até o novo carregar (a troca é suave)
    loadBorders(bordersYear).then((fc) => { if (alive) setBorders({ year: bordersYear, fc }) }).catch(() => { if (alive) setBorders(null) })
    return () => { alive = false }
  }, [bordersYear])
  const shownBorders = bordersYear === null ? null : borders
  const [borderNames, setBorderNames] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    loadBorderNames(language).then((n) => { if (alive) setBorderNames(n) }).catch(() => {})
    return () => { alive = false }
  }, [language])

  // ── Modo apresentação: mapa em tela cheia + texto dos eventos ao lado ─────
  const rootRef = useRef<HTMLDivElement>(null)
  const startPresentation = () => {
    setPresenting(true)
    setShowAll(false)
    rootRef.current?.requestFullscreen?.().catch(() => {})
    // Foco na régua: espaço pausa e ← → navegam durante a apresentação
    setTimeout(() => rootRef.current?.querySelector<HTMLElement>('[data-testid=time-scrubber]')?.focus(), 300)
    if (!playing) {
      if (now !== null && nextStop(stops, now, win) === null) setCursor(stops[0])
      setPlaying(true)
    }
  }
  const stopPresentation = () => {
    setPresenting(false)
    setPlaying(false)
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  }
  useEffect(() => {
    // Esc fora da tela cheia, ou saída da tela cheia pelo sistema, encerram a apresentação
    const onFs = () => { if (!document.fullscreenElement) { setPresenting(false); setPlaying(false) } }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && presenting) {
        setPresenting(false); setPlaying(false)
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      }
    }
    document.addEventListener('fullscreenchange', onFs)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('keydown', onKey) }
  }, [presenting])
  // Texto ao lado: todos os eventos com data do momento (também os sem local)
  const presentEvents = useMemo(() => (presenting && win
    ? timeline.events.filter((e) => !e.undated && phaseOf(eventSpan(e), win) === 'active')
    : []), [presenting, win, timeline.events])
  const presentPos = { index: now === null ? 0 : stopIndexAt(stops, now) + 1, total: stops.length }

  // ── Play ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || now === null || showAll || relOn || paleoLoadingNow) return   // em tempo profundo, espera a era
    const h = setTimeout(() => {
      const n = nextStop(stops, now, win)
      if (n === null) setPlaying(false)
      else setCursor(n)
    }, (presenting ? PRESENT_STEP_MS : PLAY_STEP_MS) / speed)
    return () => clearTimeout(h)
  }, [playing, now, win, stops, speed, showAll, paleoLoadingNow, presenting])

  const togglePlay = () => {
    if (playing) { setPlaying(false); return }
    if (now !== null && nextStop(stops, now, win) === null) setCursor(stops[0])   // no fim: recomeça
    setShowAll(false)
    setPlaying(true)
  }

  // ── Camadas do mapa ─────────────────────────────────────────────────────
  const posOf = (e: ChroniclerEvent): [number, number] | null =>
    paleo ? paleo.pointOf([e.location!.lng, e.location!.lat]) : [e.location!.lng, e.location!.lat]

  const timeMarkers: MapMarker[] = useMemo(() => visible.flatMap((e) => {
    const p = posOf(e)
    return p ? [{
      id: e.slug, lng: p[0], lat: p[1], shape: isMultiPart(e) ? 'diamond' as const : 'dot' as const,
      label: `${e.frontmatter.title} · ${e.date.display}`, opacity: view.get(e.slug)!.opacity,
      selected: e.slug === selectedHere?.slug,
    }] : []
  }), [visible, view, paleo, selectedHere?.slug]) // eslint-disable-line react-hooks/exhaustive-deps

  const timeAreas: MapArea[] = useMemo(() => paleo ? [] : visible
    .filter((e) => e.location!.precision !== 'point')
    .map((e) => ({
      id: e.slug, lng: e.location!.lng, lat: e.location!.lat, areaCode: e.location!.area,
      radiusKm: effectiveRadiusKm(e.location!), opacity: view.get(e.slug)!.opacity,
    })),
  [visible, view, paleo])

  // Rota: trechos de um mesmo arquivo com local, em ordem cronológica, até o momento atual
  const timeLines: MapLine[] = useMemo(() => {
    const byFile = new Map<string, ChroniclerEvent[]>()
    for (const e of visible) if (e.chronicle) byFile.set(e.filePath, [...(byFile.get(e.filePath) ?? []), e])
    return [...byFile.entries()].flatMap(([file, evs]) => {
      const sorted = evs.sort((a, b) => a.date.sortKey - b.date.sortKey)
      const coords = sorted.map(posOf).filter((p): p is [number, number] => !!p)
      const distinct = coords.filter((c, i) => i === 0 || c[0] !== coords[i - 1][0] || c[1] !== coords[i - 1][1])
      const opacity = view.get(sorted[sorted.length - 1].slug)!.opacity
      // Num fio (header) a rota é o assunto: linha cheia
      return distinct.length >= 2 ? [{ id: file, coords: distinct, opacity, kind: header ? 'relation' as const : undefined }] : []
    })
  }, [visible, view, paleo, !!header]) // eslint-disable-line react-hooks/exhaustive-deps

  // Relações: pontos de todos os ligados; rota dos citados em ordem de data;
  // linha pontilhada de cada um que cita até o evento
  const relLayers = useMemo(() => {
    const withLoc = relItems.filter((r): r is typeof r & { loc: EventLocation } => r.loc !== null)
    const markers: MapMarker[] = withLoc.map((r) => ({
      id: docKey(r.doc), lng: r.loc.lng, lat: r.loc.lat, shape: r.doc.anchor ? 'diamond' as const : 'dot' as const,
      label: [r.doc.title, r.doc.date ? parseChroniclerDate(r.doc.date).display : ''].filter(Boolean).join(' · '),
      selected: r.role === 'self',
    }))
    const areas: MapArea[] = withLoc.filter((r) => r.loc.precision !== 'point').map((r) => ({
      id: docKey(r.doc), lng: r.loc.lng, lat: r.loc.lat, areaCode: r.loc.area, radiusKm: effectiveRadiusKm(r.loc),
    }))
    const route = withLoc.filter((r) => r.role === 'cites' && r.doc.date)
      .map((r) => ({ p: [r.loc.lng, r.loc.lat] as [number, number], k: parseChroniclerDate(r.doc.date).sortKey }))
      .sort((a, b) => a.k - b.k).map((x) => x.p)
      .filter((c, i, all) => i === 0 || c[0] !== all[i - 1][0] || c[1] !== all[i - 1][1])
    const self = withLoc.find((r) => r.role === 'self')
    const lines: MapLine[] = route.length >= 2 ? [{ id: 'rel-route', coords: route, kind: 'relation' }] : []
    if (self) {
      for (const r of withLoc) {
        if (r.role !== 'citedBy' || (r.loc.lng === self.loc.lng && r.loc.lat === self.loc.lat)) continue
        lines.push({ id: `rel-in-${docKey(r.doc)}`, coords: [[r.loc.lng, r.loc.lat], [self.loc.lng, self.loc.lat]], kind: 'backlink' })
      }
    }
    return { markers, areas, lines, missing: relItems.length - withLoc.length }
  }, [relItems])
  const markers = relOn ? relLayers.markers : timeMarkers
  const areas = relOn ? relLayers.areas : timeAreas
  const lines = relOn ? relLayers.lines : timeLines

  const bySlug = useMemo(() => new Map(timeline.events.map((e) => [e.slug, e])), [timeline.events])
  const groupEvents = useMemo(() => (groupIds ?? []).map((id) => bySlug.get(id)).filter((e): e is ChroniclerEvent => !!e), [groupIds, bySlug])

  // Enquadramento: "Seguir" acompanha os eventos do momento (com pequeno atraso
  // para não pular a cada pixel do arraste); sem "Seguir", só ao trocar de timeline/mapa
  // A apresentação sempre acompanha os eventos (sem mudar a preferência "Seguir")
  const following = (follow || presenting) && !showAll
  const activeKey = activeIds.join('|')
  const [followKey, setFollowKey] = useState(activeKey)
  useEffect(() => {
    const h = setTimeout(() => setFollowKey(activeKey), FOLLOW_DEBOUNCE_MS)
    return () => clearTimeout(h)
  }, [activeKey])
  const relKey = relOn ? relLayers.markers.map((m) => m.id).join('|') : ''
  const fitIds = useMemo(() => (relOn ? relKey.split('|').filter(Boolean)
    : following ? followKey.split('|').filter(Boolean) : undefined), [relOn, relKey, following, followKey])
  // Só o "Seguir" reenquadra sozinho; sem ele (ou em "Todos") o mapa fica onde
  // o usuário deixou — inclusive ao voltar à tela (vista guardada por timeline)
  const fitKey = relOn ? (relKey ? `rel|${relKey}` : null)
    : following ? `${paleo ? paleo.age : 'now'}|${followKey}` : null
  const setMapView = useTimelineStore((s) => s.setMapView)

  // A lista e o popover mostram os eventos do momento em que se clicou: mudou a
  // régua (ou "Todos"), ou o mapa se reenquadrou, eles fecham para não enganar
  useEffect(() => { setPopover(null); setGroupIds(null) }, [fitKey, timeline.dirPath, win?.start, win?.end, showAll, relOn])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPopover(null); setGroupIds(null) } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const iconBtn = 'p-1 rounded-sm text-chr-muted hover:text-chr-primary hover:bg-hover transition-colors disabled:opacity-30 disabled:hover:bg-transparent'

  return (
    <div ref={rootRef} className="flex-1 flex flex-col min-h-0 bg-vault" data-testid="map-view">
      {/* Tempo profundo */}
      {hasDeepTime && (
        <div className="shrink-0 flex flex-wrap items-center gap-3 px-5 py-2 border-b border-chr-subtle bg-subtle font-mono text-2xs text-chr-secondary" data-testid="deep-time-notice">
          <Layers size={12} strokeWidth={1.5} className="text-timeline-chronicle-text" />
          <span data-testid="deep-time-status">
            {showAll ? t('map_paleo_all_hint')
              : paleo ? t('map_paleo_badge', { age: paleo.age, model: paleo.model })
              : targetKey === null ? t('map_paleo_out_of_range')
              : t('map_deep_notice')}
          </span>
          {!showAll && (paleoEnabled ? (
            <>
              <button type="button" onClick={() => setPaleoOn((v) => !v)} data-testid="paleo-toggle" aria-pressed={paleoOn}
                className="px-2 py-0.5 rounded-sm border border-chr-subtle text-chr-primary hover:bg-hover">
                {paleoOn ? t('map_paleo_hide') : t('map_paleo_show')}
              </button>
              {paleoActive && paleoFrames.loading !== null && (
                <span className="text-chr-muted" data-testid="paleo-progress">
                  {t('map_paleo_preparing', { done: paleoFrames.loaded.length, total: keyframes.length })}
                  {paleoLoadingNow && <> · {t('map_paleo_loading')}</>}
                </span>
              )}
              {paleoFailedNow && (
                <span className="text-red-500">
                  {t('map_paleo_error')}{' '}
                  <button type="button" onClick={paleoFrames.retry} className="underline hover:text-chr-primary">{t('map_paleo_retry')}</button>
                </span>
              )}
            </>
          ) : (
            <span className="text-chr-muted">{t('map_paleo_enable_hint')}</span>
          ))}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0">
          <WorldMap
            // Outra timeline: mapa novo, que retoma a vista guardada dela
            key={timeline.dirPath}
            // (lida a cada render, mas o WorldMap só a usa ao montar)
            initialView={useTimelineStore.getState().mapViews[timeline.dirPath] ?? null}
            onViewChange={(v) => setMapView(timeline.dirPath, v)}
            className="w-full h-full"
            markers={markers}
            areas={areas}
            lines={lines}
            basemap={paleo?.coast ?? null}
            borders={shownBorders?.fc ?? null}
            borderNames={borderNames}
            fitKey={fitKey}
            fitIds={fitIds}
            focusMaxZoom={paleo ? DEEP_FOCUS_ZOOM : undefined}
            onMarkerClick={(ids, at) => {
              // Um evento: popover junto ao ponto. Grupo: lista lateral (nas relações, são poucos: popover)
              if (ids.length === 1 || relOn) setPopover({ ids, ...at })
              else { setPopover(null); setGroupIds(ids) }
            }}
          />
        </div>

        {cursorMa !== null && (
          <div className="absolute left-3 top-3 px-3 py-2 chr-card shadow-card pointer-events-none" data-testid="era-badge">
            <span className="block font-serif text-lg leading-tight text-chr-primary">~{formatYear(-Math.round(cursorMa * 1e6))}</span>
            <span className="block font-mono text-2xs text-chr-muted">
              {[geologicPeriod(cursorMa, language), supercontinent(cursorMa, language)].filter(Boolean).join(' · ')}
            </span>
            {shownBorders && (
              <span className="block font-mono text-2xs text-chr-muted mt-0.5" data-testid="era-borders">
                {t('map_borders_of')} {formatYear(shownBorders.year)}
              </span>
            )}
          </div>
        )}

        {shownBorders && (
          <>
            {/* Em tempo profundo o selo da era ocupa o canto: o mapa político usado vai nele */}
            {cursorMa === null && (
              <div className="absolute left-3 top-3 px-3 py-1.5 chr-card shadow-card pointer-events-none" data-testid="borders-badge">
                <span className="block font-mono text-2xs text-chr-muted">{t('map_borders_of')}</span>
                <span className="block font-serif text-base leading-tight text-chr-primary">{formatYear(shownBorders.year)}</span>
              </div>
            )}
            <p className="absolute left-3 bottom-2 px-1.5 py-0.5 rounded-sm bg-surface/80 font-mono text-2xs text-chr-muted pointer-events-none" data-testid="borders-credit">
              {t('map_borders_credit', { license: BORDERS_SOURCE.license })}
            </p>
          </>
        )}

        {header && (
          <div className="absolute inset-x-0 top-3 flex justify-center px-3 pointer-events-none">
            <div className="pointer-events-auto max-w-full">{header}</div>
          </div>
        )}

        {relOn && (
          <div className="absolute inset-x-0 top-3 flex justify-center px-3 pointer-events-none">
            <div className="pointer-events-auto max-w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 chr-card shadow-card" data-testid="map-relations-bar">
              <Link2 size={13} strokeWidth={1.5} className="text-timeline-chronicle-text shrink-0" />
              <span className="text-sm text-chr-primary truncate">
                {t('map_rel_of')} <span className="font-serif">“{rel?.self.title ?? '…'}”</span>
              </span>
              {rel && (
                <span className="font-mono text-2xs text-chr-muted" data-testid="map-relations-counts">
                  {t('map_rel_counts', { cites: rel.cites.length, citedBy: rel.citedBy.length })}
                  {relLayers.missing > 0 && <> · {t('map_without_location', { count: relLayers.missing })}</>}
                </span>
              )}
              <span className="hidden md:flex items-center gap-3 font-mono text-2xs text-chr-muted">
                <span className="flex items-center gap-1"><svg width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke="rgb(var(--chronicle-dot))" strokeWidth="1.8" /></svg>{t('map_rel_route')}</span>
                <span className="flex items-center gap-1"><svg width="18" height="4"><line x1="1" y1="2" x2="17" y2="2" stroke="rgb(var(--chronicle-dot))" strokeWidth="1.2" strokeDasharray="1.5 3" strokeLinecap="round" /></svg>{t('map_rel_backlinks')}</span>
              </span>
              <button type="button" onClick={() => setMapRelations(null)} data-testid="map-relations-exit"
                className="flex items-center gap-1 px-2 py-0.5 rounded-sm border border-chr-subtle font-mono text-2xs text-chr-primary hover:bg-hover">
                <X size={11} /> {t('map_rel_exit')}
              </button>
            </div>
          </div>
        )}

        {relOn && rel && relLayers.markers.length === 0 && (
          <div className="absolute inset-x-0 top-20 flex justify-center pointer-events-none">
            <p className="px-3 py-1.5 rounded-sm bg-surface border border-chr-subtle font-mono text-2xs text-chr-muted" data-testid="map-empty">
              {t('map_rel_no_locations')}
            </p>
          </div>
        )}

        {!relOn && (located.length === 0 || activeIds.length === 0) && (
          <div className="absolute inset-x-0 top-6 flex justify-center pointer-events-none">
            <p className="px-3 py-1.5 rounded-sm bg-surface border border-chr-subtle font-mono text-2xs text-chr-muted" data-testid="map-empty">
              {t(located.length === 0 ? 'map_no_locations' : 'map_nothing_now')}
            </p>
          </div>
        )}

        {popover && (
          <div
            className="absolute z-20 w-64 chr-card shadow-card-hover py-1 max-h-72 overflow-y-auto"
            style={{ left: Math.max(8, popover.x - 128), top: popover.y + 14 }}
            data-testid="map-popover"
          >
            <button type="button" onClick={() => setPopover(null)} aria-label={t('close')}
              className="absolute right-1.5 top-1.5 text-chr-muted hover:text-chr-primary"><X size={12} /></button>
            {relOn ? popover.ids.map((id) => relByKey.get(id)).filter((r) => !!r).map((r) => (
              <div key={docKey(r.doc)} className="px-3 py-2">
                <button type="button" onClick={() => void openDoc(r.doc)} className="block w-full text-left group">
                  <span className="block text-sm text-chr-primary leading-snug pr-4 group-hover:underline">{r.doc.title}</span>
                  <span className="block font-mono text-2xs text-timeline-chronicle-text">{r.doc.date ? parseChroniclerDate(r.doc.date).display : t('wiki_undated')}</span>
                  <span className="block font-mono text-2xs text-chr-muted truncate">
                    {[r.loc?.name, r.doc.chronicleTitle, r.doc.timelineTitle].filter(Boolean).join(' · ')}
                  </span>
                </button>
                {r.role !== 'self' && (
                  <button type="button" onClick={() => setMapRelations(r.doc)} data-testid="map-relations-open"
                    className="mt-1 flex items-center gap-1 font-mono text-2xs text-chr-muted hover:text-chr-primary">
                    <Link2 size={10} strokeWidth={1.5} /> {t('map_rel_show')}
                  </button>
                )}
              </div>
            )) : popover.ids.map((id) => bySlug.get(id)).filter((e): e is ChroniclerEvent => !!e).map((e) => (
              <div key={e.slug} className="hover:bg-hover transition-colors">
                <button type="button" onClick={() => onEventClick(e)} className="w-full text-left px-3 pt-2 pb-2">
                  <span className="block text-sm text-chr-primary leading-snug pr-4">{e.frontmatter.title}</span>
                  <span className="block font-mono text-2xs text-timeline-chronicle-text">{e.date.display}</span>
                  {e.location?.name && <span className="block font-mono text-2xs text-chr-muted truncate">{e.location.name}</span>}
                </button>
                {!header && <RelationsButton event={e} onShow={() => setMapRelations(e)} />}
              </div>
            ))}
          </div>
        )}
      </div>
      {!presenting && groupEvents.length > 0 && (
        <GroupPanel events={groupEvents} onClose={() => setGroupIds(null)} onOpenEvent={onEventClick} />
      )}
      {presenting && win && (
        <PresentationPanel events={presentEvents} windowLabel={win.label} position={presentPos}
          onClose={stopPresentation} onOpenEvent={(e) => { stopPresentation(); onEventClick(e) }} />
      )}
      </div>

      {/* Régua de tempo */}
      {!relOn && stops.length > 0 && now !== null && (
        <div className="shrink-0 border-t border-chr-subtle bg-surface px-5 pt-2 pb-1" data-testid="map-timebar">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <div className="flex items-center">
              <button type="button" onClick={() => step(-1)} disabled={prevStop(stops, now, win) === null || showAll}
                title={t('map_time_prev')} aria-label={t('map_time_prev')} className={iconBtn} data-testid="map-prev">
                <ChevronLeft size={14} strokeWidth={1.5} />
              </button>
              <button type="button" onClick={togglePlay} disabled={stops.length < 2}
                title={playing ? t('map_pause') : t('map_play')} aria-label={playing ? t('map_pause') : t('map_play')}
                aria-pressed={playing} className={cn(iconBtn, playing && 'text-chr-primary')} data-testid="map-play">
                {playing ? <Pause size={13} strokeWidth={1.5} /> : <Play size={13} strokeWidth={1.5} />}
              </button>
              <button type="button" onClick={presenting ? stopPresentation : startPresentation} disabled={stops.length === 0}
                title={presenting ? t('presentation_exit') : t('presentation_start')} aria-pressed={presenting}
                className={cn(iconBtn, presenting && 'text-chr-primary')} data-testid="map-present">
                <Presentation size={13} strokeWidth={1.5} />
              </button>
              <button type="button" onClick={() => step(1)} disabled={nextStop(stops, now, win) === null || showAll}
                title={t('map_time_next')} aria-label={t('map_time_next')} className={iconBtn} data-testid="map-next">
                <ChevronRight size={14} strokeWidth={1.5} />
              </button>
            </div>
            <span className={cn('font-serif text-base leading-none', showAll ? 'text-chr-muted' : 'text-chr-primary')} data-testid="map-window-label">
              {showAll ? t('map_all_period') : win?.label}
            </span>
            <span className="font-mono text-2xs text-chr-muted" data-testid="map-counts">
              {showAll
                ? t('map_events_count', { count: markers.length })
                : t('map_now_count', { count: activeIds.length })}
              {withoutLocation > 0 && <> · {t('map_without_location', { count: withoutLocation })}</>}
            </span>
            <div className="flex-1" />
            <label className="flex items-center gap-1.5 font-mono text-2xs text-chr-muted" title={t('map_speed')}>
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label={t('map_speed')}
                className="px-1.5 py-0.5 rounded-sm bg-vault border border-chr-subtle text-chr-primary focus:outline-none focus:border-chr"
                data-testid="map-speed">
                {SPEEDS.map((v) => <option key={v} value={v}>{language === 'en' ? String(v) : String(v).replace('.', ',')}×</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5 font-mono text-2xs text-chr-muted">
              {t('map_granularity')}
              <select value={granularity} onChange={(e) => setGranularity(e.target.value as TimeGranularity)} disabled={showAll}
                className="px-1.5 py-0.5 rounded-sm bg-vault border border-chr-subtle text-chr-primary focus:outline-none focus:border-chr disabled:opacity-50"
                data-testid="map-granularity">
                {GRANULARITIES.map((g) => (
                  <option key={g} value={g}>
                    {g === 'auto' ? `${t('map_gran_auto')} (${t(GRAN_LABEL[effGran]).toLowerCase()})` : t(GRAN_LABEL[g])}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center border border-chr-subtle rounded-sm overflow-hidden">
              {([
                ['trail', trail, () => setTrail((v) => !v), t('map_trail'), t('map_trail_hint'), showAll],
                ['follow', follow, () => setFollow((v) => !v), t('map_follow'), t('map_follow_hint'), showAll],
                ['borders', bordersOn, () => setBordersOn((v) => !v), t('map_borders'), t('map_borders_hint'), showAll],
                ['all', showAll, () => { setPlaying(false); setShowAll((v) => !v) }, t('map_show_all'), t('map_show_all_hint'), false],
              ] as const).map(([id, on, toggle, label, hint, disabled]) => (
                <button key={id} type="button" onClick={toggle} title={hint} aria-pressed={on} disabled={disabled}
                  data-testid={`map-toggle-${id}`}
                  className={cn('px-2 py-0.5 font-mono text-2xs transition-colors disabled:opacity-40',
                    on ? 'bg-active text-chr-primary' : 'text-chr-muted hover:bg-hover hover:text-chr-secondary')}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className={cn(showAll && 'opacity-50')}>
            <TimeScrubber
              scale={scale}
              counts={stopCounts}
              value={now}
              onChange={(v) => { setPlaying(false); setShowAll(false); setCursor(v) }}
              window={showAll ? null : win}
              ariaLabel={t('map_scrubber_label')}
              onTogglePlay={togglePlay}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** No popover do mapa: "Relações (n)" se o evento tem ligações [[…]] */
function RelationsButton({ event, onShow }: { event: ChroniclerEvent; onShow: () => void }) {
  const { t } = useI18n()
  const rel = useEventRelations(event)
  const n = rel ? rel.cites.length + rel.citedBy.length : 0
  if (!n) return null
  return (
    <button type="button" onClick={onShow} data-testid="map-relations-open"
      className="-mt-1 mb-1.5 mx-3 flex items-center gap-1 font-mono text-2xs text-chr-muted hover:text-chr-primary">
      <Link2 size={10} strokeWidth={1.5} /> {t('map_rel_show')} <span className="text-chr-secondary">{n}</span>
    </button>
  )
}
