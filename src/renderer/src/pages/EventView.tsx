/**
 * EventView — Página completa de visualização e edição de um evento
 *
 * Modos:
 * - Visualizar: markdown renderizado com tipografia editorial
 * - Editar (unificado): FrontmatterPanel + SectionsPanel + toolbar + textarea
 *   - Sem seções → arquivo salvo como evento regular (.md com frontmatter simples)
 *   - Com seções  → arquivo salvo como chronicle (type: chronicle + entries)
 */

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ExternalLink, GitBranch, ChevronLeft, ChevronRight,
  Pencil, Eye, ImagePlus, Save, X, BookOpen, FileText, Plus,
  Code, Quote, List, ListOrdered, CheckSquare, Table, Link,
  FileCode, Download, Tag, Maximize2, Minimize2, Trash2,
  Search, ChevronUp, ChevronDown,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { useTimeline } from '@/hooks/useTimeline'
import { useVault } from '@/hooks/useVault'
import { useNavigationStore } from '@/stores/useNavigationStore'
import { useI18n } from '@/hooks/useI18n'
import { cn } from '@/utils/cn'
import { DateInput } from '@/components/DateInput'
import { isMultiPart } from '@/utils/events'
import type { ChroniclerEvent } from '@/types/chronicler'

// ── Utilitários de anchor ──────────────────────────────────────────────────────

function stripAnchors(body: string): string {
  return body.replace(/\r\n/g, '\n').replace(/\s*\^[\w-]+\s*$/gm, '')
}

// ── Search helpers ─────────────────────────────────────────────────────────────
function clearCSSHighlights() {
  try {
    const H = (CSS as any).highlights
    if (H) { H.delete('chr-search-all'); H.delete('chr-search-cur') }
  } catch {}
}

function findTextRanges(container: HTMLElement, query: string): Range[] {
  const ranges: Range[] = []
  const lowerQ = query.toLowerCase()
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let n: Node | null
  while ((n = walker.nextNode())) {
    const text = n.textContent || ''
    const lower = text.toLowerCase()
    let pos = 0, idx: number
    while ((idx = lower.indexOf(lowerQ, pos)) !== -1) {
      const range = new Range()
      range.setStart(n, idx)
      range.setEnd(n, idx + lowerQ.length)
      ranges.push(range)
      pos = idx + lowerQ.length
    }
  }
  return ranges
}

function extractBlock(body: string, anchorId: string): string | null {
  const normalized = body.replace(/\r\n/g, '\n')
  const blocks = normalized.split(/\n{2,}/)
  const re = new RegExp(`\\^${anchorId}\\s*$`)
  for (const block of blocks) {
    const stripped = block.trim()
    if (re.test(stripped)) return stripped.replace(/\s*\^\S+\s*$/, '').trim()
  }
  return null
}

/** Extrai TODO o conteúdo de uma entrada de chronicle (entre o anchor anterior e o atual) */
function extractChronicleEntry(body: string, anchorId: string): string | null {
  const normalized = body.replace(/\r\n/g, '\n')
  const markerRe = /\^([\w-]+)\s*$/gm
  const markers: Array<{ id: string; start: number; end: number }> = []
  let m: RegExpExecArray | null
  while ((m = markerRe.exec(normalized)) !== null) {
    markers.push({ id: m[1], start: m.index, end: m.index + m[0].length })
  }
  const targetIdx = markers.findIndex((mk) => mk.id === anchorId)
  if (targetIdx === -1) return null
  const contentStart = targetIdx > 0 ? markers[targetIdx - 1].end : 0
  const contentEnd = markers[targetIdx].start
  return normalized.substring(contentStart, contentEnd).trim() || null
}

/**
 * Conteúdo de uma entrada para exibição. A última entrada inclui o texto que vem
 * depois do último marcador (o editor também o trata como parte do último trecho).
 */
function chronicleEntryBody(body: string, anchorId: string): string | null {
  const own = extractChronicleEntry(body, anchorId)
  const normalized = body.replace(/\r\n/g, '\n')
  const markers = [...normalized.matchAll(/\^([\w-]+)\s*$/gm)]
  const last = markers[markers.length - 1]
  if (!last || last[1] !== anchorId) return own
  const trailing = normalized.slice((last.index ?? 0) + last[0].length).trim()
  return [own, trailing].filter(Boolean).join('\n\n') || null
}

/**
 * Extrai o corpo de uma seção de chronicle para edição, removendo separadores
 * horizontais (---) que possam aparecer entre seções no arquivo.
 */
function extractSectionBody(body: string, anchorId: string): string {
  const raw = extractChronicleEntry(body, anchorId) || ''
  return raw.replace(/^-{3,}\s*\n+/, '').trimStart()
}

/** Envolve valor em aspas duplas se contiver caracteres especiais do YAML */
function yamlStr(value: string): string {
  if (!value) return value
  if (
    /[:#\[\]{}&*!|>'"%@`]/.test(value) ||
    /^[\s\-?,]/.test(value) ||
    value.endsWith(' ') ||
    value.includes('\n') ||
    /^(true|false|yes|no|on|off|null|~)$/i.test(value)
  ) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
  }
  return value
}

/** Remove as aspas de um escalar YAML, desfazendo os escapes (inverso de yamlStr) */
function unquoteYaml(value: string): string {
  const v = value.trim()
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    try { return JSON.parse(v) as string } catch { /* escape YAML não suportado pelo JSON */ }
    return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) {
    return v.slice(1, -1).replace(/''/g, "'")
  }
  return v
}

/** Linha "chave: valor" no topo do YAML (coluna 0, não é comentário nem item de lista) */
const YAML_KEY_LINE = /^[^\s#-][^:]*:/

/**
 * Valor de um campo extra (preservado como texto bruto). Valores com várias
 * linhas (listas/objetos aninhados, ex: `links:`) começam com '\n'.
 */
function yamlLine(key: string, value: string, indent = ''): string {
  return value === '' || value.startsWith('\n') ? `${indent}${key}:${value}` : `${indent}${key}: ${value}`
}

/** Itens de uma lista YAML em bloco ("  - a", "  - b") */
function parseYamlList(lines: string[]): string[] {
  return lines
    .map((l) => l.match(/^\s*-\s+(.*)$/)?.[1])
    .filter((v): v is string => v !== undefined)
    .map((v) => unquoteYaml(v))
    .filter(Boolean)
}

/** Tags vindas de um campo bruto: inline `[a, b]` ou lista em bloco */
function tagsFromRaw(value: string): string[] {
  return value.includes('\n') ? parseYamlList(value.split('\n')) : parseTagsValue(value)
}

/** Serializa tags no formato inline, com aspas quando necessário */
function buildTags(tags: string[]): string {
  return `[${tags.map((t) => (t.includes(',') ? JSON.stringify(t) : yamlStr(t))).join(', ')}]`
}

/**
 * Agrupa o YAML do frontmatter em campos de topo. Linhas indentadas (ou itens
 * de lista) que seguem uma chave pertencem a ela e são preservadas como texto
 * bruto — assim campos aninhados (links, references, tags em bloco...)
 * sobrevivem intactos ao salvar pelo editor.
 */
function splitYamlFields(yaml: string): Array<{ key: string; value: string; cont: string[] }> {
  const fields: Array<{ key: string; value: string; cont: string[] }> = []
  for (const line of yaml.split(/\r?\n/)) {
    if (YAML_KEY_LINE.test(line)) {
      const ci = line.indexOf(':')
      fields.push({ key: line.slice(0, ci).trim(), value: line.slice(ci + 1).trim(), cont: [] })
    } else if (fields.length > 0 && (/^[\s-]/.test(line) || line.trim() === '')) {
      fields[fields.length - 1].cont.push(line)
    }
  }
  for (const f of fields) {
    while (f.cont.length > 0 && f.cont[f.cont.length - 1].trim() === '') f.cont.pop()
  }
  return fields
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-') || 'entrada'
}

// ── Frontmatter parser / builder (eventos regulares) ──────────────────────────

interface EditFm {
  title: string
  date: string
  dateEnd: string
  hasDateEnd: boolean
  circa: boolean
  category: string
  importance: number
  tags: string[]
  extra: Record<string, string>
}

function defaultEditFm(): EditFm {
  return { title: '', date: '', dateEnd: '', hasDateEnd: false, circa: false, category: '', importance: 3, tags: [], extra: {} }
}

function parseTagsValue(value: string): string[] {
  const clean = value.trim().replace(/^\[|\]$/g, '').trim()
  if (!clean) return []
  return clean.split(',').map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
}

function parseEventRaw(raw: string): { fm: EditFm; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)/)
  if (!match) return { fm: defaultEditFm(), body: raw }
  const fm = defaultEditFm()
  const extra: Record<string, string> = {}
  for (const { key, value, cont } of splitYamlFields(match[1])) {
    switch (key) {
      case 'title':      fm.title = unquoteYaml(value); break
      case 'date':       fm.date = unquoteYaml(value); break
      case 'date-end':   fm.dateEnd = unquoteYaml(value); fm.hasDateEnd = true; break
      case 'circa':      fm.circa = value === 'true'; break
      case 'category':   fm.category = unquoteYaml(value); break
      case 'importance': fm.importance = parseInt(value) || 3; break
      case 'tags':       fm.tags = value ? parseTagsValue(value) : parseYamlList(cont); break
      case 'type':       break
      default:           extra[key] = cont.length > 0 ? [value, ...cont].join('\n') : value
    }
  }
  fm.extra = extra
  return { fm, body: (match[2] ?? '').trim() }
}

function buildEventRaw(fm: EditFm, body: string): string {
  const lines: string[] = ['---']
  if (fm.title)    lines.push(`title: ${yamlStr(fm.title)}`)
  if (fm.date)     lines.push(`date: ${fm.date}`)
  if (fm.hasDateEnd && fm.dateEnd) lines.push(`date-end: ${fm.dateEnd}`)
  if (fm.circa)    lines.push('circa: true')
  if (fm.category) lines.push(`category: ${yamlStr(fm.category)}`)
  lines.push(`importance: ${fm.importance}`)
  if (fm.tags.length > 0) lines.push(`tags: ${buildTags(fm.tags)}`)
  for (const [k, v] of Object.entries(fm.extra)) lines.push(yamlLine(k, v))
  lines.push('---', '')
  if (body.trim()) lines.push(body.trim())
  return lines.join('\n')
}

// ── Chronicle parser / builder ─────────────────────────────────────────────────

interface EntryEdit {
  id: string
  title: string
  date: string
  anchor: string
  extra: Record<string, string>
}

interface ChronicleMetaEdit {
  title: string
  description: string
  extra: Record<string, string>
}

interface ChronicleEdit {
  meta: ChronicleMetaEdit
  entries: EntryEdit[]
  body: string
}

function defaultChronicleEdit(): ChronicleEdit {
  return { meta: { title: '', description: '', extra: {} }, entries: [], body: '' }
}

function defaultEntry(): EntryEdit {
  return { id: crypto.randomUUID(), title: '', date: '', anchor: '', extra: {} }
}

function parseChronicleRaw(raw: string): ChronicleEdit {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)/)
  if (!match) return defaultChronicleEdit()

  const yamlBlock = match[1]
  const body = (match[2] ?? '').trim()
  const meta: ChronicleMetaEdit = { title: '', description: '', extra: {} }
  const entries: EntryEdit[] = []

  const lines = yamlBlock.split(/\r?\n/)
  let inEntries = false
  let itemIndent = -1 // indentação dos itens "- " da lista de entradas
  let currentEntry: EntryEdit | null = null
  // Campo extra que recebe as linhas de continuação (valores aninhados)
  let last: { target: Record<string, string>; key: string } | null = null
  const indentOf = (l: string) => l.length - l.trimStart().length

  for (const line of lines) {
    if (/^(?:entries|events):\s*$/.test(line)) {
      inEntries = true
      itemIndent = -1
      last = null
      continue
    }

    if (inEntries) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const ind = indentOf(line)

      // Novo item da lista (aceita qualquer indentação, inclusive coluna 0)
      if ((trimmed === '-' || trimmed.startsWith('- ')) && (itemIndent === -1 || ind === itemIndent)) {
        itemIndent = ind
        if (currentEntry) entries.push(currentEntry)
        currentEntry = defaultEntry()
        last = null
        const rest = trimmed.slice(1).trim()
        if (rest) last = applyEntryField(currentEntry, rest)
        continue
      }

      if (currentEntry && ind > itemIndent) {
        if (ind === itemIndent + 2 && YAML_KEY_LINE.test(trimmed)) {
          last = applyEntryField(currentEntry, trimmed)
        } else if (last) {
          // Linha aninhada: normaliza a indentação para o formato gravado (itens com 2 espaços)
          const delta = 2 - itemIndent
          last.target[last.key] += '\n' + (delta >= 0 ? ' '.repeat(delta) + line : line.slice(-delta))
        }
        continue
      }

      // Linha de topo: fim da lista de entradas
      if (currentEntry) { entries.push(currentEntry); currentEntry = null }
      inEntries = false
      last = null
    }

    // Top-level meta fields
    if (YAML_KEY_LINE.test(line)) {
      const ci = line.indexOf(':')
      const key = line.slice(0, ci).trim()
      const val = line.slice(ci + 1).trim()
      last = null
      switch (key) {
        case 'type': break
        case 'title': meta.title = unquoteYaml(val); break
        case 'description': meta.description = unquoteYaml(val); break
        default:
          meta.extra[key] = val
          last = { target: meta.extra, key }
      }
    } else if (last && (/^[\s-]/.test(line) || line.trim() === '')) {
      last.target[last.key] += '\n' + line
    }
  }

  if (currentEntry) entries.push(currentEntry)
  for (const obj of [meta.extra, ...entries.map((e) => e.extra)]) {
    for (const k of Object.keys(obj)) obj[k] = obj[k].replace(/(\n[ \t]*)+$/, '')
  }
  return { meta, entries, body }
}

