/**
 * Paleogeografia no modo "Mapa" — quadros-chave e nomes das eras.
 *
 * O GPlates leva minutos para reconstruir as linhas de costa de uma idade nova,
 * então o mapa não consulta a idade exata do cursor: arredonda as idades dos
 * eventos em "quadros-chave" (1 em 1 Ma até 100 Ma, 5 em 5 Ma acima), busca
 * só esses e mostra o quadro mais próximo do cursor.
 */

import type { Language } from '@/i18n/translations'

/** Antes disso, a geografia já era bem diferente da atual */
export const DEEP_TIME_YEARS = -10_000
/** Alcance do modelo de placas (MERDITH2021) */
export const PALEO_MAX_MA = 1000

/** Idade em milhões de anos de um ano (negativo = passado) */
export function yearToMa(year: number): number {
  return Math.max(0, -year / 1e6)
}

/**
 * Quadro-chave para uma idade: 0 = mapa atual (menos de 1 Ma, a diferença não
 * aparece num mapa-múndi); null = além do alcance do modelo.
 */
export function keyframeAge(ageMa: number): number | null {
  if (ageMa > PALEO_MAX_MA) return null
  if (ageMa < 1) return 0
  if (ageMa <= 100) return Math.round(ageMa)
  return Math.min(PALEO_MAX_MA, Math.round(ageMa / 5) * 5)
}

/** Quadro (entre os disponíveis) mais próximo de uma idade */
export function nearestKeyframe(frames: number[], ageMa: number): number | null {
  let best: number | null = null
  for (const f of frames) if (best === null || Math.abs(f - ageMa) < Math.abs(best - ageMa)) best = f
  return best
}

// ── Escala de tempo geológico (ICS), em Ma ──────────────────────────────────
const PERIODS: Array<[number, string, string]> = [
  [2.58, 'Quaternário', 'Quaternary'],
  [23.03, 'Neogeno', 'Neogene'],
  [66, 'Paleogeno', 'Paleogene'],
  [145, 'Cretáceo', 'Cretaceous'],
  [201.4, 'Jurássico', 'Jurassic'],
  [251.9, 'Triássico', 'Triassic'],
  [298.9, 'Permiano', 'Permian'],
  [358.9, 'Carbonífero', 'Carboniferous'],
  [419.2, 'Devoniano', 'Devonian'],
  [443.8, 'Siluriano', 'Silurian'],
  [485.4, 'Ordoviciano', 'Ordovician'],
  [538.8, 'Cambriano', 'Cambrian'],
  [635, 'Ediacarano', 'Ediacaran'],
  [720, 'Criogeniano', 'Cryogenian'],
  [1000, 'Toniano', 'Tonian'],
  [1600, 'Mesoproterozoico', 'Mesoproterozoic'],
  [2500, 'Paleoproterozoico', 'Paleoproterozoic'],
  [4031, 'Arqueano', 'Archean'],
  [Infinity, 'Hadeano', 'Hadean'],
]

/** Período geológico de uma idade (no limite exato, vale o período mais antigo: 66 Ma → Cretáceo) */
export function geologicPeriod(ageMa: number, lang: Language): string {
  const p = PERIODS.find(([end]) => ageMa < end) ?? PERIODS[PERIODS.length - 1]
  return lang === 'en' ? p[2] : p[1]
}

const SUPERCONTINENTS: Array<[number, number, string, string]> = [
  [175, 335, 'Pangeia', 'Pangaea'],
  [335, 550, 'Gondwana', 'Gondwana'],
  [750, 1100, 'Rodínia', 'Rodinia'],
  [1300, 1800, 'Colúmbia', 'Columbia'],
]

/** Supercontinente da época, quando houver */
export function supercontinent(ageMa: number, lang: Language): string | null {
  const s = SUPERCONTINENTS.find(([from, to]) => ageMa >= from && ageMa <= to)
  return s ? (lang === 'en' ? s[3] : s[2]) : null
}
