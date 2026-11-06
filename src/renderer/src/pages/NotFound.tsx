/**
 * 404 Not Found Page
 *
 * Displayed when the user navigates to a route that does not exist.
 */

import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '@/hooks/useI18n'

export function NotFoundPage(): React.ReactElement {
  const navigate = useNavigate()
  const { t } = useI18n()

  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-6 py-24 bg-vault">
      <div className="font-serif text-8xl text-chr-muted/20 select-none">404</div>
      <div className="space-y-2">
        <h2 className="font-serif text-xl text-chr-primary">{t('notfound_title')}</h2>
        <p className="text-sm text-chr-secondary">
          {t('notfound_desc')}
        </p>
      </div>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="px-4 py-2 rounded-sm text-sm border border-chr-strong text-chr-primary hover:bg-active transition-colors"
      >
        {t('notfound_back')}
      </button>
    </div>
  )
}
