/**
 * Escala da timeline horizontal: onde cada data fica no canvas (fração 0..1).
 *
 * - linear: proporcional ao tempo (o comportamento clássico)
 * - compressed: cada intervalo entre datas com eventos ganha espaço pelo
 *   logaritmo da sua duração (mesma escala da régua do modo Mapa). Uma timeline
 *   que vai da Pangeia a 1960 cabe na tela e ainda chega ao nível de dia no zoom.
 */

import { buildTimeScale } from './mapTime'

export type ScaleMode = 'linear' | 'compressed'
export type ScalePreference = 'auto' | ScaleMode

/** Margem nas pontas do canvas (fração) */
const PAD = 0.045
/** Acima deste intervalo (anos), a escala automática passa a ser comprimida */
export const AUTO_COMPRESS_SPAN_YEARS = 5000

export interface ScaleSegment {
  /** Início e fim (anos decimais) e frações correspondentes no canvas */
  t0: number
  t1: number
  f0: number
  f1: number
}

export interface CanvasScale {
  mode: ScaleMode
  minT: number
  maxT: number
  /** t (anos decimais) → fração 0..1 do canvas */
  frac: (t: number) => number
  /** fração → t */
  tAt: (f: number) => number
  /** Trechos lineares entre datas com eventos (só na escala comprimida) */
  segments: ScaleSegment[]
}

export function resolveScaleMode(pref: ScalePreference, spanYears: number): ScaleMode {
  if (pref !== 'auto') return pref
  return spanYears > AUTO_COMPRESS_SPAN_YEARS ? 'compressed' : 'linear'
}

export function buildCanvasScale(ts: number[], mode: ScaleMode): CanvasScale {
  const minT = ts.length ? Math.min(...ts) : 0
  const maxT = ts.length ? Math.max(...ts) : 0
  const inner = 1 - 2 * PAD

  if (mode === 'linear' || ts.length < 2 || maxT === minT) {
    const span = maxT - minT
    return {
      mode: 'linear', minT, maxT, segments: [],
      frac: (t) => (span ? PAD + ((t - minT) / span) * inner : 0.5),
      tAt: (f) => (span ? minT + ((f - PAD) / inner) * span : minT),
    }
  }

  const scale = buildTimeScale(ts)
  const frac = (t: number) => PAD + scale.toPos(t) * inner
  const segments = scale.stops.slice(1).map((t1, i) => {
    const t0 = scale.stops[i]
    return { t0, t1, f0: frac(t0), f1: frac(t1) }
  })
  return {
    mode: 'compressed', minT, maxT, segments, frac,
    tAt: (f) => scale.fromPos((f - PAD) / inner),
  }
}

/** Limites (t) da área com margem — o eixo linear desenha nesse intervalo */
export function paddedRange(scale: CanvasScale): [number, number] {
  return [scale.tAt(0), scale.tAt(1)]
}
