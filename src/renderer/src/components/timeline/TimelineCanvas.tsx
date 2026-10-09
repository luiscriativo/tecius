/**
 * TimelineCanvas — Visão horizontal com viewport culling e pixel merging
 *
 * Otimizações para grandes volumes de eventos:
 *
 * 1. Pixel merging (useMemo):
 *    Eventos que ocupariam o mesmo pixel no canvas são fundidos em um
 *    ClusterDot antes do render. Para 1000 eventos em 100 anos ao zoom 1x
 *    (~800px), o máximo possível é 800 grupos — mas normalmente muito menos.
 *
 * 2. Viewport culling:
 *    Rastreia scrollLeft e clientWidth via scroll + ResizeObserver.
 *    Só renderiza grupos cujo pixel X está dentro de
 *    [scrollLeft - buffer, scrollLeft + viewWidth + buffer].
 *    Reduz a contagem de nós no DOM de N para ~viewport_width/canvas_width * N.
 *
 * 3. useMemo em todas as derivações pesadas:
 *    pixelGroups e visibleGroups só recalculam quando deps mudam.
 *
 * Relações [[…]]: com um evento selecionado, arcos ligam ele aos eventos que
 * cita (acima da linha) e aos que citam ele (abaixo), quando estão nesta vista.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { EventDot } from './EventDot'
import { ClusterDot } from './ClusterDot'
import { TimelineAxis } from './TimelineAxis'
import { CompressedAxis } from './CompressedAxis'
import { formatYear, formatSpan } from '../../utils/chroniclerDate'
import type { TimelineData, ChroniclerEvent } from '../../types/chronicler'
import { ymdToT } from '../../utils/mapTime'
import { buildCanvasScale, resolveScaleMode } from '../../utils/timelineScale'
import { useTimelineStore } from '../../stores/useTimelineStore'
import { useAppStore } from '../../stores/useAppStore'
import { cn } from '../../utils/cn'
import { useI18n } from '../../hooks/useI18n'
import { useEventRelations } from '../../hooks/useEventRelations'
import { docKey } from '../../utils/wikiLinks'
import { relationArcs } from '../../utils/relationGeometry'

// ── TimelineMinimap ────────────────────────────────────────────────────────────

/** Data do evento em anos decimais (posição na escala) */
const eventT = (e: ChroniclerEvent): number => ymdToT(e.date.year, e.date.month, e.date.day)

interface PixelGroup { lane: number; px: number; events: ChroniclerEvent[] }

interface TimelineMinimapProps {
  pixelGroups: PixelGroup[]
  canvasWidth: number
  viewLeft: number
  viewWidth: number
  scrollRef: React.RefObject<HTMLDivElement | null>
}

