/**
 * WorldMap — mapa mundial neutro em SVG (d3-geo), 100% offline.
 *
 * - Mapa base: países (Natural Earth) ou, no modo paleogeográfico, as linhas de
 *   costa reconstruídas recebidas por `basemap`. A troca de mapa base é suave
 *   (o anterior esmaece enquanto o novo aparece).
 * - Fronteiras históricas (opcional): polígonos dos países/povos de uma época,
 *   com tons por potência governante, fronteira tracejada quando aproximada e
 *   nomes dos maiores (sem sobreposição); trocam de época com a mesma transição.
 * - Zoom (scroll / botões / duplo clique) e arrastar para mover.
 * - Marcadores em coordenadas de tela (não escalam com o zoom) e agrupados
 *   quando ficam a menos de CLUSTER_PX uns dos outros. Clicar num grupo chama
 *   `onMarkerClick` com todos os ids (o MapView abre a lista lateral, como o
 *   cluster da timeline).
 * - Áreas: destaca o polígono do país/estado (`area`) ou desenha um círculo
 *   com o raio aproximado. Áreas iguais viram um polígono só, com o tom mais
 *   forte quanto mais eventos ela reúne.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { geoCircle, geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo'
import { bestCenterLng } from '@/utils/geoFit'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { Minus, Plus, Maximize } from 'lucide-react'
import { loadCountries, loadRegions, type AreaFeatures } from '@/utils/geoData'
import type { BorderFeatures } from '@/utils/historicalBorders'
import { useI18n } from '@/hooks/useI18n'
import { useAppStore } from '@/stores/useAppStore'

export interface MapMarker {
  id: string
  lng: number
  lat: number
  shape: 'dot' | 'diamond'
  label: string
  selected?: boolean
  /** 0..1 — eventos do "rastro" (passado) ficam esmaecidos */
  opacity?: number
}

/**
 * Vista do mapa independente do tamanho da tela: centro geográfico e escala
 * aparente (zoom × escala da projeção). Sobrevive a redimensionamentos.
 */
export interface GeoView { lng: number; lat: number; z: number }

export interface MapArea {
  id: string
  lng: number
  lat: number
  /** País (ISO3) ou estado (ISO 3166-2) para destacar o polígono */
  areaCode?: string
  radiusKm: number
  opacity?: number
}

export interface MapLine {
  id: string
  coords: Array<[number, number]>
  opacity?: number
  /** route: rota entre trechos (tracejada); link: ligação [[…]] do evento (cheia); backlink: quem cita (pontilhada) */
  kind?: 'route' | 'link' | 'backlink'
}

interface WorldMapProps {
  markers?: MapMarker[]
  areas?: MapArea[]
  lines?: MapLine[]
  /** Linhas de costa de outra era (paleogeografia); sem isso, usa os países atuais */
  basemap?: FeatureCollection | null
  /** Fronteiras históricas desenhadas sobre o mapa base */
  borders?: BorderFeatures | null
  /** Nomes traduzidos dos territórios (nome original → exibido) */
  borderNames?: Record<string, string>
  /** Clique em marcador ou grupo (ids dos eventos agrupados + posição na tela) */
  onMarkerClick?: (ids: string[], at: { x: number; y: number }) => void
  /** Clique no mapa (coordenadas geográficas) — usado no seletor de local */
  onMapClick?: (lng: number, lat: number) => void
  /**
   * Quando muda para um novo valor, reenquadra o mapa nos marcadores/áreas (com
   * transição suave). `null`: nunca reenquadra sozinho — a vista só muda pelo usuário.
   */
  fitKey?: string | null
  /** Vista para retomar ao montar (no lugar do enquadramento inicial) */
  initialView?: GeoView | null
  /** Avisa a vista atual (centro geográfico + escala), para ser retomada depois */
  onViewChange?: (view: GeoView) => void
  /** Enquadra só estes ids; lista vazia mantém a vista atual */
  fitIds?: string[]
  /** Zoom máximo ao enquadrar `fitIds` */
  focusMaxZoom?: number
  className?: string
}

const CLUSTER_PX = 18
/** Títulos listados no tooltip de um grupo (o resto vira "+N") */
const TOOLTIP_MAX = 5
const FADE_MS = 450
/** Área mínima na tela (px²) para um território ganhar rótulo */
const LABEL_MIN_AREA = 2400
const MAX_LABELS = 70

