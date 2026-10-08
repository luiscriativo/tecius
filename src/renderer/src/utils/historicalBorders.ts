/**
 * Fronteiras históricas — mapas políticos do mundo em datas fixas
 * (historical-basemaps, GPL-3.0; ver assets/geo/historical/NOTICE.md).
 *
 * Cada arquivo é um "instantâneo" (ex: 1492, 1500, 1530...). Para um ano
 * qualquer, vale o último instantâneo até ele: em 1510, o mapa de 1500.
 * Carregados sob demanda (import dinâmico → um chunk por mapa).
 */

import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import { rewindForD3 } from './geoData'
import index from '../assets/geo/historical-index.json'

/** n: nome · s: potência que governa (ou o próprio nome) · p: precisão da fronteira (1 aproximada … 3 exata) */
export type BorderFeatures = FeatureCollection<Polygon | MultiPolygon, { n: string; s: string; p: number }>

export const BORDER_YEARS: number[] = index.years
export const BORDERS_SOURCE = { url: index.source, commit: index.commit, license: index.license }

/**
 * Ano do mapa político em vigor num ano: o último instantâneo até ele.
 * null antes do primeiro (123.000 a.C.) e depois do último (o mapa atual já serve).
 */
export function bordersYearFor(year: number, years: number[] = BORDER_YEARS): number | null {
  if (years.length === 0 || year < years[0] || year > years[years.length - 1]) return null
  let found = years[0]
  for (const y of years) {
    if (y > year) break
    found = y
  }
  return found
}

let namesPt: Promise<Record<string, string>> | null = null

/** Nomes traduzidos (inglês → idioma do app); inglês é o original do dataset */
export function loadBorderNames(language: string): Promise<Record<string, string>> {
  if (language !== 'pt') return Promise.resolve({})
  namesPt ??= import('../assets/geo/historical-names-pt.json').then((m) => m.default as Record<string, string>)
  return namesPt
}

const cache = new Map<number, Promise<BorderFeatures>>()

export function loadBorders(year: number): Promise<BorderFeatures> {
  let p = cache.get(year)
  if (!p) {
    p = import(`../assets/geo/historical/${year}.json`).then((m) => rewindForD3(m.default as BorderFeatures))
    p.catch(() => cache.delete(year))
    cache.set(year, p)
  }
  return p
}
