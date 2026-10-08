/**
 * Edição de Markdown da barra de formatação e dos atalhos do editor.
 * Funções puras: recebem o texto e a seleção e devolvem o texto novo e a seleção
 * a mostrar. Aplicar de novo a mesma formatação a desfaz (toggle).
 */

export interface TextEdit { value: string; selStart: number; selEnd: number }

const lineStartAt = (v: string, i: number) => v.lastIndexOf('\n', i - 1) + 1
const lineEndAt = (v: string, i: number) => { const n = v.indexOf('\n', i); return n < 0 ? v.length : n }

/** Quantos `ch` seguidos há antes de `i` (para a esquerda) ou a partir de `i` */
const runLeft = (v: string, i: number, ch: string) => { let n = 0; while (i - n - 1 >= 0 && v[i - n - 1] === ch) n++; return n }
const runRight = (v: string, i: number, ch: string) => { let n = 0; while (v[i + n] === ch) n++; return n }

/**
 * Negrito (`**`), itálico (`*`), tachado (`~~`), código (`` ` ``).
 * - Com seleção: envolve; espaços nas pontas ficam de fora (`**palavra **` não é negrito).
 * - Se a seleção já está envolvida pela marca (por dentro ou por fora), remove.
 * - Sem seleção: insere a marca com um texto de exemplo selecionado.
 */
export function toggleInline(v: string, s: number, e: number, marker: string, placeholder: string): TextEdit {
  // Espaços nas pontas da seleção ficam fora da marca
  while (s < e && /\s/.test(v[s])) s++
  while (e > s && /\s/.test(v[e - 1])) e--
  const m = marker.length
  const ch = marker[0]
  const sel = v.slice(s, e)

  // Itálico (`*`) não pode confundir com negrito (`**`): conta as sequências de `*`
  const isActiveOutside = () => {
    if (ch === '*' && m === 1) {
      const l = runLeft(v, s, '*'), r = runRight(v, e, '*')
      return l % 2 === 1 && r % 2 === 1   // *x* ou ***x***
    }
    return v.slice(s - m, s) === marker && v.slice(e, e + m) === marker
  }
  const isActiveInside = () => {
    if (sel.length < 2 * m + 1 || !sel.startsWith(marker) || !sel.endsWith(marker)) return false
    if (ch === '*' && m === 1) {
      const l = runRight(sel, 0, '*'), r = runLeft(sel, sel.length, '*')
      return l % 2 === 1 && r % 2 === 1
    }
    return true
  }

  if (sel && isActiveOutside()) {
    return { value: v.slice(0, s - m) + sel + v.slice(e + m), selStart: s - m, selEnd: e - m }
  }
  if (sel && isActiveInside()) {
    const inner = sel.slice(m, sel.length - m)
    return { value: v.slice(0, s) + inner + v.slice(e), selStart: s, selEnd: s + inner.length }
  }
  if (sel) {
    return { value: v.slice(0, s) + marker + sel + marker + v.slice(e), selStart: s + m, selEnd: e + m }
  }
  const ins = marker + placeholder + marker
  return { value: v.slice(0, s) + ins + v.slice(e), selStart: s + m, selEnd: s + m + placeholder.length }
}

