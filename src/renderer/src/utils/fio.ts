/**
 * Fio: um evento que conta uma história por paradas (outros eventos do vault).
 *
 * - As paradas ficam no cabeçalho, em `fio:` (o mesmo texto de um [[…]]).
 * - Ligações [[…]] do texto que não são paradas são menções (contexto).
 * - Ao escrever uma ligação nova num fio, ela entra como parada (autoAddStops).
 */

import { parseChroniclerDate } from './chroniclerDate'
import { docKey, eventTexts, normTitle, parseWikiLink, resolveWikiLink, WIKI_LINK_RE, type VaultEventDoc } from './wikiLinks'

export interface FioStop {
  /** Texto gravado na lista (alvo do [[…]]) */
  target: string
  /** Evento encontrado (null: não existe mais com esse título) */
  doc: VaultEventDoc | null
  /** A parada é citada no texto do fio */
  inText: boolean
}

export interface FioView {
  self: VaultEventDoc
  /** Em ordem de data; sem data e não encontradas no fim */
  stops: FioStop[]
  /** Ligações do texto que não são paradas */
  mentions: VaultEventDoc[]
}

/** Alvos das ligações [[…]] de um texto, na ordem */
export const linkTargets = (text: string): string[] =>
  [...text.matchAll(WIKI_LINK_RE)].map((m) => parseWikiLink(m[1]).target)

const textOf = (self: VaultEventDoc, docs: VaultEventDoc[]) =>
  eventTexts(docs.filter((d) => d.filePath === self.filePath)).find((x) => docKey(x.doc) === docKey(self))?.text ?? self.body ?? ''

/** Chave de identidade de um alvo: o evento, se existir; senão o título normalizado */
const targetKey = (target: string, docs: VaultEventDoc[], dir: string) => {
  const d = resolveWikiLink(target, docs, dir)
  return d ? docKey(d) : `?${normTitle(target)}`
}

const sortKey = (d: VaultEventDoc | null) => (d?.date ? parseChroniclerDate(d.date).sortKey : Infinity)

/** Paradas e menções de um fio (null se o evento não é um fio) */
export function fioView(self: VaultEventDoc, docs: VaultEventDoc[]): FioView | null {
  if (!self.fio) return null
  const inText = new Set(linkTargets(textOf(self, docs)).map((t) => targetKey(t, docs, self.timelineDir)))
  const seen = new Set<string>()
  const stops: FioStop[] = []
  for (const target of self.fio) {
    const k = targetKey(target, docs, self.timelineDir)
    if (seen.has(k)) continue
    seen.add(k)
    stops.push({ target, doc: resolveWikiLink(target, docs, self.timelineDir), inText: inText.has(k) })
  }
  stops.sort((a, b) => Number(!a.doc) - Number(!b.doc) || sortKey(a.doc) - sortKey(b.doc))
  const mentions: VaultEventDoc[] = []
  for (const t of linkTargets(textOf(self, docs))) {
    const d = resolveWikiLink(t, docs, self.timelineDir)
    if (!d || docKey(d) === docKey(self) || seen.has(docKey(d)) || mentions.some((m) => docKey(m) === docKey(d))) continue
    mentions.push(d)
  }
  return { self, stops, mentions }
}

/** Fios dos quais um evento é parada */
export function fiosContaining(doc: VaultEventDoc, docs: VaultEventDoc[]): VaultEventDoc[] {
  const key = docKey(doc)
  return docs.filter((f) => f.fio && docKey(f) !== key && f.fio.some((t) => resolveWikiLink(t, docs, f.timelineDir) && targetKey(t, docs, f.timelineDir) === key))
}

/**
 * Entrada automática: ligações que não estavam no texto antes da edição entram
 * como paradas (as que já estavam e não são paradas continuam menções).
 * Devolve a nova lista, ou null se nada mudou.
 */
export function autoAddStops(fio: string[], before: string, after: string, docs: VaultEventDoc[], self: VaultEventDoc): string[] | null {
  const dir = self.timelineDir
  const old = new Set([...linkTargets(before), ...fio].map((t) => targetKey(t, docs, dir)))
  const added: string[] = []
  for (const t of linkTargets(after)) {
    const k = targetKey(t, docs, dir)
    if (old.has(k) || k === docKey(self)) continue
    old.add(k)
    added.push(t)
  }
  return added.length ? [...fio, ...added] : null
}

/** Remove uma parada (pelo evento ou pelo texto) */
export function withoutStop(fio: string[], target: string, docs: VaultEventDoc[], dir: string): string[] {
  const k = targetKey(target, docs, dir)
  return fio.filter((t) => targetKey(t, docs, dir) !== k)
}
