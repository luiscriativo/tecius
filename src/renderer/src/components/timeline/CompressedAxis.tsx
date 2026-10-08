/**
 * CompressedAxis — eixo da timeline horizontal na escala comprimida.
 *
 * Cada trecho entre duas datas com eventos é linear, com a sua própria
 * densidade de pixels: um intervalo de 300 milhões de anos e um de 3 dias
 * convivem no mesmo eixo. Por trecho, as marcas escolhem a unidade que cabe
 * (dias, meses ou anos 1-2-5) e os trechos muito longos ganham a marca de corte.
 */

import { useMemo } from 'react'
import { formatYear, getDateLanguage } from '../../utils/chroniclerDate'
import { tToYMD, ymdToT } from '../../utils/mapTime'
import type { CanvasScale } from '../../utils/timelineScale'

interface CompressedAxisProps {
  scale: CanvasScale
  width: number
  viewLeft: number
  viewWidth: number
}

const MIN_LABEL_GAP = 56          // px entre rótulos
const BREAK_YEARS = 1000          // trechos a partir disso ganham a marca de corte
const NICE_YEARS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500,
  ...[3, 4, 5, 6, 7, 8, 9].flatMap((e) => [1, 2, 5].map((m) => m * 10 ** e))]
const MONTHS = {
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  en: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
}

interface Tick { t: number; label: string; major: boolean }

function daysInMonth(y: number, m: number): number {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28
  return [4, 6, 9, 11].includes(m) ? 30 : 31
}

/**
 * Rótulo de ano. Em tempo profundo, "54,3 Ma" arredonda a 100 mil anos: com
 * marcas mais próximas que isso, mostra o ano completo ("54.312.000 a.C.").
 */
function yearLabel(y: number, interval: number): string {
  const ago = -y
  const coarse = ago >= 1e6 ? 1e5 : ago >= 1e4 ? 100 : 0
  if (ago <= 0 || interval >= coarse) return formatYear(y)
  const en = getDateLanguage() === 'en'
  return `${Math.round(ago).toLocaleString(en ? 'en-US' : 'pt-BR')} ${en ? 'BC' : 'a.C.'}`
}

/** Marcas de um trecho linear [t0, t1) com `pxPerYear` pixels por ano */
function segmentTicks(t0: number, t1: number, pxPerYear: number): Tick[] {
  const out: Tick[] = []
  const months = MONTHS[getDateLanguage()]
  const pxPerDay = pxPerYear / 365.25
  if (pxPerDay >= 14) {
    // Dias (o 1º do mês leva o nome do mês)
    const step = pxPerDay >= 40 ? 1 : pxPerDay >= 22 ? 2 : 5
    let { year, month, day } = tToYMD(t0)
    for (let i = 0; i < 4000; i++) {
      const t = ymdToT(year, month, day)
      if (t >= t1) break
      if (t > t0) out.push({ t, label: day === 1 ? `${months[month - 1]} ${year}` : String(day), major: day === 1 })
      // Depois do dia 1 vêm os múltiplos do passo (1, 5, 10, 15…), sempre recomeçando no mês seguinte
      day = day === 1 && step > 1 ? step : day + step
      if (day > daysInMonth(year, month)) { day = 1; month++; if (month > 12) { month = 1; year++ } }
    }
    return out
  }
  if (pxPerYear / 12 >= 26) {
    // Meses (janeiro mostra o ano)
    const step = pxPerYear / 12 >= 50 ? 1 : 3
    let { year, month } = tToYMD(t0)
    month = Math.floor((month - 1) / step) * step + 1
    for (let i = 0; i < 4000; i++) {
      const t = ymdToT(year, month)
      if (t >= t1) break
      if (t > t0) out.push({ t, label: month === 1 ? formatYear(year) : months[month - 1], major: month === 1 })
      month += step
      if (month > 12) { month -= 12; year++ }
    }
    return out
  }
  // Anos: intervalo 1-2-5 que deixa ~MIN_LABEL_GAP entre marcas
  const interval = NICE_YEARS.find((n) => n * pxPerYear >= MIN_LABEL_GAP) ?? 5e9
  const first = Math.ceil(t0 / interval) * interval
  for (let y = first; y < t1; y += interval) {
    if (y > t0) out.push({ t: y, label: yearLabel(y, interval), major: y % (interval * 5) === 0 })
  }
  return out
}

export function CompressedAxis({ scale, width, viewLeft, viewWidth }: CompressedAxisProps) {
  const { ticks, breaks } = useMemo(() => {
    const lo = viewLeft - viewWidth * 0.2, hi = viewLeft + viewWidth * 1.2
    const all: Array<Tick & { x: number }> = []
    const breaks: number[] = []
    for (const s of scale.segments) {
      const x0 = s.f0 * width, x1 = s.f1 * width
      if (x1 < lo || x0 > hi || s.t1 <= s.t0) continue
      if (s.t1 - s.t0 >= BREAK_YEARS) breaks.push((x0 + x1) / 2)
      const pxPerYear = (x1 - x0) / (s.t1 - s.t0)
      for (const tk of segmentTicks(s.t0, s.t1, pxPerYear)) {
        const x = x0 + (tk.t - s.t0) * pxPerYear
        if (x >= lo && x <= hi) all.push({ ...tk, x })
      }
    }
    // Sem sobreposição entre trechos vizinhos: maiores primeiro, depois o resto
    all.sort((a, b) => Number(b.major) - Number(a.major) || a.x - b.x)
    const placed: typeof all = []
    for (const tk of all) {
      if (placed.every((p) => Math.abs(p.x - tk.x) >= MIN_LABEL_GAP)) placed.push(tk)
    }
    return { ticks: placed.sort((a, b) => a.x - b.x), breaks }
  }, [scale, width, viewLeft, viewWidth])

  return (
    <div className="relative shrink-0 border-t overflow-hidden" style={{ height: 50, borderColor: 'var(--axis-line)' }}
      data-testid="compressed-axis">
      {ticks.map((tk, i) => (
        <div key={i}>
          <div className="absolute top-0 w-px" style={{
            left: `${(tk.x / width) * 100}%`, height: tk.major ? 26 : 18,
            backgroundColor: tk.major ? 'var(--axis-century-tick)' : 'var(--axis-tick)',
          }} />
          <span className="absolute font-mono text-[11px] font-bold select-none whitespace-nowrap leading-none"
            style={{ left: `${(tk.x / width) * 100}%`, top: 4, marginLeft: 3, color: tk.major ? 'var(--axis-century)' : 'var(--axis-label)' }}>
            {tk.label}
          </span>
        </div>
      ))}
      {breaks.map((x, i) => (
        <span key={`b${i}`} className="absolute font-mono text-xs select-none leading-none"
          style={{ left: `${(x / width) * 100}%`, top: -7, transform: 'translateX(-50%)', color: 'var(--axis-label)', background: 'rgb(var(--bg-vault))', padding: '0 2px' }}
          data-break>
          ╱╱
        </span>
      ))}
    </div>
  )
}
