/**
 * Dados geográficos offline (Natural Earth, domínio público).
 * Carregados sob demanda (import dinâmico → chunk separado), só quando o mapa
 * ou o seletor de local são abertos.
 */

import { geoArea } from 'd3-geo'
import type { FeatureCollection, Geometry, Feature } from 'geojson'
import type { EventLocation, LocationPrecision } from '../types/chronicler'
import { getDateLanguage } from './chroniclerDate'

export type AreaFeatures = FeatureCollection<Geometry, { id: string; n: string; en?: string; c?: string }>

interface Gazetteer {
  countries: Array<[string, string, string, number, number, number]>          // id, nome, nome-en, lng, lat, raioKm
  regions: Array<[string, string, string, number, number, number, string]>    // iso, nome, país, lng, lat, raioKm, iso3
  cities: Array<[string, string, string, number, number, number, string]>     // nome, estado, país, lng, lat, pop, iso3
}

/**
 * O d3-geo trabalha na esfera: um anel no sentido anti-horário (padrão RFC 7946,
 * usado pelo GeoJSON gerado) é lido como "tudo menos o polígono" e cobre o globo.
 * Corrige invertendo os anéis de qualquer feição com área > meia esfera.
 */
export function rewindForD3<T extends FeatureCollection>(fc: T): T {
  for (const f of fc.features as Feature[]) {
    if (geoArea(f) <= 2 * Math.PI) continue
    const g = f.geometry
    if (g.type === 'Polygon') g.coordinates.forEach((ring) => ring.reverse())
    else if (g.type === 'MultiPolygon') g.coordinates.forEach((poly) => poly.forEach((ring) => ring.reverse()))
  }
  return fc
}

let countriesP: Promise<AreaFeatures> | null = null
let regionsP: Promise<AreaFeatures> | null = null
let gazetteerP: Promise<Gazetteer> | null = null

export function loadCountries(): Promise<AreaFeatures> {
  countriesP ??= import('../assets/geo/countries.json').then((m) => rewindForD3(m.default as unknown as AreaFeatures))
  return countriesP
}

export function loadRegions(): Promise<AreaFeatures> {
  regionsP ??= import('../assets/geo/regions.json').then((m) => rewindForD3(m.default as unknown as AreaFeatures))
  return regionsP
}

function loadGazetteer(): Promise<Gazetteer> {
  gazetteerP ??= import('../assets/geo/gazetteer.json').then((m) => m.default as unknown as Gazetteer)
  return gazetteerP
}

/** Normaliza para busca: minúsculas, sem acentos */
export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

export interface PlaceResult {
  /** Rótulo principal (ex: "Porto Seguro") */
  title: string
  /** Contexto (ex: "Bahia, Brasil") */
  subtitle: string
  location: EventLocation
  kind: 'country' | 'region' | 'city' | 'online'
}

/**
 * Busca offline em países, estados/províncias e cidades.
 * Ordena por: nome exato > começa com > contém; depois por relevância (população).
 */
export async function searchPlaces(query: string, limit = 12): Promise<PlaceResult[]> {
  const q = normalize(query)
  if (q.length < 2) return []
  const g = await loadGazetteer()
  const scored: Array<{ score: number; r: PlaceResult }> = []
  const rank = (name: string): number => {
    const n = normalize(name)
    if (n === q) return 3
    if (n.startsWith(q)) return 2
    if (n.includes(q)) return 1
    return 0
  }

  for (const [id, nome, en, lng, lat, r] of g.countries) {
    const s = Math.max(rank(nome), rank(en))
    if (s) scored.push({ score: s * 10 + 3, r: {
      title: getDateLanguage() === 'en' ? en : nome, subtitle: '', kind: 'country',
      location: { name: nome, lat, lng, precision: 'country', area: id, radiusKm: r },
    } })
  }
  for (const [iso, nome, pais, lng, lat, r, iso3] of g.regions) {
    const s = rank(nome)
    // Desempate entre regiões homônimas: a maior primeiro (ex: Montana/EUA antes de Montana/Bulgária)
    if (s) scored.push({ score: s * 10 + 2 + Math.min(0.9, r / 1500), r: {
      title: nome, subtitle: pais, kind: 'region',
      location: { name: `${nome}, ${pais}`, lat, lng, precision: 'region', area: iso || iso3 || undefined, radiusKm: r },
    } })
  }
  for (const [nome, estado, pais, lng, lat, pop] of g.cities) {
    const s = rank(nome)
    if (s) scored.push({ score: s * 10 + 1 + Math.min(0.9, Math.log10(pop + 1) / 10), r: {
      title: nome, subtitle: [estado, pais].filter(Boolean).join(', '), kind: 'city',
      location: { name: [nome, estado, pais].filter(Boolean).join(', '), lat, lng, precision: 'city' },
    } })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.r)
}

/** Precisão sugerida a partir do tipo retornado pela busca online (OpenStreetMap) */
export function precisionFromOsm(type: string, cls: string): LocationPrecision {
  if (type === 'country') return 'country'
  if (type === 'state' || type === 'region' || type === 'province' || type === 'administrative') return 'region'
  if (['city', 'town', 'village', 'municipality', 'hamlet', 'suburb'].includes(type) || cls === 'place') return 'city'
  return 'point'
}
