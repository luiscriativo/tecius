/**
 * 404 Not Found Page
 *
 * Displayed when the user navigates to a route that does not exist.
 */

import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui'
import { useI18n } from '@/hooks/useI18n'

export function NotFoundPage(): React.ReactElement {
  const navigate = useNavigate()
  const { t } = useI18n()

  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-6 py-24">
      <div className="text-8xl font-black text-muted-foreground/20 select-none">404</div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">{t('notfound_title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('notfound_desc')}
        </p>
      </div>
      <Button variant="primary" onClick={() => navigate('/')}>
        {t('notfound_back')}
      </Button>
    </div>
  )
}
