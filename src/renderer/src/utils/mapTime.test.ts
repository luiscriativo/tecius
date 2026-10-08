import { describe, expect, it } from 'vitest'
import { parseChroniclerDate } from './chroniclerDate'
import {
  autoGranularity, buildTimeScale, eventSpan, nextStop, phaseOf, prevStop, stopIndexAt, tToYMD, trailOpacity, TRAIL_STEPS,
  windowAt, ymdToT,
} from './mapTime'
import type { ChroniclerEvent } from '../types/chronicler'

const ev = (date: string, end?: string) =>
  ({ date: parseChroniclerDate(date), dateEnd: end ? parseChroniclerDate(end) : undefined }) as ChroniclerEvent

describe('anos decimais', () => {
  it('ida e volta entre (ano, mês, dia) e t', () => {
    for (const [y, m, d] of [[1500, 4, 22], [1500, 12, 31], [2024, 2, 29], [-44, 3, 15], [1, 1, 1]]) {
      expect(tToYMD(ymdToT(y, m, d))).toEqual({ year: y, month: m, day: d })
    }
    expect(tToYMD(-300_000_000)).toEqual({ year: -300_000_000, month: 1, day: 1 })
  })

  it('intervalo do evento segue a precisão e o date-end', () => {
    expect(eventSpan(ev('1500'))).toEqual([1500, 1501])
    const [s, e] = eventSpan(ev('1500-04'))
    expect(s).toBe(1500.25)
    expect(e).toBeCloseTo(1500 + 4 / 12, 12)
    const [s2, e2] = eventSpan(ev('1500-04-22'))
    expect(e2 - s2).toBeGreaterThan(0)
    expect(e2 - s2).toBeLessThan(0.003)
    expect(eventSpan(ev('1939', '1945'))).toEqual([1939, 1946])
    expect(eventSpan(ev('300 Ma'))).toEqual([-300e6, -300e6 + 1])
  })
})

describe('janela', () => {
  it('dois eventos no mesmo mês aparecem juntos na janela de mês', () => {
    const a = eventSpan(ev('1500-04-22')), b = eventSpan(ev('1500-04-26'))
    const month = windowAt(a[0], 'month')
    expect(month.label).toBe('Abril de 1500')
    expect(phaseOf(a, month)).toBe('active')
    expect(phaseOf(b, month)).toBe('active')
    expect(phaseOf(eventSpan(ev('1499-12')), month)).toBe('past')

    const day = windowAt(a[0], 'day')
    expect(phaseOf(a, day)).toBe('active')
    expect(phaseOf(b, day)).toBe('future')
    expect(phaseOf(eventSpan(ev('1500')), day)).toBe('active')   // o ano inteiro cobre o dia
  })

  it('rótulos', () => {
    expect(windowAt(1500.25, 'year').label).toBe('1500')
    expect(windowAt(1987, 'decade').label).toBe('1980 – 1989')
    expect(windowAt(-300e6, 'year').label).toBe('300 Ma')
    expect(windowAt(-300e6, 'century').label).toBe('300 Ma')
    expect(windowAt(-44, 'decade').label).toBe('50 a.C. – 41 a.C.')
    expect(windowAt(ymdToT(1500, 4, 22), 'day').label).toMatch(/22 Abr 1500/)
  })

  it('granularidade automática', () => {
    expect(autoGranularity([parseChroniclerDate('1500-04-22')])).toBe('month')
    expect(autoGranularity([parseChroniclerDate('300 Ma')])).toBe('year')
  })
})

describe('escala comprimida', () => {
  it('é monotônica, invertível e acomoda tempo profundo e meses na mesma régua', () => {
    const scale = buildTimeScale([-300e6, -66e6, 1500, 1500.25, 1500 + 4 / 12, 1822, 1964, 1500])
    expect(scale.stops).toHaveLength(7)   // duplicata removida
    const pos = scale.stops.map(scale.toPos)
    expect(pos[0]).toBe(0)
    expect(pos[6]).toBe(1)
    for (let i = 1; i < pos.length; i++) expect(pos[i]).toBeGreaterThan(pos[i - 1])
    for (const s of scale.stops) expect(Math.abs(scale.fromPos(scale.toPos(s)) - s)).toBeLessThan(1e-6 * Math.max(1, Math.abs(s)))
    for (const p of [0.1, 0.33, 0.5, 0.77]) expect(scale.toPos(scale.fromPos(p))).toBeCloseTo(p, 9)
    expect(pos[4] - pos[3]).toBeGreaterThan(0.01)   // abril e maio de 1500 separados
    expect(pos[1] - pos[0]).toBeLessThan(0.35)       // 300 → 66 Ma não domina a régua
    expect(scale.breaks).toHaveLength(2)
  })

  it('com uma data só ou nenhuma', () => {
    const one = buildTimeScale([1500])
    expect(one.toPos(1500)).toBe(0.5)
    expect(one.fromPos(0.9)).toBe(1500)
    expect(buildTimeScale([]).stops).toHaveLength(0)
  })
})

describe('navegação', () => {
  it('paradas e rastro', () => {
    const stops = [1, 2, 3]
    expect(nextStop(stops, 1)).toBe(2)
    expect(nextStop(stops, 3)).toBeNull()
    expect(prevStop(stops, 2.5)).toBe(2)
    expect(prevStop(stops, 1)).toBeNull()
    expect(stopIndexAt(stops, 2.5)).toBe(1)
    expect(stopIndexAt(stops, 0)).toBe(-1)
    // Busca binária = busca linear antiga, em listas aleatórias (com repetidos e bordas)
    const linear = (st: number[], t: number) => { let idx = -1; for (let i = 0; i < st.length && st[i] <= t + 1e-7; i++) idx = i; return idx }
    for (let k = 0; k < 200; k++) {
      const st = Array.from({ length: k % 17 }, () => Math.round(Math.random() * 40) / 4).sort((a, b) => a - b)
      for (const t of [-1, 0, 2.5, 5, 9.75, 10, 11, ...st]) expect(stopIndexAt(st, t)).toBe(linear(st, t))
    }
    expect(trailOpacity(1)).toBeGreaterThan(trailOpacity(3))
    // Esmaece até um mínimo visível e some depois das últimas TRAIL_STEPS paradas
    expect(trailOpacity(TRAIL_STEPS)).toBeGreaterThanOrEqual(0.15)
    expect(trailOpacity(TRAIL_STEPS + 1)).toBe(0)
  })

  it('pula as datas que estão dentro da janela atual', () => {
    const z = ymdToT(1500, 3, 9), a = ymdToT(1500, 4, 22), b = ymdToT(1500, 4, 26), c = 1822.6
    const stops = [z, a, b, c]
    expect(nextStop(stops, a, windowAt(a, 'month'))).toBe(c)
    expect(prevStop(stops, b, windowAt(a, 'month'))).toBe(z)
    expect(nextStop(stops, a, windowAt(a, 'day'))).toBe(b)
  })
})
