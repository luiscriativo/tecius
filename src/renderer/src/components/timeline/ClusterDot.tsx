/**
 * ClusterDot — Dot agrupado para múltiplos eventos na mesma data
 *
 * Quando dois ou mais eventos compartilham o mesmo sortKey (mesma data),
 * exibimos um único marcador com o contador de eventos.
 *
 * Variantes visuais:
 * - Todos chronicle → losango âmbar (mesmo estilo do EventDot chronicle)
 * - Misturado ou todos normais → quadrado escuro (padrão)
 *
 * - Hover: tooltip listando todos os eventos do grupo
 * - Click: abre popover para selecionar qual evento abrir
 */

import { useState } from 'react'
import { cn } from '../../utils/cn'
import type { ChroniclerEvent } from '../../types/chronicler'

interface ClusterDotProps {
  events: ChroniclerEvent[]
  hasSelected: boolean
  onEventClick: (event: ChroniclerEvent) => void
  style: React.CSSProperties
  tooltipAlign?: 'left' | 'center' | 'right'
}

export function ClusterDot({ events, hasSelected, onEventClick, style, tooltipAlign = 'center' }: ClusterDotProps) {
  const [open, setOpen] = useState(false)

  const handleDotClick = () => setOpen((v) => !v)

  const tooltipPositionClass =
    tooltipAlign === 'left'   ? 'left-0'
    : tooltipAlign === 'right' ? 'right-0'
    : 'left-1/2 -translate-x-1/2'

  // Determina o estilo visual do cluster
  const allChronicle = events.every((e) => !!e.chronicle)
  const hasChronicle  = events.some((e) => !!e.chronicle)

  return (
    <div
      className="absolute top-1/2 group cursor-pointer"
      style={{ ...style, transform: 'translateX(-50%) translateY(-50%)' }}
    >
      {/* Backdrop invisível — fecha o popover ao clicar fora */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {allChronicle ? (
        /* ── Cluster todo-chronicle: losango âmbar ──────────────── */
        <div
          onClick={handleDotClick}
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
        /* ── Cluster misto ou todo normal: quadrado escuro ──────── */
        <div
          onClick={handleDotClick}
          className={cn(
            'relative z-50 w-5 h-5 border-2 border-timeline-dot',
            'flex items-center justify-center',
            'transition-all duration-150',
            hasSelected
              ? 'bg-timeline-dot scale-110'
              : 'bg-surface hover:bg-timeline-dot group-hover:scale-110'
          )}
        >
          <span
            className={cn(
              'font-mono text-[9px] font-bold leading-none select-none',
              hasSelected ? 'text-surface' : 'text-chr-secondary group-hover:text-surface'
            )}
          >
            {events.length}
          </span>
        </div>
      )}

      {/* Tooltip (visível no hover, apenas quando o popover está fechado) */}
      {!open && (
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
              {events[0]?.date.display} · {events.length} eventos
            </p>
            {events.map((e) => (
              <p key={e.slug} className="font-sans text-xs text-chr-secondary leading-snug flex items-center gap-1.5">
                {e.chronicle
                  ? <span className="text-timeline-chronicle text-[9px]">◆</span>
                  : <span className="text-chr-muted text-[9px]">●</span>
                }
                {e.frontmatter.title}
              </p>
            ))}
            {hasChronicle && !allChronicle && (
              <p className="font-mono text-2xs text-chr-muted mt-1.5 opacity-60">◆ chronicle  ● evento</p>
            )}
          </div>
        </div>
      )}

      {/* Popover de seleção */}
      {open && (
        <div
          className={cn(
            'absolute bottom-full mb-3 z-50',
            tooltipPositionClass,
            'min-w-48 chr-card overflow-hidden shadow-card-hover'
          )}
        >
          {/* Cabeçalho do popover */}
          <div className="px-3 py-2 border-b border-chr-subtle bg-surface">
            <p className="font-mono text-2xs text-chr-muted">
              {events[0]?.date.display} · {events.length} eventos nesta data
            </p>
          </div>

          {/* Lista de eventos */}
          {events.map((e) => (
            <button
              key={e.slug}
              onClick={(ev) => {
                ev.stopPropagation()
                onEventClick(e)
                setOpen(false)
              }}
              className={cn(
                'w-full text-left px-3 py-2.5 flex items-center gap-2',
                'text-xs text-chr-secondary hover:bg-hover hover:text-chr-primary',
                'transition-colors duration-100 border-b border-chr-subtle last:border-b-0'
              )}
            >
              {e.chronicle ? (
                /* Indicador losango âmbar para chronicle */
                <div className="w-2 h-2 border border-timeline-chronicle rotate-45 shrink-0 opacity-80" />
              ) : (
                /* Indicador círculo escuro para evento normal */
                <div className="w-1.5 h-1.5 rounded-full bg-timeline-dot shrink-0 opacity-60" />
              )}
              <div className="flex-1 min-w-0">
                <span className="truncate block">{e.frontmatter.title}</span>
                {e.chronicle && (
                  <span className="font-mono text-2xs text-timeline-chronicle opacity-70 truncate block">
                    {e.chronicle.title}
                  </span>
                )}
              </div>
              {e.hasSubtimeline && (
                <span className="font-mono text-2xs text-chr-muted shrink-0">sub</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
