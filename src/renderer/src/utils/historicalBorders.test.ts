import { describe, expect, it } from 'vitest'
import { BORDER_YEARS, bordersYearFor, loadBorderNames, loadBorders } from './historicalBorders'

describe('fronteiras históricas', () => {
  it('usa o último mapa até o ano', () => {
    const years = [-500, 1492, 1500, 1530, 2010]
    expect(bordersYearFor(1500, years)).toBe(1500)
    expect(bordersYearFor(1510, years)).toBe(1500)
    expect(bordersYearFor(1499, years)).toBe(1492)
    expect(bordersYearFor(-44, years)).toBe(-500)
    expect(bordersYearFor(2010, years)).toBe(2010)
  })

  it('fora do intervalo dos mapas, usa o mapa atual', () => {
    const years = [-500, 1492, 2010]
    expect(bordersYearFor(-501, years)).toBeNull()
    expect(bordersYearFor(2024, years)).toBeNull()
    expect(bordersYearFor(1500, [])).toBeNull()
  })

  it('o índice cobre de 123.000 a.C. a 2010 e cada ano tem arquivo', async () => {
    expect(BORDER_YEARS[0]).toBe(-123000)
    expect(BORDER_YEARS[BORDER_YEARS.length - 1]).toBe(2010)
    const fc = await loadBorders(1500)
    expect(fc.features.length).toBeGreaterThan(50)
    expect(fc.features.map((f) => f.properties.n)).toContain('Inca Empire')
  })
  it('nomes em português, com as correções revisadas', async () => {
    const pt = await loadBorderNames('pt')
    expect(pt['Inca Empire']).toBe('Império Inca')
    expect(pt['Viceroyalty of Brazil']).toBe('Vice-Reino do Brasil')
    expect(pt['Algeria (France)']).toBe('Argélia (França)')
    expect(pt['Poland']).toBe('Polônia')                     // grafia brasileira
    expect(pt['Pagan']).toBe('Reino de Pagã')                // não "Paganismo"
    expect(pt['Kali']).toBeUndefined()                       // não "Cáli (deusa hindu)"
    expect(await loadBorderNames('en')).toEqual({})
  })
})
