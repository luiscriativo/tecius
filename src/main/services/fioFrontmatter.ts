/**
 * Fio: a lista de paradas de um evento fica no cabeçalho, em `fio:`.
 * Edição por texto (não reescreve o resto do cabeçalho, que fica como o usuário deixou).
 */

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Divide o arquivo em cabeçalho (linhas entre os `---`) e o resto; null se não houver cabeçalho */
function splitHead(raw: string): { lines: string[]; nl: string; close: string; rest: string } | null {
  const m = /^---(\r?\n)([\s\S]*?)\r?\n---(\r?\n|$)/.exec(raw)
  if (!m) return null
  return { lines: m[2].split(/\r?\n/), nl: m[1], close: m[3], rest: raw.slice(m[0].length) }
}

/** Linhas de uma chave de 1º nível (a linha `chave:` e as indentadas que a seguem) */
function keyRange(lines: string[], key: string): [number, number] | null {
  const start = lines.findIndex((l) => new RegExp(`^${key}\\s*:`).test(l))
  if (start < 0) return null
  let end = start + 1
  while (end < lines.length && (/^\s+\S/.test(lines[end]) || /^-\s/.test(lines[end]) || lines[end].trim() === '')) {
    if (lines[end].trim() === '' && !(end + 1 < lines.length && /^(\s+|-\s)/.test(lines[end + 1]))) break
    end++
  }
  return [start, end]
}

const quote = (s: string) => JSON.stringify(s)

/** Grava (ou remove, com `null`) a lista `fio:` no cabeçalho */
export function setFioInRaw(raw: string, list: string[] | null): string {
  const h = splitHead(raw) ?? { lines: [], nl: '\n', close: '\n', rest: raw }
  const lines = h.lines.length === 1 && h.lines[0] === '' ? [] : [...h.lines]
  const r = keyRange(lines, 'fio')
  const block = list === null ? [] : list.length === 0 ? ['fio: []'] : ['fio:', ...list.map((t) => `  - ${quote(t)}`)]
  if (r) lines.splice(r[0], r[1] - r[0], ...block)
  else lines.push(...block)
  return `---${h.nl}${lines.join(h.nl)}${h.nl}---${h.close || h.nl}${h.rest}`
}

/** Lê a lista `fio:` do cabeçalho (texto), para a renomeação */
function readFio(lines: string[]): { range: [number, number]; items: string[] } | null {
  const r = keyRange(lines, 'fio')
  if (!r) return null
  const first = lines[r[0]].replace(/^fio\s*:\s*/, '')
  const unq = (s: string) => {
    const t = s.trim()
    if (/^".*"$/.test(t)) { try { return JSON.parse(t) as string } catch { return t.slice(1, -1) } }
    return t.replace(/^'(.*)'$/, '$1')
  }
  const items = first.startsWith('[')
    ? first.replace(/^\[|\]$/g, '').split(',').map(unq).filter(Boolean)
    : lines.slice(r[0] + 1, r[1]).map((l) => /^\s*-\s+(.*)$/.exec(l)?.[1]).filter((x): x is string => !!x).map(unq)
  return { range: r, items }
}

/** Troca, na lista `fio:`, os alvos antigos pelo novo texto. Devolve o arquivo e quantos mudaram */
export function renameInFio(raw: string, oldTargets: Set<string>, newText: string): { raw: string; changed: number } {
  const h = splitHead(raw)
  if (!h) return { raw, changed: 0 }
  const fio = readFio(h.lines)
  if (!fio) return { raw, changed: 0 }
  let changed = 0
  const items = fio.items.map((t) => (oldTargets.has(norm(t)) ? (changed++, newText) : t))
  return changed ? { raw: setFioInRaw(raw, items), changed } : { raw, changed: 0 }
}

export { norm as normFioTarget }
