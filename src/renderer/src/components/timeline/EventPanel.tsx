import { X, ExternalLink, GitBranch, BookOpen } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChroniclerEvent } from '../../types/chronicler'
import { cn } from '../../utils/cn'
import { useI18n } from '../../hooks/useI18n'
import { stripAnchors } from '../../utils/anchors'
import { remarkWikiLinks } from '../../utils/wikiLinks'
import { wikiAnchor } from '../WikiLink'
import { Backlinks, RelationsMapButton } from '../Backlinks'
import { FioPanel } from '../FioPanel'
import { usePref } from '../../hooks/usePref'


/**
 * Extrai o bloco (parágrafo) que termina com `^anchorId`.
 * Normaliza CRLF antes de processar para suportar arquivos Windows.
 * Remove a marcação `^...` do texto exibido.
 * Retorna null se o anchor não for encontrado.
 */
export function extractBlock(body: string, anchorId: string): string | null {
  const normalized = body.replace(/\r\n/g, '\n')
  const blocks = normalized.split(/\n{2,}/)
  const re = new RegExp(`\\^${anchorId}\\s*$`)
  for (const block of blocks) {
    const stripped = block.trim()
    if (re.test(stripped)) {
      return stripped.replace(/\s*\^\S+\s*$/, '').trim()
    }
  }
  return null
}

interface EventPanelProps {
  event: ChroniclerEvent
  body: string | null
  isLoading: boolean
  onClose: () => void
  onOpenInEditor: (filePath: string) => void
  onEnterSubtimeline: (event: ChroniclerEvent) => void
}

export function EventPanel({ event, body, isLoading, onClose, onOpenInEditor, onEnterSubtimeline }: EventPanelProps) {
  const { t } = useI18n()
  const fm = event.frontmatter
  const chr = event.chronicle
  // Trecho / Completo: a escolha vale para todos os chronicles e é lembrada
  const [showFullBody, setShowFullBody] = usePref('chronicle.full', false)

  // Determina qual conteúdo renderizar
  const anchor = chr?.anchor
  const cleanBody = body ? stripAnchors(body) : null
  const anchorBlock = anchor && body ? extractBlock(body, anchor) : null
  const displayBody = (anchor && !showFullBody && anchorBlock) ? anchorBlock : cleanBody

  return (
    <aside
      className={cn(
        'w-panel-md shrink-0 flex flex-col h-full',
        'border-l border-chr-subtle bg-surface',
        'animate-slide-in-right'
      )}
    >
      {/* Banner de origem do chronicle */}
      {chr && (
        <div className="shrink-0 px-5 py-2 border-b border-chr-subtle flex items-center gap-2 bg-subtle">
          <BookOpen size={11} strokeWidth={1.5} className="text-timeline-chronicle-text shrink-0" />
          <span className="font-mono text-2xs text-timeline-chronicle-text truncate flex-1">
            {chr.title}
          </span>
          <span className="font-mono text-2xs text-chr-muted shrink-0 mr-2">
            {chr.entryIndex + 1} / {chr.totalEntries}
          </span>
          {/* Toggle Trecho / Completo — sempre visível quando é chronicle */}
          {anchorBlock && (
            <div className="flex items-center rounded-sm overflow-hidden border border-chr-subtle shrink-0">
              <button
                onClick={() => setShowFullBody(false)}
                className={cn(
                  'px-2 py-0.5 font-mono text-2xs transition-colors duration-100',
                  !showFullBody
                    ? 'bg-timeline-chronicle text-surface'
                    : 'text-chr-muted hover:text-chr-secondary'
                )}
              >
                {t('excerpt')}
              </button>
              <button
                onClick={() => setShowFullBody(true)}
                className={cn(
                  'px-2 py-0.5 font-mono text-2xs transition-colors duration-100',
                  showFullBody
                    ? 'bg-timeline-chronicle text-surface'
                    : 'text-chr-muted hover:text-chr-secondary'
                )}
              >
                {t('full_view')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Header do painel */}
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-chr-subtle shrink-0">
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-lg text-chr-primary leading-tight">
            {fm.title}
          </h2>
          <p className="chr-date mt-1">
            {fm.circa && <span className="mr-1 opacity-60">~</span>}
            {event.date.display}
          </p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 p-1.5 rounded-sm text-chr-muted hover:bg-hover hover:text-chr-primary transition-colors"
          aria-label={t('close_panel')}
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>

      {/* Metadados */}
      {(fm.category || (fm.tags && fm.tags.length > 0) || fm.importance) && (
        <div className="px-5 py-3 border-b border-chr-subtle shrink-0 flex flex-wrap gap-1.5">
          {fm.category && <span className="chr-badge">{fm.category}</span>}
          {fm.tags?.map((tag) => (
            <span key={tag} className="chr-tag">#{tag}</span>
          ))}
          {fm.importance && (
            <span className="chr-tag font-mono">importancia {fm.importance}</span>
          )}
        </div>
      )}

      {/* Corpo do markdown */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-3 bg-subtle rounded" style={{ width: `${60 + (i % 3) * 15}%` }} />
            ))}
          </div>
        ) : displayBody ? (
          <>
            <div className="markdown-content selectable">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkWikiLinks]} components={{ a: wikiAnchor(event.filePath) }}>{displayBody}</ReactMarkdown>
            </div>
            <FioPanel filePath={event.filePath} slug={event.slug} compact />
            <Backlinks filePath={event.filePath} slug={event.slug} compact />
            <RelationsMapButton filePath={event.filePath} slug={event.slug} compact />
          </>
        ) : (
          <p className="font-mono text-xs text-chr-muted italic">{t('no_content')}</p>
        )}
      </div>

      {/* Acoes do painel */}
      <div className="px-5 py-3 border-t border-chr-subtle shrink-0 flex items-center gap-2">
        {event.hasSubtimeline && (
          <button
            onClick={() => onEnterSubtimeline(event)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium',
              'border border-chr-strong text-chr-primary',
              'hover:bg-active transition-colors duration-150'
            )}
          >
            <GitBranch size={12} strokeWidth={1.5} />
            {t('view_subtimeline')}
          </button>
        )}
        <button
          onClick={() => onOpenInEditor(event.filePath)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs',
            'border border-chr-subtle text-chr-muted',
            'hover:border-chr hover:text-chr-secondary transition-colors duration-150'
          )}
        >
          <ExternalLink size={12} strokeWidth={1.5} />
          {chr ? 'Abrir chronicle' : 'Abrir no editor'}
        </button>
      </div>
    </aside>
  )
}
