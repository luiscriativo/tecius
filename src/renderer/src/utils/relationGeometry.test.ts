import { describe, expect, it } from 'vitest'
import { relationArcs, relationLines } from './relationGeometry'

describe('relationArcs', () => {
  // 'self' no pixel 100; a, b, c no mesmo grupo (300); d em outro (500); e no grupo do próprio
  const pos = new Map([['self', { lane: 0, px: 100 }], ['a', { lane: 0, px: 300 }], ['b', { lane: 0, px: 300 }],
    ['c', { lane: 0, px: 300 }], ['d', { lane: 0, px: 500 }], ['e', { lane: 0, px: 100 }]])
  it('um arco por grupo de destino, com a contagem', () => {
    const arcs = relationArcs('self', pos, ['a', 'b', 'c', 'd', 'e', 'fora'], [])
    expect(arcs.map((a) => [a.to.px, a.count, a.dir])).toEqual([[300, 3, 'out'], [500, 1, 'out']])
  })
  it('cita e é citado pelo mesmo grupo: dois arcos (por cima e por baixo); repetidos contam uma vez', () => {
    const arcs = relationArcs('self', pos, ['a', 'a'], ['b', 'c'])
    expect(arcs.map((a) => [a.dir, a.count])).toEqual([['out', 1], ['in', 2]])
  })
  it('selecionado fora do eixo: nenhum arco', () => {
    expect(relationArcs('nao-esta', pos, ['a'], [])).toEqual([])
  })
})

describe('relationLines', () => {
  const lisboa: [number, number] = [-9.14, 38.72]
  it('uma linha por lugar e tipo; mesmo lugar do evento não ganha linha', () => {
    const lines = relationLines(lisboa, [
      { lng: 2.35, lat: 48.86, role: 'cites' }, { lng: 2.6, lat: 48.7, role: 'cites' },   // Paris (2x)
      { lng: 2.35, lat: 48.86, role: 'citedBy' },                                          // Paris, outro tipo
      { lng: 139.7, lat: 35.7, role: 'cites' },                                            // Tóquio
      { lng: -9.14, lat: 38.72, role: 'citedBy' },                                         // a própria Lisboa
    ])
    expect(lines.map((l) => [l.kind, l.coords[1][0]])).toEqual([['link', 2.35], ['backlink', 2.35], ['link', 139.7]])
    expect(lines.every((l) => l.opacity === 1)).toBe(true)
  })
  it('muitas linhas ficam mais claras', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ lng: -170 + i * 15, lat: 0, role: 'cites' as const }))
    expect(relationLines(lisboa, many)[0].opacity).toBe(0.6)
  })
})
