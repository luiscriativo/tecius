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
