/**
 * WikiLink — uma ligação [[…]] para outro evento, na leitura.
 * - Evento encontrado: link com a data ao lado; clicar abre o evento.
 * - Não encontrado: tracejado; clicar cria o evento (sem data) na timeline atual e abre.
 */

import React, { useEffect, useState } from 'react'
import { useEventIndexStore, ensureEventIndex } from '@/stores/useEventIndexStore'
import { useVaultStore } from '@/stores/useVaultStore'
import { useOpenEvent } from '@/hooks/useOpenEvent'
import { useVault } from '@/hooks/useVault'
import { useI18n } from '@/hooks/useI18n'
import { parseChroniclerDate } from '@/utils/chroniclerDate'
import { resolveWikiLink } from '@/utils/wikiLinks'

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
  if (doc) {
    const date = doc.date ? parseChroniclerDate(doc.date).display : ''
    return (
      <a href="#" onClick={(e) => { e.preventDefault(); void openEvent(doc) }} data-wiki-link="ok"
        title={[doc.title, date, doc.timelineTitle].filter(Boolean).join(' · ')}
        className="text-chr-primary underline decoration-timeline-chronicle-text/60 decoration-1 underline-offset-4 hover:decoration-timeline-chronicle-text">
        {label}{date && <span className="ml-1 font-mono text-2xs text-timeline-chronicle-text no-underline inline-block">{date}</span>}
      </a>
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
