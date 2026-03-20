/**
 * ClusterDot — Dot agrupado para múltiplos eventos na mesma posição
 *
 * Variantes visuais:
 * - Todos chronicle → losango âmbar
 * - Misturado ou todos normais → losango escuro
 *
 * - Hover: tooltip resumido com lista de eventos
 * - Click: chama onClusterClick para abrir o painel lateral
 */

import { cn } from '../../utils/cn'
import type { ChroniclerEvent } from '../../types/chronicler'

interface ClusterDotProps {
  events: ChroniclerEvent[]
  hasSelected: boolean
  onClusterClick: (events: ChroniclerEvent[]) => void
  style: React.CSSProperties
  tooltipAlign?: 'left' | 'center' | 'right'
}

export function ClusterDot({ events, hasSelected, onClusterClick, style, tooltipAlign = 'center' }: ClusterDotProps) {
  const sorted = [...events].sort((a, b) => a.date.sortKey - b.date.sortKey)
  const firstDate = sorted[0]?.date.display ?? ''
  const lastDate  = sorted[sorted.length - 1]?.date.display ?? ''
  const dateLabel = firstDate === lastDate ? firstDate : `${firstDate} – ${lastDate}`

  const tooltipPositionClass =
    tooltipAlign === 'left'   ? 'left-0'
    : tooltipAlign === 'right' ? 'right-0'
    : 'left-1/2 -translate-x-1/2'

  const allChronicle = events.every((e) => !!e.chronicle)
  const hasChronicle  = events.some((e) => !!e.chronicle)

  return (
    <div
      className="absolute top-1/2 group cursor-pointer"
      style={{ ...style, transform: 'translateX(-50%) translateY(-50%)' }}
      onClick={() => onClusterClick(events)}
    >
      {allChronicle ? (
        /* ── Cluster todo-chronicle: losango âmbar ──────────────── */
        <div
          className={cn(
            'relative z-50 w-5 h-5 border-2 rotate-45',
            'flex items-center justify-center',
            'transition-all duration-150',
            'border-timeline-chronicle',
            hasSelected
              ? 'bg-timeline-chronicle scale-110'
              : 'bg-surface hover:bg-timeline-chronicle group-hover:scale-110'
          )}
        >
          <span
            className={cn(
              'font-mono text-[9px] font-bold leading-none select-none -rotate-45',
              hasSelected ? 'text-surface' : 'text-timeline-chronicle group-hover:text-surface'
            )}
          >
            {events.length}
          </span>
        </div>
      ) : (
        /* ── Cluster misto ou todo normal: losango escuro ──────── */
        <div
          className={cn(
            'relative z-50 w-5 h-5 border-2 rotate-45',
            'flex items-center justify-center',
            'transition-all duration-150',
            'border-timeline-dot',
            hasSelected
              ? 'bg-timeline-dot scale-110'
              : 'bg-surface hover:bg-timeline-dot group-hover:scale-110'
          )}
        >
          <span
            className={cn(
              'font-mono text-[9px] font-bold leading-none select-none -rotate-45',
              hasSelected ? 'text-surface' : 'text-chr-secondary group-hover:text-surface'
            )}
          >
            {events.length}
          </span>
        </div>
      )}

      {/* Tooltip no hover */}
      <div
        className={cn(
          'absolute bottom-full mb-3',
          tooltipPositionClass,
          'pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150',
          'whitespace-nowrap z-30'
        )}
      >
        <div className="chr-card px-3 py-2 text-left">
          <p className="font-mono text-2xs text-chr-muted mb-1.5">
            {dateLabel} · {events.length} eventos
          </p>
          {events.slice(0, 5).map((e) => (
            <p key={e.slug} className="font-sans text-xs text-chr-secondary leading-snug flex items-center gap-1.5">
              {e.chronicle
                ? <span className="text-timeline-chronicle text-[9px]">◆</span>
                : <span className="text-chr-muted text-[9px]">●</span>
              }
              {e.frontmatter.title}
            </p>
          ))}
          {events.length > 5 && (
            <p className="font-mono text-2xs text-chr-muted mt-1 opacity-60">+{events.length - 5} mais</p>
          )}
          {hasChronicle && !allChronicle && (
            <p className="font-mono text-2xs text-chr-muted mt-1.5 opacity-60">◆ chronicle  ● evento</p>
          )}
        </div>
      </div>
    </div>
  )
}
