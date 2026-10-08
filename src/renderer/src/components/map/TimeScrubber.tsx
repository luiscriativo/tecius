/**
 * TimeScrubber — régua de tempo arrastável do modo "Mapa".
 *
 * - Escala comprimida (ver utils/mapTime): eras distantes e meses próximos
 *   cabem na mesma régua; intervalos muito longos ganham a marca de corte.
 * - Histograma de densidade atrás da régua e uma marca por data com eventos —
 *   com datas demais para caberem marcas separadas (milhares), só o histograma.
 * - Rótulos sem sobreposição pela largura do texto: ano; mês só quando dois
 *   rótulos vizinhos cairiam no mesmo ano.
 * - A parte fixa (histograma, marcas, rótulos) não é redesenhada ao mover o cursor.
 * - Arrastar com "ímã" nas datas com eventos; ← → pulam de data em data,
 *   Home/End vão para o início/fim, espaço toca/pausa.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDateParts, formatYear } from '@/utils/chroniclerDate'
import { nextStop, prevStop, tToYMD, type TimeScale, type TimeWindow } from '@/utils/mapTime'

interface TimeScrubberProps {
  scale: TimeScale
  /** Quantos eventos começam em cada parada (mesma ordem de scale.stops) */
  counts: number[]
  value: number
  onChange: (t: number) => void
  window: TimeWindow | null
  ariaLabel: string
  onTogglePlay?: () => void
}

const PAD = 14          // margem lateral da régua (px)
const SNAP_DRAG = 8     // ímã durante o arraste (px)
const SNAP_DROP = 16    // ímã ao soltar (px)
const LABEL_GAP = 12    // espaço mínimo entre dois rótulos (px)
const CHAR_W = 6.8      // largura média de um caractere do rótulo (fonte mono 11px)
const MIN_DOT_SPACING = 4 // abaixo disso (px por data), as marcas viram só histograma
const H = 64            // altura da régua (px)
const AXIS = 34         // altura do eixo dentro dela (px)

const css = {
  accent: 'rgb(var(--chronicle-dot))',
  dot: 'rgb(var(--event-dot))',
  line: 'rgb(var(--border-default))',
  subtle: 'rgb(var(--border-subtle))',
  muted: 'rgb(var(--text-muted))',
  surface: 'rgb(var(--bg-surface))',
}

/** Rótulo curto de uma parada (ano; mês quando há vizinhos no mesmo ano) */
function stopLabel(t: number, withMonth: boolean): string {
  const { year, month } = tToYMD(t)
  return withMonth && year > -10000 ? formatDateParts(year, month) : formatYear(year)
}

