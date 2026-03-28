import { useMemo } from 'react'
import { calcTimelinePosition } from '../../utils/chroniclerDate'
import type { ChroniclerDate } from '../../types/chronicler'

interface TimelineAxisProps {
  minDate: ChroniclerDate
  maxDate: ChroniclerDate
  width: number
  pixelsPerSku: number
  viewLeft: number
  viewWidth: number
}

const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const NICE_YEAR_INTERVALS = [1, 2, 5, 10, 25, 50, 100, 200, 500, 1000]

function getDaysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate()
}

// ── Geometria da régua ────────────────────────────────────────────────────────
//
// O border-t superior é a linha do eixo da timeline.
// Todos os ticks descem a partir daí, com alturas proporcionais:
//
//  ─────────────────────── ← border-t (linha do eixo da timeline)
//  │  │         │  │  │    ← tick do ANO (mais alto)
//  │  │   ║  ║  │  ║  │    ← tick do MÊS (médio, âmbar)
//  │  │  ╷╷╷╷╷╷ │ ╷╷╷ │   ← tick do DIA (curto)
//  ─────────────────────── ← LABEL_ZONE_TOP
//  1300  J F M A M  2 3 4  ← labels (anos à esquerda do tick, meses/dias abaixo)
//

// Tamanho da zona de labels no fundo da régua
const LABEL_ZONE_H = 18

