/**
 * Local de eventos — leitura/escrita do campo `location` do frontmatter.
 *
 * Formato no .md (coordenadas atuais):
 *   location:
 *     name: "Porto Seguro, Bahia, Brasil"
 *     lat: -16.43
 *     lng: -39.08
 *     precision: city        # point | city | region | country | approx
 *     area: BR-BA            # opcional — país (ISO3) ou estado (ISO 3166-2) para destacar no mapa
 *     radius_km: 25          # opcional
 */

import type { EventLocation, LocationPrecision } from '../types/chronicler'

const PRECISIONS: LocationPrecision[] = ['point', 'city', 'region', 'country', 'approx']

/** Raio padrão (km) de cada precisão quando o arquivo não informa */
export const DEFAULT_RADIUS_KM: Record<LocationPrecision, number> = {
  point: 0, city: 15, region: 150, country: 500, approx: 100,
}

export const PRECISION_LABELS: Record<LocationPrecision, { pt: string; en: string }> = {
  point:   { pt: 'Ponto exato', en: 'Exact point' },
  city:    { pt: 'Cidade', en: 'City' },
  region:  { pt: 'Estado / região', en: 'State / region' },
  country: { pt: 'País', en: 'Country' },
  approx:  { pt: 'Aproximado', en: 'Approximate' },
}

function toNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN
  return Number.isFinite(n) ? n : null
}

/** Valida um objeto vindo do YAML (já parseado pelo main) em EventLocation */
export function parseLocation(value: unknown): EventLocation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const o = value as Record<string, unknown>
  const lat = toNumber(o.lat ?? o.latitude)
  const lng = toNumber(o.lng ?? o.lon ?? o.longitude)
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  const precision = PRECISIONS.includes(o.precision as LocationPrecision) ? (o.precision as LocationPrecision) : 'point'
  const radius = toNumber(o.radius_km ?? o.radiusKm)
  return {
    name: o.name != null && String(o.name).trim() ? String(o.name) : undefined,
    lat, lng, precision,
    area: o.area != null && String(o.area).trim() ? String(o.area) : undefined,
    radiusKm: radius !== null && radius > 0 ? radius : undefined,
  }
}

// ── Texto bruto do frontmatter (editor) ─────────────────────────────────────

function unquote(v: string): string {
  const t = v.trim()
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    try { return JSON.parse(t) as string } catch { return t.slice(1, -1) }
  }
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'")
  return t
}

/** Divide "a: 1, b: "x, y"" respeitando aspas (mapa YAML inline) */
function splitFlow(body: string): string[] {
  const out: string[] = []
  let cur = '', q: string | null = null
  for (const ch of body) {
    if (q) { cur += ch; if (ch === q) q = null; continue }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue }
    if (ch === ',') { out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out
}

/**
 * Lê o valor bruto de `location:` como o editor o guarda (texto após "location:",
 * em bloco indentado ou mapa inline). Retorna null se não for reconhecido —
 * nesse caso o texto continua preservado como está.
 */
export function parseLocationRaw(raw: string): EventLocation | null {
  const text = raw.trim()
  if (!text) return null
  const obj: Record<string, string> = {}
  const pairs = text.startsWith('{') && text.endsWith('}')
    ? splitFlow(text.slice(1, -1))
    : text.split(/\r?\n/)
  for (const pair of pairs) {
    const ci = pair.indexOf(':')
    if (ci < 0) { if (pair.trim()) return null; continue }
    const key = pair.slice(0, ci).trim()
    if (!key || key.startsWith('-')) return null   // lista/estrutura inesperada
    obj[key] = unquote(pair.slice(ci + 1))
  }
  return parseLocation(obj)
}

/** Escalar YAML seguro (mesmas regras do editor) */
function yamlScalar(value: string): string {
  return /[:#[\]{}&*!|>'"%@`,]/.test(value) || /^[\s\-?]/.test(value) || /\s$/.test(value) ||
    /^(true|false|yes|no|on|off|null|~)$/i.test(value) || /^[\d.+-]+$/.test(value)
    ? JSON.stringify(value) : value
}

/**
 * Valor bruto de `location` para gravar (começa com '\n', como os demais
 * campos aninhados do editor). `indent` = indentação das linhas internas.
 */
export function locationToRaw(loc: EventLocation, indent = '  '): string {
  const lines: string[] = []
  if (loc.name) lines.push(`name: ${yamlScalar(loc.name)}`)
  lines.push(`lat: ${Math.round(loc.lat * 1e6) / 1e6}`)
  lines.push(`lng: ${Math.round(loc.lng * 1e6) / 1e6}`)
  lines.push(`precision: ${loc.precision}`)
  if (loc.area) lines.push(`area: ${yamlScalar(loc.area)}`)
  if (loc.radiusKm) lines.push(`radius_km: ${Math.round(loc.radiusKm)}`)
  return lines.map((l) => `\n${indent}${l}`).join('')
}

/** Raio efetivo em km para desenhar a área */
export function effectiveRadiusKm(loc: EventLocation): number {
  return loc.radiusKm ?? DEFAULT_RADIUS_KM[loc.precision]
}
