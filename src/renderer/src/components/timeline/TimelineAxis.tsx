import { generateTimelineTicks, calcTimelinePosition } from '../../utils/chroniclerDate'
import type { ChroniclerDate } from '../../types/chronicler'

interface TimelineAxisProps {
  minDate: ChroniclerDate
  maxDate: ChroniclerDate
  width: number
}

export function TimelineAxis({ minDate, maxDate, width }: TimelineAxisProps) {
  // Escala a quantidade de ticks com a largura do canvas:
  // ~1 tick a cada 100px → zoom 1x (800px) = 8 ticks, zoom 5x (4000px) = 40 ticks
  const targetCount = Math.max(4, Math.round(width / 100))
  const ticks = generateTimelineTicks(minDate.year, maxDate.year, targetCount)

  return (
    <div className="relative h-6 shrink-0">
      {ticks.map((year) => {
        const tickSortKey = year * 10000
        const pos = calcTimelinePosition(tickSortKey, minDate.sortKey, maxDate.sortKey)
        const left = `${pos * 100}%`

        return (
          <div
            key={year}
            className="absolute top-0 h-full flex flex-col items-center"
            style={{ left, transform: 'translateX(-50%)' }}
          >
            <div className="w-px h-2 bg-timeline-tick" />
            <span className="font-mono text-2xs text-chr-muted mt-0.5 select-none">{year}</span>
          </div>
        )
      })}
    </div>
  )
}
