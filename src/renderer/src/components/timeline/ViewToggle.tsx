import { AlignLeft, GitCommitHorizontal } from 'lucide-react'
import { cn } from '../../utils/cn'

interface ViewToggleProps {
  mode: 'horizontal' | 'list'
  onChange: (mode: 'horizontal' | 'list') => void
}

export function ViewToggle({ mode, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center border border-chr-subtle rounded-sm overflow-hidden shrink-0">
      {(
        [
          { value: 'horizontal', icon: GitCommitHorizontal, label: 'Timeline horizontal' },
          { value: 'list',       icon: AlignLeft,            label: 'Lista cronológica'   },
        ] as const
      ).map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          title={label}
          className={cn(
            'p-1.5 transition-colors duration-150',
            mode === value
              ? 'bg-active text-chr-primary'
              : 'text-chr-muted hover:bg-hover hover:text-chr-secondary'
          )}
        >
          <Icon size={14} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  )
}
