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
  /** Texto (no 1º trecho de um chronicle vem o arquivo inteiro; nos demais, vazio) */
  body?: string
  place?: string
  /** Local como está no cabeçalho (validar com parseLocation) */
  location?: unknown
  /** Trecho vinculado a outro evento (alvo [[…]]): um espelho, não é alvo de ligações */
  ref?: string
  /** Trecho de chronicle: âncora e título do chronicle */
  anchor?: string
  chronicleTitle?: string
}

const sameDoc = (a: VaultEventDoc, b: VaultEventDoc) => a.filePath === b.filePath && a.slug === b.slug

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
/**
 * Índice dos títulos (montado uma vez por lista de eventos): com milhares de
 * eventos e ligações, comparar todos os títulos a cada [[…]] travava o app.
 * Espelhos (trechos vinculados) não são alvo de ligações.
 */
const titleIndexCache = new WeakMap<VaultEventDoc[], { byTitle: Map<string, VaultEventDoc[]>; byTimeline: Map<string, VaultEventDoc[]> }>()
function titleIndex(docs: VaultEventDoc[]) {
  let idx = titleIndexCache.get(docs)
  if (!idx) {
    idx = { byTitle: new Map(), byTimeline: new Map() }
    for (const d of docs) {
      if (d.ref) continue
      const t = normTitle(d.title), k = `${normTitle(d.timelineTitle)}/${t}`
      idx.byTitle.set(t, [...(idx.byTitle.get(t) ?? []), d])
      idx.byTimeline.set(k, [...(idx.byTimeline.get(k) ?? []), d])
    }
    titleIndexCache.set(docs, idx)
  }
  return idx
}

export function resolveWikiLink(target: string, docs: VaultEventDoc[], contextDir?: string): VaultEventDoc | null {
  const idx = titleIndex(docs)
  const exact = idx.byTitle.get(normTitle(target))
  if (exact?.length) return exact.find((d) => d.timelineDir === contextDir) ?? exact[0]
  // Timeline/Título — o título pode ter "/", então testa cada divisão
  for (let i = target.indexOf('/'); i > 0; i = target.indexOf('/', i + 1)) {
    const hit = idx.byTimeline.get(`${normTitle(target.slice(0, i))}/${normTitle(target.slice(i + 1))}`)
    if (hit?.length) return hit[0]
  }
  return null
}

