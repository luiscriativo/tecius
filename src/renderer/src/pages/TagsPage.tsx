/**
 * TagsPage — todas as categorias e tags do vault, com a lista dos eventos de
 * cada uma. Usa o mesmo índice das ligações [[…]] e da busca (todo o vault,
 * sub-timelines incluídas). Clicar num evento abre a página dele.
 *
 * Chega aqui pela barra lateral, pela paleta de comandos (> tags) ou clicando
 * numa tag/categoria na página de um evento (a seleção vem em `location.state`).
 */

import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Hash, Tag } from 'lucide-react'
import { ensureEventIndex, useEventIndexStore } from '@/stores/useEventIndexStore'
import { useVaultStore } from '@/stores/useVaultStore'
import { useOpenEvent } from '@/hooks/useOpenEvent'
import { useI18n } from '@/hooks/useI18n'
import { parseChroniclerDate, parseDateParts, undatedLabel } from '@/utils/chroniclerDate'
import { docKey, type VaultEventDoc } from '@/utils/wikiLinks'
import { cn } from '@/utils/cn'

export type TagSelection = { kind: 'category' | 'tag'; name: string }

/** Índice do vault como a busca o devolve (tem categoria e tags) */
type Doc = VaultEventDoc & { category?: string; tags?: string[] }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function TagsPage() {
  const { t } = useI18n()
  const location = useLocation()
  const docs = useEventIndexStore((s) => s.docs) as Doc[] | null
  const stale = useEventIndexStore((s) => s.stale)
  const loading = useEventIndexStore((s) => s.loading)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openEvent = useOpenEvent()
  useEffect(() => { ensureEventIndex(vaultPath) }, [vaultPath, stale])

  const initial = (location.state as { tagSelection?: TagSelection } | null)?.tagSelection ?? null
  const [sel, setSel] = useState<TagSelection | null>(initial)
  const [filter, setFilter] = useState('')
  useEffect(() => { if (initial) setSel(initial) }, [initial?.kind, initial?.name]) // eslint-disable-line react-hooks/exhaustive-deps

  // Contagens (cada arquivo conta uma vez por nome, mesmo com vários trechos)
  const { categories, tags } = useMemo(() => {
    const cats = new Map<string, number>(), tgs = new Map<string, number>()
    for (const d of docs ?? []) {
      if (d.category) cats.set(d.category, (cats.get(d.category) ?? 0) + 1)
      for (const tg of new Set(d.tags ?? [])) tgs.set(tg, (tgs.get(tg) ?? 0) + 1)
    }
    const sort = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    return { categories: sort(cats), tags: sort(tgs) }
  }, [docs])

  const q = norm(filter.trim())
  const shownCats = q ? categories.filter(([n]) => norm(n).includes(q)) : categories
  const shownTags = q ? tags.filter(([n]) => norm(n).includes(q)) : tags

  const events = useMemo(() => {
    if (!sel || !docs) return []
    const match = (d: Doc) => sel.kind === 'category' ? d.category === sel.name : (d.tags ?? []).includes(sel.name)
    const key = (d: Doc) => (d.date && parseDateParts(d.date) ? parseChroniclerDate(d.date).sortKey : Number.MAX_SAFE_INTEGER)
    return docs.filter(match).sort((a, b) => key(a) - key(b) || a.title.localeCompare(b.title))
  }, [sel, docs])

  const dateOf = (d: Doc) => (d.date && parseDateParts(d.date) ? parseChroniclerDate(d.date).display : undatedLabel())
  const empty = !loading && docs && categories.length === 0 && tags.length === 0

  const Item = ({ kind, name, count }: { kind: TagSelection['kind']; name: string; count: number }) => {
    const active = sel?.kind === kind && sel.name === name
    return (
      <button type="button" onClick={() => setSel({ kind, name })} data-testid={`tag-item-${kind}`}
        className={cn('w-full flex items-center gap-2 px-3 py-1.5 rounded-sm text-left transition-colors',
          active ? 'bg-active text-chr-primary' : 'text-chr-secondary hover:bg-hover hover:text-chr-primary')}>
        {kind === 'tag' ? <Hash size={11} strokeWidth={1.5} className="shrink-0 text-chr-muted" /> : <Tag size={11} strokeWidth={1.5} className="shrink-0 text-chr-muted" />}
        <span className={cn('flex-1 truncate text-sm', kind === 'category' && 'font-mono text-xs uppercase tracking-wider')}>{name}</span>
        <span className="font-mono text-2xs text-chr-muted tabular-nums">{count}</span>
      </button>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-vault" data-testid="tags-page">
      <header className="shrink-0 border-b border-chr-subtle bg-surface">
        <div className="flex items-center justify-between px-6 py-3 gap-4">
          <div className="flex items-center gap-3">
            <Tag size={16} strokeWidth={1.5} className="text-chr-muted" />
            <div>
              <h1 className="font-mono text-sm font-medium text-chr-primary leading-none">{t('tags_title')}</h1>
              <p className="font-mono text-2xs text-chr-muted mt-0.5">{t('tags_desc')}</p>
            </div>
          </div>
          <span className="font-mono text-2xs text-chr-muted">
            {categories.length} {t('tags_categories').toLowerCase()} · {tags.length} {t('tags_tags').toLowerCase()}
          </span>
        </div>
      </header>

      {empty ? (
        <div className="flex-1 flex items-center justify-center px-8">
          <p className="font-mono text-xs text-chr-muted max-w-md text-center leading-relaxed">{t('tags_none')}</p>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* Esquerda: categorias e tags */}
          <aside className="w-72 shrink-0 border-r border-chr-subtle flex flex-col min-h-0">
            <div className="shrink-0 p-3 border-b border-chr-subtle">
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('tags_filter_ph')} spellCheck={false}
                className="w-full px-2.5 py-1.5 rounded-sm bg-vault border border-chr-subtle text-chr-primary font-mono text-xs focus:outline-none focus:border-chr placeholder:text-chr-muted"
                data-testid="tags-filter" />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-4">
              {shownCats.length > 0 && (
                <section>
                  <p className="px-3 pb-1 font-mono text-2xs text-chr-muted uppercase tracking-wider">{t('tags_categories')}</p>
                  {shownCats.map(([name, count]) => <Item key={`c:${name}`} kind="category" name={name} count={count} />)}
                </section>
              )}
              {shownTags.length > 0 && (
                <section>
                  <p className="px-3 pb-1 font-mono text-2xs text-chr-muted uppercase tracking-wider">{t('tags_tags')}</p>
                  {shownTags.map(([name, count]) => <Item key={`t:${name}`} kind="tag" name={name} count={count} />)}
                </section>
              )}
              {loading && !docs && <p className="px-3 py-2 font-mono text-2xs text-chr-muted">{t('loading')}</p>}
            </div>
          </aside>

          {/* Direita: eventos da seleção */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            {!sel ? (
              <div className="h-full flex items-center justify-center px-8">
                <p className="font-mono text-xs text-chr-muted">{t('tags_pick_hint')}</p>
              </div>
            ) : (
              <div className="px-8 py-6 max-w-3xl">
                <div className="flex items-baseline gap-3 mb-4">
                  <h2 className={cn('font-serif text-2xl text-chr-primary', sel.kind === 'tag' && 'font-mono text-xl')}>
                    {sel.kind === 'tag' ? `#${sel.name}` : sel.name}
                  </h2>
                  <span className="font-mono text-2xs text-chr-muted">
                    {t(events.length === 1 ? 'tags_events_with_one' : 'tags_events_with_other', { count: events.length, name: sel.kind === 'tag' ? `#${sel.name}` : sel.name })}
                  </span>
                </div>
                <div className="space-y-px" data-testid="tags-events">
                  {events.map((d) => (
                    <button key={docKey(d)} type="button" onClick={() => void openEvent(d)}
                      className="w-full flex items-center gap-4 px-3 py-2 rounded-sm text-left hover:bg-hover transition-colors group">
                      <span className="chr-date w-24 shrink-0 text-right">{dateOf(d)}</span>
                      <span className="flex-1 text-sm text-chr-secondary group-hover:text-chr-primary truncate">{d.title}</span>
                      <span className="font-mono text-2xs text-chr-muted truncate max-w-[12rem]">{d.chronicleTitle ? `${d.chronicleTitle} · ` : ''}{d.timelineTitle}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
