/**
 * SearchDialog — busca global no vault (Ctrl+K ou "Buscar" na barra lateral).
 *
 * - Índice FlexSearch (tokenização "forward": acha por prefixo enquanto digita)
 *   sobre título, categoria, tags, nome da timeline e corpo de todos os eventos,
 *   inclusive de sub-timelines. Texto normalizado: sem acentos e minúsculo.
 * - Títulos que contêm a busca vêm primeiro; cada resultado mostra a data, a
 *   timeline e um trecho do texto em volta do termo encontrado.
 * - ↑ ↓ escolhem, Enter abre o evento, Esc fecha.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Index } from 'flexsearch'
import { Search, X } from 'lucide-react'
import { useI18n } from '@/hooks/useI18n'
import { useOpenEvent } from '@/hooks/useOpenEvent'
import { parseChroniclerDate, parseDateParts, undatedLabel } from '@/utils/chroniclerDate'
import { cn } from '@/utils/cn'

interface SearchDoc {
  filePath: string
  slug: string
  title: string
  date: string
  category: string
  tags: string[]
  body: string
  timelineDir: string
  timelineTitle: string
}

/** Minúsculo e sem acentos, caractere a caractere (mantém as posições do texto original) */
function norm(text: string): string {
  let out = ''
  for (const ch of text) out += (ch.normalize('NFD')[0] ?? ch).toLowerCase()
  return out
}

/** Remove a marcação Markdown para o trecho exibido */
function plain(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s\^[\w-]+/g, '')
    .replace(/[#>*_`~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function snippet(body: string, words: string[]): string {
  const text = plain(body)
  if (!text) return ''
  const n = norm(text)
  const hit = words.map((w) => n.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0]
  if (hit === undefined) return text.slice(0, 140)
  const start = Math.max(0, hit - 60)
  return (start > 0 ? '…' : '') + text.slice(start, start + 160) + (start + 160 < text.length ? '…' : '')
}

interface SearchDialogProps {
  open: boolean
  onClose: () => void
}

export function SearchDialog({ open, onClose }: SearchDialogProps) {
  const { t } = useI18n()
  const [docs, setDocs] = useState<SearchDoc[]>([])
  const [index, setIndex] = useState<Index | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Reindexa a cada abertura (o vault pode ter mudado)
  useEffect(() => {
    if (!open) return
    setQuery(''); setSel(0)
    setTimeout(() => inputRef.current?.focus(), 30)
    let alive = true
    setLoading(true)
    window.electronAPI.invoke<{ success: boolean; data?: SearchDoc[] }>('fs:search-index')
      .then((r) => {
        if (!alive) return
        const list = r.success && r.data ? r.data : []
        const idx = new Index({ tokenize: 'forward' })
        list.forEach((d, i) => idx.add(i, norm([d.title, d.category, d.tags.join(' '), d.timelineTitle, d.body].join(' '))))
        setDocs(list); setIndex(idx)
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [open])

  const words = useMemo(() => norm(query).split(/\s+/).filter(Boolean), [query])
  const results = useMemo(() => {
    if (!index || words.length === 0) return []
    const ids = index.search(words.join(' '), { limit: 60 }) as number[]
    const found = ids.map((i) => docs[i]).filter((d): d is SearchDoc => !!d)
    // Títulos que contêm a busca primeiro (o resto mantém a ordem do índice)
    const inTitle = (d: SearchDoc) => words.every((w) => norm(d.title).includes(w))
    return [...found.filter(inTitle), ...found.filter((d) => !inTitle(d))]
  }, [index, docs, words])

  useEffect(() => { setSel(0) }, [query])
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const openEvent = useOpenEvent()
  const openDoc = async (d: SearchDoc) => {
    onClose()
    await openEvent(d)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
    else if (e.key === 'Enter' && results[sel]) { e.preventDefault(); void openDoc(results[sel]) }
  }

  if (!open) return null

  const dateOf = (d: SearchDoc) => (d.date && parseDateParts(d.date) ? parseChroniclerDate(d.date).display : undatedLabel())

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh]" data-testid="search-dialog">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-[min(640px,92vw)] chr-card shadow-card-hover overflow-hidden" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-chr-subtle">
          <Search size={15} strokeWidth={1.5} className="text-chr-muted shrink-0" />
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search_vault_ph')} spellCheck={false}
            className="flex-1 bg-transparent text-sm text-chr-primary outline-none placeholder:text-chr-muted/60" />
          <button type="button" onClick={onClose} aria-label={t('close')} className="text-chr-muted hover:text-chr-primary">
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        <div ref={listRef} className="max-h-[56vh] overflow-y-auto">
          {loading && <p className="px-4 py-6 font-mono text-xs text-chr-muted">{t('loading')}</p>}
          {!loading && words.length > 0 && results.length === 0 && (
            <p className="px-4 py-6 font-mono text-xs text-chr-muted">{t('search_no_results')}</p>
          )}
          {!loading && words.length === 0 && (
            <p className="px-4 py-6 font-mono text-xs text-chr-muted">{t('search_hint', { count: docs.length })}</p>
          )}
          {results.map((d, i) => (
            <button key={d.filePath + d.slug} type="button" data-idx={i} onClick={() => void openDoc(d)}
              onMouseMove={() => setSel(i)}
              className={cn('w-full text-left px-4 py-2.5 border-b border-chr-subtle last:border-0 transition-colors',
                i === sel ? 'bg-active' : 'hover:bg-hover')}>
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-chr-primary truncate">{d.title}</span>
                <span className="font-mono text-2xs text-timeline-chronicle-text shrink-0">{dateOf(d)}</span>
              </span>
              <span className="block font-mono text-2xs text-chr-muted truncate">
                {d.timelineTitle}{d.category ? ` · ${d.category}` : ''}{d.tags.length ? ` · #${d.tags.join(' #')}` : ''}
              </span>
              {d.body && <span className="block text-xs text-chr-secondary mt-0.5 line-clamp-2">{snippet(d.body, words)}</span>}
            </button>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-chr-subtle font-mono text-2xs text-chr-muted flex gap-4">
          <span>↑ ↓ {t('search_nav')}</span><span>Enter {t('search_open')}</span><span>Esc {t('close')}</span>
          {results.length > 0 && <span className="ml-auto">{results.length === 1 ? t('results_one') : t('results_other', { count: results.length })}</span>}
        </div>
      </div>
    </div>
  )
}
