/**
 * Importação de eventos a partir de CSV ou JSON (planilhas exportadas, listas
 * de outros programas). Lógica pura: lê o texto e devolve as linhas prontas
 * para virar arquivos .md — quem grava é o FileSystemService.
 *
 * Colunas reconhecidas (sem acentos, maiúsculas ou minúsculas):
 *   title | titulo · date | data · date-end | data-fim | end · category | categoria
 *   importance | importancia · tags · body | text | texto | description | descricao
 *   lat | latitude · lng | lon | longitude · location | local | place | lugar
 */

import { yamlLine, yamlList, yamlScalar } from './yaml'

export interface ImportedEvent {
  title: string
  date: string
  dateEnd?: string
  category?: string
  importance?: number
  tags: string[]
  body: string
  location?: { name?: string; lat: number; lng: number }
}

export interface ImportResult {
  events: ImportedEvent[]
  /** Linhas puladas, com o motivo (1-based, contando o cabeçalho do CSV) */
  skipped: Array<{ line: number; reason: string }>
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[\s_]+/g, '-')

/** Tira a marca de ordem de bytes (BOM) que o Excel põe no início dos CSV */
const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s)

const COLUMNS: Record<string, keyof RawRow> = {
  title: 'title', titulo: 'title', name: 'title', nome: 'title', evento: 'title', event: 'title',
  date: 'date', data: 'date', start: 'date', inicio: 'date',
  'date-end': 'dateEnd', 'data-fim': 'dateEnd', end: 'dateEnd', fim: 'dateEnd', 'end-date': 'dateEnd',
  category: 'category', categoria: 'category',
  importance: 'importance', importancia: 'importance',
  tags: 'tags', tag: 'tags', etiquetas: 'tags',
  body: 'body', text: 'body', texto: 'body', description: 'body', descricao: 'body', content: 'body', conteudo: 'body', notes: 'body', notas: 'body',
  lat: 'lat', latitude: 'lat',
  lng: 'lng', lon: 'lng', long: 'lng', longitude: 'lng',
  location: 'place', local: 'place', place: 'place', lugar: 'place',
}

interface RawRow {
  title?: unknown; date?: unknown; dateEnd?: unknown; category?: unknown; importance?: unknown
  tags?: unknown; body?: unknown; lat?: unknown; lng?: unknown; place?: unknown
}

/** CSV simples (RFC 4180): aspas, vírgula ou ponto e vírgula, quebras de linha dentro de aspas */
export function parseCsv(text: string): string[][] {
  const src = stripBom(text)
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === delim) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

/** "14/07/1789" → "1789-07-14"; "1789-07-14T10:00:00Z" → "1789-07-14"; o resto fica como está */
export function normalizeImportDate(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  const s = String(v).trim()
  if (!s) return null
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(-?\d{1,9})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  const iso = s.match(/^(-?\d{1,9}-\d{2}-\d{2})[T ]/)
  if (iso) return iso[1]
  if (/^(-?\d{1,9}(-\d{1,2}(-\d{1,2})?)?|\d+([.,]\d+)?\s*(ka|Ma|Ga)|.+\s(a\.?\s*C\.?|BCE?))$/i.test(s)) return s
  return null
}

function toRow(headers: Array<keyof RawRow | null>, cells: string[]): RawRow {
  const r: RawRow = {}
  headers.forEach((h, i) => { if (h && cells[i] !== undefined && cells[i] !== '') r[h] = cells[i] })
  return r
}

function fromJsonObject(o: Record<string, unknown>): RawRow {
  const r: RawRow = {}
  for (const [k, v] of Object.entries(o)) {
    const key = COLUMNS[norm(k)]
    if (key) r[key] = v
  }
  // Formatos aninhados: { location: { name, lat, lng } }
  const loc = o.location ?? o.local ?? o.place
  if (loc && typeof loc === 'object') {
    const l = loc as Record<string, unknown>
    r.place = l.name ?? l.nome; r.lat = l.lat ?? l.latitude; r.lng = l.lng ?? l.lon ?? l.longitude
  }
  return r
}

