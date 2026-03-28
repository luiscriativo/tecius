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
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EventDot } from './EventDot'
import { ClusterDot } from './ClusterDot'
import { TimelineAxis } from './TimelineAxis'
import { propSortKey } from '../../utils/chroniclerDate'
import type { TimelineData, ChroniclerEvent } from '../../types/chronicler'

// ── TimelineMinimap ────────────────────────────────────────────────────────────

interface TimelineMinimapProps {
  pixelGroups: Map<number, ChroniclerEvent[]>
  canvasWidth: number
  viewLeft: number
  viewWidth: number
  scrollRef: React.RefObject<HTMLDivElement | null>
}

function TimelineMinimap({ pixelGroups, canvasWidth, viewLeft, viewWidth, scrollRef }: TimelineMinimapProps) {
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
      title="Minimapa — clique ou arraste para navegar"
    >
      {/* Linha central de referência */}
      <div
        className="absolute inset-x-0 pointer-events-none"
        style={{ height: 1, top: '50%', backgroundColor: 'rgba(255,255,255,0.04)' }}
      />

      {/* Marcas de eventos */}
      {Array.from(pixelGroups.entries()).map(([px, events]) => {
        const leftPct = canvasWidth > 0 ? (px / canvasWidth) * 100 : 0
        const isCluster = events.length > 1
        const maxImportance = Math.max(...events.map((e) => (e.frontmatter.importance as number | undefined) ?? 3))
        // Altura proporcional à importância: min 20% → max 80%
        const heightPct = isCluster ? 72 : Math.round(18 + (maxImportance / 5) * 58)
        return (
          <div
            key={px}
            className="absolute pointer-events-none"
            style={{
              left: `${leftPct}%`,
              width: isCluster ? 3 : 1.5,
              height: `${heightPct}%`,
              top: `${(100 - heightPct) / 2}%`,
              transform: 'translateX(-50%)',
              borderRadius: 1,
              backgroundColor: isCluster
                ? 'rgba(220, 150, 70, 0.8)'
                : 'rgba(160, 160, 185, 0.6)',
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
          backgroundColor: 'rgba(110, 110, 190, 0.08)',
          borderLeft: '1.5px solid rgba(140, 140, 220, 0.45)',
          borderRight: '1.5px solid rgba(140, 140, 220, 0.45)',
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
}

const MIN_CANVAS_WIDTH = 800
const PADDING_PERCENT = 0.05
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
}: TimelineCanvasProps) {
  const activeEvents = filterPaths
    ? timeline.events.filter((e) => filterPaths.includes(e.filePath))
    : timeline.events
  const scrollRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const maxZoomRef = useRef(5)  // atualizado a cada render com o valor dinâmico

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
        const mouseXInCanvas = el.scrollLeft + (e.clientX - rect.left)
        const mouseClientX = e.clientX - rect.left
        setZoom((z) => {
          const factor = 1 + Math.abs(e.deltaY) * 0.003
          const newZ = e.deltaY > 0
            ? Math.max(0.5, z / factor)
            : Math.min(maxZoomRef.current, z * factor)
          const fraction = mouseXInCanvas / (MIN_CANVAS_WIDTH * z)
          requestAnimationFrame(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollLeft = fraction * MIN_CANVAS_WIDTH * newZ - mouseClientX
            }
          })
          return newZ
        })
      }
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  const { min: minDate, max: maxDate } = timeline.dateRange

  if (!minDate || !maxDate || activeEvents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-mono text-xs text-chr-muted">Nenhum evento nesta timeline</p>
      </div>
    )
  }

  // ── SortKeys proporcionais ─────────────────────────────────────────────────
  // O sortKey nativo (YYYYMMDD) distribui 12 meses em apenas 12% do espaço do ano
  // (offsets 100–1299 de 10000), deixando 88% vazio. Isso faz eventos de Dezembro
  // aparecerem perto de Fevereiro na régua proporcional.
  //
  // Usamos propSortKey() que distribui meses uniformemente ao longo do ano inteiro,
  // mantendo o mesmo espaço de coordenadas (year × 10000) mas com distribuição correta.
  // Todos os cálculos de posição — eventos E régua — usam esta escala.
  const propMin = propSortKey(minDate.year, minDate.month, minDate.day)
  const propMax = propSortKey(maxDate.year, maxDate.month, maxDate.day)

  // Zoom máximo dinâmico: garante ~65px por dia no canvas a zoom máximo.
  // Esse valor permite que step=1 seja atingido (requer dayPx ≥ 45),
  // exibindo TODOS os dias do mês com números legíveis — igual ao design de referência.
  //
  // Limite físico: navegadores suportam elementos CSS até ~33M px.
  // Usamos 24M px como teto seguro → maxZoom = 24_000_000 / 800 = 30.000×
  // Para timelines de ~1000 anos isso dá dayPx ≈ 65px (step=1, todos os dias visíveis).
  const SKU_PER_DAY = 10000 / 365.25
  const totalSku = (propMax - propMin) || 1
  const totalDays = totalSku / SKU_PER_DAY
  const TARGET_PX_PER_DAY = 65
  const MAX_CANVAS_PX = 24_000_000                          // ~24M px — teto seguro para CSS
  const maxZoom = Math.max(5, Math.min(
    MAX_CANVAS_PX / MIN_CANVAS_WIDTH,                       // 30.000× (limite do canvas)
    (TARGET_PX_PER_DAY * totalDays) / MIN_CANVAS_WIDTH      // calculado pela densidade de dias
  ))
  maxZoomRef.current = maxZoom

  const canvasWidth = Math.max(MIN_CANVAS_WIDTH, MIN_CANVAS_WIDTH * zoom)
  const pixelsPerSku = canvasWidth / totalSku

  // ── Proximity merging ──────────────────────────────────────────────────────
  // Converte cada evento para sua posição em pixels, ordena, e então agrupa
  // eventos dentro de DOT_MERGE_RADIUS*2 pixels uns dos outros.
  // Isso garante que dots nunca se sobreponham visualmente, independente do
  // zoom ou da densidade de eventos. O(N log N) pela ordenação, O(N) na varredura.
  const pixelGroups = useMemo(() => {
    const rangeSpan = propMax - propMin || 1
    const pMin = propMin - rangeSpan * PADDING_PERCENT
    const pMax = propMax + rangeSpan * PADDING_PERCENT

    // 1. Calcula posição proporcional em pixels para cada evento e ordena
    const positioned = activeEvents
      .map((event) => {
        const evSk = propSortKey(event.date.year, event.date.month, event.date.day)
        const pos = (evSk - pMin) / (pMax - pMin)
        const px = Math.round(Math.max(0, Math.min(1, pos)) * canvasWidth)
        return { px, event }
      })
      .sort((a, b) => a.px - b.px)

    // 2. Varredura greedy: inicia um grupo no primeiro evento não agrupado,
    //    absorve todos os eventos dentro de DOT_MERGE_RADIUS*2 px do anchor,
    //    posiciona o grupo no centro do span coletado.
    const map = new Map<number, ChroniclerEvent[]>()
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
      const center = Math.round((anchor + last) / 2)
      map.set(center, group)
    }
    return map
  }, [activeEvents, propMin, propMax, canvasWidth])

  // ── Viewport culling ───────────────────────────────────────────────────────
  // Renderiza apenas grupos dentro do viewport + 1 tela de buffer em cada lado.
  const buffer = Math.max(viewWidth, 400)
  const visibleGroups = useMemo(
    () =>
      Array.from(pixelGroups.entries()).filter(
        ([px]) => px >= viewLeft - buffer && px <= viewLeft + viewWidth + buffer
      ),
    [pixelGroups, viewLeft, viewWidth, buffer]
  )

  // Datas com padding para o eixo — usa sortKeys proporcionais para consistência
  const rangeSpan = propMax - propMin || 1
  const paddedMinDate = { ...minDate, sortKey: propMin - rangeSpan * PADDING_PERCENT }
  const paddedMaxDate = { ...maxDate, sortKey: propMax + rangeSpan * PADDING_PERCENT }

  // Step logarítmico: multiplica/divide por 1.5 por clique
  const ZOOM_FACTOR = 1.5
  const zoomIn = () => setZoom((z) => {
    const newZ = Math.min(maxZoomRef.current, z * ZOOM_FACTOR)
    const el = scrollRef.current
    if (el) {
      const centerFraction = (el.scrollLeft + el.clientWidth / 2) / (MIN_CANVAS_WIDTH * z)
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollLeft = centerFraction * MIN_CANVAS_WIDTH * newZ - scrollRef.current.clientWidth / 2
        }
      })
    }
    return newZ
  })
  const zoomOut = () => setZoom((z) => {
    const newZ = Math.max(0.5, z / ZOOM_FACTOR)
    const el = scrollRef.current
    if (el) {
      const centerFraction = (el.scrollLeft + el.clientWidth / 2) / (MIN_CANVAS_WIDTH * z)
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollLeft = centerFraction * MIN_CANVAS_WIDTH * newZ - scrollRef.current.clientWidth / 2
        }
      })
    }
    return newZ
  })

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
          {/* Zona dos dots */}
          <div className="flex-1 relative flex items-center">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-timeline-line" />

            {/* Só os grupos visíveis no viewport atual */}
            {visibleGroups.map(([px, groupEvents]) => {
              // Converte pixel → porcentagem CSS
              const left = `${(px / canvasWidth) * 100}%`

              // Alinhamento do tooltip para evitar sair para fora da área visível
              const relPos = px / canvasWidth
              const tooltipAlign = relPos < 0.15 ? 'left' : relPos > 0.85 ? 'right' : 'center'

              if (groupEvents.length === 1) {
                const event = groupEvents[0]!
                return (
                  <EventDot
                    key={event.slug}
                    event={event}
                    isSelected={selectedEvent?.slug === event.slug}
                    onClick={() => onEventClick(event)}
                    onDoubleClick={() => event.hasSubtimeline && onEnterSubtimeline(event)}
                    onContextMenu={(e) => onContextMenu?.(event, e.clientX, e.clientY)}
                    style={{ left }}
                    tooltipAlign={tooltipAlign}
                  />
                )
              }

              return (
                <ClusterDot
                  key={`cluster-px-${px}`}
                  events={groupEvents}
                  hasSelected={groupEvents.some((e) => selectedEvent?.slug === e.slug)}
                  onClusterClick={onClusterClick}
                  style={{ left }}
                  tooltipAlign={tooltipAlign}
                />
              )
            })}
          </div>

          <TimelineAxis
            minDate={paddedMinDate}
            maxDate={paddedMaxDate}
            width={canvasWidth}
            pixelsPerSku={pixelsPerSku}
            viewLeft={viewLeft}
            viewWidth={viewWidth}
          />
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
      <div className="shrink-0 px-5 py-2 border-t border-chr-subtle flex items-center justify-between">
        <span className="font-mono text-2xs text-chr-muted">
          {activeEvents.length} evento{activeEvents.length !== 1 ? 's' : ''}
          {filterPaths && (
            <span className="opacity-60"> de {timeline.events.length}</span>
          )}
          {timeline.dateRange.spanYears > 0 && (
            <> · {minDate.year} – {maxDate.year} ({timeline.dateRange.spanYears} anos)</>
          )}
          {pixelGroups.size < activeEvents.length && (
            <span className="opacity-50">
              {' · '}{pixelGroups.size} posições únicas
            </span>
          )}
        </span>

        {/* Controles de zoom */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-2xs text-chr-muted opacity-40 hidden sm:inline">Ctrl+scroll para zoom</span>
          <button
            onClick={zoomOut}
            disabled={zoom <= 0.5}
            className="w-6 h-6 flex items-center justify-center font-mono text-sm text-chr-muted hover:text-chr-primary hover:bg-hover rounded-sm transition-colors disabled:opacity-30 disabled:cursor-default"
            title="Diminuir zoom"
          >
            −
          </button>
          <button
            onClick={() => {
              const el = scrollRef.current
              const centerFraction = el ? (el.scrollLeft + el.clientWidth / 2) / (MIN_CANVAS_WIDTH * zoom) : 0.5
              setZoom(1)
              requestAnimationFrame(() => {
                if (scrollRef.current) {
                  scrollRef.current.scrollLeft = centerFraction * MIN_CANVAS_WIDTH - scrollRef.current.clientWidth / 2
                }
              })
            }}
            className="font-mono text-2xs text-chr-muted hover:text-chr-secondary transition-colors w-14 text-center"
            title="Resetar zoom"
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
            title="Aumentar zoom"
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}