/** Texto a escrever entre `[[ ]]` para um evento: o título, ou `Timeline/Título` se o título se repete */
export function wikiTextFor(doc: VaultEventDoc, docs: VaultEventDoc[]): string {
  const same = titleIndex(docs).byTitle.get(normTitle(doc.title)) ?? []
  const repeated = same.some((d) => d.filePath + d.slug !== doc.filePath + doc.slug)
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
    .filter((d) => !d.ref)
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

// ── Menções ("Mencionado em") e renomeação ───────────────────────────────────

/**
 * Texto de cada evento do vault. Num chronicle o arquivo inteiro vem no 1º trecho;
 * aqui ele é dividido pelos marcadores `^âncora` (o texto até um marcador é daquele
 * trecho; o que sobra depois do último fica com o último).
 */
export function eventTexts(docs: VaultEventDoc[]): Array<{ doc: VaultEventDoc; text: string }> {
  const out: Array<{ doc: VaultEventDoc; text: string }> = []
  const byFile = new Map<string, VaultEventDoc[]>()
  for (const d of docs) {
    const g = byFile.get(d.filePath)
    if (g) g.push(d)
    else byFile.set(d.filePath, [d])
  }
  for (const group of byFile.values()) {
    const body = group.find((d) => d.body)?.body ?? ''
    if (group.length === 1 || !group.some((d) => d.anchor)) { out.push({ doc: group[0], text: body }); continue }
    const markers = [...body.matchAll(/\^([\w-]+)\s*$/gm)]
    let prev = 0
    const done = new Set<VaultEventDoc>()
    markers.forEach((m, i) => {
      const end = i === markers.length - 1 ? body.length : m.index! + m[0].length
      const doc = group.find((d) => d.anchor === m[1])
      if (doc && !done.has(doc)) { out.push({ doc, text: body.slice(prev, i === markers.length - 1 ? body.length : m.index!) }); done.add(doc) }
      prev = end
    })
    for (const d of group) if (!done.has(d)) out.push({ doc: d, text: '' })
  }
  return out
}

/** Trecho de texto em volta de uma posição (sem marcações de Markdown), para mostrar o contexto */
export function snippetAround(text: string, at: number, width = 140): string {
  const ls = text.lastIndexOf('\n\n', at) + 1
  const ne = text.indexOf('\n\n', at)
  let para = text.slice(ls, ne < 0 ? text.length : ne)
  let pos = at - ls
  if (para.length > width) {
    const start = Math.max(0, Math.min(pos - width / 2, para.length - width))
    para = (start > 0 ? '…' : '') + para.slice(start, start + width) + (start + width < para.length ? '…' : '')
    pos -= start
  }
  return para
    .replace(/\s*\^[\w-]+\s*$/gm, '')
    .replace(/\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]/g, (_m, t: string, l?: string) => (l ?? t).trim())
    .replace(/[*_~`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Eventos que citam `target` com [[…]] (um por evento, com o trecho em volta da
 * menção) e trechos vinculados a ele (`linked`, com o começo do texto do trecho)
 */
export function findBacklinks(target: VaultEventDoc, docs: VaultEventDoc[]): Array<{ doc: VaultEventDoc; snippet: string; linked?: boolean }> {
  const out: Array<{ doc: VaultEventDoc; snippet: string; linked?: boolean }> = []
  for (const { doc, text } of eventTexts(docs)) {
    if (sameDoc(doc, target)) continue
    if (doc.ref) {
      const hit = resolveWikiLink(doc.ref, docs, doc.timelineDir)
      if (hit && sameDoc(hit, target)) { out.push({ doc, snippet: snippetAround(text, 0), linked: true }); continue }
    }
    if (!text.includes('[[')) continue
    for (const m of text.matchAll(WIKI_LINK_RE)) {
      const hit = resolveWikiLink(parseWikiLink(m[1]).target, docs, doc.timelineDir)
      if (hit && sameDoc(hit, target)) { out.push({ doc, snippet: snippetAround(text, m.index!) }); break }
    }
  }
  return out
}

/** Chave única de um evento do vault (o mesmo arquivo pode ter vários trechos) */
export const docKey = (d: { filePath: string; slug: string }) => `${d.filePath}#${d.slug}`

/**
 * Relações de um evento: os que ele cita (na ordem em que aparecem no texto) e
 * os que citam ele. Cada evento entra uma vez; o próprio evento não entra.
 */
export function eventRelations(self: VaultEventDoc, docs: VaultEventDoc[]): { cites: VaultEventDoc[]; citedBy: VaultEventDoc[] } {
  const text = eventTexts(docs.filter((d) => d.filePath === self.filePath)).find((x) => sameDoc(x.doc, self))?.text ?? ''
  const cites: VaultEventDoc[] = []
  for (const m of text.matchAll(WIKI_LINK_RE)) {
    const hit = resolveWikiLink(parseWikiLink(m[1]).target, docs, self.timelineDir)
    if (hit && !sameDoc(hit, self) && !cites.some((c) => sameDoc(c, hit))) cites.push(hit)
  }
  return { cites, citedBy: findBacklinks(self, docs).map((b) => b.doc) }
}

/**
 * Ligações que usam o título antigo de um evento renomeado: as formas `[[Antigo]]`
 * e `[[Timeline/Antigo]]`. Se outro evento ainda tem o título antigo, `[[Antigo]]`
 * é dele — só a forma com a timeline conta.
 */
export function linksToOldTitle(oldTitle: string, timelineTitle: string, docs: VaultEventDoc[], self: { filePath: string }): { files: string[]; count: number; targets: string[] } {
  const plain = normTitle(oldTitle), qualified = normTitle(`${timelineTitle}/${oldTitle}`)
  // Trechos vinculados repetem o título do original (o índice ainda tem o antigo): não contam
  const stillUsed = docs.some((d) => !d.ref && d.filePath !== self.filePath && normTitle(d.title) === plain)
  const accepts = (t: string) => normTitle(t) === qualified || (!stillUsed && normTitle(t) === plain)
  const files = new Set<string>()
  let count = 0
  for (const { doc, text } of eventTexts(docs)) {
    for (const m of text.matchAll(WIKI_LINK_RE)) {
      if (accepts(parseWikiLink(m[1]).target)) { files.add(doc.filePath); count++ }
    }
    // Trecho vinculado ao evento renomeado: o `ref:` também é atualizado
    if (doc.ref && accepts(doc.ref)) { files.add(doc.filePath); count++ }
  }
  return { files: [...files], count, targets: stillUsed ? [`${timelineTitle}/${oldTitle}`] : [oldTitle, `${timelineTitle}/${oldTitle}`] }
}