function toEvent(r: RawRow, line: number, skipped: ImportResult['skipped']): ImportedEvent | null {
  const title = r.title !== undefined ? String(r.title).trim() : ''
  if (!title) { skipped.push({ line, reason: 'sem título' }); return null }
  const date = normalizeImportDate(r.date)
  if (!date) { skipped.push({ line, reason: r.date ? `data inválida: ${String(r.date)}` : 'sem data' }); return null }
  const tags = Array.isArray(r.tags) ? r.tags.map(String)
    : r.tags !== undefined ? String(r.tags).split(/[,;|]/) : []
  const imp = r.importance !== undefined ? Math.round(Number(r.importance)) : NaN
  const lat = r.lat !== undefined ? Number(String(r.lat).replace(',', '.')) : NaN
  const lng = r.lng !== undefined ? Number(String(r.lng).replace(',', '.')) : NaN
  const hasLoc = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  return {
    title, date,
    dateEnd: normalizeImportDate(r.dateEnd) ?? undefined,
    category: r.category !== undefined && String(r.category).trim() ? String(r.category).trim() : undefined,
    importance: imp >= 1 && imp <= 5 ? imp : undefined,
    tags: tags.map((t) => t.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')).filter(Boolean),
    body: r.body !== undefined ? String(r.body).replace(/\r\n/g, '\n').trim() : '',
    location: hasLoc ? { name: r.place !== undefined && String(r.place).trim() ? String(r.place).trim() : undefined, lat, lng } : undefined,
  }
}

/** Interpreta o conteúdo de um arquivo .csv ou .json */
export function parseImport(text: string, kind: 'csv' | 'json'): ImportResult {
  const skipped: ImportResult['skipped'] = []
  const events: ImportedEvent[] = []
  if (kind === 'json') {
    let data: unknown
    try { data = JSON.parse(stripBom(text)) } catch { return { events, skipped: [{ line: 1, reason: 'JSON inválido' }] } }
    const list = Array.isArray(data) ? data
      : data && typeof data === 'object' && Array.isArray((data as { events?: unknown }).events) ? (data as { events: unknown[] }).events
      : null
    if (!list) return { events, skipped: [{ line: 1, reason: 'esperava uma lista de eventos' }] }
    list.forEach((item, i) => {
      if (!item || typeof item !== 'object') { skipped.push({ line: i + 1, reason: 'item não é um objeto' }); return }
      const ev = toEvent(fromJsonObject(item as Record<string, unknown>), i + 1, skipped)
      if (ev) events.push(ev)
    })
    return { events, skipped }
  }
  const rows = parseCsv(text)
  if (rows.length < 2) return { events, skipped: [{ line: 1, reason: 'CSV sem linhas de dados' }] }
  const headers = rows[0].map((h) => COLUMNS[norm(h)] ?? null)
  if (!headers.includes('title') || !headers.includes('date')) {
    return { events, skipped: [{ line: 1, reason: 'o cabeçalho precisa ter as colunas title/título e date/data' }] }
  }
  rows.slice(1).forEach((cells, i) => {
    const ev = toEvent(toRow(headers, cells), i + 2, skipped)
    if (ev) events.push(ev)
  })
  return { events, skipped }
}

/** Conteúdo .md de um evento importado */
export function eventToMarkdown(e: ImportedEvent, defaultImportance = 3): string {
  const lines = ['---', 'type: event', `title: ${yamlScalar(e.title)}`, `date: ${e.date}`]
  if (e.dateEnd) lines.push(`date-end: ${e.dateEnd}`)
  const cat = yamlLine('category', e.category); if (cat) lines.push(cat)
  lines.push(`importance: ${e.importance ?? defaultImportance}`)
  if (e.tags.length) lines.push(`tags: ${yamlList(e.tags)}`)
  if (e.location) {
    lines.push('location:')
    if (e.location.name) lines.push(`  name: ${yamlScalar(e.location.name)}`)
    lines.push(`  lat: ${Math.round(e.location.lat * 1e6) / 1e6}`, `  lng: ${Math.round(e.location.lng * 1e6) / 1e6}`, '  precision: point')
  }
  lines.push('---', '')
  if (e.body) lines.push(e.body)
  return lines.join('\n') + (e.body ? '\n' : '')
}
