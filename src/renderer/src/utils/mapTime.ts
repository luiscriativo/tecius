/**
 * Tempo do mapa — régua arrastável do modo "Mapa".
 *
 * - Tempo contínuo em "anos decimais" (1500.25 = abril de 1500), funciona de
 *   bilhões de anos atrás até hoje sem usar Date.
 * - Escala comprimida: cada intervalo entre datas com eventos ocupa
 *   MIN_GAP + ln(1 + intervalo / 1 mês), amortecido acima de SOFT_CAP.
 *   Intervalos enormes (Pangeia → 1500) viram poucos "passos", e eventos do
 *   mesmo mês continuam separados.
 * - Janela: o cursor seleciona um período alinhado ao calendário (dia, mês,
 *   ano, década...); os eventos que se sobrepõem a ele ficam em destaque.
 */

import { formatDateParts, formatYear } from './chroniclerDate'
import type { ChroniclerDate, ChroniclerEvent } from '../types/chronicler'

export type TimeGranularity = 'auto' | 'day' | 'month' | 'year' | 'decade' | 'century' | 'millennium'
export type WindowGranularity = Exclude<TimeGranularity, 'auto'>

export const GRANULARITIES: TimeGranularity[] = ['auto', 'day', 'month', 'year', 'decade', 'century', 'millennium']

const EPS = 1e-7
const MONTH = 1 / 12
/** Comprimento mínimo de um intervalo não vazio na régua (em "passos") */
const MIN_GAP = 0.6
/** Acima disso (≈ 30 anos) o comprimento cresce 4× mais devagar */
const SOFT_CAP = 6
/** Intervalos a partir disso ganham a marca de corte (╱╱) na régua */
const BREAK_YEARS = 1000

function daysInMonth(y: number, m: number): number {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28
  return [4, 6, 9, 11].includes(m) ? 30 : 31
}

/** (ano, mês?, dia?) → anos decimais */
export function ymdToT(year: number, month?: number, day?: number): number {
  if (!month) return year
  const base = year + (month - 1) * MONTH
  return day ? base + (day - 1) / (12 * daysInMonth(year, month)) : base
}

/** Anos decimais → (ano, mês, dia) do instante */
export function tToYMD(t: number): { year: number; month: number; day: number } {
  const year = Math.floor(t + EPS)
  const f = Math.max(0, (t - year) * 12)
  const month = Math.min(12, Math.floor(f + EPS) + 1)
  const dim = daysInMonth(year, month)
  const day = Math.min(dim, Math.floor(Math.max(0, f - (month - 1)) * dim + EPS) + 1)
  return { year, month, day }
}

/** Fim (exclusivo) da unidade de uma data parcial: "1500" → 1501, "1500-04" → maio */
function unitEnd(d: ChroniclerDate): number {
  if (d.month && d.day) return ymdToT(d.year, d.month, d.day) + 1 / (12 * daysInMonth(d.year, d.month))
  if (d.month) return d.year + d.month * MONTH
  return d.year + 1
}

/** Intervalo [início, fim) que o evento ocupa no tempo (considera `date-end`) */
export function eventSpan(e: ChroniclerEvent): [number, number] {
  const start = ymdToT(e.date.year, e.date.month, e.date.day)
  const end = Math.max(unitEnd(e.date), e.dateEnd ? unitEnd(e.dateEnd) : -Infinity)
  return [start, end]
}

/** Granularidade "automática": a precisão das datas na parada mais próxima (dia → mês) */
export function autoGranularity(dates: ChroniclerDate[]): WindowGranularity {
  return dates.some((d) => d.month) ? 'month' : 'year'
}

// ── Janela ─────────────────────────────────────────────────────────────────

export interface TimeWindow {
  start: number
  end: number
  label: string
}

const SPAN_YEARS: Record<'decade' | 'century' | 'millennium', number> = { decade: 10, century: 100, millennium: 1000 }

/** Período do calendário que contém `t` */
export function windowAt(t: number, gran: WindowGranularity): TimeWindow {
  const { year, month, day } = tToYMD(t)
  if (gran === 'day') {
    const start = ymdToT(year, month, day)
    return { start, end: start + 1 / (12 * daysInMonth(year, month)), label: formatDateParts(year, month, day) }
  }
  if (gran === 'month') {
    const start = ymdToT(year, month)
    return { start, end: start + MONTH, label: formatDateParts(year, month) }
  }
  if (gran === 'year') return { start: year, end: year + 1, label: formatYear(year) }
  const n = SPAN_YEARS[gran]
  const s = Math.floor(year / n) * n
  const a = formatYear(s), b = formatYear(s + n - 1)
  return { start: s, end: s + n, label: a === b ? a : `${a} – ${b}` }
}