/** Aplica "chave: valor" a uma entrada; retorna o alvo para linhas de continuação (campos extras) */
function applyEntryField(entry: EntryEdit, text: string): { target: Record<string, string>; key: string } | null {
  const ci = text.indexOf(':')
  if (ci < 0) return null
  const key = text.slice(0, ci).trim()
  const val = text.slice(ci + 1).trim()
  switch (key) {
    case 'title':
    case 'label':  entry.title = unquoteYaml(val); return null  // 'label' é o formato legado
    case 'date':   entry.date = unquoteYaml(val); return null
    case 'anchor': entry.anchor = unquoteYaml(val); return null
    default:
      entry.extra[key] = val  // bruto: preserva aspas e valores com ':' intactos
      return { target: entry.extra, key }
  }
}

/** EditFm de um chronicle: category/importance/tags vêm dos campos extras do arquivo */
function chronicleEditFm(parsed: ChronicleEdit): EditFm {
  const fm = defaultEditFm()
  fm.title = parsed.meta.title
  fm.category = unquoteYaml(parsed.meta.extra['category'] ?? '')
  fm.importance = parseInt(parsed.meta.extra['importance'] ?? '3') || 3
  fm.tags = parsed.meta.extra['tags'] ? tagsFromRaw(parsed.meta.extra['tags']) : []
  const { category: _c, importance: _i, tags: _t, ...restExtra } = parsed.meta.extra
  fm.extra = restExtra
  return fm
}

// ── Estado de edição: evento = 1 ou mais trechos ───────────────────────────────
// Para o usuário só existe "evento com trechos". O formato do arquivo é derivado:
// 1 trecho → .md simples · 2+ trechos → chronicle (type: chronicle + entries).

interface EditState {
  fm: EditFm
  body: string
  entries: EntryEdit[]
  chrDesc: string
  sectionBodies: Record<string, string>
}

/** Converte o único trecho restante em evento simples (dados do trecho passam ao evento) */
function collapseToSingle(fm: EditFm, entry: EntryEdit, entryBody: string, chrDesc: string): EditState {
  const next: EditFm = { ...fm, title: entry.title || fm.title, date: entry.date || fm.date, extra: { ...fm.extra } }
  const { importance, category, tags, ...entryExtra } = entry.extra
  if (importance) next.importance = parseInt(importance) || next.importance
  if (category) next.category = unquoteYaml(category)
  if (tags) next.tags = tagsFromRaw(tags)
  for (const [k, v] of Object.entries(entryExtra)) if (!(k in next.extra)) next.extra[k] = v
  if (chrDesc && !('description' in next.extra)) next.extra['description'] = yamlStr(chrDesc)
  return { fm: next, body: entryBody, entries: [], chrDesc: '', sectionBodies: {} }
}

/**
 * Corpo de cada trecho. O texto após o último marcador ^âncora não pertence a
 * nenhum trecho e era descartado ao salvar — passa a integrar o último trecho.
 */
function sectionBodiesFor(entries: EntryEdit[], body: string): Record<string, string> {
  const bodies: Record<string, string> = {}
  for (const entry of entries) bodies[entry.id] = extractSectionBody(body, entry.anchor)
  const normalized = body.replace(/\r\n/g, '\n')
  const markers = [...normalized.matchAll(/\^([\w-]+)\s*$/gm)]
  const lastMarker = markers[markers.length - 1]
  if (lastMarker && entries.length > 0) {
    const trailing = normalized.slice((lastMarker.index ?? 0) + lastMarker[0].length).trim()
    if (trailing) {
      const owner = entries.find((e) => e.anchor === lastMarker[1]) ?? entries[entries.length - 1]
      bodies[owner.id] = [bodies[owner.id], trailing].filter(Boolean).join('\n\n')
    }
  }
  return bodies
}

/** O frontmatter declara `type: chronicle`? (olha só o bloco YAML, não o corpo) */
function isChronicleRaw(raw: string): boolean {
  const fmBlock = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ''
  return /^type:\s*["']?chronicle["']?\s*$/m.test(fmBlock)
}

/** Estado de edição a partir do conteúdo bruto do arquivo */
function editStateFromRaw(raw: string, isChronicle: boolean): EditState {
  if (!isChronicle) {
    const { fm, body } = parseEventRaw(raw)
    return { fm, body, entries: [], chrDesc: '', sectionBodies: {} }
  }
  const parsed = parseChronicleRaw(raw)
  const fm = chronicleEditFm(parsed)
  const sectionBodies = sectionBodiesFor(parsed.entries, parsed.body)
  // Chronicle com um único trecho é, para o usuário, um evento comum
  if (parsed.entries.length === 1) {
    const only = parsed.entries[0]
    return collapseToSingle(fm, only, sectionBodies[only.id] ?? '', parsed.meta.description)
  }
  return { fm, body: parsed.body, entries: parsed.entries, chrDesc: parsed.meta.description, sectionBodies }
}

function buildChronicleRaw(edit: ChronicleEdit): string {
  const lines: string[] = ['---', 'type: chronicle']
  if (edit.meta.title)       lines.push(`title: ${yamlStr(edit.meta.title)}`)
  if (edit.meta.description) lines.push(`description: ${yamlStr(edit.meta.description)}`)
  for (const [k, v] of Object.entries(edit.meta.extra)) lines.push(yamlLine(k, v))

  if (edit.entries.length > 0) {
    lines.push('entries:')
    for (const entry of edit.entries) {
      lines.push(`  - title: ${yamlStr(entry.title || '(sem título)')}`)
      if (entry.date)   lines.push(`    date: ${entry.date}`)
      if (entry.anchor) lines.push(`    anchor: ${entry.anchor}`)
      for (const [k, v] of Object.entries(entry.extra)) lines.push(yamlLine(k, v, '    '))
    }
  }

  lines.push('---', '')
  if (edit.body.trim()) lines.push(edit.body.trim())
  return lines.join('\n')
}

// ── Sort / build helpers ───────────────────────────────────────────────────────

function sortEntries(entries: EntryEdit[]): EntryEdit[] {
  return [...entries].sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return a.date.localeCompare(b.date)
  })
}

function buildSaveContent(
  fm: EditFm, body: string, entries: EntryEdit[], chrDesc: string
): string {
  if (entries.length === 0) {
    return buildEventRaw(fm, body)
  }
  const extra: Record<string, string> = { ...fm.extra }
  if (fm.category) extra['category'] = yamlStr(fm.category)
  if (fm.importance !== 3) extra['importance'] = String(fm.importance)
  if (fm.tags.length > 0) extra['tags'] = buildTags(fm.tags)
  return buildChronicleRaw({
    meta: { title: fm.title, description: chrDesc, extra },
    entries: sortEntries(entries),
    body,
  })
}

/** Conteúdo bruto (.md) a ser gravado a partir do estado de edição */
function buildRawFromEditValues(vals: {
  editFm: EditFm; editBody: string; editEntries: EntryEdit[]; editSectionBodies: Record<string, string>
  editChrDesc: string; editContent: string; editIsRaw: boolean
}): string {
  if (vals.editIsRaw) return vals.editContent
  const body = vals.editEntries.length > 0
    ? buildBodyFromSections(vals.editEntries, vals.editSectionBodies)
    : vals.editBody
  return buildSaveContent(vals.editFm, body, vals.editEntries, vals.editChrDesc)
}

function buildBodyFromSections(entries: EntryEdit[], sectionBodies: Record<string, string>): string {
  return sortEntries(entries)
    .map((entry) => {
      const anchor = entry.anchor || slugify(entry.title || 'secao')
      const content = (sectionBodies[entry.id] || '').trim()
      return content ? `${content} ^${anchor}` : `^${anchor}`
    })
    .join('\n\n')
}

// ── Toolbar text-manipulation helpers ─────────────────────────────────────────

interface TextEdit { value: string; selStart: number; selEnd: number }

function applyInline(v: string, s: number, e: number, pre: string, suf: string, ph = 'texto'): TextEdit {
  const sel = v.slice(s, e)
  if (sel) {
    return { value: v.slice(0, s) + pre + sel + suf + v.slice(e), selStart: s + pre.length, selEnd: s + pre.length + sel.length }
  }
  const ins = pre + ph + suf
  return { value: v.slice(0, s) + ins + v.slice(e), selStart: s + pre.length, selEnd: s + pre.length + ph.length }
}

function applyHeading(v: string, s: number, prefix: string): TextEdit {
  const lineStart = v.lastIndexOf('\n', s - 1) + 1
  const lineEnd = v.indexOf('\n', s)
  const line = v.slice(lineStart, lineEnd < 0 ? undefined : lineEnd)
  const clean = line.replace(/^#{1,6}\s*/, '')
  const newLine = prefix + clean
  const tail = lineEnd < 0 ? '' : v.slice(lineEnd)
  return { value: v.slice(0, lineStart) + newLine + tail, selStart: lineStart + prefix.length, selEnd: lineStart + prefix.length + clean.length }
}

function applyLinePrefix(v: string, s: number, prefix: string): TextEdit {
  const lineStart = v.lastIndexOf('\n', s - 1) + 1
  return { value: v.slice(0, lineStart) + prefix + v.slice(lineStart), selStart: s + prefix.length, selEnd: s + prefix.length }
}

function insertAtCursor(v: string, s: number, text: string): TextEdit {
  return { value: v.slice(0, s) + text + v.slice(s), selStart: s + text.length, selEnd: s + text.length }
}

// ── TagInput ───────────────────────────────────────────────────────────────────

function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { t } = useI18n()

  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (tag && !tags.includes(tag)) onChange([...tags, tag])
    setInput('')
  }

  return (
    <div
      className="flex flex-wrap gap-1 px-2 py-1.5 rounded-sm min-h-[34px] bg-vault border border-chr-subtle focus-within:border-chr transition-colors cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag, i) => (
        <span key={i} className="flex items-center gap-1 px-1.5 py-0.5 bg-subtle rounded-sm font-mono text-2xs text-chr-secondary leading-none">
          {tag}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(tags.filter((_, j) => j !== i)) }}
            className="text-chr-muted hover:text-chr-primary ml-0.5 text-sm leading-none"
          >×</button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input) }
          else if (e.key === 'Backspace' && !input && tags.length > 0) onChange(tags.slice(0, -1))
        }}
        onBlur={() => { if (input.trim()) addTag(input) }}
        placeholder={tags.length === 0 ? t('add_tag') : ''}
        className="flex-1 min-w-[80px] bg-transparent outline-none font-mono text-xs text-chr-primary placeholder:text-chr-muted py-0.5"
      />
    </div>
  )
}

// ── ImportanceSelector ─────────────────────────────────────────────────────────

function ImportanceSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t } = useI18n()
  const labels = ['', t('importance_min'), t('importance_low'), t('importance_mid'), t('importance_high'), t('importance_max')]
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n} type="button" onClick={() => onChange(n)} title={labels[n]}
          className={cn(
            'w-3.5 h-3.5 rounded-full border transition-all duration-100',
            n <= value
              ? 'bg-chr-primary border-chr-primary'
              : 'bg-transparent border-chr-subtle hover:border-chr-strong'
          )}
        />
      ))}
      <span className="font-mono text-2xs text-chr-muted">{labels[value]}</span>
    </div>
  )
}

// ── CategoryInput ──────────────────────────────────────────────────────────────

