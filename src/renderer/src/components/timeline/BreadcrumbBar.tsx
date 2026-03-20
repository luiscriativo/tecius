import { ChevronRight } from 'lucide-react'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { useTimeline } from '../../hooks/useTimeline'
import { cn } from '../../utils/cn'

export function BreadcrumbBar() {
  const stack = useNavigationStore((s) => s.stack)
  const { loadTimeline } = useTimeline()

  if (stack.length === 0) return null

  return (
    <nav className="flex items-center gap-1 px-5 py-2.5 border-b border-chr-subtle bg-surface shrink-0 overflow-x-auto">
      {stack.map((item, i) => {
        const isLast = i === stack.length - 1
        return (
          <span key={`${i}-${item.dirPath}`} className="flex items-center gap-1 shrink-0">
            {i > 0 && <ChevronRight size={12} className="text-chr-muted shrink-0" strokeWidth={1.5} />}
            <button
              disabled={isLast}
              onClick={() => !isLast && loadTimeline(item.dirPath, item.title, false)}
              className={cn(
                'font-mono text-xs tracking-wide transition-colors duration-150 whitespace-nowrap',
                isLast
                  ? 'text-chr-primary font-medium cursor-default'
                  : 'text-chr-muted hover:text-chr-secondary cursor-pointer'
              )}
            >
              {item.title}
            </button>
          </span>
        )
      })}
    </nav>
  )
}