export function TimeScrubber({ scale, counts, value, onChange, window: win, ariaLabel, onTogglePlay }: TimeScrubberProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const dragging = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const { stops } = scale
  const inner = Math.max(width - PAD * 2, 1)
  const xOf = (t: number) => PAD + scale.toPos(t) * inner
  const stopXs = useMemo(() => stops.map((s) => PAD + scale.toPos(s) * inner), [stops, scale, inner])

  // Histograma: soma de eventos por faixa de ~6px
  const bins = useMemo(() => {
    const n = Math.max(1, Math.floor(inner / 6))
    const b = new Array<number>(n).fill(0)
    stopXs.forEach((x, i) => { b[Math.min(n - 1, Math.floor(((x - PAD) / inner) * n))] += counts[i] ?? 1 })
    const max = Math.max(1, ...b)
    return b.map((v) => Math.sqrt(v / max))
  }, [stopXs, counts, inner])

  // Rótulos sem sobreposição (pela largura do texto): primeira, última e as
  // demais da esquerda para a direita. Primeiro só anos; onde dois rótulos
  // vizinhos têm o mesmo ano, passam a mostrar o mês e a colisão é refeita.
  const labels = useMemo(() => {
    if (stops.length === 0) return []
    const anchorOf = (x: number): 'start' | 'end' | 'middle' => (x < PAD + 30 ? 'start' : x > PAD + inner - 30 ? 'end' : 'middle')
    const place = (items: Array<{ i: number; text: string }>) => {
      const placed: Array<{ i: number; text: string; x0: number; x1: number }> = []
      for (const it of items) {
        const x = stopXs[it.i], w = it.text.length * CHAR_W, a = anchorOf(x)
        const x0 = a === 'start' ? x : a === 'end' ? x - w : x - w / 2
        const box = { ...it, x0, x1: x0 + w }
        if (placed.every((p) => box.x1 + LABEL_GAP <= p.x0 || box.x0 >= p.x1 + LABEL_GAP)) placed.push(box)
      }
      return placed.sort((a, b) => a.i - b.i)
    }
    const order = stops.length === 1 ? [0] : [0, stops.length - 1, ...stops.map((_, i) => i).slice(1, -1)]
    let placed = place(order.map((i) => ({ i, text: stopLabel(stops[i], false) })))
    const years = placed.map((p) => tToYMD(stops[p.i]).year)
    if (years.some((y, k) => y === years[k - 1] || y === years[k + 1])) {
      placed = place(placed.map((p, k) => ({
        i: p.i, text: stopLabel(stops[p.i], years[k] === years[k - 1] || years[k] === years[k + 1]),
      })))
    }
    return placed.map((p) => ({ x: stopXs[p.i], text: p.text, anchor: anchorOf(stopXs[p.i]) }))
  }, [stops, stopXs, inner])

  // Parte fixa da régua: não depende do cursor, então não é refeita a cada passo
  const showDots = stops.length <= 1 || inner / stops.length >= MIN_DOT_SPACING
  const staticLayer = useMemo(() => (
    <>
      {/* Densidade */}
      {bins.map((v, i) => v > 0 && (
        <rect key={i} x={PAD + (i * inner) / bins.length} width={Math.max(1, inner / bins.length - 1)}
          y={AXIS - 4 - v * 20} height={v * 20} fill={css.subtle} />
      ))}

      {/* Eixo com cortes nos intervalos longos */}
      <line x1={PAD} x2={PAD + inner} y1={AXIS} y2={AXIS} stroke={css.line} strokeWidth={1} />
      {scale.breaks.map((p, i) => {
        const x = PAD + p * inner
        return (
          <g key={i} data-break>
            <rect x={x - 5} y={AXIS - 4} width={10} height={8} fill={css.surface} />
            <line x1={x - 5} x2={x - 1} y1={AXIS + 4} y2={AXIS - 4} stroke={css.muted} strokeWidth={1} />
            <line x1={x + 1} x2={x + 5} y1={AXIS + 4} y2={AXIS - 4} stroke={css.muted} strokeWidth={1} />
          </g>
        )
      })}

      {/* Datas com eventos (com milhares de datas, o histograma já mostra onde estão) */}
      {showDots && stopXs.map((x, i) => (
        <circle key={i} cx={x} cy={AXIS} r={(counts[i] ?? 1) > 1 ? 3.5 : 2.5} fill={css.surface} stroke={css.dot} strokeWidth={1.5} />
      ))}

      {/* Rótulos */}
      {labels.map((l, i) => (
        <text key={i} x={l.x} y={AXIS + 20} textAnchor={l.anchor} fontSize={11} fontFamily="var(--font-mono)" fill={css.muted}>{l.text}</text>
      ))}
    </>
  ), [bins, inner, scale.breaks, showDots, stopXs, counts, labels])

  const tAtX = (clientX: number, snapPx: number): number => {
    const r = ref.current!.getBoundingClientRect()
    const x = clientX - r.left
    let best = -1, bestD = Infinity
    stopXs.forEach((sx, i) => { const d = Math.abs(sx - x); if (d < bestD) { bestD = d; best = i } })
    if (best >= 0 && bestD <= snapPx) return stops[best]
    return scale.fromPos((x - PAD) / inner)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (stops.length === 0) return
    dragging.current = true
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    ref.current?.focus()
    onChange(tAtX(e.clientX, SNAP_DRAG))
  }
  const onPointerMove = (e: React.PointerEvent) => { if (dragging.current) onChange(tAtX(e.clientX, SNAP_DRAG)) }
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return
    dragging.current = false
    onChange(tAtX(e.clientX, SNAP_DROP))
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' && onTogglePlay) { e.preventDefault(); onTogglePlay(); return }
    let t: number | null = null
    if (e.key === 'ArrowRight') t = nextStop(stops, value, win)
    else if (e.key === 'ArrowLeft') t = prevStop(stops, value, win)
    else if (e.key === 'Home') t = stops[0] ?? null
    else if (e.key === 'End') t = stops[stops.length - 1] ?? null
    else return
    e.preventDefault()
    if (t !== null) onChange(t)
  }

  const cx = xOf(value)
  const winX0 = win ? xOf(win.start) : cx
  const winX1 = win ? xOf(win.end) : cx

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={stops[0]}
      aria-valuemax={stops[stops.length - 1]}
      aria-valuenow={value}
      aria-valuetext={win?.label}
      className="relative w-full select-none cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-chr rounded-sm"
      style={{ height: H, touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { dragging.current = false }}
      onKeyDown={onKeyDown}
      data-testid="time-scrubber"
    >
      {width > 0 && (
        <svg width={width} height={H} className="absolute inset-0">
          {staticLayer}

          {/* Janela selecionada */}
          <rect x={Math.min(winX0, winX1) - 1} y={AXIS - 7} width={Math.max(2, Math.abs(winX1 - winX0)) + 2} height={14}
            rx={2} fill={css.accent} fillOpacity={0.18} />

          {/* Cursor */}
          <line x1={cx} x2={cx} y1={4} y2={AXIS + 8} stroke={css.accent} strokeWidth={1.5} />
          <circle cx={cx} cy={AXIS} r={6} fill={css.accent} stroke={css.surface} strokeWidth={2} data-testid="time-cursor" />
        </svg>
      )}
    </div>
  )
}
