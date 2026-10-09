import { describe, expect, it } from 'vitest'
import { autoAddStops, fioView, fiosContaining, withoutStop } from './fio'
import type { VaultEventDoc } from './wikiLinks'

const doc = (title: string, date: string, extra: Partial<VaultEventDoc> = {}): VaultEventDoc =>
  ({ filePath: `/v/P/${title}.md`, slug: title, title, date, timelineDir: '/v/P', timelineTitle: 'P', ...extra })
const belmonte = doc('Belmonte', '1467'), brasil = doc('Cabral chega ao Brasil', '1500-04-22')
const calicute = doc('Calicute', '1500-09-13'), vasco = doc('Vasco da Gama', '1498-05-20'), sem = doc('Sem data', '')
const vida = doc('Vida de Cabral', '1467', {
  body: 'Nasce em [[Belmonte]]. Segue [[Vasco da Gama|Vasco]], chega ao [[Cabral chega ao Brasil]].',
  fio: ['Calicute', 'Cabral chega ao Brasil', 'Belmonte', 'Apagado', 'Sem data', 'belmonte'],
})
const all = [vida, belmonte, brasil, calicute, vasco, sem]

describe('fioView', () => {
  it('paradas por data (sem data e não encontradas no fim), sem repetir; menções à parte', () => {
    const v = fioView(vida, all)!
    expect(v.stops.map((s) => [s.target, s.inText])).toEqual([
      ['Belmonte', true], ['Cabral chega ao Brasil', true], ['Calicute', false], ['Sem data', false], ['Apagado', false],
    ])
    expect(v.stops[4].doc).toBeNull()
    expect(v.mentions.map((d) => d.title)).toEqual(['Vasco da Gama'])
    expect(fioView(belmonte, all)).toBeNull()
  })
  it('fios de que um evento faz parte', () => {
    expect(fiosContaining(calicute, all).map((d) => d.title)).toEqual(['Vida de Cabral'])
    expect(fiosContaining(vasco, all)).toEqual([])
  })
})

describe('autoAddStops', () => {
  it('só as ligações novas entram; menções antigas ficam menções', () => {
    const before = vida.body!
    const after = before + ' Depois [[Calicute]] e [[Sem data]] e [[vasco da gama]].'
    expect(autoAddStops(['Belmonte'], before, after, all, vida)).toEqual(['Belmonte', 'Calicute', 'Sem data'])
    expect(autoAddStops(['Belmonte'], before, before, all, vida)).toBeNull()
  })
  it('remove parada pelo evento', () => {
    expect(withoutStop(['Belmonte', 'Calicute'], 'belmonte', all, '/v/P')).toEqual(['Calicute'])
  })
})
