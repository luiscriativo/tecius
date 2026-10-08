import { afterEach, describe, expect, it } from 'vitest'
import { formatDateParts, formatSpan, formatYear, generateAxisTicks, parseChroniclerDate, setDateLanguage } from './chroniclerDate'

afterEach(() => setDateLanguage('pt'))

describe('datas em português e inglês', () => {
  it('anos antigos e tempo profundo', () => {
    expect(formatYear(-500)).toBe('500 a.C.')
    expect(formatYear(-66e6)).toBe('66 Ma')
    expect(formatYear(-66e6, false)).toBe('há 66 milhões de anos')
    expect(formatYear(-1.2e9, false)).toBe('há 1,2 bilhão de anos')
    setDateLanguage('en')
    expect(formatYear(-500)).toBe('500 BC')
    expect(formatYear(-66e6)).toBe('66 Ma')
    expect(formatYear(-66e6, false)).toBe('66 million years ago')
    expect(formatYear(-1.2e9, false)).toBe('1.2 billion years ago')
    expect(formatYear(-12000, false)).toBe('12 thousand years ago')
  })

  it('durações', () => {
    expect(formatSpan(1)).toBe('1 ano')
    expect(formatSpan(428)).toBe('428 anos')
    expect(formatSpan(66e6)).toBe('66 milhões de anos')
    setDateLanguage('en')
    expect(formatSpan(1)).toBe('1 year')
    expect(formatSpan(428)).toBe('428 years')
    expect(formatSpan(66e6)).toBe('66 million years')
  })

  it('o texto de exibição acompanha o idioma sem reler a data', () => {
    const d = parseChroniclerDate('1500-04-22')
    const m = parseChroniclerDate('1500-04')
    expect(d.display).toBe('22 Abr 1500')
    expect(d.displayShort).toBe('22/04/1500')
    expect(m.display).toBe('Abril de 1500')
    setDateLanguage('en')
    expect(d.display).toBe('22 Apr 1500')
    expect(d.displayShort).toBe('04/22/1500')
    expect(m.display).toBe('April 1500')
    expect(m.displayShort).toBe('Apr 1500')
    expect(formatDateParts(1822, 9)).toBe('September 1822')
    expect(JSON.parse(JSON.stringify(d)).display).toBe('22 Apr 1500')   // continua serializável
  })

  it('eixo da timeline', () => {
    const labels = (lang: 'pt' | 'en') => {
      setDateLanguage(lang)
      return generateAxisTicks(15000101, 15001231, 1, 'month').map((t) => t.label)
    }
    expect(labels('pt')).toContain('abr')
    expect(labels('en')).toContain('apr')
    expect(labels('en')).not.toContain('abr')
  })
})
