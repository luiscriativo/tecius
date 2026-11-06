import { describe, expect, it } from 'vitest'
import { parseDateParts } from './chroniclerDate'

describe('validação de datas do cabeçalho', () => {
  it('aceita os formatos documentados', () => {
    expect(parseDateParts('1789')).toEqual({ year: 1789 })
    expect(parseDateParts('1789-07')).toEqual({ year: 1789, month: 7 })
    expect(parseDateParts('1789-07-14')).toEqual({ year: 1789, month: 7, day: 14 })
    expect(parseDateParts('-44-03-15')).toEqual({ year: -44, month: 3, day: 15 })
    expect(parseDateParts('500 a.C.')).toEqual({ year: -500 })
    expect(parseDateParts('15/03/44 a.C.')).toEqual({ year: -44, month: 3, day: 15 })
    expect(parseDateParts('66 Ma')).toEqual({ year: -66_000_000 })
    expect(parseDateParts('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 })
  })
  it('recusa mês e dia impossíveis (o evento fica "sem data" em vez de "45 undefined 2024")', () => {
    expect(parseDateParts('2024-13-45')).toBeNull()
    expect(parseDateParts('2024-00')).toBeNull()
    expect(parseDateParts('2023-02-29')).toBeNull()
    expect(parseDateParts('44-13 a.C.')).toBeNull()
  })
  it('não lê um sufixo qualquer como "a.C." nem ignora lixo depois da data', () => {
    expect(parseDateParts('1789abc')).toBeNull()
    expect(parseDateParts('1789-07-14 teste')).toBeNull()
  })
})
