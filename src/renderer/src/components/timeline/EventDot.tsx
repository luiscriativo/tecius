import { cn } from '../../utils/cn'
import type { ChroniclerEvent } from '../../types/chronicler'

interface EventDotProps {
  event: ChroniclerEvent
  isSelected: boolean
  onClick: () => void
  onDoubleClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  style: React.CSSProperties
  /** Alinhamento do tooltip — 'left' quando o dot está perto da borda esquerda,
   *  'right' quando perto da borda direita, 'center' (padrão) no meio. */
  tooltipAlign?: 'left' | 'center' | 'right'
}

const IMPORTANCE_SIZE: Record<number, string> = {
  1: 'w-2 h-2',
  2: 'w-2.5 h-2.5',
  3: 'w-3 h-3',
  4: 'w-3.5 h-3.5',
  5: 'w-4 h-4',
}

export function EventDot({ event, isSelected, onClick, onDoubleClick, onContextMenu, style, tooltipAlign = 'center' }: EventDotProps) {
  const importance = event.frontmatter.importance ?? 3
  const hasSubtimeline = event.hasSubtimeline
  const isChronicle = !!event.chronicle
  const sizeClass = IMPORTANCE_SIZE[importance] ?? IMPORTANCE_SIZE[3]

  // Classes de posição do tooltip: evita sair para fora da área visível
  const tooltipPositionClass =
    tooltipAlign === 'left'   ? 'left-0'
    : tooltipAlign === 'right' ? 'right-0'
    : 'left-1/2 -translate-x-1/2'

  return (
    <div
      className="absolute top-1/2 group cursor-pointer"
      style={{ ...style, transform: 'translateX(-50%) translateY(-50%)' }}
    >
      {/* Area de clique maior (invisivel) */}
      <div
        className="absolute inset-0 -m-3"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e) }}
      />

      {isChronicle ? (
        /* ── Dot chronicle: losango âmbar ────────────────────────── */
        <div
          className={cn(
            'border border-timeline-chronicle transition-all duration-150 rotate-45',
            sizeClass,
            isSelected
              ? 'bg-timeline-chronicle scale-125'
              : 'bg-surface group-hover:bg-timeline-chronicle group-hover:scale-125',
          )}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e) }}
        />
      ) : (
        /* ── Dot padrão: círculo escuro ──────────────────────────── */
        <div
          className={cn(
            'rounded-full border border-timeline-dot transition-all duration-150',
            sizeClass,
            isSelected
              ? 'bg-timeline-dot scale-125'
              : 'bg-surface group-hover:bg-timeline-dot group-hover:scale-125',
          )}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e) }}
        />
      )}

      {/* Indicador de sub-timeline */}
      {hasSubtimeline && (
        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-timeline-dot rounded-full opacity-60" />
      )}

      {/* Tooltip */}
      <div
        className={cn(
          'absolute bottom-full mb-3 z-tooltip',
          tooltipPositionClass,
          'pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150',
          'whitespace-nowrap'
        )}
      >
        <div className="chr-card px-2.5 py-1.5 text-left">
          <p className="font-sans text-xs font-medium text-chr-primary leading-tight">
            {event.frontmatter.title}
          </p>
          <p className="chr-date mt-0.5">{event.date.display}</p>
          {isChronicle && (
            <p className="text-2xs text-timeline-chronicle mt-0.5 font-mono truncate max-w-48">
              ◆ {event.chronicle!.title}
            </p>
          )}
          {hasSubtimeline && (
            <p className="text-2xs text-chr-muted mt-0.5 font-mono">subtimeline</p>
          )}
        </div>
      </div>
    </div>
  )
}
