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

import { useEffect, useMemo, useRef, useState } from 'react'
import { EventDot } from './EventDot'
import { ClusterDot } from './ClusterDot'
import { TimelineAxis } from './TimelineAxis'
import type { TimelineData, ChroniclerEvent } from '../../types/chronicler'

interface TimelineCanvasProps {
  timeline: TimelineData
  selectedEvent: ChroniclerEvent | null
  onEventClick: (event: ChroniclerEvent) => void
  onEnterSubtimeline: (event: ChroniclerEvent) => void
  onClusterClick: (events: ChroniclerEvent[]) => void
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
  filterPaths,
}: TimelineCanvasProps) {
  const activeEvents = filterPaths
    ? timeline.events.filter((e) => filterPaths.includes(e.filePath))
    : timeline.events
  const scrollRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)

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
        setZoom((z) => Math.max(0.5, Math.min(5, z - e.deltaY * 0.002)))
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

  const canvasWidth = Math.max(MIN_CANVAS_WIDTH, MIN_CANVAS_WIDTH * zoom)

  // ── Proximity merging ──────────────────────────────────────────────────────
  // Converte cada evento para sua posição em pixels, ordena, e então agrupa
  // eventos dentro de DOT_MERGE_RADIUS*2 pixels uns dos outros.
  // Isso garante que dots nunca se sobreponham visualmente, independente do
  // zoom ou da densidade de eventos. O(N log N) pela ordenação, O(N) na varredura.
  const pixelGroups = useMemo(() => {
    const rangeSpan = maxDate.sortKey - minDate.sortKey || 1
    const pMin = minDate.sortKey - rangeSpan * PADDING_PERCENT
    const pMax = maxDate.sortKey + rangeSpan * PADDING_PERCENT

    // 1. Calcula posição em pixels para cada evento e ordena
    const positioned = activeEvents
      .map((event) => {
        const pos = (event.date.sortKey - pMin) / (pMax - pMin)
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
  }, [activeEvents, minDate.sortKey, maxDate.sortKey, canvasWidth])

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

  // Datas com padding para o eixo
  const rangeSpan = maxDate.sortKey - minDate.sortKey || 1
  const paddedMinDate = { ...minDate, sortKey: minDate.sortKey - rangeSpan * PADDING_PERCENT }
  const paddedMaxDate = { ...maxDate, sortKey: maxDate.sortKey + rangeSpan * PADDING_PERCENT }

  const zoomIn  = () => setZoom((z) => Math.min(5, Math.round((z + 0.25) * 100) / 100))
  const zoomOut = () => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))

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
          />
        </div>
      </div>

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
            onClick={() => setZoom(1)}
            className="font-mono text-2xs text-chr-muted hover:text-chr-secondary transition-colors w-10 text-center"
            title="Resetar zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={zoomIn}
            disabled={zoom >= 5}
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
