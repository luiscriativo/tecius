/**
 * Geo IPC Handlers — serviços online opcionais (desligados por padrão no app).
 *
 * - geo:search-online       → busca de endereços no OpenStreetMap (Nominatim)
 * - geo:paleo-coastlines    → linhas de costa reconstruídas para uma idade (GPlates)
 * - geo:paleo-points        → posição de pontos atuais numa idade geológica (GPlates)
 *
 * As requisições saem do main process (o renderer não tem acesso à rede pelo CSP).
 * Resultados do GPlates ficam em cache em <userData>/geo-cache — depois da
 * primeira consulta, funcionam offline.
 */

import { app, ipcMain, net } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'

const PALEO_MODEL = 'MERDITH2021'          // 0–1000 Ma
const GPLATES = 'https://gws.gplates.org'
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const TIMEOUT_MS = 30_000
// O GPlates leva ~1–3 min para reconstruir as linhas de costa (só na 1ª vez; depois vem do cache)
const COASTLINES_TIMEOUT_MS = 240_000

const cacheDir = (): string => path.join(app.getPath('userData'), 'geo-cache')
const userAgent = (): string => `Tecius/${app.getVersion()} (desktop timeline app)`

async function fetchJson(url: string, headers: Record<string, string> = {}, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await net.fetch(url, { headers: { 'User-Agent': userAgent(), ...headers }, signal: ctrl.signal })
    const text = await res.text()
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
    try { return JSON.parse(text) } catch { throw new Error(text.slice(0, 200)) }
  } finally {
    clearTimeout(timer)
  }
}

/** Idade válida em milhões de anos (0–1000), arredondada a 0.1 para aproveitar o cache */
function normalizeAge(age: unknown): number {
  const n = Number(age)
  if (!Number.isFinite(n) || n < 0 || n > 1000) throw new Error('Idade fora do intervalo do modelo (0–1000 Ma)')
  return Math.round(n * 10) / 10
}

// ── Cache de pontos (um arquivo JSON) ───────────────────────────────────────
let pointsCache: Record<string, [number, number] | null> | null = null
async function loadPointsCache(): Promise<Record<string, [number, number] | null>> {
  if (pointsCache) return pointsCache
  try { pointsCache = JSON.parse(await fs.readFile(path.join(cacheDir(), 'paleo-points.json'), 'utf-8')) }
  catch { pointsCache = {} }
  return pointsCache!
}
async function savePointsCache(): Promise<void> {
  await fs.mkdir(cacheDir(), { recursive: true })
  await fs.writeFile(path.join(cacheDir(), 'paleo-points.json'), JSON.stringify(pointsCache ?? {}), 'utf-8')
}

// Nominatim pede no máximo 1 requisição por segundo
let lastNominatim = 0

export function registerGeoHandlers(): void {
  ipcMain.handle('geo:search-online', async (_e, query: unknown) => {
    try {
      if (typeof query !== 'string' || !query.trim() || query.length > 200) throw new Error('Busca inválida')
      const wait = 1000 - (Date.now() - lastNominatim)
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      lastNominatim = Date.now()
      const url = `${NOMINATIM}?format=jsonv2&limit=8&q=${encodeURIComponent(query.trim())}`
      const data = await fetchJson(url, { 'Accept-Language': 'pt-BR,pt,en' })
      if (!Array.isArray(data)) throw new Error('Resposta inesperada')
      return {
        success: true,
        data: data.map((r: Record<string, unknown>) => ({
          name: String(r.display_name ?? ''),
          lat: Number(r.lat),
          lng: Number(r.lon),
          type: String(r.type ?? ''),
          cls: String(r.category ?? r.class ?? ''),
        })).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng)),
      }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('geo:paleo-coastlines', async (_e, ageInput: unknown) => {
    try {
      const age = normalizeAge(ageInput)
      const file = path.join(cacheDir(), `coastlines-low-${PALEO_MODEL}-${age}.json`)
      try {
        return { success: true, data: JSON.parse(await fs.readFile(file, 'utf-8')), model: PALEO_MODEL, cached: true }
      } catch { /* não está em cache */ }
      // Versão de baixa resolução: ~650 KB (vs ~2 MB) — suficiente para um mapa-múndi
      const data = await fetchJson(`${GPLATES}/reconstruct/coastlines_low/?time=${age}&model=${PALEO_MODEL}`, {}, COASTLINES_TIMEOUT_MS)
      if (!data || (data as { type?: string }).type !== 'FeatureCollection') throw new Error('Resposta inesperada do GPlates')
      await fs.mkdir(cacheDir(), { recursive: true })
      await fs.writeFile(file, JSON.stringify(data), 'utf-8')
      return { success: true, data, model: PALEO_MODEL, cached: false }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('geo:paleo-points', async (_e, pointsInput: unknown, ageInput: unknown) => {
    try {
      const age = normalizeAge(ageInput)
      if (!Array.isArray(pointsInput) || pointsInput.length > 2000) throw new Error('Pontos inválidos')
      const points = pointsInput.map((p) => {
        const [lng, lat] = Array.isArray(p) ? p.map(Number) : [NaN, NaN]
        if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Coordenada inválida')
        return [Math.round(lng * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4] as [number, number]
      })
      const cache = await loadPointsCache()
      const key = (p: [number, number]) => `${PALEO_MODEL}|${age}|${p[0]},${p[1]}`
      const missing = [...new Set(points.filter((p) => !(key(p) in cache)).map((p) => `${p[0]},${p[1]}`))]
        .map((s) => s.split(',').map(Number) as [number, number])

      // Em lotes, mantendo a ordem (return_null_points devolve null para pontos sem placa)
      for (let i = 0; i < missing.length; i += 100) {
        const batch = missing.slice(i, i + 100)
        const qs = batch.map((p) => `${p[0]},${p[1]}`).join(',')
        const res = await fetchJson(`${GPLATES}/reconstruct/reconstruct_points/?points=${qs}&time=${age}&model=${PALEO_MODEL}&return_null_points`, {}, 60_000) as { coordinates?: Array<[number, number] | null> }
        const coords = res?.coordinates
        if (!Array.isArray(coords) || coords.length !== batch.length) throw new Error('Resposta inesperada do GPlates')
        batch.forEach((p, j) => { cache[key(p)] = coords[j] ?? null })
      }
      if (missing.length) await savePointsCache()
      return { success: true, data: points.map((p) => cache[key(p)] ?? null), model: PALEO_MODEL }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}
