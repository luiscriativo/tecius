/**
 * Ligações entre eventos no texto: `[[Título]]`, `[[Timeline/Título]]` (quando
 * dois eventos têm o mesmo título) e `[[Título|texto mostrado]]`.
 * O evento é encontrado pelo título, sem diferenciar maiúsculas e acentos.
 */

import type { TextEdit } from './markdownEdit'

/** Um evento do vault (o mesmo formato do índice da busca global) */
export interface VaultEventDoc {
  filePath: string
  slug: string
  title: string
  date: string
  timelineDir: string
  timelineTitle: string
}

/** Minúsculo, sem acentos e com espaços normalizados — para comparar títulos */
export const normTitle = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export const WIKI_LINK_RE = /\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]/g

/** `Título|texto` → alvo e texto mostrado */
export function parseWikiLink(inner: string): { target: string; label: string } {
  const [target, label] = inner.split('|')
  return { target: target.trim(), label: (label ?? target).trim() }
}

/**
 * Encontra o evento de um alvo. Com títulos repetidos, `Timeline/Título` escolhe a
 * timeline; sem isso, vale o da timeline atual (`contextDir`) e depois o primeiro.
 */
export function resolveWikiLink(target: string, docs: VaultEventDoc[], contextDir?: string): VaultEventDoc | null {
  const pick = (list: VaultEventDoc[]) => list.find((d) => d.timelineDir === contextDir) ?? list[0] ?? null
  const t = normTitle(target)
  const exact = docs.filter((d) => normTitle(d.title) === t)
  if (exact.length) return pick(exact)
  // Timeline/Título — o título pode ter "/", então testa cada divisão
  for (let i = target.indexOf('/'); i > 0; i = target.indexOf('/', i + 1)) {
    const tl = normTitle(target.slice(0, i)), title = normTitle(target.slice(i + 1))
    const hit = docs.filter((d) => normTitle(d.title) === title && normTitle(d.timelineTitle) === tl)
    if (hit.length) return hit[0]
  }
  return null
}

/** Texto a escrever entre `[[ ]]` para um evento: o título, ou `Timeline/Título` se o título se repete */
export function wikiTextFor(doc: VaultEventDoc, docs: VaultEventDoc[]): string {
  const t = normTitle(doc.title)
  const repeated = docs.some((d) => d !== doc && d.filePath + d.slug !== doc.filePath + doc.slug && normTitle(d.title) === t)
  return repeated ? `${doc.timelineTitle}/${doc.title}` : doc.title
}

/** Sugestões para o que foi digitado depois de `[[`: começa com > contém; timeline atual primeiro */
export function suggestWikiTargets(query: string, docs: VaultEventDoc[], contextDir?: string, limit = 8): VaultEventDoc[] {
  const q = normTitle(query)
  const score = (d: VaultEventDoc) => {
    const t = normTitle(d.title)
    if (q && !t.includes(q)) return -1
    return (q && t.startsWith(q) ? 2 : 0) + (d.timelineDir === contextDir ? 1 : 0)
  }
  return docs
    .map((d) => ({ d, s: score(d) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || a.d.title.localeCompare(b.d.title))
    .slice(0, limit)
    .map((x) => x.d)
}

/** O que está sendo digitado num `[[` ainda aberto antes do cursor (ou `null`) */
export function openWikiQuery(before: string): string | null {
  const m = /\[\[([^[\]\n|]{0,80})$/.exec(before)
  return m ? m[1] : null
}

/** Troca o `[[consulta` antes do cursor por `[[texto]]` (aproveita um `]]` que já esteja depois) */
export function completeWikiLink(v: string, caret: number, text: string): TextEdit {
  const start = v.lastIndexOf('[[', caret)
  const after = v.slice(caret).startsWith(']]') ? caret + 2 : caret
  const ins = `[[${text}]]`
  return { value: v.slice(0, start) + ins + v.slice(after), selStart: start + ins.length, selEnd: start + ins.length }
}

// ── Plugin de Markdown: [[…]] vira um link marcado com data-wiki ─────────────

interface MdNode { type: string; value?: string; url?: string; children?: MdNode[]; data?: Record<string, unknown> }

/**
 * Plugin remark: troca `[[…]]` em textos por links com `data-wiki` (o alvo).
 * O componente `a` do ReactMarkdown decide como mostrar (link de evento).
 * Não mexe em código nem dentro de links.
 */
export function remarkWikiLinks() {
  const walk = (node: MdNode) => {
    if (!node.children || node.type === 'link' || node.type === 'linkReference') return
    const out: MdNode[] = []
    for (const child of node.children) {
      if (child.type !== 'text' || !child.value?.includes('[[')) { walk(child); out.push(child); continue }
      const text = child.value
      let last = 0
      for (const m of text.matchAll(WIKI_LINK_RE)) {
        if (m.index! > last) out.push({ type: 'text', value: text.slice(last, m.index) })
        const { target, label } = parseWikiLink(m[1] + (m[2] ? `|${m[2]}` : ''))
        out.push({ type: 'link', url: '#', data: { hProperties: { 'data-wiki': target } }, children: [{ type: 'text', value: label }] })
        last = m.index! + m[0].length
      }
      if (last < text.length) out.push({ type: 'text', value: text.slice(last) })
    }
    node.children = out
  }
  return (tree: MdNode) => { walk(tree) }
}
