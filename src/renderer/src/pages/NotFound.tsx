/**
 * 404 Not Found Page
 *
 * Displayed when the user navigates to a route that does not exist.
 */

import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui'

export function NotFoundPage(): React.ReactElement {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-6 py-24">
      <div className="text-8xl font-black text-muted-foreground/20 select-none">404</div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">Page not found</h2>
        <p className="text-sm text-muted-foreground">
          The page you are looking for does not exist or has been moved.
        </p>
      </div>
      <Button variant="primary" onClick={() => navigate('/')}>
        Back to Home
      </Button>
    </div>
  )
}
