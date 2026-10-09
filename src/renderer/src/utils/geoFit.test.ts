import { describe, expect, it } from 'vitest'
import { bestCenterLng } from './geoFit'

describe('bestCenterLng', () => {
  it('pontos que não cruzam o Pacífico: centro de sempre', () => {
    expect(bestCenterLng([-43, -9, 77])).toBe(0)          // Rio, Lisboa, Índia
    expect(bestCenterLng([139])).toBe(0)                  // um ponto só
    expect(bestCenterLng([])).toBe(0)
  })
  it('dos dois lados do Pacífico: centro no Pacífico', () => {
    // Taiti (-149.6), Nova Zelândia (178), Austrália (151)
    expect(Math.abs(bestCenterLng([-149.6, 178, 151]))).toBeGreaterThan(170)
    // Japão (139.7) e Califórnia (-122.4): o meio do arco fica perto de 180
    expect(Math.abs(Math.abs(bestCenterLng([139.7, -122.4])) - 180)).toBeLessThan(15)
  })
  it('viagem de Cook (Inglaterra → Taiti → Austrália → Cabo): centro na Ásia, nada na borda', () => {
    expect(bestCenterLng([-4, -149, 178, 151, 106, 18, 1])).toBe(103.5)
  })
  it('acervo espalhado pelo mundo todo: não gira', () => {
    expect(bestCenterLng([-122, -74, -43, -9, 2, 31, 77, 116, 139])).toBe(0)
  })
})
