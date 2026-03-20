/**
 * EventView — Página completa de visualização e edição de um evento
 *
 * Modos:
 * - Visualizar: markdown renderizado com tipografia editorial
 * - Editar (unificado): FrontmatterPanel + SectionsPanel + toolbar + textarea
 *   - Sem seções → arquivo salvo como evento regular (.md com frontmatter simples)
 *   - Com seções  → arquivo salvo como chronicle (type: chronicle + entries)
 */

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ExternalLink, GitBranch, ChevronLeft, ChevronRight,
  Pencil, Eye, ImagePlus, Save, X, BookOpen, FileText, Plus,
  Code, Quote, List, ListOrdered, CheckSquare, Table, Link,
  Anchor, FileCode, Download,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { useTimeline } from '@/hooks/useTimeline'
import { useNavigationStore } from '@/stores/useNavigationStore'
import { useI18n } from '@/hooks/useI18n'
import { cn } from '@/utils/cn'

// ── Utilitários de anchor ──────────────────────────────────────────────────────

function stripAnchors(body: string): string {
  return body.replace(/\r\n/g, '\n').replace(/\s*\^[\w-]+\s*$/gm, '')
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

/** Envolve valor em aspas duplas se contiver caracteres especiais do YAML */
function yamlStr(value: string): string {
  if (!value) return value
  if (/[:#\[\]{}&*!|>'"]/.test(value) || value.startsWith(' ') || value.endsWith(' ') || value.includes('\n')) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
  }
  return value
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
  for (const line of match[1].split(/\r?\n/)) {
    const ci = line.indexOf(':')
    if (ci < 0) continue
    const key = line.slice(0, ci).trim()
    const value = line.slice(ci + 1).trim()
    switch (key) {
      case 'title':      fm.title = value.replace(/^["']|["']$/g, ''); break
      case 'date':       fm.date = value; break
      case 'date-end':   fm.dateEnd = value; fm.hasDateEnd = true; break
      case 'circa':      fm.circa = value === 'true'; break
      case 'category':   fm.category = value.replace(/^["']|["']$/g, ''); break
      case 'importance': fm.importance = parseInt(value) || 3; break
      case 'tags':       fm.tags = parseTagsValue(value); break
      case 'type':       break
      default:           extra[key] = value
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
  if (fm.tags.length > 0) lines.push(`tags: [${fm.tags.join(', ')}]`)
  for (const [k, v] of Object.entries(fm.extra)) lines.push(`${k}: ${v}`)
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
  let currentEntry: EntryEdit | null = null

  for (const line of lines) {
    if (/^(?:entries|events):\s*$/.test(line)) {
      inEntries = true
      continue
    }

    if (inEntries) {
      const newItemMatch = line.match(/^  - (.*)$/)
      if (newItemMatch) {
        if (currentEntry) entries.push(currentEntry)
        currentEntry = defaultEntry()
        const rest = newItemMatch[1].trim()
        const ci = rest.indexOf(':')
        if (ci >= 0) {
          const key = rest.slice(0, ci).trim()
          const val = rest.slice(ci + 1).trim().replace(/^["']|["']$/g, '')
          applyEntryField(currentEntry, key, val)
        }
        continue
      }

      const fieldMatch = line.match(/^    (.+)$/)
      if (fieldMatch && currentEntry) {
        const rest = fieldMatch[1].trim()
        const ci = rest.indexOf(':')
        if (ci >= 0) {
          const key = rest.slice(0, ci).trim()
          const val = rest.slice(ci + 1).trim().replace(/^["']|["']$/g, '')
          applyEntryField(currentEntry, key, val)
        }
        continue
      }

      if (line.trim() && !line.startsWith('  ')) {
        if (currentEntry) { entries.push(currentEntry); currentEntry = null }
        inEntries = false
        // Fall through to top-level parsing below
      } else {
        continue
      }
    }

    // Top-level meta fields
    const ci = line.indexOf(':')
    if (ci < 0) continue
    const key = line.slice(0, ci).trim()
    const val = line.slice(ci + 1).trim().replace(/^["']|["']$/g, '')
    switch (key) {
      case 'type': break
      case 'title': meta.title = val; break
      case 'description': meta.description = val; break
      default: meta.extra[key] = val
    }
  }

  if (currentEntry) entries.push(currentEntry)
  return { meta, entries, body }
}

function applyEntryField(entry: EntryEdit, key: string, val: string) {
  switch (key) {
    case 'title':
    case 'label':  entry.title = val; break  // 'label' é o formato legado
    case 'date':   entry.date = val; break
    case 'anchor': entry.anchor = val; break
    default:       entry.extra[key] = val
  }
}

function buildChronicleRaw(edit: ChronicleEdit): string {
  const lines: string[] = ['---', 'type: chronicle']
  if (edit.meta.title)       lines.push(`title: ${yamlStr(edit.meta.title)}`)
  if (edit.meta.description) lines.push(`description: ${yamlStr(edit.meta.description)}`)
  for (const [k, v] of Object.entries(edit.meta.extra)) lines.push(`${k}: ${v}`)

  if (edit.entries.length > 0) {
    lines.push('entries:')
    for (const entry of edit.entries) {
      lines.push(`  - title: ${yamlStr(entry.title || '(sem título)')}`)
      if (entry.date)   lines.push(`    date: ${entry.date}`)
      if (entry.anchor) lines.push(`    anchor: ${entry.anchor}`)
      for (const [k, v] of Object.entries(entry.extra)) lines.push(`    ${k}: ${v}`)
    }
  }

  lines.push('---', '')
  if (edit.body.trim()) lines.push(edit.body.trim())
  return lines.join('\n')
}

// ── buildSaveContent helper ────────────────────────────────────────────────────

function buildSaveContent(
  fm: EditFm, body: string, entries: EntryEdit[], chrDesc: string
): string {
  if (entries.length === 0) {
    return buildEventRaw(fm, body)
  }
  const extra: Record<string, string> = { ...fm.extra }
  if (fm.category) extra['category'] = fm.category
  if (fm.importance !== 3) extra['importance'] = String(fm.importance)
  if (fm.tags.length > 0) extra['tags'] = `[${fm.tags.join(', ')}]`
  return buildChronicleRaw({
    meta: { title: fm.title, description: chrDesc, extra },
    entries,
    body,
  })
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
                <input type="text" value={fm.date} onChange={(e) => set('date', e.target.value)} placeholder="YYYY-MM-DD" className={inputCls} />
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
                  <input type="text" value={fm.dateEnd} onChange={(e) => set('dateEnd', e.target.value)} placeholder="YYYY-MM-DD" className={inputCls} />
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

  const updateEntry = (id: string, patch: Partial<EntryEdit>) =>
    onChange(entries.map((e) => e.id === id ? { ...e, ...patch } : e))

  const removeEntry = (id: string) =>
    onChange(entries.filter((e) => e.id !== id))

  const hasEntries = entries.length > 0

  return (
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
            <div className="space-y-1.5">
              {/* Column headers */}
              <div className="flex items-center gap-2">
                <span className="w-5 shrink-0" />
                <span className="font-mono text-2xs text-chr-muted flex-[2]">{t('event_title')}</span>
                <span className="font-mono text-2xs text-chr-muted w-[110px] shrink-0">{t('event_date')}</span>
                <span className="font-mono text-2xs text-chr-muted flex-1" title={t('section_anchor_hint')}>{t('section_anchor')}</span>
                <span className="w-6 shrink-0" />
              </div>
              {/* Scrollable list — max 5 rows visíveis (~160px) */}
              <div className="max-h-[160px] overflow-y-auto space-y-1.5 pr-1
                [&::-webkit-scrollbar]:w-1
                [&::-webkit-scrollbar-track]:bg-transparent
                [&::-webkit-scrollbar-thumb]:bg-chr-subtle
                [&::-webkit-scrollbar-thumb]:rounded-full
                hover:[&::-webkit-scrollbar-thumb]:bg-chr-strong">
              {entries.map((entry, idx) => (
                <div key={entry.id} className="flex items-center gap-2 group">
                  <span className="font-mono text-2xs text-chr-muted w-5 text-right shrink-0 select-none">{idx + 1}</span>
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
                    className={cn(inputCls, 'flex-[2]')}
                  />
                  <input
                    type="text"
                    value={entry.date}
                    onChange={(e) => updateEntry(entry.id, { date: e.target.value })}
                    placeholder="YYYY-MM-DD"
                    className={cn(inputCls, 'w-[110px] shrink-0')}
                  />
                  <input
                    type="text"
                    value={entry.anchor}
                    onChange={(e) => updateEntry(entry.id, { anchor: e.target.value })}
                    placeholder="ancora-id"
                    title={t('section_anchor_hint')}
                    className={cn(inputCls, 'flex-1 text-timeline-chronicle')}
                  />
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.id)}
                    title={t('remove_section')}
                    className="w-6 shrink-0 flex items-center justify-center p-1 rounded-sm text-chr-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <X size={11} strokeWidth={1.5} />
                  </button>
                </div>
              ))}
              </div>{/* fim scroll */}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── MarkdownToolbar ────────────────────────────────────────────────────────────

interface MarkdownToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>
  onBodyChange: (v: string) => void
  onPickImage: () => void
  isInsertingImage: boolean
  isSaving: boolean
  saveError: string | null
  onSave: () => void
  onCancel: () => void
  showRawToggle?: boolean
  isRawMode?: boolean
  onToggleRawMode?: () => void
  /** Entries for the anchor picker dropdown */
  chronicleEntries?: EntryEdit[]
}

function MarkdownToolbar({
  textareaRef, onBodyChange, onPickImage, isInsertingImage,
  isSaving, saveError, onSave, onCancel,
  showRawToggle, isRawMode, onToggleRawMode,
  chronicleEntries,
}: MarkdownToolbarProps) {
  const [anchorMenuOpen, setAnchorMenuOpen] = useState(false)
  const anchorBtnRef = useRef<HTMLButtonElement>(null)
  const { t } = useI18n()

  // Close dropdown on outside click
  useEffect(() => {
    if (!anchorMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (!anchorBtnRef.current?.closest('[data-anchor-menu]')?.contains(e.target as Node)) {
        setAnchorMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [anchorMenuOpen])

  const apply = (fn: (v: string, s: number, e: number) => TextEdit) => {
    const ta = textareaRef.current
    if (!ta) return
    const r = fn(ta.value, ta.selectionStart, ta.selectionEnd)
    onBodyChange(r.value)
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(r.selStart, r.selEnd) })
  }

  const insertAnchor = (anchorId: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const s = ta.selectionStart
    const suffix = ` ^${anchorId}`
    const result = { value: ta.value.slice(0, s) + suffix + ta.value.slice(s), selStart: s + suffix.length, selEnd: s + suffix.length }
    onBodyChange(result.value)
    setAnchorMenuOpen(false)
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(result.selStart, result.selEnd) })
  }

  const TABLE_TPL = `| Coluna 1 | Coluna 2 | Coluna 3 |\n|----------|----------|----------|\n| Célula 1 | Célula 2 | Célula 3 |`

  const btnCls = cn(
    'flex items-center justify-center w-7 h-7 rounded-sm text-xs font-mono',
    'text-chr-muted border border-transparent',
    'hover:bg-hover hover:text-chr-primary hover:border-chr-subtle',
    'transition-colors duration-100 shrink-0 select-none'
  )
  const sep = <div className="w-px h-4 bg-chr-subtle mx-0.5 shrink-0" />

  const hasEntries = chronicleEntries && chronicleEntries.length > 0

  const anchorButton = hasEntries ? (
    <div className="relative shrink-0" data-anchor-menu>
      <button
        ref={anchorBtnRef}
        type="button"
        title={t('insert_anchor_title')}
        className={cn(btnCls, anchorMenuOpen && 'bg-hover border-chr-subtle text-chr-primary')}
        onClick={() => setAnchorMenuOpen((v) => !v)}
      >
        <Anchor size={12} strokeWidth={1.5} />
      </button>
      {anchorMenuOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] max-w-[300px] bg-surface border border-chr-subtle rounded-sm shadow-card-hover overflow-hidden">
          <div className="px-2 py-1.5 border-b border-chr-subtle">
            <span className="font-mono text-2xs text-chr-muted">{t('insert_anchor_header')}</span>
          </div>
          {chronicleEntries!.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => entry.anchor && insertAnchor(entry.anchor)}
              disabled={!entry.anchor}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-hover transition-colors disabled:opacity-40 disabled:cursor-default"
            >
              <span className="font-mono text-xs text-chr-primary truncate flex-1">{entry.title || '(sem título)'}</span>
              <span className="font-mono text-2xs text-timeline-chronicle shrink-0">^{entry.anchor || '?'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  ) : (
    <button
      type="button"
      title={t('insert_anchor_title')}
      className={btnCls}
      onClick={() => apply((v, s, e) => {
        const sel = v.slice(s, e)
        if (sel) {
          const id = sel.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'ancora'
          const suffix = ` ^${id}`
          return { value: v.slice(0, e) + suffix + v.slice(e), selStart: e + suffix.length, selEnd: e + suffix.length }
        }
        const placeholder = '^ancora-id'
        return { value: v.slice(0, s) + placeholder + v.slice(s), selStart: s + 1, selEnd: s + placeholder.length }
      })}
    >
      <Anchor size={12} strokeWidth={1.5} />
    </button>
  )

  return (
    <div className="shrink-0 flex items-center gap-0.5 px-3 py-1.5 border-b border-chr-subtle bg-surface flex-wrap">
      {/* Headings */}
      <button type="button" title="Cabeçalho H2" className={btnCls} onClick={() => apply((v, s) => applyHeading(v, s, '## '))}>H2</button>
      <button type="button" title="Cabeçalho H3" className={btnCls} onClick={() => apply((v, s) => applyHeading(v, s, '### '))}>H3</button>

      {sep}

      {/* Inline formatting */}
      <button type="button" title="Negrito" className={cn(btnCls, 'font-bold')} onClick={() => apply((v, s, e) => applyInline(v, s, e, '**', '**'))}>B</button>
      <button type="button" title="Itálico" className={cn(btnCls, 'italic')} onClick={() => apply((v, s, e) => applyInline(v, s, e, '*', '*'))}>I</button>
      <button type="button" title="Tachado" className={cn(btnCls, 'line-through')} onClick={() => apply((v, s, e) => applyInline(v, s, e, '~~', '~~'))}>S</button>
      <button type="button" title="Código inline" className={btnCls} onClick={() => apply((v, s, e) => applyInline(v, s, e, '`', '`', 'código'))}>
        <Code size={12} strokeWidth={1.5} />
      </button>

      {sep}

      {/* Block formatting */}
      <button type="button" title="Citação (blockquote)" className={btnCls} onClick={() => apply((v, s) => applyLinePrefix(v, s, '> '))}>
        <Quote size={12} strokeWidth={1.5} />
      </button>
      <button type="button" title="Lista com marcador" className={btnCls} onClick={() => apply((v, s) => applyLinePrefix(v, s, '- '))}>
        <List size={12} strokeWidth={1.5} />
      </button>
      <button type="button" title="Lista numerada" className={btnCls} onClick={() => apply((v, s) => applyLinePrefix(v, s, '1. '))}>
        <ListOrdered size={12} strokeWidth={1.5} />
      </button>
      <button type="button" title="Lista de tarefas" className={btnCls} onClick={() => apply((v, s) => applyLinePrefix(v, s, '- [ ] '))}>
        <CheckSquare size={12} strokeWidth={1.5} />
      </button>

      {sep}

      {/* Inserts */}
      <button type="button" title="Inserir tabela" className={btnCls} onClick={() => apply((v, s) => insertAtCursor(v, s, '\n' + TABLE_TPL + '\n'))}>
        <Table size={12} strokeWidth={1.5} />
      </button>
      <button type="button" title="Inserir link" className={btnCls} onClick={() => apply((v, s, e) => applyInline(v, s, e, '[', '](url)', 'texto'))}>
        <Link size={12} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        title="Inserir imagem (ou cole com Ctrl+V)"
        className={cn(btnCls, isInsertingImage && 'opacity-40 cursor-default')}
        onClick={onPickImage}
        disabled={isInsertingImage}
      >
        <ImagePlus size={12} strokeWidth={1.5} />
      </button>
      {anchorButton}

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

      {saveError && <span className="font-mono text-2xs text-red-500 mr-1 shrink-0">{saveError}</span>}

      <button
        type="button"
        onClick={onCancel}
        className="flex items-center gap-1 px-2.5 py-1 rounded-sm font-mono text-xs border border-chr-subtle text-chr-muted hover:text-chr-secondary transition-colors shrink-0"
      >
        <X size={11} strokeWidth={1.5} />
        {t('cancel')}
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={isSaving}
        className={cn(
          'flex items-center gap-1 px-3 py-1 rounded-sm font-mono text-xs shrink-0',
          'border border-chr-strong text-chr-primary hover:bg-active transition-colors',
          isSaving && 'opacity-50 cursor-default'
        )}
      >
        <Save size={11} strokeWidth={1.5} />
        {isSaving ? t('saving') : t('save')}
      </button>
    </div>
  )
}

// ── useMarkdownComponents ─────────────────────────────────────────────────────

function useMarkdownComponents(eventFilePath: string) {
  return {
    img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => {
      const resolved = src ? window.electronAPI.resolveAssetPath(eventFilePath, src) : ''
      return <img {...props} src={resolved} alt={alt ?? ''} className="max-w-full rounded border border-chr-subtle my-4" />
    },
  }
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
    enterSubtimeline,
    openInEditor,
  } = useTimeline()
  const currentNavItem = useNavigationStore((s) => s.current())
  const { t, nSections } = useI18n()

  // ── Shared edit state ─────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isInsertingImage, setIsInsertingImage] = useState(false)
  const [showPdfModal, setShowPdfModal] = useState(false)
  const [isPdfExporting, setIsPdfExporting] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Unified edit state ────────────────────────────────────────────────────
  const [editFm, setEditFm] = useState<EditFm>(defaultEditFm())
  const [editBody, setEditBody] = useState('')
  const [editEntries, setEditEntries] = useState<EntryEdit[]>([])
  const [editChrDesc, setEditChrDesc] = useState('')
  const [editIsRaw, setEditIsRaw] = useState(false)
  const [editContent, setEditContent] = useState('')

  // ── Panel collapse state — default collapsed ───────────────────────────────
  const [fmCollapsed, setFmCollapsed] = useState(true)
  const [sectionsCollapsed, setSectionsCollapsed] = useState(true)

  // ── Derived ───────────────────────────────────────────────────────────────
  const hasEntries = editEntries.length > 0

  // ── Chronicle anchor / display ────────────────────────────────────────────
  const [showFullBody, setShowFullBody] = useState(false)
  const chr = selectedEvent?.chronicle
  const anchorBlock = chr?.anchor && selectedEventBody ? extractBlock(selectedEventBody, chr.anchor) : null
  const displayBody = selectedEventBody ? (anchorBlock && !showFullBody ? anchorBlock : stripAnchors(selectedEventBody)) : null
  useEffect(() => { setShowFullBody(false) }, [selectedEvent?.slug])

  // ── Navigate away if no event ─────────────────────────────────────────────
  useEffect(() => {
    if (!selectedEvent) navigate('/timeline', { replace: true })
  }, [selectedEvent, navigate])

  // ── Start editing ─────────────────────────────────────────────────────────
  const handleStartEdit = useCallback(() => {
    setSaveError(null)
    setEditIsRaw(false)
    const isChronicle = !!selectedEvent?.chronicle
    if (isChronicle) {
      const parsed = parseChronicleRaw(selectedEventRaw ?? '')
      const fm = defaultEditFm()
      fm.title = parsed.meta.title
      fm.category = (parsed.meta.extra['category'] ?? '').replace(/^["']|["']$/g, '')
      fm.importance = parseInt(parsed.meta.extra['importance'] ?? '3') || 3
      fm.tags = parsed.meta.extra['tags'] ? parseTagsValue(parsed.meta.extra['tags']) : []
      const { category: _c, importance: _i, tags: _t, ...restExtra } = parsed.meta.extra
      fm.extra = restExtra
      setEditFm(fm)
      setEditChrDesc(parsed.meta.description)
      setEditEntries(parsed.entries)
      setEditBody(parsed.body)
    } else {
      const { fm, body } = parseEventRaw(selectedEventRaw ?? '')
      setEditFm(fm)
      setEditBody(body)
      setEditEntries([])
      setEditChrDesc('')
    }
    setIsEditing(true)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }, [selectedEvent, selectedEventRaw])

  // ── Cancel editing ────────────────────────────────────────────────────────
  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
    setSaveError(null)
  }, [])

  // ── Body change handler ───────────────────────────────────────────────────
  const handleBodyChange = useCallback((v: string) => {
    if (editIsRaw) setEditContent(v)
    else setEditBody(v)
  }, [editIsRaw])

  // ── Toggle raw mode ───────────────────────────────────────────────────────
  const handleToggleRawMode = useCallback(() => {
    if (!editIsRaw) {
      const raw = buildSaveContent(editFm, editBody, editEntries, editChrDesc)
      setEditContent(raw)
      setEditIsRaw(true)
    } else {
      const isRawChronicle = /^---\r?\n[\s\S]*?^type:\s*chronicle/m.test(editContent)
      if (isRawChronicle) {
        const parsed = parseChronicleRaw(editContent)
        const fm = defaultEditFm()
        fm.title = parsed.meta.title
        fm.category = (parsed.meta.extra['category'] ?? '').replace(/^["']|["']$/g, '')
        fm.importance = parseInt(parsed.meta.extra['importance'] ?? '3') || 3
        fm.tags = parsed.meta.extra['tags'] ? parseTagsValue(parsed.meta.extra['tags']) : []
        const { category: _c, importance: _i, tags: _t, ...restExtra } = parsed.meta.extra
        fm.extra = restExtra
        setEditFm(fm)
        setEditChrDesc(parsed.meta.description)
        setEditEntries(parsed.entries)
        setEditBody(parsed.body)
      } else {
        const { fm, body } = parseEventRaw(editContent)
        setEditFm(fm)
        setEditBody(body)
        setEditEntries([])
        setEditChrDesc('')
      }
      setEditIsRaw(false)
    }
  }, [editIsRaw, editFm, editBody, editEntries, editChrDesc, editContent])

  // ── Add section ───────────────────────────────────────────────────────────
  const handleAddSection = useCallback(() => {
    const newEntry = defaultEntry()
    if (editEntries.length === 0) {
      newEntry.title = editFm.title
      newEntry.date = editFm.date
      newEntry.anchor = slugify(editFm.title || 'secao')
    }
    setEditEntries((prev) => [...prev, newEntry])
    const ta = textareaRef.current
    if (ta && newEntry.anchor) {
      const s = ta.selectionStart
      const suffix = ` ^${newEntry.anchor}`
      const newBody = editBody.slice(0, s) + suffix + editBody.slice(s)
      setEditBody(newBody)
      requestAnimationFrame(() => {
        ta.focus()
        ta.selectionStart = ta.selectionEnd = s + suffix.length
      })
    }
  }, [editEntries, editFm, editBody])

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedEvent || isSaving) return
    setIsSaving(true)
    setSaveError(null)
    try {
      const rawContent = editIsRaw
        ? editContent
        : buildSaveContent(editFm, editBody, editEntries, editChrDesc)
      const ok = await saveEvent(selectedEvent.filePath, rawContent)
      if (ok) {
        setIsEditing(false)
        reloadTimeline()
      } else {
        setSaveError(t('save_error'))
      }
    } catch {
      setSaveError(t('save_error_unexpected'))
    } finally {
      setIsSaving(false)
    }
  }, [selectedEvent, isSaving, saveEvent, reloadTimeline, editIsRaw, editContent, editFm, editBody, editEntries, editChrDesc, t])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave() }
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget
      const s = ta.selectionStart
      const v = ta.value
      const newVal = v.slice(0, s) + '  ' + v.slice(ta.selectionEnd)
      handleBodyChange(newVal)
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 2 })
    }
  }, [handleSave, handleBodyChange])

  // ── Image insertion ───────────────────────────────────────────────────────
  const insertImageMarkdown = useCallback((relativePath: string) => {
    const ta = textareaRef.current
    const text = `![imagem](${relativePath})`
    if (!ta) { handleBodyChange(text + '\n'); return }
    const v = ta.value
    const s = ta.selectionStart
    const newContent = v.slice(0, s) + text + v.slice(ta.selectionEnd)
    handleBodyChange(newContent)
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + text.length; ta.focus() })
  }, [handleBodyChange])

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

  // ── Render ────────────────────────────────────────────────────────────────
  if (!selectedEvent || !currentTimeline) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <span className="font-mono text-xs text-chr-muted animate-pulse">{t('loading')}</span>
      </div>
    )
  }

  const events = currentTimeline.events
  const currentIdx = events.findIndex((e) => e.filePath === selectedEvent.filePath)
  const prevEvent = currentIdx > 0 ? events[currentIdx - 1] : null
  const nextEvent = currentIdx < events.length - 1 ? events[currentIdx + 1] : null
  const fm = selectedEvent.frontmatter
  const markdownComponents = useMarkdownComponents(selectedEvent.filePath)

  // Textarea value routing
  const textareaValue = editIsRaw ? editContent : editBody

  const handleEnterSubtimeline = () => { enterSubtimeline(selectedEvent); navigate('/timeline') }

  return (
    <div className="flex flex-col h-full overflow-hidden print:h-auto print:overflow-visible">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-chr-subtle bg-surface gap-4 print:hidden">
        <button
          onClick={() => navigate('/timeline')}
          className="flex items-center gap-1.5 text-chr-muted hover:text-chr-primary transition-colors text-xs font-mono shrink-0"
        >
          <ArrowLeft size={13} strokeWidth={1.5} />
          {currentNavItem?.title ?? 'Timeline'}
        </button>

        <div className="flex items-center border border-chr-subtle rounded-sm overflow-hidden shrink-0">
          <button
            onClick={isEditing ? handleCancelEdit : undefined}
            disabled={!isEditing}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono transition-colors',
              !isEditing ? 'bg-active text-chr-primary' : 'text-chr-muted hover:text-chr-secondary hover:bg-hover cursor-pointer'
            )}
          >
            <Eye size={12} strokeWidth={1.5} />{t('view')}
          </button>
          <div className="w-px h-full bg-chr-subtle" />
          <button
            onClick={!isEditing ? handleStartEdit : undefined}
            disabled={isEditing}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono transition-colors',
              isEditing ? 'bg-active text-chr-primary' : 'text-chr-muted hover:text-chr-secondary hover:bg-hover cursor-pointer'
            )}
          >
            <Pencil size={12} strokeWidth={1.5} />{t('edit')}
          </button>
        </div>

        <div className="flex items-center shrink-0">
          <button
            onClick={() => prevEvent && loadEvent(prevEvent)}
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
            onClick={() => nextEvent && loadEvent(nextEvent)}
            disabled={!nextEvent || isEditing}
            title={nextEvent?.frontmatter.title}
            className={cn('flex items-center gap-1 px-3 py-1.5 text-xs font-mono transition-colors',
              nextEvent && !isEditing ? 'text-chr-muted hover:text-chr-primary hover:bg-hover' : 'text-chr-muted opacity-30 cursor-default')}
          >
            {t('next')}<ChevronRight size={12} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      {/* ── Edit mode ────────────────────────────────────────────────────── */}
      {isEditing ? (
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Always show FrontmatterPanel */}
          {!editIsRaw && (
            <FrontmatterPanel
              fm={editFm}
              collapsed={fmCollapsed}
              onToggleCollapse={() => setFmCollapsed((v) => !v)}
              onChange={setEditFm}
              hasEntries={hasEntries}
              chrDescription={editChrDesc}
              onChrDescChange={setEditChrDesc}
            />
          )}

          {/* Always show SectionsPanel */}
          {!editIsRaw && (
            <SectionsPanel
              entries={editEntries}
              collapsed={sectionsCollapsed}
              onToggleCollapse={() => setSectionsCollapsed((v) => !v)}
              onChange={(entries) => {
                if (entries.length === 0 && editEntries.length === 1) {
                  setEditFm((prev) => ({ ...prev, date: editEntries[0].date || prev.date }))
                }
                setEditEntries(entries)
              }}
              onAddSection={handleAddSection}
            />
          )}

          {/* Raw mode info banner */}
          {editIsRaw && (
            <div className="shrink-0 flex items-center gap-2 px-5 py-2 border-b border-chr-subtle bg-subtle">
              <FileCode size={11} strokeWidth={1.5} className="text-chr-muted shrink-0" />
              <span className="font-mono text-2xs text-chr-muted">
                {t('raw_mode_banner').split('{button}')[0]}
                <strong className="text-chr-secondary">{t('form_mode_label')}</strong>
                {t('raw_mode_banner').split('{button}')[1]}
              </span>
            </div>
          )}

          {/* Markdown toolbar */}
          <MarkdownToolbar
            textareaRef={textareaRef}
            onBodyChange={handleBodyChange}
            onPickImage={handlePickImage}
            isInsertingImage={isInsertingImage}
            isSaving={isSaving}
            saveError={saveError}
            onSave={handleSave}
            onCancel={handleCancelEdit}
            showRawToggle={true}
            isRawMode={editIsRaw}
            onToggleRawMode={handleToggleRawMode}
            chronicleEntries={!editIsRaw ? editEntries : undefined}
          />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={textareaValue}
            onChange={(e) => handleBodyChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            spellCheck={false}
            className={cn(
              'flex-1 resize-none outline-none',
              'font-mono text-sm text-chr-primary leading-relaxed',
              'bg-vault px-8 py-6',
              'border-0 focus:outline-none focus:ring-0'
            )}
            placeholder={
              editIsRaw
                ? t('textarea_raw_ph')
                : hasEntries
                  ? t('textarea_chronicle_ph')
                  : t('textarea_ph')
            }
          />
        </div>

      ) : (

        /* ── View mode ───────────────────────────────────────────────────── */
        <div className="flex-1 overflow-y-auto print:overflow-visible print:flex-none print:h-auto">
          <article className="max-w-2xl mx-auto px-8 pt-12 pb-20 print:max-w-none print:px-12 print:pt-8 print:pb-8">

            <p className="chr-date mb-3 tracking-wider">
              {fm.circa && <span className="mr-1 opacity-60">~</span>}
              {selectedEvent.date.display}
            </p>

            <h1 className="font-serif text-display text-chr-primary leading-tight mb-6">{fm.title}</h1>

            {(fm.category || (fm.tags && fm.tags.length > 0) || fm.importance) && (
              <div className="flex flex-wrap gap-1.5 mb-10 pb-8 border-b border-chr-subtle">
                {fm.category && <span className="chr-badge">{fm.category}</span>}
                {fm.tags?.map((tag) => <span key={tag} className="chr-tag">#{tag}</span>)}
                {fm.importance && <span className="chr-tag font-mono">{t('importance_badge', { n: fm.importance })}</span>}
              </div>
            )}

            {chr && (
              <div className="flex items-center gap-3 mb-8 pb-6 border-b border-chr-subtle">
                <BookOpen size={13} strokeWidth={1.5} className="text-timeline-chronicle shrink-0" />
                <span className="font-mono text-xs text-timeline-chronicle flex-1 truncate">{chr.title}</span>
                <span className="font-mono text-2xs text-chr-muted shrink-0">{chr.entryIndex + 1} / {chr.totalEntries}</span>
                {anchorBlock && (
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
            ) : displayBody ? (
              <div className="markdown-content">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>{displayBody}</ReactMarkdown>
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
              <button onClick={() => openInEditor(selectedEvent.filePath)} className={cn('flex items-center gap-1.5 px-4 py-2 rounded-sm text-sm border border-chr-subtle text-chr-muted hover:border-chr hover:text-chr-secondary transition-colors')}>
                <ExternalLink size={13} strokeWidth={1.5} />{t('open_in_editor')}
              </button>
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

    </div>
  )
}
