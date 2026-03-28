import { ChroniclerDate, DatePrecision } from '../types/chronicler'

const MONTHS_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

const MONTHS_LONG = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/**
 * Parseia uma string de data do frontmatter YAML em ChroniclerDate.
 * Suporta: "1789", "1789-07", "1789-07-14"
 * Com hora opcional separada: time = "10:30"
 *
 * Nao usa new Date() internamente — seguro para datas historicas.
 */
export function parseChroniclerDate(
  dateStr: string,
  timeStr?: string,
  precision?: DatePrecision,
  circa?: boolean,
): ChroniclerDate {
  const str = String(dateStr).trim()
  const parts = str.split('-').map(Number)

  const year = parts[0] ?? 0
  const month = parts[1]  // 1-12 ou undefined
  const day = parts[2]    // 1-31 ou undefined

  let hour: number | undefined
  let minute: number | undefined

  if (timeStr) {
    const timeParts = timeStr.split(':').map(Number)
    hour = timeParts[0]
    minute = timeParts[1] ?? 0
  }

  // Detecta precisao automaticamente se nao fornecida
  const detectedPrecision: DatePrecision = precision ?? (
    hour !== undefined ? 'hour' :
    day   !== undefined ? 'day'  :
    month !== undefined ? 'month' : 'year'
  )

  // sortKey: numero inteiro para ordenacao YYYYMMDD
  const sortKey =
    year * 10000 +
    (month ?? 0) * 100 +
    (day ?? 0)

  // Display completo
  const display = formatDisplay(year, month, day, hour, minute, detectedPrecision)
  const displayShort = formatDisplayShort(year, month, day, detectedPrecision)

  return {
    year,
    month,
    day,
    hour,
    minute,
    precision: detectedPrecision,
    circa: circa ?? false,
    sortKey,
    display,
    displayShort,
  }
}