/** Título `##` / `###` na linha do cursor; clicar no mesmo nível de novo remove */
export function toggleHeading(v: string, s: number, level: number): TextEdit {
  const ls = lineStartAt(v, s), le = lineEndAt(v, s)
  const line = v.slice(ls, le)
  const current = /^(#{1,6})\s+/.exec(line)
  const clean = line.replace(/^#{1,6}\s*/, '')
  const prefix = current && current[1].length === level ? '' : '#'.repeat(level) + ' '
  const newLine = prefix + clean
  const cursor = Math.max(ls + prefix.length, Math.min(ls + newLine.length, s - line.length + newLine.length))
  return { value: v.slice(0, ls) + newLine + v.slice(le), selStart: cursor, selEnd: cursor }
}

export type BlockKind = 'quote' | 'bullet' | 'numbered' | 'task'

const LIST_MARKER = /^(\s*)(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/
const markerOf = (kind: BlockKind, n: number) =>
  kind === 'quote' ? '> ' : kind === 'bullet' ? '- ' : kind === 'task' ? '- [ ] ' : `${n}. `
const hasKind = (line: string, kind: BlockKind) =>
  kind === 'quote' ? /^\s*>\s?/.test(line)
  : kind === 'task' ? /^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)
  : kind === 'numbered' ? /^\s*\d+[.)]\s+/.test(line)
  : /^\s*[-*+]\s+(?!\[[ xX]\]\s)/.test(line)

/**
 * Citação e listas em todas as linhas da seleção (não só na primeira).
 * - Se todas as linhas já são desse tipo, remove (toggle).
 * - Trocar entre tipos de lista substitui o marcador (`- item` → `1. item`), não empilha.
 * - A lista numerada conta 1, 2, 3… Linhas em branco ficam como estão.
 */
export function toggleBlock(v: string, s: number, e: number, kind: BlockKind): TextEdit {
  const ls = lineStartAt(v, s)
  // Seleção que termina logo depois de uma quebra de linha não inclui a linha seguinte
  const le = lineEndAt(v, e > s && v[e - 1] === '\n' ? e - 1 : e)
  const lines = v.slice(ls, le).split('\n')
  const filled = lines.filter((l) => l.trim())
  const remove = filled.length > 0 && filled.every((l) => hasKind(l, kind))
  let n = 0
  const out = lines.map((l) => {
    if (!l.trim()) return l
    if (remove) return kind === 'quote' ? l.replace(/^(\s*)>\s?/, '$1') : l.replace(LIST_MARKER, '$1')
    n++
    if (kind === 'quote') return '> ' + l
    const indent = /^\s*/.exec(l)![0]
    return indent + markerOf(kind, n) + l.slice(indent.length).replace(LIST_MARKER, '')
  })
  const block = out.join('\n')
  const value = v.slice(0, ls) + block + v.slice(le)
  if (s === e) {
    // Cursor: mantém a posição relativa ao fim da linha
    const fromEnd = le - s
    const pos = Math.max(ls, ls + block.length - fromEnd)
    return { value, selStart: pos, selEnd: pos }
  }
  return { value, selStart: ls, selEnd: ls + block.length }
}

/**
 * Link. Com uma URL selecionada, ela vira o endereço e o texto de exemplo fica
 * selecionado; com outro texto selecionado (ou nada), o `url` fica selecionado
 * para colar o endereço em seguida.
 */
export function insertLink(v: string, s: number, e: number, placeholder: string): TextEdit {
  const sel = v.slice(s, e).trim()
  if (/^(https?:\/\/|mailto:|www\.)\S+$/i.test(sel)) {
    const ins = `[${placeholder}](${sel})`
    return { value: v.slice(0, s) + ins + v.slice(e), selStart: s + 1, selEnd: s + 1 + placeholder.length }
  }
  const text = sel || placeholder
  const ins = `[${text}](url)`
  const urlAt = s + text.length + 3
  return { value: v.slice(0, s) + ins + v.slice(e), selStart: urlAt, selEnd: urlAt + 3 }
}

/**
 * Bloco (ex.: tabela) separado do texto por linhas em branco — fica legível no
 * arquivo e não gruda no parágrafo. `select` é um trecho do bloco a deixar selecionado.
 */
export function insertBlock(v: string, s: number, e: number, block: string, select?: string): TextEdit {
  const before = v.slice(0, s), after = v.slice(e)
  const pre = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const post = after === '' ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
  const value = before + pre + block + post + after
  const start = before.length + pre.length
  const at = select ? block.indexOf(select) : -1
  return at >= 0
    ? { value, selStart: start + at, selEnd: start + at + select!.length }
    : { value, selStart: start + block.length, selEnd: start + block.length }
}

/**
 * Enter numa lista continua a lista (`- `, `1. ` → `2. `, `- [ ] `); Enter num item
 * vazio encerra a lista. `null` quando a linha não é de lista (Enter normal).
 */
export function continueList(v: string, s: number, e: number): TextEdit | null {
  if (s !== e) return null
  const ls = lineStartAt(v, s)
  const line = v.slice(ls, s)
  const m = /^(\s*)(?:([-*+])\s+\[[ xX]\]\s+|([-*+])\s+|(\d+)([.)])\s+|(>)\s?)/.exec(line)
  if (!m) return null
  const [whole, indent, taskBullet, bullet, num, numSep, quote] = m
  if (line.length === whole.length && v.slice(s, lineEndAt(v, s)).trim() === '') {
    // Item vazio: sai da lista (apaga o marcador)
    return { value: v.slice(0, ls) + v.slice(s), selStart: ls, selEnd: ls }
  }
  const next = taskBullet ? `${taskBullet} [ ] ` : bullet ? `${bullet} ` : num ? `${Number(num) + 1}${numSep} ` : quote ? '> ' : ''
  const ins = '\n' + indent + next
  return { value: v.slice(0, s) + ins + v.slice(e), selStart: s + ins.length, selEnd: s + ins.length }
}

/** Menor trecho que mudou entre dois textos (para aplicar a edição como digitação e manter o desfazer) */
export function diffRange(a: string, b: string): { start: number; endA: number; insert: string } {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let ea = a.length, eb = b.length
  while (ea > start && eb > start && a[ea - 1] === b[eb - 1]) { ea--; eb-- }
  return { start, endA: ea, insert: b.slice(start, eb) }
}
