/**
 * Backlinks — "Mencionado em": os eventos que citam este com [[…]], com o trecho
 * em volta da menção. Clicar abre o evento. Num chronicle, aponta o trecho certo.
 */

import { useEffect, useMemo } from 'react'
import { Link2 } from 'lucide-react'
import { ensureEventIndex, useEventIndexStore } from '@/stores/useEventIndexStore'
import { useVaultStore } from '@/stores/useVaultStore'
import { useOpenEvent } from '@/hooks/useOpenEvent'
import { useI18n } from '@/hooks/useI18n'
import { parseChroniclerDate } from '@/utils/chroniclerDate'
import { findBacklinks } from '@/utils/wikiLinks'

export function Backlinks({ filePath, slug, compact }: { filePath: string; slug: string; compact?: boolean }) {
  const { t } = useI18n()
  const docs = useEventIndexStore((s) => s.docs)
  const stale = useEventIndexStore((s) => s.stale)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openEvent = useOpenEvent()
  useEffect(() => { ensureEventIndex(vaultPath) }, [vaultPath, stale])

  const links = useMemo(() => {
    const self = docs?.find((d) => d.filePath === filePath && d.slug === slug)
    return self && docs ? findBacklinks(self, docs) : []
  }, [docs, filePath, slug])
  if (!links.length) return null

  return (
    <section className={compact ? 'mt-6 pt-4 border-t border-chr-subtle' : 'mt-10 pt-6 border-t border-chr-subtle'} data-testid="backlinks">
      <h3 className="flex items-center gap-1.5 font-mono text-2xs tracking-wider uppercase text-chr-muted mb-3">
        <Link2 size={11} strokeWidth={1.5} /> {t('backlinks_title')} <span className="text-chr-secondary">{links.length}</span>
      </h3>
      <div className="space-y-1">
        {links.map(({ doc, snippet }) => (
          <button key={doc.filePath + doc.slug} type="button" onClick={() => void openEvent(doc)}
            className="block w-full text-left -mx-2 px-2 py-1.5 rounded-sm hover:bg-hover transition-colors">
            <span className="flex items-baseline gap-2 min-w-0">
              <span className="text-sm text-chr-primary truncate">{doc.title}</span>
              <span className="font-mono text-2xs text-timeline-chronicle-text shrink-0">{doc.date ? parseChroniclerDate(doc.date).display : ''}</span>
              <span className="font-mono text-2xs text-chr-muted truncate">{doc.chronicleTitle ? `${doc.chronicleTitle} · ` : ''}{doc.timelineTitle}</span>
            </span>
            {snippet && <span className="block text-xs text-chr-secondary leading-relaxed mt-0.5 line-clamp-2">{snippet}</span>}
          </button>
        ))}
      </div>
    </section>
  )
}