export function TimelineAxis({
  minDate,
  maxDate,
  width,
  pixelsPerSku,
  viewLeft,
  viewWidth,
}: TimelineAxisProps) {
  const totalRange    = maxDate.sortKey - minDate.sortKey || 1
  const pixelsPerYear = pixelsPerSku * 10000

  // Gatilhos de zoom — alinhados com a referência
  const showMonths     = pixelsPerYear > 200
  const showDayTicks   = pixelsPerYear > 3000
  const showDayNumbers = pixelsPerYear > 4000

  // Range visível com buffer de 10%
  const bufferPx  = viewWidth * 0.1
  const visMinSk  = minDate.sortKey + ((viewLeft - bufferPx) / width) * totalRange
  const visMaxSk  = minDate.sortKey + ((viewLeft + viewWidth + bufferPx) / width) * totalRange
  const startYear = Math.floor(visMinSk / 10000)
  const endYear   = Math.ceil(visMaxSk  / 10000)

  function toLeft(sk: number): string {
    return `${calcTimelinePosition(sk, minDate.sortKey, maxDate.sortKey) * 100}%`
  }

  // ── Altura total da régua ─────────────────────────────────────────────────
  const rulerHeight = showDayNumbers ? 88 : showDayTicks ? 76 : showMonths ? 64 : 50

  // Zona de ticks: do topo até onde os labels começam
  const tickZoneH    = rulerHeight - LABEL_ZONE_H
  const labelZoneTop = tickZoneH

  // Alturas dos ticks (baseadas nas proporções do design de referência):
  // Referência: século h-32(128), ano h-16(64), mês h-10(40), dia h-2(8)
  // Razões: século=2x, mês=0.625x, dia=0.125x do ano
  const yearTickH    = tickZoneH                               // 100% — ano ocupa toda a zona
  const centuryTickH = Math.min(rulerHeight, Math.round(tickZoneH * 1.0)) // mesmo (já é o max)
  const monthTickH   = Math.round(tickZoneH * 0.60)           // 60% da zona
  const dayTickH     = Math.round(tickZoneH * 0.14)           // 14% da zona

  // Tops dos ticks (todos terminam em labelZoneTop, crescem para cima)
  const monthTickTop = labelZoneTop - monthTickH
  const dayTickTop   = labelZoneTop - dayTickH

  // ── Marcadores de anos ────────────────────────────────────────────────────
  const yearMarkers = useMemo(() => {
    const span = endYear - startYear || 1
    const targetCount = Math.max(2, Math.floor((viewWidth * 1.2) / 80))
    const rawInterval = span / targetCount
    const interval = NICE_YEAR_INTERVALS.find(n => n >= rawInterval) ?? 1000
    const out: Array<{ year: number; sortKey: number }> = []
    const first = Math.ceil(startYear / interval) * interval
    for (let y = first; y <= endYear; y += interval) {
      out.push({ year: y, sortKey: y * 10000 + 101 })
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.round(visMinSk), Math.round(visMaxSk), pixelsPerYear, viewWidth])

  // ── Marcadores de meses ───────────────────────────────────────────────────
  // Posição proporcional: sk = yearBase + round((m/12) × 10000)
  // Janeiro incluso como label (sem tick extra) para dar contexto nos dias.
  const monthMarkers = useMemo(() => {
    if (!showMonths) return []
    const buffer = (10000 / 12) * 2
    const out: Array<{
      year: number; month: number; sortKey: number
      label: string; isJan: boolean
    }> = []
    for (let y = startYear; y <= endYear; y++) {
      const base = y * 10000 + 101
      for (let m = 0; m < 12; m++) {
        const isJan = m === 0
        const sk = base + Math.round((m / 12) * 10000)
        if (sk < visMinSk - buffer || sk > visMaxSk + buffer) continue
        // Tick de Janeiro é omitido (o tick do ano já está lá)
        // Label de Janeiro só aparece quando mostrando dias (para contexto)
        if (isJan && !showDayTicks) continue
        out.push({ year: y, month: m, sortKey: sk, label: MONTH_INITIALS[m] ?? '', isJan })
      }
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.round(visMinSk), Math.round(visMaxSk), showMonths, showDayTicks])

  // ── Marcadores de dias ────────────────────────────────────────────────────
  // Smart step: mostra 1, 2, 5 ou 10 dias conforme o espaço disponível.
  // Anti-colisão: suprime o label do dia se ele está a menos de MIN_GAP_PX
  // de qualquer fronteira de mês (início ou fim), evitando sobreposição com
  // letras/círculos de meses. O TICK ainda aparece — apenas o número some.
  const dayMarkers = useMemo(() => {
    if (!showDayTicks) return []
    const buffer = (10000 / 365) * 3
    // Distância mínima em pixels de uma fronteira de mês para mostrar o número
    const MIN_GAP_PX = 16
    const out: Array<{ day: number; sortKey: number; showLabel: boolean }> = []

    for (let y = startYear; y <= endYear; y++) {
      const base = y * 10000 + 101
      for (let m = 0; m < 12; m++) {
        const days = getDaysInMonth(y, m)
        const monthPx = pixelsPerYear / 12
        const dayPx   = monthPx / days

        // Passo inteligente (referência): menos marcadores quando há pouco espaço
        const step = dayPx < 12 ? 10 : dayPx < 25 ? 5 : dayPx < 45 ? 2 : 1
        const labelAllowed = showDayNumbers && (dayPx * step > 22)

        for (let d = 1; d <= days; d += step) {
          if (d === 1) continue // dia 1 fica com o tick/label do mês

          const sk = base + Math.round(((m / 12) + ((d - 1) / (days * 12))) * 10000)
          if (sk < visMinSk - buffer || sk > visMaxSk + buffer) continue

          // Anti-colisão: calcula distância em pixels até a fronteira de mês mais próxima
          const distToMonthStart = (d - 1) * dayPx          // px desde o início do mês
          const distToMonthEnd   = (days - d + 1) * dayPx   // px até o início do mês seguinte
          const tooClose = distToMonthStart < MIN_GAP_PX || distToMonthEnd < MIN_GAP_PX

          out.push({ day: d, sortKey: sk, showLabel: labelAllowed && !tooClose })
        }
      }
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.round(visMinSk), Math.round(visMaxSk), showDayTicks, showDayNumbers, pixelsPerYear])

  return (
    <div
      className="relative shrink-0 border-t border-zinc-700/40 overflow-hidden"
      style={{ height: rulerHeight, backgroundColor: 'transparent' }}
    >
      {/* ── Anos ──────────────────────────────────────────────────────────── */}
      {yearMarkers.map(({ year, sortKey }) => {
        const left    = toLeft(sortKey)
        const isCent  = year % 100 === 0
        const tickColor = isCent ? 'rgba(245,158,11,0.75)' : 'rgb(63,63,70)'   // amber-500 : zinc-700
        const labelColor = isCent ? '#f59e0b' : '#a1a1aa'                       // amber-500 : zinc-400

        return [
          // Tick do ano (altura total da zona de ticks)
          <div
            key={`yt-${year}`}
            className="absolute top-0 w-px"
            style={{
              left,
              height: yearTickH,
              backgroundColor: tickColor,
              boxShadow: isCent ? '0 0 8px rgba(245,158,11,0.25)' : 'none',
            }}
          />,

          // Rótulo do ano — à DIREITA do tick (igual ao design de referência)
          <span
            key={`yl-${year}`}
            className="absolute font-mono text-[11px] font-bold select-none whitespace-nowrap leading-none"
            style={{ left, top: 4, marginLeft: 3, color: labelColor }}
          >
            {year}
          </span>,
        ]
      })}

      {/* ── Meses ─────────────────────────────────────────────────────────── */}
      {showMonths && monthMarkers.map(({ year, month, sortKey, label, isJan }) => {
        const left = toLeft(sortKey)
        return [
          // Tick do mês em âmbar (não aparece em Janeiro — o do ano já está lá)
          !isJan && (
            <div
              key={`mt-${year}-${month}`}
              className="absolute w-px"
              style={{
                left,
                top: monthTickTop,
                height: monthTickH,
                backgroundColor: 'rgba(245,158,11,0.70)',  // amber-500/70
              }}
            />
          ),

          // Label do mês: Janeiro tem indicador circular (referência)
          isJan ? (
            <div
              key={`ml-${year}-${month}`}
              className="absolute flex items-center justify-center pointer-events-none"
              style={{
                left,
                top: labelZoneTop + 1,
                width: 20,
                height: 20,
                marginLeft: -10,
                borderRadius: '50%',
                border: '1px solid rgb(63,63,70)',          // zinc-700
                backgroundColor: '#060606',
              }}
            >
              <span className="font-mono text-[9px] font-bold text-zinc-400 leading-none select-none">
                {label}
              </span>
            </div>
          ) : (
            <span
              key={`ml-${year}-${month}`}
              className="absolute font-mono text-[10px] font-bold text-zinc-400 select-none leading-none pointer-events-none"
              style={{ left, top: labelZoneTop + 3, marginLeft: 2 }}
            >
              {label}
            </span>
          ),
        ]
      })}

      {/* ── Dias ──────────────────────────────────────────────────────────── */}
      {showDayTicks && dayMarkers.map(({ day, sortKey, showLabel }) => {
        const left = toLeft(sortKey)
        return [
          // Tick do dia (curto, zinc-700)
          <div
            key={`dt-${sortKey}`}
            className="absolute w-px"
            style={{
              left,
              top: dayTickTop,
              height: dayTickH,
              backgroundColor: 'rgb(63,63,70)',   // zinc-700
            }}
          />,

          // Número do dia
          showLabel && (
            <span
              key={`dl-${sortKey}`}
              className="absolute font-mono text-[9px] text-zinc-500 select-none leading-none pointer-events-none"
              style={{ left, top: labelZoneTop + 3, marginLeft: 1 }}
            >
              {day}
            </span>
          ),
        ]
      })}
    </div>
  )
}