function formatDisplay(
  year: number,
  month?: number,
  day?: number,
  hour?: number,
  minute?: number,
  precision?: DatePrecision,
): string {
  if (precision === 'year' || !month) return `${year}`
  if (precision === 'month' || !day) return `${MONTHS_LONG[month - 1]} de ${year}`

  const dayStr = String(day).padStart(2, '0')
  const monthStr = MONTHS_SHORT[month - 1]
  const base = `${dayStr} ${monthStr} ${year}`

  if (hour !== undefined && minute !== undefined) {
    return `${base}, ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }
  return base
}

function formatDisplayShort(
  year: number,
  month?: number,
  day?: number,
  precision?: DatePrecision,
): string {
  if (precision === 'year' || !month) return String(year)
  if (precision === 'month' || !day) return `${MONTHS_SHORT[month - 1]} ${year}`
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
}

/**
 * Converte (year, month?, day?) para sortKey PROPORCIONAL.
 *
 * O formato YYYYMMDD original distribui os 12 meses apenas nos primeiros
 * 12% do espaço de cada ano (offset 101–1299 de 10000), deixando 88% vazio.
 * Isso faz com que eventos de Dezembro apareçam perto de Fevereiro na régua.
 *
 * O sortKey proporcional distribui os meses uniformemente ao longo do ano inteiro:
 *   Janeiro  → base + 0
 *   Julho    → base + 5000
 *   Dezembro → base + 9167
 *   ...
 *
 * Deve ser usado em TODOS os cálculos de posição: eventos E régua.
 */
export function propSortKey(year: number, month?: number, day?: number): number {
  if (!month) return year * 10000
  const m0  = month - 1                          // 0-based (Jan=0, Dez=11)
  const base = year * 10000 + 101
  if (!day) return base + Math.round((m0 / 12) * 10000)
  const dIM  = new Date(year, month, 0).getDate() // dias no mês (month 1-based ok)
  return base + Math.round(((m0 / 12) + ((day - 1) / (dIM * 12))) * 10000)
}

/**
 * Calcula a posicao proporcional de um evento na timeline (0 a 1).
 * Baseado em sortKey para nao depender de Date.
 */
export function calcTimelinePosition(
  eventSortKey: number,
  minSortKey: number,
  maxSortKey: number,
): number {
  if (maxSortKey === minSortKey) return 0.5
  return (eventSortKey - minSortKey) / (maxSortKey - minSortKey)
}

/**
 * Verifica se duas datas sao no mesmo ano (para agrupamento visual).
 */
export function isSameYear(a: ChroniclerDate, b: ChroniclerDate): boolean {
  return a.year === b.year
}

/**
 * Retorna o span em anos entre duas datas.
 */
export function yearSpan(min: ChroniclerDate, max: ChroniclerDate): number {
  return Math.abs(max.year - min.year)
}

/**
 * Gera a lista de anos para o eixo da timeline.
 * Distribui marcadores proporcionalmente, maximo ~10 ticks visiveis.
 */
export function generateTimelineTicks(
  minYear: number,
  maxYear: number,
  targetCount: number = 8,
): number[] {
  const span = maxYear - minYear
  if (span <= 0) return [minYear]

  // Escolhe um intervalo "bonito" (1, 2, 5, 10, 25, 50, 100, 250, 500...)
  const rawInterval = span / targetCount
  const niceIntervals = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000]
  const interval = niceIntervals.find(n => n >= rawInterval) ?? 1000

  const ticks: number[] = []
  const start = Math.ceil(minYear / interval) * interval
  for (let y = start; y <= maxYear; y += interval) {
    ticks.push(y)
  }
  return ticks
}

// ── Eixo adaptativo ──────────────────────────────────────────────────────────

/** Decompõe sortKey em { year, month, day } */
export function sortKeyToYMD(sk: number): { year: number; month: number; day: number } {
  const year = Math.floor(sk / 10000)
  const rem  = sk % 10000
  const rawMonth = Math.floor(rem / 100)
  const rawDay   = rem % 100
  const month = rawMonth < 1 ? 1 : rawMonth > 12 ? 12 : rawMonth
  const day   = rawDay   < 1 ? 1 : rawDay   > 28  ? 28  : rawDay
  return { year, month, day }
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

function daysInMonth(y: number, m: number): number {
  const d = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return m === 2 && isLeapYear(y) ? 29 : (d[m] ?? 30)
}

// Reutiliza MONTHS_SHORT já definido acima
const AXIS_MONTHS = ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                          'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Granularidade do eixo de acordo com pixels/dia */
export type AxisGranularity = 'century' | 'decade' | 'year' | 'month' | 'day'

/**
 * Determina a granularidade ideal para o eixo.
 * pixelsPerSortKeyUnit = canvasWidth / (maxSortKey - minSortKey)
 * 1 dia ≈ 10000/365.25 ≈ 27.4 unidades de sortKey
 */
export function getAxisGranularity(pixelsPerSortKeyUnit: number): AxisGranularity {
  const SKU_PER_DAY = 10000 / 365.25
  const pxPerDay = pixelsPerSortKeyUnit * SKU_PER_DAY
  if (pxPerDay >= 12)  return 'day'
  if (pxPerDay >= 0.8) return 'month'
  if (pxPerDay >= 0.04) return 'year'
  if (pxPerDay >= 0.008) return 'decade'
  return 'century'
}

export interface AxisTick {
  sortKey: number
  label: string
  isMajor: boolean  // ex: janeiro num eixo de meses, ou 1.º do mês num eixo de dias
}

/**
 * Gera os ticks visíveis do eixo adaptativo.
 * Só gera ticks dentro de [visMinSk, visMaxSk] (range visível + buffer),
 * evitando criar dezenas de milhares de nós para uma timeline de séculos em dias.
 */
export function generateAxisTicks(
  visMinSk: number,   // sortKey do início do range visível (com buffer)
  visMaxSk: number,   // sortKey do final do range visível (com buffer)
  pixelsPerSku: number, // pixels por sortKey unit
  granularity: AxisGranularity,
): AxisTick[] {
  const MIN_PX = 65   // px mínimo entre ticks para não sobrepor labels
  // quantos ticks cabem na janela visível
  const visWidthPx = (visMaxSk - visMinSk) * pixelsPerSku
  const targetCount = Math.max(2, Math.floor(visWidthPx / MIN_PX))

  /* ── Anos / Décadas / Séculos ── */
  if (granularity !== 'month' && granularity !== 'day') {
    const minYear = Math.floor(visMinSk / 10000)
    const maxYear = Math.ceil(visMaxSk / 10000)
    const span = maxYear - minYear || 1
    const rawInterval = span / targetCount

    const intervals: Record<AxisGranularity, number[]> = {
      century: [100, 200, 500, 1000],
      decade:  [10, 20, 25, 50, 100],
      year:    [1, 2, 5, 10, 25, 50, 100],
      month:   [], day: [],
    }
    const list = intervals[granularity]
    const interval = list.find(n => n >= rawInterval) ?? list[list.length - 1] ?? 100

    const ticks: AxisTick[] = []
    const start = Math.ceil(minYear / interval) * interval
    for (let y = start; y <= maxYear; y += interval) {
      ticks.push({ sortKey: y * 10000 + 101, label: String(y), isMajor: true })
    }
    return ticks
  }

  /* ── Meses ── */
  if (granularity === 'month') {
    const s = sortKeyToYMD(visMinSk)
    const e = sortKeyToYMD(visMaxSk)
    const totalMonths = (e.year - s.year) * 12 + (e.month - s.month) + 1
    const rawInterval = totalMonths / targetCount
    const niceM = [1, 2, 3, 6, 12, 24, 36, 60, 120]
    const mInterval = niceM.find(n => n >= rawInterval) ?? 120

    const ticks: AxisTick[] = []

    // Itera ano a ano para garantir que Janeiro (tick major) sempre apareça,
    // independente do alinhamento do mInterval. Alinha meses a partir de m=1.
    for (let y = s.year; y <= e.year; y++) {
      const mStart = y === s.year ? s.month : 1
      const mEnd   = y === e.year ? e.month : 12
      for (let m = mStart; m <= mEnd; m++) {
        if (mInterval <= 12) {
          // Emite meses alinhados ao intervalo a partir de Janeiro (offset 0)
          if ((m - 1) % mInterval !== 0) continue
        } else {
          // Intervalo grande (> 1 ano): só Janeiro, a cada (mInterval/12) anos
          if (m !== 1) continue
          const yearInterval = Math.round(mInterval / 12)
          if (yearInterval > 1 && y % yearInterval !== 0) continue
        }
        const sk = y * 10000 + m * 100 + 1
        if (sk < visMinSk || sk > visMaxSk) continue
        ticks.push({
          sortKey: sk,
          label: m === 1 ? String(y) : (AXIS_MONTHS[m] ?? ''),
          isMajor: m === 1,
        })
      }
    }
    return ticks
  }

  /* ── Dias ── */
  {
    const s = sortKeyToYMD(visMinSk)
    const e = sortKeyToYMD(visMaxSk)
    const approxDays = Math.max(1,
      (e.year - s.year) * 365 + (e.month - s.month) * 30 + (e.day - s.day))
    const rawInterval = approxDays / targetCount
    const niceD = [1, 2, 5, 7, 10, 14, 15, 30]
    const dInterval = niceD.find(n => n >= rawInterval) ?? 30

    let { year, month, day } = s
    // alinha ao intervalo
    day = Math.floor(day / dInterval) * dInterval || dInterval

    const ticks: AxisTick[] = []
    for (let i = 0; i < 5000; i++) {
      // Clamp day ao mês
      const maxDay = daysInMonth(year, month)
      if (day > maxDay) { day = 1; month++; if (month > 12) { year++; month = 1 } }

      const sk = year * 10000 + month * 100 + day
      if (sk > visMaxSk) break
      if (sk >= visMinSk) {
        const isFirst = day <= dInterval && day <= 7
        ticks.push({
          sortKey: sk,
          label: isFirst ? `${AXIS_MONTHS[month]} ${year}` : String(day),
          isMajor: isFirst,
        })
      }
      day += dInterval
    }
    return ticks
  }
}
