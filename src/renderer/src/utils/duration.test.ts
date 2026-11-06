import { afterEach, describe, expect, it } from 'vitest'
import { formatDuration, setDateLanguage } from './chroniclerDate'
import { eventSpan } from './mapTime'
import { parseChroniclerDate } from './chroniclerDate'
import type { ChroniclerEvent } from '../types/chronicler'

afterEach(() => setDateLanguage('pt'))

const ev = (date: string, end?: string): ChroniclerEvent => ({
  filePath: 'x.md', relativePath: 'x.md', slug: 'x', hasSubtimeline: false,
  frontmatter: { type: 'event', title: 'x', date },
  date: parseChroniclerDate(date), dateEnd: end ? parseChroniclerDate(end) : undefined,
})

describe('duração do evento em foco', () => {
  it('anos inteiros, um ano e meses', () => {
    expect(formatDuration(1914.57, 1918.86)).toBe('4 anos')
    expect(formatDuration(1900, 1901)).toBe('1 ano')
    expect(formatDuration(1900, 1900.6)).toBe('7 meses')
    expect(formatDuration(1900, 1900.02)).toBe('1 mês')
    setDateLanguage('en')
    expect(formatDuration(1914.57, 1918.86)).toBe('4 years')
    expect(formatDuration(1900, 1900.6)).toBe('7 months')
  })
  it('o intervalo do evento inclui o dia final inteiro', () => {
    const [start, end] = eventSpan(ev('1914-07-28', '1918-11-11'))
    expect(formatDuration(start, end)).toBe('4 anos')
    const [s2, e2] = eventSpan(ev('1939', '1945'))
    expect(formatDuration(s2, e2)).toBe('7 anos')   // 1939 inteiro até o fim de 1945
  })
})
