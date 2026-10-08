import { ChroniclerDate, DatePrecision } from '../types/chronicler'

// ── Idioma da formatação ────────────────────────────────────────────────────
// Definido pelo store (setLanguage) — as funções de formatação são chamadas em
// muitos lugares fora de componentes, então o idioma fica aqui, não num hook.
export type DateLanguage = 'pt' | 'en'
let lang: DateLanguage = 'pt'
export function setDateLanguage(l: DateLanguage): void { lang = l }
export function getDateLanguage(): DateLanguage { return lang }

/** Texto exibido no lugar da data de um evento sem data válida */
export function undatedLabel(): string { return lang === 'en' ? 'No date' : 'Sem data' }

const MONTHS: Record<DateLanguage, { short: string[]; long: string[] }> = {
  pt: {
    short: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
    long: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
  },
  en: {
    short: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    long: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  },
}

// ── Datas antigas ───────────────────────────────────────────────────────────
// Além de "1789", "1789-07" e "1789-07-14", aceita:
//   anos antes de Cristo:  "-500", "-44-03-15", "500 a.C.", "500 BC"
//   tempo profundo:        "12 ka" (mil anos), "66 Ma" (milhões), "1,2 Ga" (bilhões)
// Internamente o ano é negativo para a.C./tempo profundo (sortKey continua ordenável).

const DEEP_TIME_RE = /^(\d+(?:[.,]\d+)?)\s*(ka|ma|ga|mya)$/i
const BCE_RE = /^(.+?)\s*(a\.?\s*c\.?|bce?)$/i
const NUMERIC_RE = /^(-?\d{1,9})(?:-(\d{1,2})(?:-(\d{1,2}))?)?/

// Linguagem natural: "12 mil anos", "há 66 milhões de anos", "66 million years ago"
const NATURAL_RE = /^(há\s+|ha\s+)?(\d+(?:[.,]\d+)?)\s*(mil|thousand|milhões|milhoes|milhão|milhao|millions?|bilhões|bilhoes|bilhão|bilhao|billions?)?\s*(?:de\s+)?(anos?|years?)?\s*(atrás|atras|ago)?$/i

/**
 * Converte datas em linguagem natural para o formato gravado no arquivo:
 *   "12 mil anos" → "12 ka" · "66 milhões de anos" → "66 Ma" · "1,2 bilhão de anos" → "1.2 Ga"
 *   "há 5 mil anos" → "-2974" (ano a.C., relativo ao ano atual quando < 10 mil anos)
 * Retorna null se o texto não for desse tipo (ex: "1789", "500 a.C.").
 */
export function normalizeNaturalDate(input: string, currentYear = new Date().getFullYear()): string | null {
  const m = String(input).trim().replace(/\s+/g, ' ').match(NATURAL_RE)
  if (!m) return null
  const [, ha, num, mag, anos, atras] = m
  if (!ha && !mag && !anos && !atras) return null   // só um número: é um ano comum
  const w = (mag ?? '').toLowerCase()
  // "milhões"/"million" também começam com "mil": checar antes
  const mult = /^(milh|million)/.test(w) ? 1e6 : /^(bilh|billion)/.test(w) ? 1e9 : /^(mil|thousand)/.test(w) ? 1e3 : 1
  const ago = Number(num.replace(',', '.')) * mult
  if (!Number.isFinite(ago) || ago <= 0) return null
  const fmt = (v: number) => String(Math.round(v * 1000) / 1000)
  if (ago >= 1e9) return `${fmt(ago / 1e9)} Ga`
  if (ago >= 1e6) return `${fmt(ago / 1e6)} Ma`
  if (ago >= 1e4) return `${fmt(ago / 1e3)} ka`
  return String(Math.round(currentYear - ago))
}

/** Interpreta a parte de data (sem hora). Retorna null se não reconhecer. */
export function parseDateParts(input: string): { year: number; month?: number; day?: number } | null {
  let str = String(input).trim()
  if (!str) return null
  str = normalizeNaturalDate(str) ?? str
  const deep = str.match(DEEP_TIME_RE)
  if (deep) {
    const value = Number(deep[1].replace(',', '.'))
    const unit = deep[2].toLowerCase()
    const factor = unit === 'ka' ? 1e3 : unit === 'ga' ? 1e9 : 1e6
    return { year: -Math.round(value * factor) }
  }
  const bce = str.match(BCE_RE)
  if (bce) {
    // "15/03/44 a.C." ou "44-03-15 a.C." ou "500 a.C."
    const body = bce[1].trim()
    const dmy = body.match(/^(\d{1,2})\/(\d{1,2})\/(\d{1,9})$/)
    if (dmy) return { year: -Number(dmy[3]), month: Number(dmy[2]), day: Number(dmy[1]) }
    const my = body.match(/^(\d{1,2})\/(\d{1,9})$/)
    if (my) return { year: -Number(my[2]), month: Number(my[1]) }
    const n = body.match(NUMERIC_RE)
    if (n && !n[1].startsWith('-')) {
      return { year: -Number(n[1]), month: n[2] ? Number(n[2]) : undefined, day: n[3] ? Number(n[3]) : undefined }
    }
    return null
  }
  const n = str.match(NUMERIC_RE)
  if (!n) return null
  return { year: Number(n[1]), month: n[2] ? Number(n[2]) : undefined, day: n[3] ? Number(n[3]) : undefined }
}

