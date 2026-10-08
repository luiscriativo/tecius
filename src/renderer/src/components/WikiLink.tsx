/**
 * WikiLink — uma ligação [[…]] para outro evento, na leitura.
 * - Evento encontrado: link com a data ao lado; clicar abre o evento. Parar o
 *   mouse em cima mostra um cartão com data, local, timeline e o começo do texto.
 * - Não encontrado: tracejado; clicar cria o evento (sem data) na timeline atual e abre.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEventIndexStore, ensureEventIndex } from '@/stores/useEventIndexStore'
import { useVaultStore } from '@/stores/useVaultStore'
import { useOpenEvent } from '@/hooks/useOpenEvent'
import { useVault } from '@/hooks/useVault'
import { useI18n } from '@/hooks/useI18n'
import { parseChroniclerDate } from '@/utils/chroniclerDate'
import { eventTexts, resolveWikiLink, snippetAround, type VaultEventDoc } from '@/utils/wikiLinks'

const dirOf = (filePath: string) => filePath.replace(/[\\/][^\\/]*$/, '')

export function WikiLink({ target, label, contextDir }: { target: string; label: React.ReactNode; contextDir?: string }) {
  const { t } = useI18n()
  const docs = useEventIndexStore((s) => s.docs)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openEvent = useOpenEvent()
  const { reloadVault } = useVault()
  const [creating, setCreating] = useState(false)
  const stale = useEventIndexStore((s) => s.stale)
  useEffect(() => { ensureEventIndex(vaultPath) }, [vaultPath, stale])

  const doc = docs ? resolveWikiLink(target, docs, contextDir) : null
  // Cartão ao parar o mouse em cima (pequena espera para não piscar ao passar)
  const [card, setCard] = useState<{ left: number; top: number; above: boolean } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const showCard = (el: HTMLElement) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const r = el.getBoundingClientRect()
      const above = r.bottom + 190 > window.innerHeight
      setCard({ left: Math.max(8, Math.min(r.left, window.innerWidth - 328)), top: above ? r.top - 8 : r.bottom + 8, above })
    }, 350)
  }
  const hideCard = () => { if (timer.current) clearTimeout(timer.current); setCard(null) }

  if (doc) {
    const date = doc.date ? parseChroniclerDate(doc.date).display : ''
    return (
      <>
        <a href="#" onClick={(e) => { e.preventDefault(); hideCard(); void openEvent(doc) }} data-wiki-link="ok"
          onMouseEnter={(e) => showCard(e.currentTarget)} onMouseLeave={hideCard}
          className="text-chr-primary underline decoration-timeline-chronicle-text/60 decoration-1 underline-offset-4 hover:decoration-timeline-chronicle-text">
          {label}{date && <span className="ml-1 font-mono text-2xs text-timeline-chronicle-text no-underline inline-block">{date}</span>}
        </a>
        {card && docs && createPortal(<EventCard doc={doc} docs={docs} pos={card} />, document.body)}
      </>
    )
  }

  // Ainda carregando o índice: só o texto, sem marcar como inexistente
  if (!docs) return <span>{label}</span>

  const create = async () => {
    if (!contextDir || !vaultPath || creating) return
    setCreating(true)
    try {
      const r = await window.electronAPI.invoke<{ success: boolean; data?: { filePath: string; slug: string } }>('fs:create-event', contextDir, target, undefined, null)
      if (!r.success || !r.data) return
      await Promise.all([useEventIndexStore.getState().refresh(vaultPath), reloadVault()])
      const created = useEventIndexStore.getState().docs?.find((d) => d.filePath === r.data!.filePath)
      if (created) await openEvent(created)
    } finally {
      setCreating(false)
    }
  }
  return (
    <a href="#" onClick={(e) => { e.preventDefault(); void create() }} data-wiki-link="missing"
      title={contextDir ? t('wiki_missing') : t('wiki_missing_readonly')}
      className="text-chr-muted underline decoration-dashed decoration-1 underline-offset-4 hover:text-chr-primary">
      {label}
    </a>
  )
}

/** Cartão de pré-visualização de um evento ligado */
function EventCard({ doc, docs, pos }: { doc: VaultEventDoc; docs: VaultEventDoc[]; pos: { left: number; top: number; above: boolean } }) {
  const text = useMemo(() => eventTexts(docs).find((x) => x.doc.filePath === doc.filePath && x.doc.slug === doc.slug)?.text ?? '', [docs, doc])
  const snippet = snippetAround(text, 0, 220)
  const date = doc.date ? parseChroniclerDate(doc.date).display : ''
  return (
    <div className="fixed z-50 w-80 chr-card shadow-card-hover px-4 py-3 pointer-events-none" data-testid="wiki-card"
      style={{ left: pos.left, top: pos.top, transform: pos.above ? 'translateY(-100%)' : undefined }}>
      {date && <p className="font-mono text-2xs text-timeline-chronicle-text tracking-wider uppercase">{date}</p>}
      <p className="font-serif text-lg text-chr-primary leading-tight mt-0.5">{doc.title}</p>
      <p className="font-mono text-2xs text-chr-muted mt-1">
        {[doc.place, doc.chronicleTitle ? `${doc.chronicleTitle} · ${doc.timelineTitle}` : doc.timelineTitle].filter(Boolean).join(' · ')}
      </p>
      {snippet && <p className="text-xs text-chr-secondary leading-relaxed mt-2 line-clamp-4">{snippet}</p>}
    </div>
  )
}

type Anchor = (props: React.AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown; 'data-wiki'?: string }) => React.ReactElement
const anchors = new Map<string, Anchor>()

/**
 * Componente `a` do ReactMarkdown: links [[…]] (data-wiki) viram WikiLink; os demais
 * ficam como estão. Um por pasta de timeline (o mesmo a cada render, sem remontar os links).
 */
export function wikiAnchor(eventFilePath?: string): Anchor {
  const contextDir = eventFilePath ? dirOf(eventFilePath) : undefined
  const key = contextDir ?? ''
  const cached = anchors.get(key)
  if (cached) return cached
  const made: Anchor = function A({ node: _node, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown; 'data-wiki'?: string }) {
    const target = props['data-wiki']
    if (target) return <WikiLink target={target} label={props.children} contextDir={contextDir} />
    return <a {...props} />
  }
  anchors.set(key, made)
  return made
}

/** Para exportação (PDF/HTML): a ligação vira só o texto */
export function StaticWikiAnchor({ node: _node, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown; 'data-wiki'?: string }) {
  if (props['data-wiki']) return <span>{props.children}</span>
  return <a {...props} />
}