function CategoryInput({ value, onChange, suggestions }: { value: string; onChange: (v: string) => void; suggestions: string[] }) {
  const [open, setOpen] = useState(false)
  const filtered = suggestions.filter((c) =>
    c.toLowerCase().includes(value.toLowerCase())
  )
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="CATEGORIA"
        spellCheck={false}
        className="font-mono text-[10px] font-medium tracking-[0.06em] uppercase px-1.5 py-0.5 rounded-sm border bg-subtle text-chr-secondary border-chr-subtle outline-none focus:border-chr transition-colors placeholder:text-chr-muted/30 w-32"
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 mt-0.5 bg-surface border border-chr-subtle rounded-sm shadow-card z-50 min-w-full overflow-hidden">
          {filtered.map((c) => (
            <button
              key={c}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(c); setOpen(false) }}
              className="block w-full text-left px-2 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-chr-secondary hover:bg-hover transition-colors"
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── EditHeader ─────────────────────────────────────────────────────────────────

interface EditHeaderProps {
  fm: EditFm
  onChange: (fm: EditFm) => void
  hasEntries: boolean
  chrDescription: string
  onChrDescChange: (v: string) => void
  categorySuggestions: string[]
  wideLayout?: boolean
}

function EditHeader({ fm, onChange, hasEntries, chrDescription, onChrDescChange, categorySuggestions, wideLayout }: EditHeaderProps) {
  const set = <K extends keyof EditFm>(key: K, val: EditFm[K]) => onChange({ ...fm, [key]: val })
  const { t } = useI18n()
  const [addingTag, setAddingTag] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const tagRef = useRef<HTMLInputElement>(null)

  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (tag && !fm.tags.includes(tag)) set('tags', [...fm.tags, tag])
    setTagInput('')
    setAddingTag(false)
  }

  const contentCls = wideLayout ? 'max-w-5xl mx-auto px-8 pt-10 pb-2' : 'max-w-2xl mx-auto px-12 pt-10 pb-2'
  return (
    <div className={contentCls}>
      {/* Category + Importance */}
      <div className="flex items-center justify-between mb-6">
        <CategoryInput value={fm.category} onChange={(v) => set('category', v)} suggestions={categorySuggestions} />
        <div className="flex items-center gap-2">
          <span className="font-mono text-2xs text-chr-muted uppercase tracking-wider">{t('importance')}</span>
          <ImportanceSelector value={fm.importance} onChange={(v) => set('importance', v)} />
        </div>
      </div>

      {/* Date (non-chronicle) */}
      {!hasEntries && (
        <div className="flex items-center gap-4 mb-3">
          <DateInput
            value={fm.date}
            onChange={(v) => set('date', v)}
            className="font-mono text-sm text-timeline-chronicle-text bg-transparent outline-none border-0 w-28 placeholder:text-chr-muted/30"
          />
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={fm.circa} onChange={(e) => set('circa', e.target.checked)} className="w-3 h-3 accent-chr-primary" />
            <span className="font-mono text-2xs text-chr-muted select-none">~circa</span>
          </label>
          {fm.hasDateEnd ? (
            <DateInput
              value={fm.dateEnd}
              onChange={(v) => set('dateEnd', v)}
              className="font-mono text-sm text-chr-muted bg-transparent outline-none border-0 placeholder:text-chr-muted/30"
            />
          ) : (
            <button type="button" onClick={() => set('hasDateEnd', true)}
              className="font-mono text-2xs text-chr-muted/40 hover:text-chr-muted transition-colors">
              + data fim
            </button>
          )}
        </div>
      )}

      {/* Title */}
      <textarea
        ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }}
        value={fm.title}
        onChange={(e) => { set('title', e.target.value); const el = e.currentTarget; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }}
        placeholder={t('event_title_placeholder')}
        spellCheck={false}
        rows={1}
        className="w-full font-serif text-display text-chr-primary bg-transparent border-0 outline-none focus:outline-none placeholder:text-chr-muted/15 leading-tight block mb-5 resize-none overflow-hidden"
      />

      {/* Description — chronicle only */}
      {hasEntries && (
        <textarea
          value={chrDescription}
          onChange={(e) => onChrDescChange(e.target.value)}
          placeholder={t('chronicle_desc_placeholder')}
          spellCheck={false}
          rows={2}
          className="w-full font-sans text-base italic text-chr-secondary bg-transparent outline-none resize-none border-l-2 border-chr-subtle pl-4 mb-5 placeholder:text-chr-muted/20 leading-relaxed block"
          onInput={(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }}
        />
      )}

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-1.5 pb-8 border-b border-chr-subtle">
        <Tag size={12} strokeWidth={1.5} className="text-chr-muted/40 shrink-0 mr-0.5" />
        {fm.tags.map((tag, i) => (
          <button key={i} type="button"
            onClick={() => set('tags', fm.tags.filter((_, j) => j !== i))}
            className="chr-tag hover:text-red-400 transition-colors group cursor-pointer"
          >
            #{tag} <span className="opacity-0 group-hover:opacity-100 ml-0.5">×</span>
          </button>
        ))}
        {addingTag ? (
          <input
            ref={tagRef}
            autoFocus
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) }
              else if (e.key === 'Escape') { setAddingTag(false); setTagInput('') }
              else if (e.key === 'Backspace' && !tagInput) setAddingTag(false)
            }}
            onBlur={() => { if (tagInput.trim()) addTag(tagInput); else setAddingTag(false) }}
            placeholder="nova-tag"
            className="font-mono text-[10px] text-chr-primary bg-transparent outline-none w-20 placeholder:text-chr-muted/40"
          />
        ) : (
          <button type="button" onClick={() => { setAddingTag(true); setTimeout(() => tagRef.current?.focus(), 0) }}
            className="font-mono text-[10px] text-chr-muted/50 hover:text-chr-muted transition-colors">
            + tag
          </button>
        )}
      </div>
    </div>
  )
}

// ── FrontmatterPanel ──────────────────────────────────────────────────────────

const EVENT_CATEGORIES = ['Politica', 'Arte', 'Ciencia', 'Cultura', 'Musica', 'Cinema', 'Literatura', 'Esporte', 'Pessoal', 'Outro']

interface FrontmatterPanelProps {
  fm: EditFm
  collapsed: boolean
  onToggleCollapse: () => void
  onChange: (fm: EditFm) => void
  hasEntries: boolean
  chrDescription: string
  onChrDescChange: (v: string) => void
}