export type EventPhase = 'active' | 'past' | 'future'

export function phaseOf(span: [number, number], win: TimeWindow): EventPhase {
  if (span[1] <= win.start + EPS) return 'past'
  if (span[0] >= win.end - EPS) return 'future'
  return 'active'
}

/**
 * Quantas paradas para trás o rastro alcança. Sem limite, numa timeline com
 * milhares de datas o rastro viraria a história inteira cobrindo o mapa.
 */
export const TRAIL_STEPS = 24

/** Opacidade do rastro: esmaece a cada parada que ficou para trás e some depois de TRAIL_STEPS */
export function trailOpacity(stepsBehind: number): number {
  if (stepsBehind > TRAIL_STEPS) return 0
  return Math.max(0.15, 0.55 * Math.pow(0.8, Math.max(0, stepsBehind - 1)))
}

// ── Escala comprimida ──────────────────────────────────────────────────────

export interface TimeScale {
  /** Datas (anos decimais) com pelo menos um evento, em ordem */
  stops: number[]
  /** t → posição 0..1 na régua */
  toPos: (t: number) => number
  /** posição 0..1 → t */
  fromPos: (p: number) => number
  /** Posições (0..1) das marcas de corte nos intervalos muito longos */
  breaks: number[]
}

/** Remove duplicatas (tolerância numérica) e ordena */
export function uniqueStops(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.filter((v, i) => i === 0 || v - sorted[i - 1] > EPS)
}

export function buildTimeScale(values: number[]): TimeScale {
  const stops = uniqueStops(values)
  if (stops.length <= 1) {
    const only = stops[0] ?? 0
    return { stops, toPos: () => 0.5, fromPos: () => only, breaks: [] }
  }
  const lens = stops.slice(1).map((s, i) => {
    const l = Math.log1p((s - stops[i]) / MONTH)
    return MIN_GAP + (l > SOFT_CAP ? SOFT_CAP + (l - SOFT_CAP) / 4 : l)
  })
  const cum = [0]
  for (const l of lens) cum.push(cum[cum.length - 1] + l)
  const total = cum[cum.length - 1]
  const last = stops.length - 1

  // Maior i com stops[i] <= t
  const segOf = (t: number): number => {
    let lo = 0, hi = last - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (stops[mid] <= t) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  const toPos = (t: number): number => {
    if (t <= stops[0]) return 0
    if (t >= stops[last]) return 1
    const i = segOf(t)
    return (cum[i] + ((t - stops[i]) / (stops[i + 1] - stops[i])) * lens[i]) / total
  }

  const fromPos = (p: number): number => {
    const x = Math.min(1, Math.max(0, p)) * total
    if (x <= 0) return stops[0]
    if (x >= total) return stops[last]
    let i = 0
    while (i < last - 1 && cum[i + 1] <= x) i++
    return stops[i] + ((x - cum[i]) / lens[i]) * (stops[i + 1] - stops[i])
  }

  const breaks = lens.flatMap((l, i) =>
    stops[i + 1] - stops[i] >= BREAK_YEARS ? [(cum[i] + l / 2) / total] : [])

  return { stops, toPos, fromPos, breaks }
}

/** Índice da maior parada <= t (ou -1) */
export function stopIndexAt(stops: number[], t: number): number {
  // Busca binária: o mapa chama isto para cada evento a cada passo da régua
  let lo = 0, hi = stops.length - 1, idx = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (stops[mid] <= t + EPS) { idx = mid; lo = mid + 1 } else hi = mid - 1
  }
  return idx
}

/** Próxima data com eventos; com janela, a primeira depois dela (pula as do mesmo mês etc.) */
export function nextStop(stops: number[], t: number, win?: TimeWindow | null): number | null {
  const after = win ? Math.max(t, win.end - EPS) : t
  return stops.find((s) => s > after + EPS) ?? null
}

/** Data anterior com eventos; com janela, a última antes dela */
export function prevStop(stops: number[], t: number, win?: TimeWindow | null): number | null {
  const before = win ? Math.min(t, win.start) : t
  for (let i = stops.length - 1; i >= 0; i--) if (stops[i] < before - EPS) return stops[i]
  return null
}
