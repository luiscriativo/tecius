/**
 * PresentationPanel — texto dos eventos do momento, ao lado do mapa, no modo
 * apresentação (narrativa guiada pelo play da régua).
 *
 * Carrega o corpo de cada evento sob demanda (com cache); de um chronicle,
 * mostra só o trecho da âncora daquele evento.
 */

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MapPin, X } from 'lucide-react'
import { useI18n } from '@/hooks/useI18n'
import { extractBlock } from '../timeline/EventPanel'
import { stripAnchors } from '@/utils/anchors'
import type { ChroniclerEvent } from '@/types/chronicler'

const bodyCache = new Map<string, string>()

interface PresentationPanelProps {
  events: ChroniclerEvent[]
  windowLabel: string
  position: { index: number; total: number }
  onClose: () => void
  onOpenEvent: (e: ChroniclerEvent) => void
}

export function PresentationPanel({ events, windowLabel, position, onClose, onOpenEvent }: PresentationPanelProps) {
  const { t } = useI18n()
  const [, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    const missing = [...new Set(events.map((e) => e.filePath))].filter((fp) => !bodyCache.has(fp))
    Promise.all(missing.map(async (fp) => {
      const r = await window.electronAPI.invoke<{ success: boolean; data?: { body: string } }>('fs:read-event', fp)
      bodyCache.set(fp, r.success && r.data ? r.data.body : '')
    })).then(() => { if (alive && missing.length) setTick((n) => n + 1) })
    return () => { alive = false }
  }, [events])

  const textOf = (e: ChroniclerEvent): string | null => {
    const body = bodyCache.get(e.filePath)
    if (body === undefined) return null
    if (e.chronicle?.anchor) return extractBlock(body, e.chronicle.anchor) ?? ''
    return stripAnchors(body)
  }

  return (
    <aside className="w-[min(420px,40%)] shrink-0 border-l border-chr-subtle bg-surface flex flex-col min-h-0" data-testid="presentation-panel">
      <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-chr-subtle">
        <span className="font-serif text-xl text-chr-primary leading-tight flex-1">{windowLabel}</span>
        <span className="font-mono text-2xs text-chr-muted">{position.index} / {position.total}</span>
        <button type="button" onClick={onClose} title={t('presentation_exit')} aria-label={t('presentation_exit')}
          className="text-chr-muted hover:text-chr-primary"><X size={15} strokeWidth={1.5} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-8">
        {events.length === 0 && <p className="font-mono text-xs text-chr-muted">{t('map_nothing_now')}</p>}
        {events.map((e) => {
          const text = textOf(e)
          return (
            <article key={e.filePath + e.slug} className="animate-in fade-in duration-500">
              <p className="font-mono text-2xs text-timeline-chronicle-text tracking-wider uppercase">{e.date.display}</p>
              <button type="button" onClick={() => onOpenEvent(e)}
                className="block text-left font-serif text-2xl text-chr-primary leading-tight mt-1 hover:underline underline-offset-4">
                {e.frontmatter.title}
              </button>
              {e.location?.name && (
                <p className="flex items-center gap-1.5 font-mono text-2xs text-chr-secondary mt-1.5">
                  <MapPin size={11} strokeWidth={1.5} />{e.location.name}
                </p>
              )}
              <div className="markdown-content text-sm mt-3">
                {text === null
                  ? <div className="h-3 w-2/3 bg-subtle rounded animate-pulse" />
                  : text.trim()
                    ? <ReactMarkdown remarkPlugins={[remarkGfm]}
                        components={{ img: ({ src, alt }) => <img src={src ? window.electronAPI.resolveAssetPath(e.filePath, String(src)) : ''} alt={alt ?? ''} /> }}>
                        {text}
                      </ReactMarkdown>
                    : <p className="font-mono text-xs text-chr-muted italic">{t('no_content')}</p>}
              </div>
            </article>
          )
        })}
      </div>
      <p className="shrink-0 px-5 py-2 border-t border-chr-subtle font-mono text-2xs text-chr-muted">{t('presentation_keys')}</p>
    </aside>
  )
}