function TimelineMinimap({ pixelGroups, canvasWidth, viewLeft, viewWidth, scrollRef }: TimelineMinimapProps) {
  const { t } = useI18n()
  const barRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const scrollTo = useCallback((clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect || !scrollRef.current) return
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    scrollRef.current.scrollLeft = Math.max(0, fraction * canvasWidth - viewWidth / 2)
  }, [canvasWidth, viewWidth, scrollRef])

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (isDragging.current) scrollTo(e.clientX) }
    const onUp   = () => { isDragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [scrollTo])

  const winL = canvasWidth > 0 ? (viewLeft / canvasWidth) * 100 : 0
  const winW = canvasWidth > 0 ? Math.min(100 - winL, (viewWidth / canvasWidth) * 100) : 100

  return (
    <div
      ref={barRef}
      onMouseDown={(e) => { e.preventDefault(); isDragging.current = true; scrollTo(e.clientX) }}
      className="shrink-0 relative border-t border-chr-subtle overflow-hidden cursor-crosshair"
      style={{ height: 36, userSelect: 'none' }}
      title={t('canvas_minimap_hint')}
    >
      {/* Linha central de referência */}
      <div
        className="absolute inset-x-0 pointer-events-none"
        style={{ height: 1, top: '50%', backgroundColor: 'var(--minimap-center)' }}
      />

      {/* Marcas de eventos */}
      {pixelGroups.map(({ lane, px, events }) => {
        const leftPct = canvasWidth > 0 ? (px / canvasWidth) * 100 : 0
        const isCluster = events.length > 1
        const maxImportance = Math.max(...events.map((e) => (e.frontmatter.importance as number | undefined) ?? 3))
        // Altura proporcional à importância: min 20% → max 80%
        const heightPct = isCluster ? 72 : Math.round(18 + (maxImportance / 5) * 58)
        return (
          <div
            key={`${lane}-${px}`}
            className="absolute pointer-events-none"
            style={{
              left: `${leftPct}%`,
              width: isCluster ? 3 : 1.5,
              height: `${heightPct}%`,
              top: `${(100 - heightPct) / 2}%`,
              transform: 'translateX(-50%)',
              borderRadius: 1,
              backgroundColor: isCluster ? 'var(--minimap-cluster)' : 'var(--minimap-mark)',
            }}
          />
        )
      })}

      {/* Janela do viewport */}
      <div
        className="absolute inset-y-0 pointer-events-none"
        style={{
          left: `${winL}%`,
          width: `${winW}%`,
          backgroundColor: 'var(--minimap-window)',
          borderLeft: '1.5px solid var(--minimap-window-border)',
          borderRight: '1.5px solid var(--minimap-window-border)',
        }}
      />
    </div>
  )
}

// ── TimelineCanvas ─────────────────────────────────────────────────────────────

interface TimelineCanvasProps {
  timeline: TimelineData
  selectedEvent: ChroniclerEvent | null
  onEventClick: (event: ChroniclerEvent) => void
  onEnterSubtimeline: (event: ChroniclerEvent) => void
  onClusterClick: (events: ChroniclerEvent[]) => void
  onContextMenu?: (event: ChroniclerEvent, x: number, y: number) => void
  /** Quando definido, exibe apenas eventos cujos filePaths estão na lista */
  filterPaths?: string[]
  /** Outra timeline sobreposta no mesmo eixo, numa segunda faixa (comparação) */
  compare?: TimelineData | null
}

const MIN_CANVAS_WIDTH = 800
/** Margem interna do conteúdo rolável (px-8) — os pontos e o eixo ficam dentro dela */
const PAD_X = 32

/**
 * Largura real do canvas: nunca menor que a área visível (minWidth: 100%).
 * As contas de zoom precisam usar esta largura — supor 800 × zoom fazia o ponto
 * sob o mouse "escorregar" a cada passo de zoom.
 */
const widthAt = (z: number, view: number) => Math.max(view, MIN_CANVAS_WIDTH * z)
/** Fração da timeline (0..1) sob a coordenada x da área rolável */
const fracAtScroll = (el: HTMLElement, z: number, x: number) =>
  (el.scrollLeft + x - PAD_X) / (widthAt(z, el.clientWidth) - 2 * PAD_X)
/** scrollLeft que deixa a fração f na coordenada x */
const scrollFor = (el: HTMLElement, z: number, f: number, x: number) =>
  PAD_X + f * (widthAt(z, el.clientWidth) - 2 * PAD_X) - x
/** Ao vir do modo Mapa, a janela dele ocupa ~1/3 da largura visível */
const FOCUS_CONTEXT = 3
// Raio de fusão em pixels — o losango tem ~28px de diagonal (20px * √2),
// então 16px garante que dois dots adjacentes nunca se sobreponham.
const DOT_MERGE_RADIUS = 16

