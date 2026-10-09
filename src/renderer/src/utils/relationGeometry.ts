/**
 * Desenho das relações [[…]] com muitos eventos: agrupa para não virar borrão.
 *
 * - Timeline: um arco por grupo de destino (pontos agrupados no mesmo pixel) e
 *   quantos ligados há nele.
 * - Mapa: uma linha por lugar de destino (grade de ~3°).
 */

/** Posição de um evento na timeline: faixa e pixel do grupo em que ele está */
export interface LanePos { lane: number; px: number }

export interface RelationArc {
  key: string
  from: LanePos
  to: LanePos
  /** out: o selecionado cita; in: cita o selecionado */
  dir: 'out' | 'in'
  /** Quantos eventos ligados há no grupo de destino */
  count: number
}

/**
 * Arcos do evento selecionado (chave `self`) até os ligados, um por grupo de
 * destino e direção. Ligados fora do eixo ou no mesmo grupo do selecionado não
 * entram; um evento repetido conta uma vez.
 */
export function relationArcs(self: string, pos: Map<string, LanePos>, cites: string[], citedBy: string[]): RelationArc[] {
  const from = pos.get(self)
  if (!from) return []
  const byTarget = new Map<string, RelationArc>()
  const seen = new Set<string>()
  const add = (k: string, dir: 'out' | 'in') => {
    const to = pos.get(k)
    if (!to || (to.px === from.px && to.lane === from.lane) || seen.has(dir + k)) return
    seen.add(dir + k)
    const key = `${dir}|${to.lane}|${to.px}`
    const a = byTarget.get(key)
    if (a) a.count++
    else byTarget.set(key, { key, from, to, dir, count: 1 })
  }
  cites.forEach((k) => add(k, 'out'))
  citedBy.forEach((k) => add(k, 'in'))
  return [...byTarget.values()]
}

export interface RelationLine {
  id: string
  coords: Array<[number, number]>
  kind: 'link' | 'backlink'
  opacity: number
}

/**
 * Linhas do evento (`self`, [lng, lat]) até os ligados: uma por lugar de destino
 * e tipo. Ligados no mesmo lugar do evento não ganham linha. Com mais de 12
 * linhas, ficam mais claras.
 */
export function relationLines(self: [number, number], linked: Array<{ lng: number; lat: number; role: 'cites' | 'citedBy' }>, gridDeg = 3): RelationLine[] {
  const byPlace = new Map<string, Omit<RelationLine, 'opacity'>>()
  for (const r of linked) {
    if (r.lng === self[0] && r.lat === self[1]) continue
    const kind = r.role === 'cites' ? 'link' as const : 'backlink' as const
    const key = `${kind}|${Math.round(r.lng / gridDeg)}|${Math.round(r.lat / gridDeg)}`
    if (!byPlace.has(key)) byPlace.set(key, { id: `rel-${key}`, coords: [self, [r.lng, r.lat]], kind })
  }
  const all = [...byPlace.values()]
  return all.map((l) => ({ ...l, opacity: all.length > 12 ? 0.6 : 1 }))
}