const nf1 = (v: number) =>
  (Math.round(v * 10) / 10).toLocaleString(lang === 'en' ? 'en-US' : 'pt-BR', { maximumFractionDigits: 1 })

/** "66 milhões" / "66 million" (bilhões, milhões, mil) */
function magnitude(v: number): string {
  if (lang === 'en') {
    if (v >= 1e9) return `${nf1(v / 1e9)} billion`
    if (v >= 1e6) return `${nf1(v / 1e6)} million`
    return `${nf1(v / 1e3)} thousand`
  }
  if (v >= 1e9) return `${nf1(v / 1e9)} ${v / 1e9 >= 2 ? 'bilhões' : 'bilhão'} de`
  if (v >= 1e6) return `${nf1(v / 1e6)} ${v / 1e6 >= 2 ? 'milhões' : 'milhão'} de`
  return `${nf1(v / 1e3)} mil`
}

/**
 * Ano formatado para exibição (eixo, lista, rodapé).
 * short: "66 Ma", "12 ka", "500 a.C." / "500 BC"
 * longo: "há 66 milhões de anos" / "66 million years ago"
 */
export function formatYear(year: number, short = true): string {
  if (year >= 0) return String(year)
  const ago = -year
  if (ago >= 1e4 && short) {
    if (ago >= 1e9) return `${nf1(ago / 1e9)} Ga`
    if (ago >= 1e6) return `${nf1(ago / 1e6)} Ma`
    return `${nf1(ago / 1e3)} ka`
  }
  if (ago >= 1e4) return lang === 'en' ? `${magnitude(ago)} years ago` : `há ${magnitude(ago)} anos`
  return lang === 'en' ? `${ago} BC` : `${ago} a.C.`
}

/** Duração em anos, legível ("428 anos" / "428 years", "66 milhões de anos" / "66 million years") */
export function formatSpan(years: number): string {
  const y = Math.abs(years)
  if (y >= 1e4) return lang === 'en' ? `${magnitude(y)} years` : `${magnitude(y)} anos`
  if (lang === 'en') return `${y} ${y === 1 ? 'year' : 'years'}`
  return `${y} ${y === 1 ? 'ano' : 'anos'}`
}

/**
 * Parseia uma string de data do frontmatter YAML em ChroniclerDate.
 * Suporta: "1789", "1789-07", "1789-07-14", datas a.C. e tempo profundo (ver acima).
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
  const parts = parseDateParts(String(dateStr)) ?? { year: 0 }
  const year = parts.year
  const month = parts.month  // 1-12 ou undefined
  const day = parts.day      // 1-31 ou undefined

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

  const date = {
    year,
    month,
    day,
    hour,
    minute,
    precision: detectedPrecision,
    circa: circa ?? false,
    sortKey,
  } as ChroniclerDate
  // Textos de exibição calculados na hora, no idioma atual (trocar de idioma
  // não exige recarregar as timelines)
  Object.defineProperties(date, {
    // configurable: eventos sem data trocam esses textos por "Sem data" (useTimeline)
    display: { enumerable: true, configurable: true, get: () => formatDisplay(year, month, day, hour, minute, detectedPrecision) },
    displayShort: { enumerable: true, configurable: true, get: () => formatDisplayShort(year, month, day, detectedPrecision) },
  })
  return date
}

function formatDisplay(
  year: number,
  month?: number,
  day?: number,
  hour?: number,
  minute?: number,
  precision?: DatePrecision,
): string {
  const y = formatYear(year, false)
  if (precision === 'year' || !month) return y
  const names = MONTHS[lang]
  if (precision === 'month' || !day) return lang === 'en' ? `${names.long[month - 1]} ${y}` : `${names.long[month - 1]} de ${y}`

  const dayStr = String(day).padStart(2, '0')
  const monthStr = names.short[month - 1]
  const base = `${dayStr} ${monthStr} ${y}`

  if (hour !== undefined && minute !== undefined) {
    return `${base}, ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }
  return base
}

/** "22 Abr 1500", "Abril de 1500" ou só o ano curto ("1500", "66 Ma") */
export function formatDateParts(year: number, month?: number, day?: number): string {
  if (!month) return formatYear(year, true)
  return formatDisplay(year, month, day, undefined, undefined, day ? 'day' : 'month')
}

function formatDisplayShort(
  year: number,
  month?: number,
  day?: number,
  precision?: DatePrecision,
): string {
  const y = formatYear(year, true)
  if (precision === 'year' || !month) return y
  if (precision === 'month' || !day) return `${MONTHS[lang].short[month - 1]} ${y}`
  const dd = String(day).padStart(2, '0'), mm = String(month).padStart(2, '0')
  return lang === 'en' ? `${mm}/${dd}/${y}` : `${dd}/${mm}/${y}`
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
  const dIM  = daysInMonth(year, month)          // sem Date(): funciona para qualquer ano
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

/** Mês abreviado em minúsculas para o eixo ("abr" / "apr"); m de 1 a 12 */
const axisMonth = (m: number): string => (MONTHS[lang].short[m - 1] ?? '').toLowerCase()

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
          label: m === 1 ? String(y) : axisMonth(m),
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
          label: isFirst ? `${axisMonth(month)} ${year}` : String(day),
          isMajor: isFirst,
        })
      }
      day += dInterval
    }
    return ticks
  }
}