export function TimelineCanvas({
  timeline,
  selectedEvent,
  onEventClick,
  onEnterSubtimeline,
  onClusterClick,
  onContextMenu,
  filterPaths,
  compare,
}: TimelineCanvasProps) {
  const { t, nEvents } = useI18n()
  // Memoizado: sem isso, com filtro ativo, pixelGroups era recalculado a cada scroll
  // Eventos sem data ficam fora do eixo (o aviso acima da timeline lista quais são)
  const activeEvents = useMemo(
    () => timeline.events.filter((e) => !e.undated && (!filterPaths || filterPaths.includes(e.filePath))),
    [timeline.events, filterPaths]
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const maxZoomRef = useRef(5)  // atualizado a cada render com o valor dinâmico
  // Ponto que deve continuar sob o cursor/centro depois do zoom. Aplicado depois
  // que o canvas já tem a nova largura (antes disso o navegador limita a rolagem
  // à largura antiga e o ponto "escorrega").
  const pendingAnchor = useRef<{ f: number; x: number } | null>(null)
  useLayoutEffect(() => {
    const el = scrollRef.current, a = pendingAnchor.current
    if (!el || !a) return
    pendingAnchor.current = null
    el.scrollLeft = scrollFor(el, zoom, a.f, a.x)
  }, [zoom])
  const zoomTo = useCallback((nextZoom: (z: number) => number, x?: number) => {
    const el = scrollRef.current
    setZoom((z) => {
      const newZ = nextZoom(z)
      if (el && newZ !== z) {
        const ax = x ?? el.clientWidth / 2
        pendingAnchor.current = { f: fracAtScroll(el, z, ax), x: ax }
      }
      return newZ
    })
  }, [])

  // Estado do viewport (scrollLeft e largura visível)
  const [viewLeft, setViewLeft] = useState(0)
  const [viewWidth, setViewWidth] = useState(800)

  // Rastreia posição de scroll e redimensionamento para o culling
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => {
      setViewLeft(el.scrollLeft)
      setViewWidth(el.clientWidth)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [])

  // O React 17+ registra onWheel como listener PASSIVO por padrão,
  // o que impede chamar preventDefault() (necessário para bloquear o scroll
  // da página ao fazer zoom com Ctrl+scroll).
  // Solução: adicionar o listener nativo com { passive: false } via useEffect.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const el = scrollRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const mouseClientX = e.clientX - rect.left
        const factor = 1 + Math.abs(e.deltaY) * 0.003
        zoomTo((z) => (e.deltaY > 0 ? Math.max(0.5, z / factor) : Math.min(maxZoomRef.current, z * factor)), mouseClientX)
      }
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  },[zoomTo])

  const { min: minDate, max: maxDate } = timeline.dateRange
  const scalePref = useAppStore((st) => st.timelineScale)
  const setScalePref = useAppStore((st) => st.setTimelineScale)

  // Faixas: a timeline aberta e, ao comparar, a outra logo abaixo (mesmo eixo)
  const compareEvents = useMemo(() => (compare ? compare.events.filter((e) => !e.undated) : []), [compare])
  const lanes = useMemo(() => (compare ? [activeEvents, compareEvents] : [activeEvents]), [compare, activeEvents, compareEvents])
  const allTs = useMemo(() => lanes.flat().map(eventT), [lanes])
  // O early return do estado vazio fica DEPOIS de todos os hooks (regras dos hooks):
  // trocar entre uma timeline vazia e outra com eventos sem desmontar o componente
  // (timeline em cache) quebrava o React ("Rendered more hooks than...").
  const hasEvents = Boolean(minDate && maxDate) && activeEvents.length > 0
  const spanYears = allTs.length ? Math.max(...allTs) - Math.min(...allTs) : 0

  // Escala: linear (proporcional ao tempo) ou comprimida (cada intervalo entre
  // datas com eventos pelo logaritmo da duração — tempo geológico e meses na mesma régua)
  const mode = resolveScaleMode(scalePref, spanYears)
  const scale = useMemo(() => buildCanvasScale(allTs, mode), [allTs, mode])
  const [padMinT, padMaxT] = [scale.tAt(0), scale.tAt(1)]

  // Zoom máximo: na linear, ~65px por dia; na comprimida, o teto do canvas (o
  // trecho mais curto é pequeno e precisa de muito zoom para chegar aos dias).
  // O Chromium limita elementos a 2^24 ≈ 16,7M px (acima disso a rolagem trava no fim):
  // usamos 16M px como teto → maxZoom = 16_000_000 / 800 = 20.000×
  const TARGET_PX_PER_DAY = 65
  const MAX_CANVAS_PX = 16_000_000                          // ~16M px — teto seguro no Chromium
  const totalDays = Math.max(padMaxT - padMinT, 1 / 365) * 365.25
  const maxZoom = mode === 'compressed'
    ? MAX_CANVAS_PX / MIN_CANVAS_WIDTH
    : Math.max(5, Math.min(MAX_CANVAS_PX / MIN_CANVAS_WIDTH, (TARGET_PX_PER_DAY * totalDays) / MIN_CANVAS_WIDTH))
  maxZoomRef.current = maxZoom

  const canvasWidth = widthAt(zoom, viewWidth)
  // Eixo linear: trabalha em "sortKeys" (ano × 10000), com a mesma margem da escala
  const pixelsPerSku = canvasWidth / (Math.max(padMaxT - padMinT, 1e-9) * 10000)

  // ── Proximity merging ──────────────────────────────────────────────────────
  // Converte cada evento para sua posição em pixels, ordena, e então agrupa
  // eventos dentro de DOT_MERGE_RADIUS*2 pixels uns dos outros (por faixa).
  // Isso garante que dots nunca se sobreponham visualmente, independente do
  // zoom ou da densidade de eventos. O(N log N) pela ordenação, O(N) na varredura.
  const pixelGroups = useMemo(() => {
    const out: PixelGroup[] = []
    lanes.forEach((laneEvents, lane) => {
      const positioned = laneEvents
        .map((event) => ({ event, px: Math.round(Math.max(0, Math.min(1, scale.frac(eventT(event)))) * canvasWidth) }))
        .sort((a, b) => a.px - b.px)
      let i = 0
      while (i < positioned.length) {
        const anchor = positioned[i].px
        const group: ChroniclerEvent[] = []
        let last = anchor
        while (i < positioned.length && positioned[i].px - anchor <= DOT_MERGE_RADIUS * 2) {
          group.push(positioned[i].event)
          last = positioned[i].px
          i++
        }
        out.push({ lane, px: Math.round((anchor + last) / 2), events: group })
      }
    })
    return out
  }, [lanes, scale, canvasWidth])

  // ── Relações do evento selecionado: arcos até os ligados que estão no eixo ──
  const rel = useEventRelations(selectedEvent)
  const arcs = useMemo(() => {
    if (!rel || !selectedEvent) return []
    const pos = new Map<string, { lane: number; px: number }>()
    for (const g of pixelGroups) for (const e of g.events) pos.set(docKey(e), { lane: g.lane, px: g.px })
    // Um arco por grupo de destino, com a contagem (arcos repetidos viravam um leque ilegível)
    return relationArcs(docKey(selectedEvent), pos, rel.cites.map(docKey), rel.citedBy.map(docKey))
  }, [rel, selectedEvent, pixelGroups])
  // Tamanho da zona dos pontos (os arcos são desenhados em pixels dela)
  const [zone, setZone] = useState<HTMLDivElement | null>(null)
  const [zoneSize, setZoneSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    if (!zone) return
    const ro = new ResizeObserver(() => setZoneSize({ w: zone.clientWidth, h: zone.clientHeight }))
    ro.observe(zone)
    return () => ro.disconnect()
  }, [zone])

  // ── Viewport culling ───────────────────────────────────────────────────────
  // Renderiza apenas grupos dentro do viewport + 1 tela de buffer em cada lado.
  const buffer = Math.max(viewWidth, 400)
  const visibleGroups = useMemo(
    () => pixelGroups.filter(({ px }) => px >= viewLeft - buffer && px <= viewLeft + viewWidth + buffer),
    [pixelGroups, viewLeft, viewWidth, buffer]
  )

  // Mantém o centro da vista ao trocar de escala
  const prevModeRef = useRef(mode)
  useEffect(() => {
    if (prevModeRef.current === mode) return
    prevModeRef.current = mode
    setZoom(1)
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollLeft = 0 })
  }, [mode])

  // ── Vindo do modo Mapa: zoom e rolagem até o momento que estava na régua ──
  const focusGeom = useRef({ scale, maxZoom })
  focusGeom.current = { scale, maxZoom }
  useEffect(() => {
    const { timelineFocus: focus, setTimelineFocus } = useTimelineStore.getState()
    const el = scrollRef.current
    if (!focus || !el || !hasEvents || focus.dirPath !== timeline.dirPath) return
    setTimelineFocus(null)
    const { scale: sc, maxZoom: maxZ } = focusGeom.current
    const f0 = sc.frac(focus.start), f1 = Math.max(sc.frac(focus.end), f0 + 1e-9)
    // A janela do mapa ocupa ~1/FOCUS_CONTEXT da largura visível
    const z = Math.max(1, Math.min(maxZ, el.clientWidth / (MIN_CANVAS_WIDTH * (f1 - f0) * FOCUS_CONTEXT)))
    const target = scrollRef.current
    const fraction = (f0 + f1) / 2
    setZoom(z)
    // Dois quadros: o primeiro aplica a nova largura do canvas, o segundo rola
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (target) target.scrollLeft = scrollFor(target, z, fraction, target.clientWidth / 2)
    }))
  }, [timeline.dirPath, hasEvents])

  if (!hasEvents || !minDate || !maxDate) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-mono text-xs text-chr-muted">{t('canvas_no_events')}</p>
      </div>
    )
  }

  // Datas com margem para o eixo linear (mesmas pontas da escala)
  const paddedMinDate = { ...minDate, sortKey: padMinT * 10000 }
  const paddedMaxDate = { ...maxDate, sortKey: padMaxT * 10000 }

  // Step logarítmico: multiplica/divide por 1.5 por clique
  const ZOOM_FACTOR = 1.5
  const zoomIn = () => zoomTo((z) => Math.min(maxZoomRef.current, z * ZOOM_FACTOR))
  const zoomOut = () => zoomTo((z) => Math.max(0.5, z / ZOOM_FACTOR))

  return (
    <div className="flex-1 flex flex-col overflow-hidden select-none">

      {/* Área de scroll horizontal */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden"
      >
        <div
          style={{ width: canvasWidth, minWidth: '100%' }}
          className="h-full flex flex-col px-8 py-4"
        >
          {/* Zona dos dots: uma faixa por timeline (duas ao comparar) */}
          <div ref={setZone} className="flex-1 relative">
            {arcs.length > 0 && zoneSize.w > 0 && (() => {
              // Só a faixa perto da vista (o canvas pode ter milhões de pixels)
              const x0 = Math.max(0, viewLeft - 32 - viewWidth), w = viewWidth * 3
              const laneH = zoneSize.h / lanes.length
              const X = (px: number) => (px / canvasWidth) * zoneSize.w - x0
              // Muitos arcos: mais claros, para o leque não cobrir a timeline
              const dim = arcs.length > 12 ? 0.45 : 1
              const Y = (lane: number) => (lane + 0.5) * laneH
              return (
                <svg className="absolute top-0 pointer-events-none" style={{ left: x0 }} width={w} height={zoneSize.h} data-testid="relation-arcs">
                  {arcs.map((a) => {
                    const x1 = X(a.from.px), y1 = Y(a.from.lane), x2 = X(a.to.px), y2 = Y(a.to.lane)
                    const lift = Math.min(laneH * 0.28, 12 + Math.abs(x2 - x1) * 0.15) * (a.dir === 'out' ? -1 : 1)
                    const cy = a.from.lane === a.to.lane ? y1 + lift * 2 : (y1 + y2) / 2
                    return (
                      <g key={a.key} data-arc={a.dir}>
                        <path d={`M${x1},${y1} Q${(x1 + x2) / 2},${cy} ${x2},${y2}`} fill="none" stroke="rgb(var(--chronicle-dot))"
                          strokeOpacity={(a.dir === 'out' ? 0.75 : 0.55) * dim} strokeWidth={a.dir === 'out' ? 1.5 : 1.2}
                          strokeDasharray={a.dir === 'in' ? '1.5 3' : undefined} strokeLinecap="round" />
                        <circle cx={x2} cy={y2} r={8} fill="none" stroke="rgb(var(--chronicle-dot))" strokeOpacity={0.6} strokeWidth={1.2} />
                        {/* Quantos ligados há naquele grupo: junto do destino (no topo das curvas os números se amontoavam) */}
                        {a.count > 1 && (
                          <text x={x2} y={y2 + (a.dir === 'out' ? -17 : 25)} textAnchor="middle" className="font-mono" fontSize={9}
                            fill="rgb(var(--chronicle-dot))" data-arc-count={a.count}>{a.count}</text>
                        )}
                      </g>
                    )
                  })}
                </svg>
              )
            })()}
            {lanes.map((_, lane) => (
              <div key={lane} className="absolute inset-x-0" data-lane={lane}
                style={{ top: `${(lane * 100) / lanes.length}%`, height: `${100 / lanes.length}%` }}>
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-timeline-line"
                  style={lane === 1 ? { backgroundColor: 'rgb(var(--chronicle-dot))', opacity: 0.6 } : undefined} />
                {compare && (
                  <span className={cn('absolute top-3 font-mono text-2xs px-1.5 py-0.5 rounded-sm bg-surface border border-chr-subtle z-10',
                    lane === 1 ? 'text-timeline-chronicle-text' : 'text-chr-secondary')}
                    style={{ left: viewLeft + 4 }} data-testid={`lane-label-${lane}`}>
                    {lane === 0 ? timeline.meta.title : compare.meta.title}
                  </span>
                )}

                {/* Só os grupos visíveis no viewport atual */}
                {visibleGroups.filter((g) => g.lane === lane).map(({ px, events: groupEvents }) => {
                  // Converte pixel → porcentagem CSS
                  const left = `${(px / canvasWidth) * 100}%`

                  // Alinhamento do tooltip para evitar sair para fora da área visível
                  const relPos = px / canvasWidth
                  const tooltipAlign = relPos < 0.15 ? 'left' : relPos > 0.85 ? 'right' : 'center'

                  if (groupEvents.length === 1) {
                    const event = groupEvents[0]!
                    return (
                      <EventDot
                        key={event.filePath + event.slug}
                        event={event}
                        isSelected={selectedEvent?.slug === event.slug && selectedEvent?.filePath === event.filePath}
                        onClick={() => onEventClick(event)}
                        onDoubleClick={() => event.hasSubtimeline && onEnterSubtimeline(event)}
                        onContextMenu={(e) => lane === 0 && onContextMenu?.(event, e.clientX, e.clientY)}
                        style={{ left }}
                        tooltipAlign={tooltipAlign}
                      />
                    )
                  }

                  return (
                    <ClusterDot
                      key={`cluster-${lane}-${px}`}
                      events={groupEvents}
                      hasSelected={groupEvents.some((e) => selectedEvent?.slug === e.slug)}
                      onClusterClick={onClusterClick}
                      style={{ left }}
                      tooltipAlign={tooltipAlign}
                    />
                  )
                })}
              </div>
            ))}
          </div>

          {mode === 'compressed' ? (
            <CompressedAxis scale={scale} width={canvasWidth} viewLeft={viewLeft} viewWidth={viewWidth} />
          ) : (
          <TimelineAxis
            minDate={paddedMinDate}
            maxDate={paddedMaxDate}
            width={canvasWidth}
            pixelsPerSku={pixelsPerSku}
            viewLeft={viewLeft}
            viewWidth={viewWidth}
          />
          )}
        </div>
      </div>

      {/* Minimapa de navegação */}
      <TimelineMinimap
        pixelGroups={pixelGroups}
        canvasWidth={canvasWidth}
        viewLeft={viewLeft}
        viewWidth={viewWidth}
        scrollRef={scrollRef}
      />

      {/* Rodapé */}
      {/* O resumo ocupa o espaço que sobra (quebra em 2 linhas se precisar); os controles não quebram */}
      <div className="shrink-0 px-5 py-2 border-t border-chr-subtle flex items-center justify-between gap-4">
        <span className="min-w-0 flex-1 font-mono text-2xs text-chr-muted">
          {nEvents(activeEvents.length)}
          {filterPaths && (
            <span> {t('of_total', { total: timeline.events.length })}</span>
          )}
          {timeline.dateRange.spanYears > 0 && (
            <> · {formatYear(minDate.year)} – {formatYear(maxDate.year)} ({formatSpan(timeline.dateRange.spanYears)})</>
          )}
          {compare && <span className="text-timeline-chronicle-text"> · {t('compare_with_short', { title: compare.meta.title, count: compareEvents.length })}</span>}
          {pixelGroups.length < activeEvents.length && (
            <span>
              {' · '}{t('canvas_unique_positions', { count: pixelGroups.length })}
            </span>
          )}
        </span>

        {/* Escala + controles de zoom */}
        <div className="shrink-0 flex items-center gap-3 whitespace-nowrap">
          <div className="flex items-center border border-chr-subtle rounded-sm overflow-hidden" title={t('scale_hint')} data-testid="scale-toggle">
            {(['linear', 'compressed'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setScalePref(m)} aria-pressed={mode === m}
                className={cn('px-2 py-0.5 font-mono text-2xs transition-colors',
                  mode === m ? 'bg-active text-chr-primary' : 'text-chr-muted hover:text-chr-secondary hover:bg-hover')}>
                {t(m === 'linear' ? 'scale_linear' : 'scale_compressed')}{mode === m && scalePref === 'auto' ? ` · ${t('scale_auto')}` : ''}
              </button>
            ))}
          </div>
          <span className="font-mono text-2xs text-chr-muted hidden 2xl:inline">{t('canvas_zoom_hint')}</span>
          <button
            onClick={zoomOut}
            disabled={zoom <= 0.5}
            className="w-6 h-6 flex items-center justify-center font-mono text-sm text-chr-muted hover:text-chr-primary hover:bg-hover rounded-sm transition-colors disabled:opacity-30 disabled:cursor-default"
            title={t('canvas_zoom_out')}
          >
            −
          </button>
          <button
            onClick={() => zoomTo(() => 1)}
            className="font-mono text-2xs text-chr-muted hover:text-chr-secondary transition-colors w-14 text-center"
            title={t('canvas_zoom_reset')}
          >
            {zoom < 10
              ? `${Math.round(zoom * 100)}%`
              : zoom < 100
              ? `${Math.round(zoom)}x`
              : `${Math.round(zoom / 10) * 10}x`}
          </button>
          <button
            onClick={zoomIn}
            disabled={zoom >= maxZoom}
            className="w-6 h-6 flex items-center justify-center font-mono text-sm text-chr-muted hover:text-chr-primary hover:bg-hover rounded-sm transition-colors disabled:opacity-30 disabled:cursor-default"
            title={t('canvas_zoom_in')}
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}
