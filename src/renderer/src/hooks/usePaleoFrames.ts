/**
 * usePaleoFrames — carrega em segundo plano os quadros-chave paleogeográficos
 * (linhas de costa + posição reconstruída dos pontos) de uma timeline.
 *
 * - Um quadro por vez, começando pelo mais próximo da idade "prioritária"
 *   (a do cursor), para não sobrecarregar o servidor público do GPlates.
 * - O main guarda tudo em cache em disco; aqui fica um cache em memória para
 *   trocar de quadro instantaneamente (inclusive ao voltar para o modo Mapa).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FeatureCollection } from 'geojson'

type LngLat = [number, number]

interface CoastResult { coast: FeatureCollection; model: string }

const coastCache = new Map<number, Promise<CoastResult>>()
const pointCache = new Map<string, LngLat | null>()
const pointKey = (age: number, p: LngLat) => `${age}|${p[0]},${p[1]}`

function loadCoast(age: number): Promise<CoastResult> {
  let p = coastCache.get(age)
  if (!p) {
    p = window.electronAPI
      .invoke<{ success: boolean; data?: FeatureCollection; model?: string; error?: string }>('geo:paleo-coastlines', age)
      .then((r) => {
        if (!r.success || !r.data) throw new Error(r.error ?? 'GPlates')
        return { coast: r.data, model: r.model ?? '' }
      })
    p.catch(() => coastCache.delete(age))   // permite tentar de novo
    coastCache.set(age, p)
  }
  return p
}

async function loadPoints(age: number, points: LngLat[]): Promise<void> {
  const missing = points.filter((p) => !pointCache.has(pointKey(age, p)))
  if (missing.length === 0) return
  const r = await window.electronAPI
    .invoke<{ success: boolean; data?: Array<LngLat | null>; error?: string }>('geo:paleo-points', missing, age)
  if (!r.success || !r.data) throw new Error(r.error ?? 'GPlates')
  missing.forEach((p, i) => pointCache.set(pointKey(age, p), r.data![i] ?? null))
}

export interface PaleoFrame {
  age: number
  model: string
  coast: FeatureCollection
  /** Posição reconstruída de um ponto atual (null = sem placa nessa idade) */
  pointOf: (p: LngLat) => LngLat | null
}

export function usePaleoFrames(enabled: boolean, ages: number[], points: LngLat[], priorityAge: number | null) {
  const [frames, setFrames] = useState<Map<number, { coast: FeatureCollection; model: string }>>(new Map())
  const [loading, setLoading] = useState<number | null>(null)
  const [failed, setFailed] = useState<number[]>([])
  const [retryToken, setRetryToken] = useState(0)

  const priorityRef = useRef(priorityAge)
  priorityRef.current = priorityAge

  const agesKey = ages.join(',')
  const pointsKey = points.map((p) => p.join(',')).join(';')

  useEffect(() => {
    if (!enabled || ages.length === 0) { setLoading(null); return }
    let alive = true
    const failedNow = new Set<number>()
    const ready = (age: number) =>
      frames.has(age) && points.every((p) => pointCache.has(pointKey(age, p)))
    ;(async () => {
      const done = new Set<number>()
      for (;;) {
        const pending = ages.filter((a) => !done.has(a) && !failedNow.has(a) && !ready(a))
        if (!alive || pending.length === 0) break
        const pr = priorityRef.current ?? pending[0]
        const age = pending.reduce((a, b) => (Math.abs(b - pr) < Math.abs(a - pr) ? b : a))
        setLoading(age)
        try {
          const [c] = await Promise.all([loadCoast(age), loadPoints(age, points)])
          done.add(age)
          if (alive) setFrames((m) => (m.get(age) === c ? m : new Map(m).set(age, c)))
        } catch {
          failedNow.add(age)
        }
      }
      if (alive) { setLoading(null); setFailed([...failedNow]) }
    })()
    return () => { alive = false }
    // frames fica de fora de propósito: o laço só precisa recomeçar quando mudam os pedidos
  }, [enabled, agesKey, pointsKey, retryToken]) // eslint-disable-line react-hooks/exhaustive-deps

  const frameFor = useCallback((age: number): PaleoFrame | null => {
    const f = frames.get(age)
    if (!f) return null
    return { age, model: f.model, coast: f.coast, pointOf: (p) => pointCache.get(pointKey(age, p)) ?? null }
  }, [frames])

  const loaded = useMemo(() => ages.filter((a) => frames.has(a)), [ages, frames])
  const retry = useCallback(() => { setFailed([]); setRetryToken((n) => n + 1) }, [])

  return { frameFor, loaded, loading, failed, retry }
}
