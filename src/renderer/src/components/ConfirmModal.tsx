/**
 * ConfirmModal — confirmação antes de uma ação (Esc ou clique fora cancelam).
 */

import { useEffect } from 'react'
import { useI18n } from '@/hooks/useI18n'
import { cn } from '@/utils/cn'

interface ConfirmModalProps {
  title: string
  description: string
  confirmLabel: string
  isDanger?: boolean
  isLoading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  title, description, confirmLabel, isDanger = false, isLoading = false, onConfirm, onCancel,
}: ConfirmModalProps) {
  const { t } = useI18n()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      {/* Card */}
      <div className="relative z-10 w-80 chr-card p-5 shadow-card-hover">
        <h3 className="font-serif text-base text-chr-primary mb-2">{title}</h3>
        <p className="font-mono text-xs text-chr-muted mb-5 leading-relaxed">{description}</p>
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-3 py-1.5 font-mono text-xs rounded-sm border border-chr-subtle text-chr-muted hover:text-chr-secondary hover:border-chr transition-colors disabled:opacity-40"
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              'px-3 py-1.5 font-mono text-xs rounded-sm transition-colors disabled:opacity-40',
              isDanger
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-chr-primary text-surface hover:opacity-90'
            )}
          >
            {isLoading ? t('please_wait') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