/** Tons de preenchimento por potência governante (estável por nome) */
const BORDER_TINTS = [0.05, 0.1, 0.15, 0.2, 0.25]
/**
 * O tom usa a cor do texto: clara no tema escuro (sutil) e escura no tema claro,
 * onde a mesma opacidade vira blocos cinza que escondem marcadores e rótulos.
 */
const LIGHT_TINT_SCALE = 0.45
function tintOf(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return BORDER_TINTS[Math.abs(h) % BORDER_TINTS.length]
}

/** Raio do marcador: um evento, ou um grupo que cresce para a contagem caber */
function markerRadius(n: number): number {
  return n > 1 ? Math.max(11, 3.3 * String(n).length + 4) : 6
}

/**
 * Tom de uma área pelo "peso" dos eventos que ela reúne (soma das opacidades:
 * eventos do rastro pesam menos), relativo à área mais cheia do mapa — com
 * milhares de eventos, os países continuam se distinguindo em vez de todos
 * saturarem. Com no máximo um evento por área, o tom de sempre.
 */
function areaFill(weight: number, maxWeight: number): number {
  if (maxWeight <= 1) return 0.14 * weight
  return 0.05 + 0.35 * (Math.log1p(weight) / Math.log1p(maxWeight))
}

/**
 * Troca suave de camada: a última é a atual; as anteriores esmaecem e saem.
 * O novo valor entra com opacidade 0 e só no quadro seguinte recebe 1, para a
 * transição CSS acontecer.
 */
function useCrossfade<T>(value: T) {
  const [layers, setLayers] = useState<Array<{ id: number; value: T; on: boolean }>>(() => [{ id: 0, value, on: true }])
  useEffect(() => {
    setLayers((ls) => (ls[ls.length - 1].value === value ? ls
      : [...ls.map((l) => ({ ...l, on: false })), { id: ls[ls.length - 1].id + 1, value, on: false }]))
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => setLayers((ls) => ls.map((l, i) => (i === ls.length - 1 && !l.on ? { ...l, on: true } : l))))
    })
    const timer = setTimeout(() => setLayers((ls) => (ls.length > 1 ? ls.slice(-1) : ls)), FADE_MS + 50)
    return () => { cancelAnimationFrame(raf); clearTimeout(timer) }
  }, [value])
  return layers
}
const MIN_K = 1
const MAX_K = 400
/** Zoom máximo padrão ao enquadrar só alguns ids (modo "Seguir"): mantém o contexto ao redor */
const FOCUS_MAX_K = 8

const css = {
  ocean: 'rgb(var(--map-ocean))',
  land: 'rgb(var(--map-land))',
  border: 'rgb(var(--map-border))',
  grid: 'rgb(var(--map-grid))',
  accent: 'rgb(var(--chronicle-dot))',
  dot: 'rgb(var(--event-dot))',
  surface: 'rgb(var(--bg-surface))',
  text: 'rgb(var(--text-primary))',
  inverse: 'rgb(var(--text-inverse))',
  muted: 'rgb(var(--text-muted))',
}

