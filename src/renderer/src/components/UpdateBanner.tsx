/**
 * UpdateBanner
 *
 * Banner não intrusivo exibido no topo da aplicação quando:
 * - Uma nova versão está disponível para download   → estado "available"
 * - O download está em progresso                    → estado "downloading"
 * - O download foi concluído e aguarda reinicialização → estado "ready"
 *
 * O fluxo completo acontece dentro do próprio app:
 * 1. Banner aparece com a versão disponível
 * 2. Usuário clica "Baixar" → progresso em tempo real com barra
 * 3. Download concluído → botão "Reiniciar e instalar"
 * 4. App fecha, instala a nova versão e reinicia automaticamente
 */

import { useEffect, useState } from 'react'
import { Download, CheckCircle2, X, Loader2 } from 'lucide-react'

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'available'; version: string }
  | { phase: 'downloading'; version: string; percent: number }
  | { phase: 'ready'; version: string }

export function UpdateBanner(): React.ReactElement | null {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const unsubAvailable = window.electronAPI.on('update:available', (info) => {
      const data = info as { version: string }
      setState((prev) => {
        // electron-updater re-dispara update-available durante o download — ignorar
        if (prev.phase === 'downloading' || prev.phase === 'ready') return prev
        return { phase: 'available', version: data.version }
      })
      setDismissed(false)
    })

    const unsubProgress = window.electronAPI.on('update:progress', (info) => {
      const data = info as { percent: number }
      setState((prev) => ({
        phase: 'downloading',
        version: prev.phase === 'available' || prev.phase === 'downloading' ? prev.version : '',
        percent: data.percent,
      }))
    })

    const unsubDownloaded = window.electronAPI.on('update:downloaded', (info) => {
      const data = info as { version: string }
      setState({ phase: 'ready', version: data.version })
      setDismissed(false)
    })

    return () => {
      unsubAvailable()
      unsubProgress()
      unsubDownloaded()
    }
  }, [])

  const handleDownload = async (): Promise<void> => {
    setState((prev) =>
      prev.phase === 'available'
        ? { phase: 'downloading', version: prev.version, percent: 0 }
        : prev
    )
    try {
      await window.electronAPI.invoke('update:download')
    } catch {
      // silencioso
    }
  }

  const handleInstall = (): void => {
    window.electronAPI.send('update:install')
  }

  if (dismissed || state.phase === 'idle') return null

  const isDownloading = state.phase === 'downloading'
  const isReady = state.phase === 'ready'

  return (
    <div className="shrink-0 border-b border-chr-subtle bg-surface">
      {/* Barra de progresso colada no topo — visível só enquanto baixa */}
      {isDownloading && (
        <div className="h-0.5 w-full bg-chr-subtle overflow-hidden">
          <div
            className="h-full bg-chr-primary transition-all duration-300 ease-out"
            style={{ width: `${state.percent}%` }}
          />
        </div>
      )}

      <div className="px-6 py-2.5 flex items-center gap-4">

        {/* Ícone de estado */}
        <div className="shrink-0">
          {isReady ? (
            <CheckCircle2 size={13} className="text-timeline-chronicle" strokeWidth={1.5} />
          ) : isDownloading ? (
            <Loader2 size={13} className="text-chr-muted animate-spin" strokeWidth={1.5} />
          ) : (
            <Download size={13} className="text-chr-muted" strokeWidth={1.5} />
          )}
        </div>

        {/* Texto + barra de progresso inline */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-chr-secondary">
              {state.phase === 'available' && (
                <>
                  Nova versão disponível:{' '}
                  <span className="text-chr-primary font-medium">v{state.version}</span>
                </>
              )}
              {state.phase === 'downloading' && (
                <>
                  Baixando{' '}
                  <span className="text-chr-primary font-medium">v{state.version}</span>
                </>
              )}
              {isReady && (
                <>
                  <span className="text-chr-primary font-medium">v{state.version}</span>
                  {' '}pronta para instalar
                </>
              )}
            </span>

            {/* Barra inline com percentual — só durante download */}
            {isDownloading && (
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-1 w-32 bg-chr-subtle rounded-full overflow-hidden shrink-0">
                  <div
                    className="h-full bg-chr-primary rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${state.percent}%` }}
                  />
                </div>
                <span className="font-mono text-2xs text-chr-muted tabular-nums shrink-0">
                  {state.percent}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-3 shrink-0">
          {state.phase === 'available' && (
            <button
              onClick={handleDownload}
              className="font-mono text-xs text-chr-primary border border-chr-subtle px-2.5 py-0.5 rounded-sm hover:bg-active transition-colors duration-100"
            >
              Baixar
            </button>
          )}
          {isReady && (
            <button
              onClick={handleInstall}
              className="font-mono text-xs text-chr-primary border border-chr-strong px-2.5 py-0.5 rounded-sm hover:bg-active transition-colors duration-100"
            >
              Reiniciar e instalar
            </button>
          )}
          {!isDownloading && (
            <button
              onClick={() => setDismissed(true)}
              className="text-chr-muted hover:text-chr-primary transition-colors duration-100"
              aria-label="Dispensar"
            >
              <X size={13} strokeWidth={1.5} />
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