function FrontmatterPanel({ fm, collapsed, onToggleCollapse, onChange, hasEntries, chrDescription, onChrDescChange }: FrontmatterPanelProps) {
  const set = <K extends keyof EditFm>(key: K, val: EditFm[K]) => onChange({ ...fm, [key]: val })
  const { t } = useI18n()
  const inputCls = cn(
    'w-full px-2.5 py-1.5 rounded-sm',
    'bg-vault border border-chr-subtle text-chr-primary',
    'focus:outline-none focus:border-chr transition-colors',
    'font-mono text-xs placeholder:text-chr-muted'
  )
  const labelCls = 'block font-mono text-2xs text-chr-muted mb-1'

  return (
    <div className="shrink-0 border-b border-chr-subtle bg-surface">
      <button
        type="button"
        onClick={onToggleCollapse}
        className="w-full flex items-center gap-2 px-5 py-2.5 text-left hover:bg-hover transition-colors"
      >
        <span className="font-mono text-2xs text-chr-muted select-none">{collapsed ? '▸' : '▾'}</span>
        <span className="font-mono text-2xs text-chr-muted flex-1 select-none">{t('metadata')}</span>
        {collapsed && (
          <span className="font-serif text-xs text-chr-secondary truncate max-w-xs opacity-70">{fm.title || '—'}</span>
        )}
      </button>

      {!collapsed && (
        <div className="px-5 pb-4 space-y-3">

          {/* Título */}
          <div>
            <label className={labelCls}>{t('event_title')}</label>
            <input
              type="text"
              value={fm.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder={t('event_title_placeholder')}
              className={cn(inputCls, 'font-serif text-sm')}
            />
            {hasEntries && (
              <span className="font-mono text-2xs text-chr-muted opacity-60 mt-1 block">
                {t('dates_in_sections')}
              </span>
            )}
          </div>

          {/* Descrição (apenas quando hasEntries) */}
          {hasEntries && (
            <div>
              <label className={labelCls}>{t('description')}</label>
              <input
                type="text"
                value={chrDescription}
                onChange={(e) => onChrDescChange(e.target.value)}
                placeholder={t('chronicle_desc_placeholder')}
                className={inputCls}
              />
            </div>
          )}

          {/* Data + Data fim + Circa (apenas quando !hasEntries) */}
          {!hasEntries && (
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[140px]">
                <label className={labelCls}>{t('event_date')}</label>
                <DateInput value={fm.date} onChange={(v) => set('date', v)} className={inputCls} />
              </div>

              <label
                title="Para eventos com duração. Ativa o campo date-end no YAML — ex: uma guerra de 1939 a 1945."
                className="flex items-center gap-1.5 pb-1.5 cursor-pointer"
              >
                <input type="checkbox" checked={fm.hasDateEnd} onChange={(e) => set('hasDateEnd', e.target.checked)} className="w-3 h-3 accent-chr-primary" />
                <span className="font-mono text-2xs text-chr-muted select-none">{t('event_date_end')}</span>
              </label>

              {fm.hasDateEnd && (
                <div className="flex-1 min-w-[140px]">
                  <label className={labelCls}>{t('event_date_end')}</label>
                  <DateInput value={fm.dateEnd} onChange={(v) => set('dateEnd', v)} className={inputCls} />
                </div>
              )}

              <label
                title="Marca a data como aproximada. Exibe ~ antes da data e adiciona circa: true no YAML."
                className="flex items-center gap-1.5 pb-1.5 cursor-pointer"
              >
                <input type="checkbox" checked={fm.circa} onChange={(e) => set('circa', e.target.checked)} className="w-3 h-3 accent-chr-primary" />
                <span className="font-mono text-2xs text-chr-muted select-none">{t('event_circa')}</span>
              </label>
            </div>
          )}

          {/* Categoria + Importância */}
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <label className={labelCls}>{t('event_category')}</label>
              <input
                type="text"
                list="event-categories-list"
                value={fm.category}
                onChange={(e) => set('category', e.target.value)}
                placeholder="Categoria..."
                className={inputCls}
              />
              <datalist id="event-categories-list">
                {EVENT_CATEGORIES.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="pb-1.5">
              <label className={labelCls}>{t('importance')}</label>
              <ImportanceSelector value={fm.importance} onChange={(v) => set('importance', v)} />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className={labelCls}>
              {t('tags')} <span className="opacity-50">{t('tags_hint')}</span>
            </label>
            <TagInput tags={fm.tags} onChange={(tag) => set('tags', tag)} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── SectionsPanel ─────────────────────────────────────────────────────────────

interface SectionsPanelProps {
  entries: EntryEdit[]
  collapsed: boolean
  onToggleCollapse: () => void
  onChange: (entries: EntryEdit[]) => void
  onAddSection: () => void
}

function SectionsPanel({ entries, collapsed, onToggleCollapse, onChange, onAddSection }: SectionsPanelProps) {
  const { t, nSections } = useI18n()
  const inputCls = cn(
    'px-2 py-1 rounded-sm bg-vault border border-chr-subtle text-chr-primary',
    'focus:outline-none focus:border-chr transition-colors font-mono text-xs placeholder:text-chr-muted'
  )

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const updateEntry = (id: string, patch: Partial<EntryEdit>) =>
    onChange(entries.map((e) => e.id === id ? { ...e, ...patch } : e))

  const confirmRemove = () => {
    if (!pendingDeleteId) return
    onChange(entries.filter((e) => e.id !== pendingDeleteId))
    setPendingDeleteId(null)
  }

  const hasEntries = entries.length > 0

  const pendingEntry = entries.find((e) => e.id === pendingDeleteId)

  return (
    <>
    {pendingDeleteId && (
      <ConfirmModal
        message={t('remove_part_confirm', { title: pendingEntry?.title?.trim() || '—' })}
        onConfirm={confirmRemove}
        confirmLabel={t('remove_section')}
        onCancel={() => setPendingDeleteId(null)}
      />
    )}
    <div className="shrink-0 border-b border-chr-subtle bg-surface">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-2.5">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center gap-2 flex-1 text-left hover:opacity-80 transition-opacity min-w-0"
        >
          <span className="font-mono text-2xs text-chr-muted select-none">{collapsed ? '▸' : '▾'}</span>
          <span className={cn('font-mono text-2xs select-none', hasEntries ? 'text-chr-muted' : 'text-chr-muted opacity-60')}>
            {t('sections')}
          </span>
          <span className={cn(
            'font-mono text-2xs px-1.5 py-0.5 rounded-sm shrink-0',
            hasEntries ? 'text-chr-muted bg-subtle' : 'text-chr-muted opacity-50 bg-subtle'
          )}>
            {hasEntries ? nSections(entries.length) : t('sections_none')}
          </span>
        </button>
        <button
          type="button"
          onClick={onAddSection}
          className="flex items-center gap-1 font-mono text-2xs text-chr-muted hover:text-chr-primary transition-colors shrink-0"
        >
          <Plus size={10} strokeWidth={1.5} />
          {t('add_section')}
        </button>
      </div>

      {!collapsed && (
        <div className="px-5 pb-4">
          {!hasEntries ? (
            <p className="font-mono text-2xs text-chr-muted italic opacity-60 py-1">
              {t('sections_empty_hint')}
            </p>
          ) : (
            <div className="max-h-[200px] overflow-y-auto space-y-1.5 pr-1
              [&::-webkit-scrollbar]:w-1
              [&::-webkit-scrollbar-track]:bg-transparent
              [&::-webkit-scrollbar-thumb]:bg-chr-subtle
              [&::-webkit-scrollbar-thumb]:rounded-full
              hover:[&::-webkit-scrollbar-thumb]:bg-chr-strong">
              {entries.map((entry, idx) => (
                <div key={entry.id} className="group rounded border border-chr-subtle hover:border-chr bg-vault transition-colors p-2">
                  {/* Linha principal: número + título + data + apagar */}
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-2xs text-chr-muted w-4 text-right shrink-0 select-none">{idx + 1}</span>
                    <input
                      type="text"
                      value={entry.title}
                      onChange={(e) => {
                        const newTitle = e.target.value
                        const prevSlug = slugify(entry.title)
                        const anchor = (!entry.anchor || entry.anchor === prevSlug)
                          ? slugify(newTitle)
                          : entry.anchor
                        updateEntry(entry.id, { title: newTitle, anchor })
                      }}
                      placeholder={t('section_title_ph')}
                      className={cn(inputCls, 'flex-1')}
                    />
                    <DateInput
                      value={entry.date}
                      onChange={(v) => updateEntry(entry.id, { date: v })}
                      className={cn(inputCls, 'w-[110px] shrink-0')}
                    />
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(entry.id)}
                      title={t('remove_section')}
                      className="shrink-0 flex items-center justify-center p-1 rounded-sm text-chr-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X size={11} strokeWidth={1.5} />
                    </button>
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
    </>
  )
}

// ── AddPartButton ──────────────────────────────────────────────────────────────

/** "+ Adicionar trecho" — sempre no fim do editor, com 1 ou vários trechos */
function AddPartButton({ onClick, className }: { onClick: () => void; className?: string }) {
  const { t } = useI18n()
  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <button
        type="button"
        onClick={onClick}
        className="w-10 h-10 rounded-full border border-chr-subtle flex items-center justify-center text-chr-muted hover:text-chr-primary hover:border-chr transition-colors"
      >
        <Plus size={14} strokeWidth={1.5} />
      </button>
      <span className="font-mono text-2xs tracking-widest uppercase text-chr-muted/60 select-none">
        {t('add_section')}
      </span>
    </div>
  )
}

// ── SectionBlocksEditor ────────────────────────────────────────────────────────

interface SectionBlocksEditorProps {
  entries: EntryEdit[]
  sectionBodies: Record<string, string>
  onEntriesChange: (entries: EntryEdit[]) => void
  onBodyChange: (id: string, body: string) => void
  onAddSection: () => void
  onBodyFocus: (el: HTMLTextAreaElement, id: string) => void
  onBodyBlur: () => void
  wideLayout?: boolean
}

function SectionBlocksEditor({ entries, sectionBodies, onEntriesChange, onBodyChange, onAddSection, onBodyFocus, onBodyBlur, wideLayout }: SectionBlocksEditorProps) {
  const { t } = useI18n()
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const updateEntry = (id: string, patch: Partial<EntryEdit>) =>
    onEntriesChange(entries.map((e) => e.id === id ? { ...e, ...patch } : e))

  const confirmRemove = () => {
    if (!pendingDeleteId) return
    onEntriesChange(entries.filter((e) => e.id !== pendingDeleteId))
    setPendingDeleteId(null)
  }

  // Enquanto uma data está sendo digitada, a ordem fica congelada: reordenar a
  // cada tecla fazia a seção "pular" pela lista (datas parciais como "2", "20"...).
  // A reordenação acontece ao sair do campo.
  const [frozenOrder, setFrozenOrder] = useState<string[] | null>(null)
  const sorted = frozenOrder
    ? [
        ...frozenOrder.map((id) => entries.find((e) => e.id === id)).filter((e): e is EntryEdit => !!e),
        ...entries.filter((e) => !frozenOrder.includes(e.id)),
      ]
    : sortEntries(entries)

  // Ao sair do campo de data, a seção pode ir parar longe (ex: posição 143 de 200).
  // Rola até ela e a destaca brevemente para o usuário não perdê-la de vista.
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const scrollToIdRef = useRef<string | null>(null)
  const handleDateBlur = (entryId: string, e: React.FocusEvent<HTMLInputElement>) => {
    const before = frozenOrder ?? sorted.map((x) => x.id)
    const after = sortEntries(entries).map((x) => x.id)
    setFrozenOrder(null)
    if (before.indexOf(entryId) === after.indexOf(entryId)) return
    setHighlightId(entryId)
    // Se o foco foi para um campo de OUTRA seção (clique), não arrasta a tela para longe dele
    const target = (e.relatedTarget as HTMLElement | null)?.closest<HTMLElement>('[data-entry-id]')
    if (!target || target.dataset.entryId === entryId) scrollToIdRef.current = entryId
  }
  useEffect(() => {
    if (!highlightId) return
    if (scrollToIdRef.current === highlightId) {
      scrollToIdRef.current = null
      document.querySelector(`[data-entry-id="${highlightId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    const timer = setTimeout(() => setHighlightId(null), 1600)
    return () => clearTimeout(timer)
  }, [highlightId])
  const pendingEntry = entries.find((e) => e.id === pendingDeleteId)

  return (
    <>
    {pendingDeleteId && (
      <ConfirmModal
        message={t('remove_part_confirm', { title: pendingEntry?.title?.trim() || '—' })}
        onConfirm={confirmRemove}
        confirmLabel={t('remove_section')}
        onCancel={() => setPendingDeleteId(null)}
      />
    )}
    <div className="bg-vault">
      <div className={wideLayout ? 'max-w-5xl mx-auto px-8 pt-2 pb-20' : 'max-w-2xl mx-auto px-12 pt-2 pb-20'}>

        {sorted.map((entry, idx) => (
          <div key={entry.id} data-entry-id={entry.id} className="group relative">
            {/* Divider between sections */}
            {idx > 0 && <div className="h-px bg-chr-subtle my-10" />}

            <div
              className="rounded-sm transition-[background-color,box-shadow] duration-700"
              style={highlightId === entry.id
                ? { backgroundColor: 'rgb(var(--chronicle-dot) / 0.08)', boxShadow: '0 0 0 12px rgb(var(--chronicle-dot) / 0.08)' }
                : undefined}
            >

              {/* Meta row: date + number + delete */}
              <div className="flex items-center justify-between mb-3">
                <DateInput
                  value={entry.date}
                  onChange={(v) => updateEntry(entry.id, { date: v })}
                  onFocus={() => setFrozenOrder(sorted.map((e) => e.id))}
                  onBlur={(e) => handleDateBlur(entry.id, e)}
                  className="font-mono text-sm text-timeline-chronicle-text bg-transparent border-0 outline-none focus:outline-none placeholder:text-chr-muted/30 w-32"
                />
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-chr-muted/30 select-none tabular-nums">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(entry.id)}
                    title={t('remove_section')}
                    className="text-chr-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <X size={12} strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              {/* Title — large serif */}
              <textarea
                ref={(el) => { if (el) { const len = String(el.value.length); if (el.dataset.hLen !== len) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; el.dataset.hLen = len } } }}
                value={entry.title}
                onChange={(e) => {
                  const newTitle = e.target.value
                  const prevSlug = slugify(entry.title)
                  const anchor = (!entry.anchor || entry.anchor === prevSlug) ? slugify(newTitle) : entry.anchor
                  updateEntry(entry.id, { title: newTitle, anchor })
                  const el = e.currentTarget; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'
                }}
                placeholder={t('section_title_ph')}
                spellCheck={false}
                rows={1}
                className="w-full font-serif text-2xl text-chr-primary bg-transparent border-0 outline-none focus:outline-none placeholder:text-chr-muted/20 mb-5 leading-tight resize-none overflow-hidden"
              />

              {/* Body textarea — open, auto-height */}
              <textarea
                ref={(el) => { if (el) { const len = String(el.value.length); if (el.dataset.hLen !== len) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; el.dataset.hLen = len } } }}
                value={sectionBodies[entry.id] || ''}
                onChange={(e) => onBodyChange(entry.id, e.target.value)}
                onFocus={(e) => onBodyFocus(e.currentTarget, entry.id)}
                onBlur={onBodyBlur}
                placeholder={t('section_body_ph')}
                spellCheck={false}
                rows={1}
                data-section-id={entry.id}
                className="w-full resize-none overflow-hidden outline-none block font-mono text-sm text-chr-primary leading-relaxed bg-transparent border-0 focus:outline-none focus:ring-0 placeholder:text-chr-muted/30"
                onInput={(e) => {
                  const el = e.currentTarget
                  el.style.height = 'auto'
                  el.style.height = el.scrollHeight + 'px'
                }}
              />
            </div>
          </div>
        ))}

        <AddPartButton onClick={onAddSection} className={entries.length > 0 ? 'mt-12' : 'mt-4'} />

      </div>
    </div>
    </>
  )
}

// ── MarkdownToolbar ────────────────────────────────────────────────────────────

interface MarkdownToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>
  onBodyChange: (v: string) => void
  onPickImage: () => void
  isInsertingImage: boolean
  showRawToggle?: boolean
  isRawMode?: boolean
  onToggleRawMode?: () => void
  showFormatting?: boolean
  onSendToTrash?: () => void
}

function MarkdownToolbar({
  textareaRef, onBodyChange, onPickImage, isInsertingImage,
  showRawToggle, isRawMode, onToggleRawMode, showFormatting, onSendToTrash,
}: MarkdownToolbarProps) {
  const { t } = useI18n()

  const apply = (fn: (v: string, s: number, e: number) => TextEdit) => {
    const ta = textareaRef.current
    if (!ta) return
    const r = fn(ta.value, ta.selectionStart, ta.selectionEnd)
    onBodyChange(r.value)
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(r.selStart, r.selEnd) })
  }

  const TABLE_TPL = `| Coluna 1 | Coluna 2 | Coluna 3 |\n|----------|----------|----------|\n| Célula 1 | Célula 2 | Célula 3 |`

  const btnCls = cn(
    'flex items-center justify-center w-7 h-7 rounded-sm text-xs font-mono',
    'text-chr-muted border border-transparent',
    'hover:bg-hover hover:text-chr-primary hover:border-chr-subtle',
    'transition-colors duration-100 shrink-0 select-none',
    'disabled:opacity-25 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-chr-muted disabled:hover:border-transparent'
  )
  const sep = <div className="w-px h-4 bg-chr-subtle mx-0.5 shrink-0" />

  return (
    <div
      className="shrink-0 flex items-center gap-0.5 px-3 py-1.5 border-b border-chr-subtle bg-surface flex-wrap"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Headings */}
      <button type="button" title="Cabeçalho H2" disabled={!showFormatting} className={btnCls} onClick={() => apply((v, s) => applyHeading(v, s, '## '))}>H2</button>
      <button type="button" title="Cabeçalho H3" disabled={!showFormatting} className={btnCls} onClick={() => apply((v, s) => applyHeading(v, s, '### '))}>H3</button>

      {sep}

      {/* Inline formatting */}
      <button type="button" title="Negrito" disabled={!showFormatting} className={cn(btnCls, 'font-bold')} onClick={() => apply((v, s, e) => applyInline(v, s, e, '**', '**'))}>B</button>
      <button type="button" title="Itálico" disabled={!showFormatting} className={cn(btnCls, 'italic')} onClick={() => apply((v, s, e) => applyInline(v, s, e, '*', '*'))}>I</button>
      <button type="button" title="Tachado" disabled={!showFormatting} className={cn(btnCls, 'line-through')} onClick={() => apply((v, s, e) => applyInline(v, s, e, '~~', '~~'))}>S</button>
      <button type="button" title="Código inline" disabled={!showFormatting} className={btnCls} onClick={() => apply((v, s, e) => applyInline(v, s, e, '`', '`', 'código'))}>
        <Code size={12} strokeWidth={1.5} />
      </button>

      {sep}

      {/* Block formatting */}
      <button type="button" title="Citação (blockquote)" disabled={!showFormatting} className={btnCls} onClick={() => apply((v, s) => applyLinePrefix(v, s, '> '))}>
        <Quote size={12} strokeWidth={1.5} />
      </button>
      <button type="button" title="Lista com marcador" disabled={!showFormatting} className={btnCls} onClick={() => apply((v, s) => applyLinePrefix(v, s, '- '))}>
        <List size={12} strokeWidth={1.5} />
      </button>
      <button type="button" title="Lista numerada" disabled={!showFormatting} className={btnCls} onClick={() => apply((v, s) => applyLinePrefix(v, s, '1. '))}>
        <ListOrdered size={12} strokeWidth={1.5} />
      </button>
      <button type="button" title="Lista de tarefas" disabled={!showFormatting} className={btnCls} onClick={() => apply((v, s) => applyLinePrefix(v, s, '- [ ] '))}>
        <CheckSquare size={12} strokeWidth={1.5} />
      </button>

      {sep}

      {/* Inserts */}
      <button type="button" title="Inserir tabela" disabled={!showFormatting} className={btnCls} onClick={() => apply((v, s) => insertAtCursor(v, s, '\n' + TABLE_TPL + '\n'))}>
        <Table size={12} strokeWidth={1.5} />
      </button>
      <button type="button" title="Inserir link" disabled={!showFormatting} className={btnCls} onClick={() => apply((v, s, e) => applyInline(v, s, e, '[', '](url)', 'texto'))}>
        <Link size={12} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        title="Inserir imagem (ou cole com Ctrl+V)"
        className={cn(btnCls, (isInsertingImage || !showFormatting) && 'opacity-40 cursor-default')}
        onClick={onPickImage}
        disabled={isInsertingImage || !showFormatting}
      >
        <ImagePlus size={12} strokeWidth={1.5} />
      </button>

      {sep}

      {/* Spacer + actions */}
      <div className="flex-1 min-w-[4px]" />

      {showRawToggle && (
        <button
          type="button"
          onClick={onToggleRawMode}
          title={isRawMode ? 'Voltar para o formulário estruturado' : 'Editar o arquivo .md completo (YAML + corpo)'}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1 rounded-sm font-mono text-xs border shrink-0 transition-colors',
            isRawMode
              ? 'border-chr-strong text-chr-primary bg-active'
              : 'border-chr-subtle text-chr-muted hover:text-chr-secondary'
          )}
        >
          {isRawMode ? <FileText size={11} strokeWidth={1.5} /> : <FileCode size={11} strokeWidth={1.5} />}
          {isRawMode ? t('form_mode_label') : t('raw_mode_label')}
        </button>
      )}

      {onSendToTrash && (
        <>
          <div className="w-px h-3.5 bg-chr-subtle mx-1 shrink-0" />
          <button
            type="button"
            onClick={onSendToTrash}
            title={t('send_to_trash')}
            className="flex items-center gap-1 px-2 py-1 rounded-sm font-mono text-xs border border-transparent text-chr-muted hover:text-red-400 hover:border-red-400/40 shrink-0 transition-colors"
          >
            <Trash2 size={11} strokeWidth={1.5} />
          </button>
        </>
      )}

    </div>
  )
}

// ── MarkdownBody ──────────────────────────────────────────────────────────────

const REMARK_PLUGINS = [remarkGfm, remarkBreaks]

/**
 * Markdown renderizado. Memoizado: sem isso o documento inteiro era re-parseado
 * a cada render da página (ex: a cada tecla na busca, a cada mudança de store).
 */
const MarkdownBody = React.memo(function MarkdownBody({ body, eventFilePath }: { body: string; eventFilePath: string }) {
  const components = useMemo(() => ({
    img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => {
      const resolved = src ? window.electronAPI.resolveAssetPath(eventFilePath, src) : ''
      return <img {...props} src={resolved} alt={alt ?? ''} className="max-w-full rounded border border-chr-subtle my-4" />
    },
  }), [eventFilePath])
  return <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>{body}</ReactMarkdown>
})

// ── ConfirmModal ───────────────────────────────────────────────────────────────

function ConfirmModal({ message, onConfirm, onCancel, confirmLabel = 'Confirmar' }: { message: string; onConfirm: () => void; onCancel: () => void; confirmLabel?: string }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter') onConfirm() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel, onConfirm])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative z-10 w-[360px] chr-card p-6 shadow-card-hover">
        <p className="font-sans text-sm text-chr-primary mb-6 leading-relaxed">{message}</p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 font-mono text-xs border border-chr-subtle text-chr-muted hover:text-chr-secondary hover:border-chr transition-colors rounded-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 font-mono text-xs border border-chr-strong text-chr-primary hover:bg-active transition-colors rounded-sm"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── PdfExportModal ─────────────────────────────────────────────────────────────

interface PdfOptions {
  pageSize: 'A4' | 'Letter' | 'Legal' | 'A3'
  landscape: boolean
  marginType: 'default' | 'none' | 'printableArea'
  scaleFactor: number
  includeTags: boolean
}

function PdfToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={cn(
        'relative w-10 h-5 rounded-full border transition-colors duration-200 shrink-0',
        value ? 'bg-chr-accent border-chr-accent' : 'bg-subtle border-chr-subtle'
      )}
    >
      <span
        className="absolute w-4 h-4 rounded-full transition-all duration-200"
        style={{
          top: '1px',
          left: value ? '20px' : '2px',
          backgroundColor: 'white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.12)',
        }}
      />
    </button>
  )
}

interface PdfExportModalProps {
  suggestedName: string
  isExporting: boolean
  error: string | null
  onConfirm: (opts: PdfOptions) => void
  onCancel: () => void
}

function PdfExportModal({ suggestedName, isExporting, error, onConfirm, onCancel }: PdfExportModalProps) {
  const { t } = useI18n()
  const [opts, setOpts] = useState<PdfOptions>({
    pageSize: 'A4',
    landscape: false,
    marginType: 'default',
    scaleFactor: 100,
    includeTags: false,
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  const rowCls = 'flex items-center justify-between gap-4 py-3 border-b border-chr-subtle last:border-0'
  const labelCls = 'font-mono text-xs text-chr-secondary select-none'
  const selectCls = 'font-mono text-xs bg-vault border border-chr-subtle text-chr-primary rounded-sm px-2 py-1 focus:outline-none focus:border-chr transition-colors'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative z-10 w-[400px] chr-card p-6 shadow-card-hover">

        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-serif text-base text-chr-primary">{t('pdf_export_title')}</h3>
          <button onClick={onCancel} className="text-chr-muted hover:text-chr-primary transition-colors p-0.5">
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
        <p className="font-mono text-2xs text-chr-muted mb-5 leading-relaxed">
          {t('pdf_export_desc', { name: suggestedName })}
        </p>

        {/* Options */}
        <div>
          {/* Page size */}
          <div className={rowCls}>
            <span className={labelCls}>{t('pdf_page_size')}</span>
            <select
              value={opts.pageSize}
              onChange={(e) => setOpts((o) => ({ ...o, pageSize: e.target.value as PdfOptions['pageSize'] }))}
              className={selectCls}
            >
              <option value="A4">A4</option>
              <option value="Letter">Letter</option>
              <option value="Legal">Legal</option>
              <option value="A3">A3</option>
            </select>
          </div>

          {/* Landscape */}
          <div className={rowCls}>
            <span className={labelCls}>{t('pdf_landscape')}</span>
            <PdfToggle value={opts.landscape} onChange={(v) => setOpts((o) => ({ ...o, landscape: v }))} />
          </div>

          {/* Margins */}
          <div className={rowCls}>
            <span className={labelCls}>{t('pdf_margins')}</span>
            <select
              value={opts.marginType}
              onChange={(e) => setOpts((o) => ({ ...o, marginType: e.target.value as PdfOptions['marginType'] }))}
              className={selectCls}
            >
              <option value="default">{t('pdf_margin_default')}</option>
              <option value="none">{t('pdf_margin_none')}</option>
              <option value="printableArea">{t('pdf_margin_minimal')}</option>
            </select>
          </div>

          {/* Include tags */}
          <div className={rowCls}>
            <span className={labelCls}>{t('pdf_include_tags')}</span>
            <PdfToggle value={opts.includeTags} onChange={(v) => setOpts((o) => ({ ...o, includeTags: v }))} />
          </div>

          {/* Scale */}
          <div className={rowCls}>
            <span className={labelCls}>{t('pdf_scale')}</span>
            <div className="flex items-center gap-2.5">
              <input
                type="range"
                min={50}
                max={200}
                step={5}
                value={opts.scaleFactor}
                onChange={(e) => setOpts((o) => ({ ...o, scaleFactor: Number(e.target.value) }))}
                className="w-28 accent-chr-primary cursor-pointer"
              />
              <span className="font-mono text-xs text-chr-muted w-10 text-right tabular-nums">
                {opts.scaleFactor}%
              </span>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="font-mono text-2xs text-red-500 mt-3">{error}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 justify-end mt-5">
          <button
            onClick={onCancel}
            disabled={isExporting}
            className="px-3 py-1.5 font-mono text-xs rounded-sm border border-chr-subtle text-chr-muted hover:text-chr-secondary hover:border-chr transition-colors disabled:opacity-40"
          >
            {t('cancel')}
          </button>
          <button
            onClick={() => onConfirm(opts)}
            disabled={isExporting}
            className="px-4 py-1.5 font-mono text-xs rounded-sm bg-chr-primary text-surface hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isExporting ? t('exporting_pdf') : t('export_pdf')}
          </button>
        </div>

      </div>
    </div>
  )
}

// ── EventView ─────────────────────────────────────────────────────────────────

export default function EventView(): React.ReactElement {
  const navigate = useNavigate()
  const {
    selectedEvent,
    selectedEventBody,
    selectedEventRaw,
    isLoadingEvent,
    currentTimeline,
    loadEvent,
    saveEvent,
    reloadTimeline,
    refreshTimeline,
    enterSubtimeline,
    openInEditor,
    deleteEvent,
  } = useTimeline()
  const { reloadVault } = useVault()
  const currentNavItem = useNavigationStore((s) => s.current())
  const { t, nSections } = useI18n()

  // ── Shared edit state ─────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [bodyFocused, setBodyFocused] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  // Auto-save infrastructure
  const isSavingRef = useRef(false)
  const resaveRef = useRef(false) // um save foi pedido enquanto outro estava em andamento
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const preEditRawRef = useRef<string | null>(null) // snapshot of raw content when editing started

  // ── Save on unmount: flush any pending debounced save when navigating away ──
  const performSaveRef = useRef<() => Promise<void>>(() => Promise.resolve())
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
        performSaveRef.current()
      }
    }
  }, [])

  const [wideLayout, setWideLayout] = useState(() => localStorage.getItem('chr-wide-layout') === '1')
  const toggleWideLayout = () => setWideLayout((v) => { const next = !v; localStorage.setItem('chr-wide-layout', next ? '1' : '0'); return next })
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null)
  const skipDirtyRef = useRef(false)
  const editInitializedRef = useRef(false)
  const reSelectRef = useRef<{ filePath: string; slug: string; anchor?: string } | null>(null)
  const [isInsertingImage, setIsInsertingImage] = useState(false)
  const [showPdfModal, setShowPdfModal] = useState(false)
  const [isPdfExporting, setIsPdfExporting] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const editScrollRef = useRef<HTMLDivElement>(null)

  // ── Unified edit state ────────────────────────────────────────────────────
  const [editFm, setEditFm] = useState<EditFm>(defaultEditFm())
  const [editBody, setEditBody] = useState('')
  const [editEntries, setEditEntries] = useState<EntryEdit[]>([])
  const [editChrDesc, setEditChrDesc] = useState('')
  const [editIsRaw, setEditIsRaw] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editSectionBodies, setEditSectionBodies] = useState<Record<string, string>>({})

  // ── Panel collapse state — default collapsed ───────────────────────────────


  // ── Search ────────────────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatchIdx, setSearchMatchIdx] = useState(0)
  const [searchMatchCount, setSearchMatchCount] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const viewContentRef = useRef<HTMLDivElement>(null)

  // ── Derived ───────────────────────────────────────────────────────────────
  const hasEntries = editEntries.length > 0

  // ── Dirty tracking (form mode) ────────────────────────────────────────────
  useEffect(() => {
    if (skipDirtyRef.current) { skipDirtyRef.current = false; return }
    if (isEditing) setIsDirty(true)
  }, [editFm, editBody, editEntries, editSectionBodies, editChrDesc]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chronicle anchor / display ────────────────────────────────────────────
  const [showFullBody, setShowFullBody] = useState(false)
  const chr = selectedEvent?.chronicle
  // anchorBlock  = último bloco da entrada (trecho/excerpt)
  const anchorBlock = chr?.anchor && selectedEventBody ? extractBlock(selectedEventBody, chr.anchor) : null
  // fullEntryContent = todo o conteúdo da entrada entre dois anchors consecutivos
  // Só é "evento com trechos" (losango, Trecho/Completo) com 2+ trechos; um
  // chronicle de 1 entrada é exibido como evento comum
  const multi = selectedEvent ? isMultiPart(selectedEvent) : false
  const fullEntryContent = chr?.anchor && selectedEventBody ? chronicleEntryBody(selectedEventBody, chr.anchor) : null
  const displayBody = selectedEventBody
    ? (chr && multi
      // Chronicle: Trecho = só esta entrada; Completo = chronicle inteiro (todos os trechos)
      ? (showFullBody ? stripAnchors(selectedEventBody) : (fullEntryContent ?? anchorBlock))
      // Evento normal: body completo sem markers
      : stripAnchors(selectedEventBody))
    : null
  useEffect(() => { setShowFullBody(false) }, [selectedEvent?.slug])

  // ── Navigate away if no event ─────────────────────────────────────────────
  useEffect(() => {
    if (!selectedEvent && !reSelectRef.current) navigate('/timeline', { replace: true })
  }, [selectedEvent, navigate])

  // ── Re-select event after save reload ────────────────────────────────────
  useEffect(() => {
    if (!reSelectRef.current || !currentTimeline) return
    const sel = reSelectRef.current
    reSelectRef.current = null
    // Chronicles geram vários eventos no mesmo arquivo: mantém a mesma entrada
    const sameFile = currentTimeline.events.filter((e) => e.filePath === sel.filePath)
    const event = (sel.anchor && sameFile.find((e) => e.chronicle?.anchor === sel.anchor))
      || sameFile.find((e) => e.slug === sel.slug)
      || sameFile[0]
    if (event) loadEvent(event)
  }, [currentTimeline, loadEvent])

  // ── editValuesRef: always holds the latest edit state for the auto-save closure ──
  const editValuesRef = useRef({ editFm, editBody, editEntries, editSectionBodies, editChrDesc, editContent, editIsRaw, selectedEvent: selectedEvent as typeof selectedEvent | null })
  editValuesRef.current = { editFm, editBody, editEntries, editSectionBodies, editChrDesc, editContent, editIsRaw, selectedEvent }

  // ── Aplica um estado de edição completo (início, reverter, sair do modo raw) ──
  const applyEditState = useCallback((st: EditState) => {
    setEditFm(st.fm)
    setEditBody(st.body)
    setEditEntries(st.entries)
    setEditChrDesc(st.chrDesc)
    setEditSectionBodies(st.sectionBodies)
  }, [])

  // ── Start editing ─────────────────────────────────────────────────────────
  const handleStartEdit = useCallback(() => {
    setSaveError(null)
    skipDirtyRef.current = true
    setIsDirty(false)
    setEditIsRaw(false)
    applyEditState(editStateFromRaw(selectedEventRaw ?? '', isChronicleRaw(selectedEventRaw ?? '')))
    preEditRawRef.current = selectedEventRaw ?? null
    editInitializedRef.current = true
    setIsEditing(true)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }, [selectedEvent, selectedEventRaw, applyEditState])

  // ── Cancel editing ────────────────────────────────────────────────────────
  const handleCancelEdit = useCallback(() => {
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null }
    skipDirtyRef.current = true
    setIsDirty(false)
    setSaveStatus('idle')
    editInitializedRef.current = false
    setIsEditing(false)
    setSaveError(null)
    setBodyFocused(false)
  }, [])

  // ── Navigate to another event, resetting all edit/draft state ───────────
  const navigateTo = useCallback((event: ChroniclerEvent) => {
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null }
    skipDirtyRef.current = true
    editInitializedRef.current = false
    setIsEditing(false)
    setIsDirty(false)
    setSaveStatus('idle')
    setSaveError(null)
    setBodyFocused(false)
    setShowFullBody(false)
    loadEvent(event)
  }, [loadEvent])

  // ── Toggle between edit and preview (preserves draft) ────────────────────
  const handleToggleMode = useCallback(() => {
    if (!isEditing) {
      if (!editInitializedRef.current) {
        handleStartEdit()
      } else {
        setIsEditing(true)
      }
    } else {
      setShowFullBody(false)
      setIsEditing(false)
      // If nothing was changed, clear draft state so view shows saved data.
      // This prevents isDraftActive from incorrectly overriding section-level
      // fields (e.g. importance, body) with chronicle-level defaults.
      if (!isDirty) {
        editInitializedRef.current = false
      }
    }
  }, [isEditing, isDirty, handleStartEdit])

  // ── Revert changes (stay in edit mode) ───────────────────────────────────
  const handleRevert = useCallback(() => {
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null }
    setSaveError(null)
    setSaveStatus('idle')
    skipDirtyRef.current = true
    setIsDirty(false)
    setEditIsRaw(false)
    const rawSnapshot = preEditRawRef.current ?? selectedEventRaw ?? ''
    applyEditState(editStateFromRaw(rawSnapshot, isChronicleRaw(rawSnapshot)))
  }, [selectedEventRaw, applyEditState])

  // ── Body change handler ───────────────────────────────────────────────────
  const handleBodyChange = useCallback((v: string) => {
    if (editIsRaw) { setEditContent(v); setIsDirty(true) }
    else setEditBody(v)
  }, [editIsRaw])

  // Roteia a alteração para a seção focada ou para o corpo principal
  const activeBodyChange = useCallback((v: string) => {
    if (focusedSectionId) setEditSectionBodies((prev) => ({ ...prev, [focusedSectionId]: v }))
    else handleBodyChange(v)
  }, [focusedSectionId, handleBodyChange])

  // ── Toggle raw mode ───────────────────────────────────────────────────────
  const handleToggleRawMode = useCallback(() => {
    if (!editIsRaw) {
      const body = editEntries.length > 0 ? buildBodyFromSections(editEntries, editSectionBodies) : editBody
      const raw = buildSaveContent(editFm, body, editEntries, editChrDesc)
      setEditContent(raw)
      setEditIsRaw(true)
    } else {
      skipDirtyRef.current = true
      applyEditState(editStateFromRaw(editContent, isChronicleRaw(editContent)))
      setEditIsRaw(false)
    }
  }, [editIsRaw, editFm, editBody, editEntries, editSectionBodies, editChrDesc, editContent, applyEditState])

  // ── Search: open / close ──────────────────────────────────────────────────
  const openSearch = useCallback(() => {
    setSearchOpen(true)
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchMatchCount(0)
    setSearchMatchIdx(0)
    clearCSSHighlights()
  }, [])

  // Ctrl+F / Escape + intercept typing when textarea has focus in edit search mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); openSearch(); return }
      if (e.key === 'Escape' && searchOpen) { closeSearch(); return }
      // In edit mode with search open: if a textarea stole focus, capture keystrokes
      // and redirect them to the search input so the user can keep typing the query
      if (searchOpen && isEditing && document.activeElement?.tagName === 'TEXTAREA') {
        if (e.ctrlKey || e.metaKey || e.altKey) return
        if (e.key.length === 1) {
          e.preventDefault()
          setSearchQuery(q => q + e.key)
          setSearchMatchIdx(0)
        } else if (e.key === 'Backspace') {
          e.preventDefault()
          setSearchQuery(q => q.slice(0, -1))
          setSearchMatchIdx(0)
        }
      }
    }
    document.addEventListener('keydown', onKey, true) // capture phase — before textarea
    return () => document.removeEventListener('keydown', onKey, true)
  }, [searchOpen, isEditing, openSearch, closeSearch])

  // View mode: CSS Custom Highlight API (React-safe — never touches the DOM)
  useEffect(() => {
    clearCSSHighlights()
    const container = viewContentRef.current
    if (!container || isEditing || !searchOpen || !searchQuery.trim()) {
      if (!searchOpen || !searchQuery.trim()) setSearchMatchCount(0)
      return
    }
    const ranges = findTextRanges(container, searchQuery)
    const count = ranges.length
    setSearchMatchCount(count)
    if (!count) return
    const normIdx = ((searchMatchIdx % count) + count) % count
    try {
      const H = (CSS as any).highlights
      const others = ranges.filter((_, i) => i !== normIdx)
      if (others.length) H.set('chr-search-all', new (window as any).Highlight(...others))
      H.set('chr-search-cur', new (window as any).Highlight(ranges[normIdx]))
    } catch {}
    const anchor = ranges[normIdx].startContainer.parentElement
    if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [searchOpen, searchQuery, searchMatchIdx, selectedEventBody, showFullBody, isEditing, isLoadingEvent])

  // Close search when switching between view ↔ edit mode
  const prevIsEditingRef = useRef(isEditing)
  useEffect(() => {
    if (prevIsEditingRef.current !== isEditing) {
      prevIsEditingRef.current = isEditing
      closeSearch()
    }
  }, [isEditing, closeSearch])

  // Edit mode: scroll to match without stealing focus from search input
  useEffect(() => {
    if (!isEditing || !searchOpen || !searchQuery.trim()) return
    const lowerQ = searchQuery.toLowerCase()
    const sources: Array<{ el: HTMLTextAreaElement; text: string }> = []
    if (editIsRaw) {
      if (textareaRef.current) sources.push({ el: textareaRef.current, text: textareaRef.current.value })
    } else if (editEntries.length > 0) {
      const container = editScrollRef.current
      if (container) {
        editEntries.forEach(entry => {
          const ta = container.querySelector(`textarea[data-section-id="${entry.id}"]`) as HTMLTextAreaElement | null
          if (ta) sources.push({ el: ta, text: ta.value })
        })
      }
    } else if (textareaRef.current) {
      sources.push({ el: textareaRef.current, text: textareaRef.current.value })
    }
    const matches: Array<{ el: HTMLTextAreaElement; start: number }> = []
    sources.forEach(({ el, text }) => {
      const lower = text.toLowerCase()
      let pos = 0, idx: number
      while ((idx = lower.indexOf(lowerQ, pos)) !== -1) {
        matches.push({ el, start: idx })
        pos = idx + lowerQ.length
      }
    })
    setSearchMatchCount(matches.length)
    if (!matches.length) return
    const normIdx = ((searchMatchIdx % matches.length) + matches.length) % matches.length
    const match = matches[normIdx]
    match.el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Focus the textarea so the selection is visible
    match.el.focus()
    match.el.setSelectionRange(match.start, match.start + lowerQ.length)
    // Note: focus stays on the textarea so selection is visible.
    // The keydown handler (capture phase) intercepts typing and redirects to search query.
  }, [searchOpen, searchQuery, searchMatchIdx, isEditing, editIsRaw, editEntries, editBody])

  // Textarea do evento de 1 trecho cresce com o conteúdo (o botão de adicionar fica logo abaixo)
  useEffect(() => {
    const el = textareaRef.current
    if (!el || !isEditing || editIsRaw || editEntries.length > 0) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [editBody, isEditing, editIsRaw, editEntries.length, wideLayout])

  // ── Add section ───────────────────────────────────────────────────────────
  const handleAddSection = useCallback(() => {
    const newEntry = defaultEntry()
    if (editEntries.length === 0) {
      // 1 → 2 trechos: o conteúdo atual vira o 1º trecho e o 2º já é criado vazio.
      // O título atual continua como título do evento (editável no topo).
      const first = defaultEntry()
      first.title = editFm.title
      first.date = editFm.date
      first.anchor = slugify(editFm.title || 'trecho')
      setEditSectionBodies({ [first.id]: editBody, [newEntry.id]: '' })
      setEditBody('')
      setEditEntries([first, newEntry])
    } else {
      setEditSectionBodies((prev) => ({ ...prev, [newEntry.id]: '' }))
      setEditEntries((prev) => [...prev, newEntry])
    }
  }, [editEntries, editFm, editBody])

  // ── performSave: reads latest values from ref, called by auto-save & Ctrl+S ──
  const performSave = useCallback(async () => {
    if (isSavingRef.current) { resaveRef.current = true; return }
    const vals = editValuesRef.current
    if (!vals.selectedEvent) return
    isSavingRef.current = true
    setSaveStatus('saving')
    setSaveError(null)
    try {
      const rawContent = buildRawFromEditValues(vals)
      const ok = await saveEvent(vals.selectedEvent.filePath, rawContent)
      if (ok) {
        preEditRawRef.current = rawContent // update snapshot to latest saved
        // Se o usuário digitou durante o save, continua "sujo" — o timer de
        // auto-save já agendado (ou o resave abaixo) grava o restante.
        const upToDate = buildRawFromEditValues(editValuesRef.current) === rawContent
        if (upToDate) setIsDirty(false)
        setSaveStatus(upToDate ? 'saved' : 'pending')
        setTimeout(() => setSaveStatus((s) => s === 'saved' ? 'idle' : s), 2500)
        // Atualiza a timeline em segundo plano (posição/data refletidas ao voltar),
        // sem limpar a seleção nem desmontar o editor.
        reSelectRef.current = {
          filePath: vals.selectedEvent.filePath,
          slug: vals.selectedEvent.slug,
          anchor: vals.selectedEvent.chronicle?.anchor,
        }
        refreshTimeline()
      } else {
        setSaveStatus('error')
        setSaveError(t('save_error'))
      }
    } catch {
      setSaveStatus('error')
      setSaveError(t('save_error_unexpected'))
    } finally {
      isSavingRef.current = false
      if (resaveRef.current) {
        resaveRef.current = false
        performSaveRef.current()
      }
    }
  }, [saveEvent, refreshTimeline, t]) // intentionally reads edit state from editValuesRef
  // Always keep ref in sync so the unmount cleanup can call the latest version
  performSaveRef.current = performSave

  // ── Auto-save: debounced 1.5s after last content change ──────────────────
  useEffect(() => {
    if (!isDirty || !selectedEvent) return
    setSaveStatus('pending')
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null
      performSave()
    }, 1500)
    return () => {
      if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null }
    }
  }, [editFm, editBody, editEntries, editSectionBodies, editChrDesc, editContent, isDirty, selectedEvent, performSave])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null }
      performSave()
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget
      const s = ta.selectionStart
      const v = ta.value
      const newVal = v.slice(0, s) + '  ' + v.slice(ta.selectionEnd)
      activeBodyChange(newVal)
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 2 })
    }
  }, [performSave, activeBodyChange])

  // ── Image insertion ───────────────────────────────────────────────────────
  const insertImageMarkdown = useCallback((relativePath: string) => {
    const ta = textareaRef.current
    const text = `![imagem](${relativePath})`
    if (!ta) { activeBodyChange(text + '\n'); return }
    const v = ta.value
    const s = ta.selectionStart
    const newContent = v.slice(0, s) + text + v.slice(ta.selectionEnd)
    activeBodyChange(newContent)
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + text.length; ta.focus() })
  }, [activeBodyChange])

  const handlePickImage = useCallback(async () => {
    if (!selectedEvent || isInsertingImage) return
    setIsInsertingImage(true)
    try {
      const result = await window.electronAPI.invoke<{ success: boolean; relativePath?: string }>('fs:pick-image', selectedEvent.filePath)
      if (result.success && result.relativePath) insertImageMarkdown(result.relativePath)
    } finally { setIsInsertingImage(false) }
  }, [selectedEvent, isInsertingImage, insertImageMarkdown])

  // ── Export PDF ────────────────────────────────────────────────────────────
  const handleExportPdf = useCallback(() => {
    setPdfError(null)
    setShowPdfModal(true)
  }, [])

  const handleExportPdfConfirm = useCallback(async (opts: PdfOptions) => {
    if (!selectedEvent) return
    setIsPdfExporting(true)
    setPdfError(null)
    const fm = selectedEvent.frontmatter
    const suggestedName = fm.title || selectedEvent.slug
    const filePath = selectedEvent.filePath

    // Render markdown to clean HTML for PDF export (reuses existing rendering pipeline)
    const htmlContent = displayBody
      ? renderToStaticMarkup(
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            components={{
              img: ({ src, alt }) => {
                const resolved = src ? window.electronAPI.resolveAssetPath(filePath, src) : ''
                return <img src={resolved} alt={alt ?? ''} />
              },
            }}
          >
            {displayBody}
          </ReactMarkdown>
        )
      : ''

    try {
      const result = await window.electronAPI.invoke<{
        success: boolean
        canceled?: boolean
        filePath?: string
        error?: string
      }>('app:export-pdf', {
        suggestedName,
        htmlContent,
        title: fm.title || selectedEvent.slug,
        dateDisplay: selectedEvent.date.display,
        tags: opts.includeTags ? (fm.tags ?? []) : [],
        ...opts,
      })
      if (result.success || result.canceled) {
        setShowPdfModal(false)
      } else {
        setPdfError(result.error ?? t('pdf_error'))
      }
    } catch {
      setPdfError(t('pdf_error'))
    } finally {
      setIsPdfExporting(false)
    }
  }, [selectedEvent, displayBody, t])

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!selectedEvent) return
    const imageItem = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'))
    if (!imageItem) return
    e.preventDefault()
    const file = imageItem.getAsFile()
    if (!file) return
    const ext = file.type.split('/')[1] ?? 'png'
    const ab = await file.arrayBuffer()
    try {
      const result = await window.electronAPI.invoke<{ success: boolean; relativePath?: string }>('fs:save-image', ab, `imagem.${ext}`, selectedEvent.filePath)
      if (result.success && result.relativePath) insertImageMarkdown(result.relativePath)
    } catch { /* ignore */ }
  }, [selectedEvent, insertImageMarkdown])

  const handleDeleteEvent = useCallback(async () => {
    if (!selectedEvent) return
    setIsDeleting(true)
    const ok = await deleteEvent(selectedEvent.filePath)
    if (ok) {
      await Promise.all([reloadTimeline(), reloadVault()])
      navigate('/timeline')
    }
    setIsDeleting(false)
    setShowDeleteConfirm(false)
  }, [selectedEvent, deleteEvent, reloadTimeline, reloadVault, navigate])

  // ── Render ────────────────────────────────────────────────────────────────
  if (!selectedEvent || !currentTimeline) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <span className="font-mono text-xs text-chr-muted animate-pulse">{t('loading')}</span>
      </div>
    )
  }

  const events = currentTimeline.events
  const currentIdx = events.findIndex((e) => e.slug === selectedEvent.slug)
  const categorySuggestions = [...new Set(
    events.map((e) => e.frontmatter.category).filter((c): c is NonNullable<typeof c> => Boolean(c))
  )].sort()
  const prevEvent = currentIdx > 0 ? events[currentIdx - 1] : null
  const nextEvent = currentIdx < events.length - 1 ? events[currentIdx + 1] : null
  const fm = selectedEvent.frontmatter
  // Draft preview: when user toggles to view mode with an unsaved draft
  const isDraftActive = !isEditing && editInitializedRef.current
  // Trecho body: current entry only (draft or saved)
  const trechoBody: string | null = isDraftActive
    ? (editEntries.length > 0
        ? (() => {
            if (chr?.anchor) {
              const entry = editEntries.find((e) => e.anchor === chr.anchor)
              return entry ? (editSectionBodies[entry.id] || '').trim() || null : null
            }
            return stripAnchors(buildBodyFromSections(editEntries, editSectionBodies))
          })()
        : editBody || null)
    : displayBody
  // All-entries for Completo: unified source for draft and saved modes
  const chronicleAllEntries: Array<{ key: string; date: string; title: string; body: string | null }> =
    chr && showFullBody
      ? (isDraftActive
          ? editEntries.map((e, i) => ({
              key: e.id,
              date: e.date || '',
              title: e.title,
              body: (editSectionBodies[e.id] || '').trim() || null,
            }))
          : events
              .filter((e) => e.filePath === selectedEvent.filePath)
              .sort((a, b) => a.date.sortKey - b.date.sortKey)
              .map((e) => ({
                key: e.slug,
                date: e.date.display,
                title: e.frontmatter.title,
                body: e.chronicle?.anchor ? chronicleEntryBody(selectedEventBody ?? '', e.chronicle.anchor) : null,
              })))
      : []
  const viewFm = isDraftActive
    ? (chr && editEntries.length > 0
        // Chronicle em draft: usa metadata do editFm mas título e importância da entrada atual
        // (editFm reflete o nível do arquivo chronicle, não da seção individual)
        ? { ...editFm, title: editEntries.find((e) => e.anchor === chr.anchor)?.title ?? fm.title, importance: fm.importance }
        : editFm)
    : fm
  const viewBody = showFullBody && chr && multi ? null : trechoBody

  // Textarea value routing
  const textareaValue = editIsRaw ? editContent : editBody

  const handleEnterSubtimeline = () => { enterSubtimeline(selectedEvent); navigate('/timeline') }

  return (
    <div className="flex flex-col h-full overflow-hidden print:h-auto print:overflow-visible">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-chr-subtle bg-surface gap-4 print:hidden">
        <button
          onClick={() => isEditing ? handleToggleMode() : navigate('/timeline')}
          className="flex items-center gap-1.5 text-chr-muted hover:text-chr-primary transition-colors text-xs font-mono shrink-0"
        >
          <ArrowLeft size={13} strokeWidth={1.5} />
          {isEditing ? (selectedEvent?.frontmatter.title ?? 'Evento') : (currentNavItem?.title ?? 'Timeline')}
        </button>

        <div className="flex items-center shrink-0">
          <button
            onClick={() => prevEvent && navigateTo(prevEvent)}
            disabled={!prevEvent || isEditing}
            title={prevEvent?.frontmatter.title}
            className={cn('flex items-center gap-1 px-3 py-1.5 text-xs font-mono transition-colors',
              prevEvent && !isEditing ? 'text-chr-muted hover:text-chr-primary hover:bg-hover' : 'text-chr-muted opacity-30 cursor-default')}
          >
            <ChevronLeft size={12} strokeWidth={1.5} />{t('previous')}
          </button>
          <span className="font-mono text-2xs text-chr-muted px-3 border-x border-chr-subtle select-none">
            {currentIdx + 1} / {events.length}
          </span>
          <button
            onClick={() => nextEvent && navigateTo(nextEvent)}
            disabled={!nextEvent || isEditing}
            title={nextEvent?.frontmatter.title}
            className={cn('flex items-center gap-1 px-3 py-1.5 text-xs font-mono transition-colors',
              nextEvent && !isEditing ? 'text-chr-muted hover:text-chr-primary hover:bg-hover' : 'text-chr-muted opacity-30 cursor-default')}
          >
            {t('next')}<ChevronRight size={12} strokeWidth={1.5} />
          </button>
          <div className="w-px h-4 bg-chr-subtle mx-2" />
          <button
            type="button"
            onClick={handleToggleMode}
            title={isEditing ? 'Voltar para visualização' : 'Editar evento'}
            className="flex items-center gap-1 px-2 py-1 rounded-sm border border-transparent text-chr-muted hover:text-chr-secondary hover:border-chr-subtle transition-colors"
          >
            {isEditing
              ? <><Eye size={12} strokeWidth={1.5} /><span className="font-mono text-2xs">Visualizar</span></>
              : <><Pencil size={12} strokeWidth={1.5} /><span className="font-mono text-2xs">Editar</span></>
            }
          </button>
          <button
            type="button"
            onClick={toggleWideLayout}
            title={wideLayout ? 'Comprimir layout' : 'Expandir layout'}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-sm border transition-colors',
              wideLayout
                ? 'border-chr-subtle text-chr-primary bg-active hover:border-chr-strong'
                : 'border-transparent text-chr-muted hover:text-chr-secondary hover:border-chr-subtle'
            )}
          >
            {wideLayout
              ? <><Minimize2 size={12} strokeWidth={1.5} /><span className="font-mono text-2xs">Comprimir</span></>
              : <><Maximize2 size={12} strokeWidth={1.5} /><span className="font-mono text-2xs">Expandir</span></>
            }
          </button>
        </div>
      </header>

      {/* ── Search bar (view mode only — edit mode renders it below toolbar) ── */}
      {searchOpen && !isEditing && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 bg-surface border-b border-chr-subtle print:hidden">
          <Search size={12} className="text-chr-muted shrink-0" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchMatchIdx(0) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); setSearchMatchIdx(i => searchMatchCount > 0 ? (i + 1) % searchMatchCount : 0) }
              if (e.key === 'Escape') closeSearch()
            }}
            placeholder="Buscar no conteúdo..."
            className="flex-1 bg-transparent text-sm text-chr-primary outline-none placeholder:text-chr-muted/50 min-w-0"
          />
          {searchQuery.trim() && (
            <span className="font-mono text-2xs text-chr-muted shrink-0 tabular-nums">
              {searchMatchCount > 0 ? `${((searchMatchIdx % searchMatchCount) + searchMatchCount) % searchMatchCount + 1} / ${searchMatchCount}` : '0 resultados'}
            </span>
          )}
          <button onClick={() => setSearchMatchIdx(i => searchMatchCount > 0 ? (i - 1 + searchMatchCount) % searchMatchCount : 0)} disabled={searchMatchCount === 0} className="text-chr-muted hover:text-chr-primary disabled:opacity-30 transition-colors p-0.5">
            <ChevronUp size={13} />
          </button>
          <button onClick={() => setSearchMatchIdx(i => searchMatchCount > 0 ? (i + 1) % searchMatchCount : 0)} disabled={searchMatchCount === 0} className="text-chr-muted hover:text-chr-primary disabled:opacity-30 transition-colors p-0.5">
            <ChevronDown size={13} />
          </button>
          <div className="w-px h-3.5 bg-chr-subtle mx-0.5" />
          <button onClick={closeSearch} className="text-chr-muted hover:text-chr-primary transition-colors p-0.5">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Edit mode ────────────────────────────────────────────────────── */}
      {isEditing ? (
        <div className="relative flex flex-col flex-1 overflow-hidden">

          {/* Markdown toolbar */}
          <MarkdownToolbar
            textareaRef={textareaRef}
            onBodyChange={activeBodyChange}
            onPickImage={handlePickImage}
            isInsertingImage={isInsertingImage}
            showRawToggle={true}
            isRawMode={editIsRaw}
            onToggleRawMode={handleToggleRawMode}
            showFormatting={bodyFocused}
            onSendToTrash={() => setShowDeleteConfirm(true)}
          />

          {/* Search bar — below toolbar in edit mode */}
          {searchOpen && (
            <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 bg-surface border-b border-chr-subtle print:hidden">
              <Search size={12} className="text-chr-muted shrink-0" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchMatchIdx(0) }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); setSearchMatchIdx(i => searchMatchCount > 0 ? (i + 1) % searchMatchCount : 0) }
                  if (e.key === 'Escape') closeSearch()
                }}
                placeholder="Buscar no conteúdo..."
                className="flex-1 bg-transparent text-sm text-chr-primary outline-none placeholder:text-chr-muted/50 min-w-0"
              />
              {searchQuery.trim() && (
                <span className="font-mono text-2xs text-chr-muted shrink-0 tabular-nums">
                  {searchMatchCount > 0 ? `${((searchMatchIdx % searchMatchCount) + searchMatchCount) % searchMatchCount + 1} / ${searchMatchCount}` : '0 resultados'}
                </span>
              )}
              <button onClick={() => setSearchMatchIdx(i => searchMatchCount > 0 ? (i - 1 + searchMatchCount) % searchMatchCount : 0)} disabled={searchMatchCount === 0} className="text-chr-muted hover:text-chr-primary disabled:opacity-30 transition-colors p-0.5">
                <ChevronUp size={13} />
              </button>
              <button onClick={() => setSearchMatchIdx(i => searchMatchCount > 0 ? (i + 1) % searchMatchCount : 0)} disabled={searchMatchCount === 0} className="text-chr-muted hover:text-chr-primary disabled:opacity-30 transition-colors p-0.5">
                <ChevronDown size={13} />
              </button>
              <div className="w-px h-3.5 bg-chr-subtle mx-0.5" />
              <button onClick={closeSearch} className="text-chr-muted hover:text-chr-primary transition-colors p-0.5">
                <X size={13} />
              </button>
            </div>
          )}

          {/* Content area */}
          {!editIsRaw ? (
            <div ref={editScrollRef} className="flex-1 overflow-y-auto bg-vault
              [&::-webkit-scrollbar]:w-1
              [&::-webkit-scrollbar-track]:bg-transparent
              [&::-webkit-scrollbar-thumb]:bg-chr-subtle
              [&::-webkit-scrollbar-thumb]:rounded-full
              hover:[&::-webkit-scrollbar-thumb]:bg-chr-strong">
              <EditHeader
                fm={editFm}
                onChange={setEditFm}
                hasEntries={hasEntries}
                chrDescription={editChrDesc}
                onChrDescChange={setEditChrDesc}
                categorySuggestions={categorySuggestions}
                wideLayout={wideLayout}
              />
              {hasEntries ? (
                <SectionBlocksEditor
                  entries={editEntries}
                  sectionBodies={editSectionBodies}
                  onEntriesChange={(entries) => {
                    // Sobrou 1 trecho: volta a ser evento simples (dados do trecho passam ao evento)
                    if (entries.length === 1 && editEntries.length > 1) {
                      const only = entries[0]
                      applyEditState(collapseToSingle(editFm, only, editSectionBodies[only.id] || '', editChrDesc))
                      return
                    }
                    setEditEntries(entries)
                  }}
                  onBodyChange={(id, body) => setEditSectionBodies((prev) => ({ ...prev, [id]: body }))}
                  onAddSection={handleAddSection}
                  onBodyFocus={(el, id) => { textareaRef.current = el; setBodyFocused(true); setFocusedSectionId(id) }}
                  onBodyBlur={() => { setBodyFocused(false); setFocusedSectionId(null) }}
                  wideLayout={wideLayout}
                />
              ) : (
                <div className={wideLayout ? 'max-w-5xl mx-auto px-8 pt-2 pb-20' : 'max-w-2xl mx-auto px-12 pt-2 pb-20'}>
                  <textarea
                    ref={textareaRef}
                    value={textareaValue}
                    onChange={(e) => handleBodyChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onFocus={() => setBodyFocused(true)}
                    onBlur={() => setBodyFocused(false)}
                    spellCheck={false}
                    className="w-full min-h-[30vh] resize-none overflow-hidden outline-none font-mono text-sm text-chr-primary leading-relaxed bg-transparent border-0 focus:outline-none focus:ring-0"
                    placeholder={t('textarea_ph')}
                  />
                  <AddPartButton onClick={handleAddSection} className="mt-12" />
                </div>
              )}
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={textareaValue}
              onChange={(e) => handleBodyChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onFocus={() => setBodyFocused(true)}
              onBlur={() => setBodyFocused(false)}
              spellCheck={false}
              className="flex-1 resize-none outline-none font-mono text-sm text-chr-primary leading-relaxed bg-vault px-8 py-6 border-0 focus:outline-none focus:ring-0"
              placeholder={t('textarea_raw_ph')}
            />
          )}

          {/* ── Floating save status — bottom-right of content area ──────── */}
          {saveStatus !== 'idle' && (
            <div className="absolute bottom-3 right-3 z-20 pointer-events-none print:hidden">
              <div className={cn(
                'flex items-center px-2 py-1 rounded-sm border bg-surface font-mono text-2xs transition-opacity duration-500',
                saveStatus === 'error'
                  ? 'border-chr-subtle text-red-400 opacity-80'
                  : 'border-chr-subtle text-chr-muted opacity-70'
              )}>
                {saveStatus === 'pending' && '●'}
                {saveStatus === 'saving'  && t('saving')}
                {saveStatus === 'saved'   && `✓ ${t('saved')}`}
                {saveStatus === 'error'   && saveError}
              </div>
            </div>
          )}
        </div>

      ) : (

        /* ── View mode ───────────────────────────────────────────────────── */
        <div ref={viewContentRef} className="flex-1 overflow-y-auto print:overflow-visible print:flex-none print:h-auto">
          <article className={cn(wideLayout ? 'max-w-5xl mx-auto px-8 pt-12 pb-20' : 'max-w-2xl mx-auto px-8 pt-12 pb-20', 'print:max-w-none print:px-12 print:pt-8 print:pb-8')}>

            <p className="chr-date mb-3 tracking-wider">
              {viewFm.circa && <span className="mr-1 opacity-60">~</span>}
              {selectedEvent.date.display}
            </p>

            <h1 className="font-serif text-display text-chr-primary leading-tight mb-6">{viewFm.title}</h1>

            {(viewFm.category || (viewFm.tags && viewFm.tags.length > 0) || viewFm.importance) && (
              <div className="flex flex-wrap gap-1.5 mb-10 pb-8 border-b border-chr-subtle">
                {viewFm.category && <span className="chr-badge">{viewFm.category}</span>}
                {viewFm.tags?.map((tag) => <span key={tag} className="chr-tag">#{tag}</span>)}
                {viewFm.importance && <span className="chr-tag font-mono">{t('importance_badge', { n: viewFm.importance })}</span>}
              </div>
            )}

            {chr && multi && (
              <div className="flex items-center gap-3 mb-8 pb-6 border-b border-chr-subtle">
                <BookOpen size={13} strokeWidth={1.5} className="text-timeline-chronicle-text shrink-0" />
                <span className="font-mono text-xs text-timeline-chronicle-text flex-1 truncate">{chr.title}</span>
                <span className="font-mono text-2xs text-chr-muted shrink-0">{chr.entryIndex + 1} / {chr.totalEntries}</span>
                {chr.anchor && (
                  <div className="flex items-center rounded-sm overflow-hidden border border-chr-subtle shrink-0">
                    <button onClick={() => setShowFullBody(false)} className={cn('px-2.5 py-1 font-mono text-2xs transition-colors', !showFullBody ? 'bg-timeline-chronicle text-surface' : 'text-chr-muted hover:text-chr-secondary')}>{t('excerpt')}</button>
                    <button onClick={() => setShowFullBody(true)} className={cn('px-2.5 py-1 font-mono text-2xs transition-colors', showFullBody ? 'bg-timeline-chronicle text-surface' : 'text-chr-muted hover:text-chr-secondary')}>{t('full_view')}</button>
                  </div>
                )}
              </div>
            )}

            {isLoadingEvent ? (
              <div className="space-y-3 animate-pulse">
                {[92, 78, 88, 65, 82, 72, 90, 58, 84, 70, 88].map((w, i) => (
                  <div key={i} className="h-3.5 bg-subtle rounded" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : showFullBody && chr && chronicleAllEntries.length > 0 ? (
              /* Completo: todas as entradas do chronicle formatadas */
              <div className="space-y-10">
                {chronicleAllEntries.map((entry, i) => (
                  <div key={entry.key} className="pb-10 border-b border-chr-subtle last:border-0">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="font-mono text-sm text-timeline-chronicle-text">{entry.date}</span>
                      <span className="font-mono text-2xs text-chr-muted">#{String(i + 1).padStart(2, '0')}</span>
                    </div>
                    <h2 className="font-serif text-2xl text-chr-primary leading-tight mb-4">{entry.title}</h2>
                    {entry.body ? (
                      <div className="markdown-content">
                        <MarkdownBody body={entry.body} eventFilePath={selectedEvent.filePath} />
                      </div>
                    ) : (
                      <p className="font-mono text-sm text-chr-muted italic">{t('no_content')}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : viewBody ? (
              <div className="markdown-content">
                <MarkdownBody body={viewBody} eventFilePath={selectedEvent.filePath} />
              </div>
            ) : !isLoadingEvent ? (
              <p className="font-mono text-sm text-chr-muted italic">
                {t('no_content')}{' '}
                <button onClick={handleStartEdit} className="underline hover:text-chr-secondary transition-colors">{t('click_to_edit')}</button>
              </p>
            ) : null}

            <div className="flex items-center gap-3 mt-14 pt-8 border-t border-chr-subtle print:hidden">
              {selectedEvent.hasSubtimeline && (
                <button onClick={handleEnterSubtimeline} className={cn('flex items-center gap-1.5 px-4 py-2 rounded-sm text-sm font-medium border border-chr-strong text-chr-primary hover:bg-active transition-colors')}>
                  <GitBranch size={13} strokeWidth={1.5} />{t('view_subtimeline')}
                </button>
              )}

              <button onClick={handleExportPdf} className={cn('flex items-center gap-1.5 px-4 py-2 rounded-sm text-sm border border-chr-subtle text-chr-muted hover:border-chr hover:text-chr-secondary transition-colors')}>
                <Download size={13} strokeWidth={1.5} />{t('export_pdf')}
              </button>
            </div>

          </article>
        </div>
      )}

      {/* ── PDF Export Modal ─────────────────────────────────────────────── */}
      {showPdfModal && (
        <PdfExportModal
          suggestedName={selectedEvent.frontmatter.title || selectedEvent.slug}
          isExporting={isPdfExporting}
          error={pdfError}
          onConfirm={handleExportPdfConfirm}
          onCancel={() => setShowPdfModal(false)}
        />
      )}

      {/* ── Delete Event Confirm ──────────────────────────────────────────── */}
      {showDeleteConfirm && selectedEvent && (
        <ConfirmModal
          message={t('send_to_trash_desc', { title: selectedEvent.frontmatter.title || selectedEvent.slug })}
          confirmLabel={isDeleting ? '...' : t('send_to_trash')}
          onConfirm={handleDeleteEvent}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

    </div>
  )
}