export function WorldMap({
  markers = [], areas = [], lines = [], basemap, borders, borderNames, onMarkerClick, onMapClick, fitKey, fitIds, focusMaxZoom = FOCUS_MAX_K, initialView, onViewChange, className,
}: WorldMapProps) {
  const { t } = useI18n()
  const tintScale = useAppStore((s) => s.resolvedTheme) === 'light' ? LIGHT_TINT_SCALE : 1
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const [countries, setCountries] = useState<AreaFeatures | null>(null)
  const [regions, setRegions] = useState<AreaFeatures | null>(null)

  // Tamanho do container
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // Dados (lazy). Estados só quando alguma área usa código de estado (ex: "BR-BA").
  useEffect(() => { loadCountries().then(setCountries) }, [])
  const needsRegions = areas.some((a) => a.areaCode?.includes('-'))
  useEffect(() => { if (needsRegions && !regions) loadRegions().then(setRegions) }, [needsRegions, regions])

  // Longitude no centro do mapa: zero, ou o Pacífico quando os pontos enquadrados
  // estão dos dois lados dele (senão ficavam um em cada borda)
  // Vista guardada no meio do Pacífico (o mapa estava girado): reabre girado também
  const [centerLng, setCenterLng] = useState(() => (initialView && Math.abs(initialView.lng) > 100 ? Math.round(initialView.lng) : 0))
  const projection = useMemo(() => {
    const w = Math.max(size.w, 10), h = Math.max(size.h, 10)
    return geoNaturalEarth1().rotate([-centerLng, 0]).fitExtent([[12, 12], [w - 12, h - 12]], { type: 'Sphere' })
  }, [size.w, size.h, centerLng])
  const path = useMemo(() => geoPath(projection), [projection])

  // Caminhos do mapa base (recalculados só quando a projeção muda)
  const sphereD = useMemo(() => path({ type: 'Sphere' }) ?? '', [path])
  const graticuleD = useMemo(() => path(geoGraticule10()) ?? '', [path])

  // Camadas do mapa base (com transição ao trocar)
  const layers = useCrossfade(basemap ?? null)
  const layersD = useMemo(() => layers.map((l) => ({
    id: l.id, on: l.on,
    d: ((l.value?.features ?? countries?.features ?? []) as Feature<Geometry>[]).map((f) => path(f) ?? ''),
  })), [layers, countries, path])

  // Fronteiras históricas (com transição ao trocar de época)
  const borderLayers = useCrossfade(borders ?? null)
  const bordersD = useMemo(() => borderLayers.map((l) => ({
    id: l.id, on: l.on,
    shapes: (l.value?.features ?? []).map((f) => ({
      d: path(f) ?? '',
      name: (borderNames?.[f.properties.n] ?? f.properties.n).trim(),
      tint: f.properties.n.trim() ? tintOf(f.properties.s || f.properties.n) : 0,
      approx: f.properties.p <= 1,
      centroid: path.centroid(f),
      area: path.area(f),
    })),
  })), [borderLayers, path, borderNames])

  // Rótulos dos territórios maiores, em coordenadas de tela e sem sobreposição
  const borderLabels = useMemo(() => {
    const current = bordersD[bordersD.length - 1]
    if (!current?.on || !current.shapes.length) return []
    const placed: Array<{ x: number; y: number; w: number; text: string }> = []
    const candidates = current.shapes
      .filter((s) => s.name && Number.isFinite(s.centroid[0]) && s.area * view.k * view.k >= LABEL_MIN_AREA)
      .sort((a, b) => b.area - a.area)
    for (const s of candidates) {
      if (placed.length >= MAX_LABELS) break
      const x = s.centroid[0] * view.k + view.x, y = s.centroid[1] * view.k + view.y
      const w = s.name.length * 6.8 + 6   // fonte mono 11px
      if (x - w / 2 < 4 || x + w / 2 > size.w - 4 || y < 10 || y > size.h - 10) continue
      if (placed.some((p) => Math.abs(p.x - x) < (p.w + w) / 2 && Math.abs(p.y - y) < 14)) continue
      placed.push({ x, y, w, text: s.name })
    }
    return placed
  }, [bordersD, view, size.w, size.h])

  // Áreas destacadas: polígono do país/estado quando existe; senão, círculo.
  // Áreas iguais (mesmo país/estado ou mesmo círculo) são desenhadas uma vez só:
  // mil eventos "no Brasil" não empilham mil polígonos. O contorno calculado fica
  // guardado: a cada passo da régua só a opacidade muda, não a forma.
  // As dependências não são usadas dentro: servem para descartar o cache quando o mapa muda
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const areaShapeCache = useMemo(() => new Map<string, string>(), [path, countries, regions, basemap])
  const areaD = useMemo(() => {
    const featureOf = new Map<string, Feature<Geometry> | undefined>()
    const groups = new Map<string, { feature?: Feature<Geometry>; a: MapArea; weight: number; opacity: number; count: number }>()
    for (const a of areas) {
      const code = a.areaCode
      let feature: Feature<Geometry> | undefined
      if (code && !basemap) {
        if (!featureOf.has(code)) {
          featureOf.set(code, (code.includes('-') ? regions : countries)?.features.find((f) => f.properties.id === code))
        }
        feature = featureOf.get(code)
      }
      const key = feature ? `area:${code}` : `circle:${a.lng},${a.lat},${Math.round(Math.max(a.radiusKm, 1))}`
      const opacity = a.opacity ?? 1
      const g = groups.get(key)
      if (g) { g.weight += opacity; g.opacity = Math.max(g.opacity, opacity); g.count++ }
      else groups.set(key, { feature, a, weight: opacity, opacity, count: 1 })
    }
    const maxWeight = Math.max(0, ...[...groups.values()].map((g) => g.weight))
    return [...groups.entries()].map(([key, g]) => {
      let d = areaShapeCache.get(key)
      if (d === undefined) {
        const shape = g.feature ?? geoCircle().center([g.a.lng, g.a.lat]).radius(Math.max(g.a.radiusKm, 1) / 111.32)()
        d = path(shape) ?? ''
        areaShapeCache.set(key, d)
      }
      return { id: key, d, fill: areaFill(g.weight, maxWeight), opacity: g.opacity, count: g.count }
    })
  }, [areas, countries, regions, basemap, path, areaShapeCache])

  const linesD = useMemo(() => lines.map((l) => ({
    id: l.id, d: path({ type: 'LineString', coordinates: l.coords }) ?? '', opacity: l.opacity ?? 1, kind: l.kind ?? 'route',
  })), [lines, path])

  // Marcadores em coordenadas de tela + agrupamento
  // Agrupamento em grade (custo linear, para milhares de pontos): cada célula de
  // CLUSTER_PX vira um grupo no centro dos seus pontos; depois, grupos vizinhos
  // cujos círculos se encostariam (eles crescem com o número) viram um só.
  // A grade acompanha o mapa (não a tela): arrastar não reagrupa. Pontos fora
  // da tela não entram.
  // Eventos do momento e do rastro (esmaecidos) são agrupados separadamente: um
  // grupo aceso conta só os do momento, e o rastro fica atrás, à parte.
  const groups = useMemo(() => {
    const cluster = (list0: MapMarker[], tag: string) => {
      const M = 40
      type Cell = { cx: number; cy: number; sx: number; sy: number; items: MapMarker[] }
      const cells = new Map<string, Cell>()
      for (const m of list0) {
        const p = projection([m.lng, m.lat])
        if (!p) continue
        const x = p[0] * view.k + view.x, y = p[1] * view.k + view.y
        if (x < -M || y < -M || x > size.w + M || y > size.h + M) continue
        const cx = Math.floor((x - view.x) / CLUSTER_PX), cy = Math.floor((y - view.y) / CLUSTER_PX)
        const key = `${cx},${cy}`
        const c = cells.get(key)
        if (c) { c.sx += x; c.sy += y; c.items.push(m) } else cells.set(key, { cx, cy, sx: x, sy: y, items: [m] })
      }
      const list = [...cells.values()].map((c) => ({ ...c, x: c.sx / c.items.length, y: c.sy / c.items.length }))
      // União de vizinhos que se encostam (olha as células ao redor, até 2 de distância)
      const parent = list.map((_, i) => i)
      const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
      const at = new Map(list.map((c, i) => [`${c.cx},${c.cy}`, i]))
      list.forEach((a, i) => {
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
          const j = at.get(`${a.cx + dx},${a.cy + dy}`)
          if (j === undefined || j <= i) continue
          const b = list[j]
          if (Math.hypot(a.x - b.x, a.y - b.y) < markerRadius(a.items.length) + markerRadius(b.items.length) + 2) parent[find(j)] = find(i)
        }
      })
      const merged = new Map<number, { sx: number; sy: number; items: MapMarker[] }>()
      list.forEach((c, i) => {
        const r = find(i), g = merged.get(r), n = c.items.length
        if (g) { g.sx += c.x * n; g.sy += c.y * n; for (const m of c.items) g.items.push(m) }
        else merged.set(r, { sx: c.x * n, sy: c.y * n, items: [...c.items] })
      })
      return [...merged.values()].map((g) => ({
        x: g.sx / g.items.length, y: g.sy / g.items.length, items: g.items,
        key: `${tag}${g.items[0].id}#${g.items.length}`,
      }))
    }
    const active = markers.filter((m) => (m.opacity ?? 1) >= 0.99)
    const trail = markers.filter((m) => (m.opacity ?? 1) < 0.99)
    return [...cluster(trail, 't:'), ...cluster(active, '')]
  }, [markers, projection, view, size.w, size.h])

  // Transição suave da vista (reenquadramentos automáticos)
  const animRef = useRef<number | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const stopAnim = useCallback(() => { if (animRef.current !== null) cancelAnimationFrame(animRef.current); animRef.current = null }, [])
  const animateTo = useCallback((target: { k: number; x: number; y: number }) => {
    stopAnim()
    const from = viewRef.current
    const t0 = performance.now(), dur = 450
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur)
      const e = 1 - Math.pow(1 - p, 3)
      // Interpola o zoom em escala log e o centro junto, para não "escorregar"
      const k = from.k * Math.pow(target.k / from.k, e)
      const cx = size.w / 2, cy = size.h / 2
      const fromCx = (cx - from.x) / from.k, toCx = (cx - target.x) / target.k
      const fromCy = (cy - from.y) / from.k, toCy = (cy - target.y) / target.k
      const gx = fromCx + (toCx - fromCx) * e, gy = fromCy + (toCy - fromCy) * e
      setView({ k, x: cx - gx * k, y: cy - gy * k })
      animRef.current = p < 1 ? requestAnimationFrame(step) : null
    }
    animRef.current = requestAnimationFrame(step)
  }, [size.w, size.h, stopAnim])
  useEffect(() => stopAnim, [stopAnim])

  // Enquadra marcadores/áreas
  const pendingFitRef = useRef(false)
  const fit = useCallback((animate = false) => {
    if (!size.w || !size.h) return
    const only = fitIds ? new Set(fitIds) : null
    if (only && only.size === 0) return
    // Antes do zoom, o centro do mapa: se mudar, a projeção gira e o enquadramento
    // acontece de novo com ela (sem animação — o mapa todo muda de lugar)
    const lngs = [...markers.filter((m) => !only || only.has(m.id)).map((m) => m.lng),
      ...areas.filter((a) => !only || only.has(a.id)).map((a) => a.lng)]
    const center = bestCenterLng(lngs)
    if (center !== centerLng) { pendingFitRef.current = true; setCenterLng(center); return }
    const pts: Array<[number, number]> = []
    for (const m of markers) { if (only && !only.has(m.id)) continue; const p = projection([m.lng, m.lat]); if (p) pts.push(p) }
    for (const a of areas) {
      if (only && !only.has(a.id)) continue
      const r = a.radiusKm / 111.32
      for (const [dx, dy] of [[-r, 0], [r, 0], [0, -r], [0, r]]) {
        const p = projection([a.lng + dx, Math.max(-89, Math.min(89, a.lat + dy))]); if (p) pts.push(p)
      }
    }
    const nAreas = areas.filter((a) => !only || only.has(a.id)).length
    const apply = animate ? animateTo : (v: { k: number; x: number; y: number }) => { stopAnim(); setView(v) }
    if (pts.length === 0) { apply({ k: 1, x: 0, y: 0 }); return }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    const bw = Math.max(maxX - minX, 1), bh = Math.max(maxY - minY, 1)
    const maxK = only ? focusMaxZoom : pts.length === 1 && nAreas === 0 ? 6 : 40
    const k = Math.max(MIN_K, Math.min(maxK, (size.w * 0.7) / bw, (size.h * 0.7) / bh))
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    apply({ k, x: size.w / 2 - cx * k, y: size.h / 2 - cy * k })
  }, [markers, areas, fitIds, focusMaxZoom, projection, size.w, size.h, animateTo, stopAnim, centerLng])
  useEffect(() => {
    if (!pendingFitRef.current) return
    pendingFitRef.current = false
    fit(false)
  }, [projection, fit])

  // Conversão entre a vista em pixels e a vista geográfica (independe do tamanho)
  const toGeo = useCallback((v: { k: number; x: number; y: number }, proj: typeof projection, w: number, h: number): GeoView | null => {
    const ll = proj.invert?.([(w / 2 - v.x) / v.k, (h / 2 - v.y) / v.k])
    return ll && Number.isFinite(ll[0]) && Number.isFinite(ll[1]) ? { lng: ll[0], lat: ll[1], z: v.k * proj.scale() } : null
  }, [])
  const fromGeo = useCallback((g: GeoView) => {
    const k = Math.max(MIN_K, Math.min(MAX_K, g.z / projection.scale()))
    const p = projection([g.lng, g.lat])
    return p ? { k, x: size.w / 2 - p[0] * k, y: size.h / 2 - p[1] * k } : null
  }, [projection, size.w, size.h])

  // Primeira vista: a retomada (initialView) ou o enquadramento dos marcadores.
  // Depois, só reenquadra quando fitKey muda para um novo valor; mudança de
  // tamanho (painel lateral, janela) mantém o centro e o zoom.
  const fittedRef = useRef<{ done: boolean; key?: string | null }>({ done: false })
  const prevSizeRef = useRef<{ w: number; h: number; proj: typeof projection } | null>(null)
  useEffect(() => {
    if (!size.w) return
    const prevSize = prevSizeRef.current
    prevSizeRef.current = { w: size.w, h: size.h, proj: projection }
    const state = fittedRef.current
    if (!state.done) {
      fittedRef.current = { done: true, key: fitKey }
      const restored = initialView ? fromGeo(initialView) : null
      if (restored) { stopAnim(); setView(restored) } else fit(false)
      return
    }
    if (fitKey != null && fitKey !== state.key) {
      fittedRef.current = { done: true, key: fitKey }
      fit(true)
      return
    }
    if (fitKey !== state.key) fittedRef.current = { done: true, key: fitKey }
    if (prevSize && (prevSize.w !== size.w || prevSize.h !== size.h)) {
      const g = toGeo(viewRef.current, prevSize.proj, prevSize.w, prevSize.h)
      const v = g && fromGeo(g)
      if (v) { stopAnim(); setView(v) }
    }
  }, [fitKey, size.w, size.h, projection, fit, initialView, fromGeo, toGeo, stopAnim])

  // Avisa a vista atual (para o MapView retomá-la ao voltar à tela)
  const onViewChangeRef = useRef(onViewChange)
  onViewChangeRef.current = onViewChange
  useEffect(() => {
    if (!size.w || !fittedRef.current.done) return
    const g = toGeo(view, projection, size.w, size.h)
    if (g) onViewChangeRef.current?.(g)
  }, [view, projection, size.w, size.h, toGeo])

  // ── Zoom e arraste ─────────────────────────────────────────────────────────
  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    stopAnim()
    setView((v) => {
      const k = Math.max(MIN_K, Math.min(MAX_K, v.k * factor))
      return { k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) }
    })
  }, [stopAnim])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('[data-marker]')) return
    stopAnim()
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    if (d.moved) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d || d.moved || !onMapClick) return
    const r = wrapRef.current!.getBoundingClientRect()
    const px = (e.clientX - r.left - view.x) / view.k
    const py = (e.clientY - r.top - view.y) / view.k
    const ll = projection.invert?.([px, py])
    if (ll && Number.isFinite(ll[0]) && Number.isFinite(ll[1])) onMapClick(ll[0], ll[1])
  }

  /** Marcador de um evento só (bolinha ou losango, como na timeline) */
  const drawMarker = (m: MapMarker, x: number, y: number) => {
    const click = (e: React.MouseEvent) => {
      e.stopPropagation()
      const r = wrapRef.current!.getBoundingClientRect()
      onMarkerClick?.([m.id], { x: e.clientX - r.left, y: e.clientY - r.top })
    }
    const s = m.selected ? 1.4 : 1
    return (
      <g key={m.id} data-marker transform={`translate(${x},${y}) scale(${s})`} opacity={m.opacity ?? 1} className="cursor-pointer" onClick={click}>
        <title>{m.label}</title>
        {m.shape === 'diamond'
          ? <rect x={-5} y={-5} width={10} height={10} transform="rotate(45)" fill={css.accent} stroke={css.surface} strokeWidth={1.5} />
          : <circle r={5.5} fill={css.surface} stroke={css.dot} strokeWidth={2} />}
      </g>
    )
  }

  const btn = 'w-7 h-7 flex items-center justify-center bg-surface border border-chr-subtle text-chr-secondary hover:text-chr-primary hover:bg-hover transition-colors'

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden select-none ${onMapClick ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'} ${className ?? ''}`}
      style={{ background: css.ocean, touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={(e) => { const r = wrapRef.current!.getBoundingClientRect(); zoomAt(2, e.clientX - r.left, e.clientY - r.top) }}
      data-testid="world-map"
    >
      {size.w > 0 && (
        <svg width={size.w} height={size.h} className="absolute inset-0">
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            <path d={sphereD} fill={css.ocean} stroke={css.border} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <path d={graticuleD} fill="none" stroke={css.grid} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
            {layersD.map((l) => (
              <g key={l.id} data-basemap={l.on ? 'on' : 'off'} style={{ opacity: l.on ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` }}>
                {l.d.map((d, i) => (
                  <path key={i} d={d} fill={css.land} stroke={css.border} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            ))}
            {bordersD.map((l) => (
              <g key={`b${l.id}`} data-borders={l.on ? 'on' : 'off'} style={{ opacity: l.on ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` }}>
                {l.shapes.map((sh, i) => (
                  <path key={i} d={sh.d} fill={css.text} fillOpacity={sh.tint * tintScale} stroke={css.muted} strokeOpacity={0.55}
                    strokeWidth={0.7} strokeDasharray={sh.approx ? '3 2' : undefined} vectorEffect="non-scaling-stroke">
                    {sh.name && <title>{sh.name}</title>}
                  </path>
                ))}
              </g>
            ))}
            {areaD.map((a) => (
              <path key={a.id} d={a.d} fill={css.accent} fillOpacity={a.fill} stroke={css.accent} strokeOpacity={0.7 * a.opacity}
                strokeWidth={1.2} vectorEffect="non-scaling-stroke" data-area={a.id} data-count={a.count} />
            ))}
            {linesD.map((l) => (
              // Rotas discretas: com muitas, não cobrem os pontos e os países
              <path key={l.id} d={l.d} fill="none" stroke={css.accent} vectorEffect="non-scaling-stroke" data-line-kind={l.kind}
                {...(l.kind === 'link' ? { strokeOpacity: 0.7 * l.opacity, strokeWidth: 1.2 }
                  : l.kind === 'backlink' ? { strokeOpacity: 0.6 * l.opacity, strokeWidth: 1.2, strokeDasharray: '1.5 3', strokeLinecap: 'round' as const }
                  : { strokeOpacity: 0.55 * l.opacity, strokeWidth: 1.2, strokeDasharray: '4 3' })} />
            ))}
          </g>

          {borderLabels.length > 0 && (
            <g pointerEvents="none" data-border-labels>
              {borderLabels.map((l, i) => (
                <text key={i} x={l.x} y={l.y} textAnchor="middle" dy="0.35em" fontSize={11} fontFamily="var(--font-mono)"
                  fill={css.muted} stroke={css.ocean} strokeWidth={2} strokeOpacity={0.6} strokeLinejoin="round" paintOrder="stroke">{l.text}</text>
              ))}
            </g>
          )}

          {groups.map((g) => {
            const ids = g.items.map((m) => m.id)
            const opacity = Math.max(...g.items.map((m) => m.opacity ?? 1))
            if (g.items.length > 1) {
              const n = g.items.length
              const click = (e: React.MouseEvent) => {
                e.stopPropagation()
                const r = wrapRef.current!.getBoundingClientRect()
                onMarkerClick?.(ids, { x: e.clientX - r.left, y: e.clientY - r.top })
              }
              const selected = g.items.some((m) => m.selected)
              const trail = opacity < 0.99
              const tip = g.items.slice(0, TOOLTIP_MAX).map((m) => m.label).join('\n') + (n > TOOLTIP_MAX ? `\n+${n - TOOLTIP_MAX}` : '')
              return (
                <g key={g.key} data-marker data-count={n} transform={`translate(${g.x},${g.y})`} opacity={opacity} className="cursor-pointer" onClick={click}>
                  <title>{tip}</title>
                  {/* O círculo cresce com o número de dígitos para a contagem caber. Grupo do
                      rastro: só contorno, para não competir com os eventos do momento */}
                  <circle r={markerRadius(n)} fill={trail ? css.surface : css.text} stroke={selected ? css.accent : trail ? css.muted : css.surface}
                    strokeWidth={selected ? 3 : trail ? 1.5 : 2} />
                  <text textAnchor="middle" dy="0.35em" fontSize={10} fontFamily="var(--font-mono)" fill={trail ? css.muted : css.inverse}>{n}</text>
                </g>
              )
            }
            return drawMarker(g.items[0], g.x, g.y)
          })}

        </svg>
      )}

      {/* Controles de zoom */}
      <div className="absolute right-3 bottom-3 flex flex-col shadow-card" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" title={t('map_zoom_in')} aria-label={t('map_zoom_in')} className={btn} onClick={() => zoomAt(1.6, size.w / 2, size.h / 2)}><Plus size={13} /></button>
        <button type="button" title={t('map_zoom_out')} aria-label={t('map_zoom_out')} className={btn} onClick={() => zoomAt(1 / 1.6, size.w / 2, size.h / 2)}><Minus size={13} /></button>
        <button type="button" title={t('map_fit')} aria-label={t('map_fit')} className={btn} onClick={() => fit(true)}><Maximize size={12} /></button>
      </div>
    </div>
  )
}
