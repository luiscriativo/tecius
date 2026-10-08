import { AlignLeft, GitCommitHorizontal, Map as MapIcon } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useI18n } from '../../hooks/useI18n'

interface ViewToggleProps {
  mode: 'horizontal' | 'list' | 'map'
  onChange: (mode: 'horizontal' | 'list' | 'map') => void
}

export function ViewToggle({ mode, onChange }: ViewToggleProps) {
  const { t } = useI18n()
  return (
    <div className="flex items-center border border-chr-subtle rounded-sm overflow-hidden shrink-0">
      {(
        [
          { value: 'horizontal', icon: GitCommitHorizontal, label: t('view_horizontal') },
          { value: 'list',       icon: AlignLeft,            label: t('view_list')        },
          { value: 'map',        icon: MapIcon,              label: t('map_view')         },
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
