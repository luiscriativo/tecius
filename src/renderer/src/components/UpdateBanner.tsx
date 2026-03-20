/**
 * UpdateBanner
 *
 * Banner não intrusivo exibido no topo da aplicação quando:
 * - Uma nova versão está disponível para download   → estado "available"
 * - O download foi concluído e aguarda reinicialização → estado "ready"
 *
 * O banner desaparece ao ser dispensado ou após a instalação.
 */

import { useEffect, useState } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'available'; version: string }
  | { phase: 'downloading' }
  | { phase: 'ready'; version: string }

export function UpdateBanner(): React.ReactElement | null {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Nova versão detectada no servidor
    const unsubAvailable = window.electronAPI.on('update:available', (info) => {
      const data = info as { version: string }
      setState({ phase: 'available', version: data.version })
      setDismissed(false)
    })

    // Download concluído, pronto para instalar
    const unsubDownloaded = window.electronAPI.on('update:downloaded', (info) => {
      const data = info as { version: string }
      setState({ phase: 'ready', version: data.version })
      setDismissed(false)
    })

    return () => {
      unsubAvailable()
      unsubDownloaded()
    }
  }, [])

  const handleDownload = async (): Promise<void> => {
    setState({ phase: 'downloading' })
    // electron-updater baixa automaticamente quando autoDownload: false
    // e o main process faz autoUpdater.downloadUpdate() implicitamente
    // ao receber o sinal. Aqui apenas atualizamos o visual.
    try {
      await window.electronAPI.invoke('update:check')
    } catch {
      // silencioso
    }
  }

  const handleInstall = (): void => {
    window.electronAPI.send('update:install')
  }

  if (dismissed || state.phase === 'idle') return null

  return (
    <div className="shrink-0 border-b border-chr-subtle bg-surface px-6 py-2 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2.5">
        {state.phase === 'downloading' ? (
          <RefreshCw size={13} className="text-chr-muted animate-spin" strokeWidth={1.5} />
        ) : (
          <Download size={13} className="text-chr-muted" strokeWidth={1.5} />
        )}

        <span className="font-mono text-xs text-chr-secondary">
          {state.phase === 'available' && (
            <>
              Nova versão disponível:{' '}
              <span className="text-chr-primary font-medium">v{state.version}</span>
            </>
          )}
          {state.phase === 'downloading' && (
            <>Baixando atualização…</>
          )}
          {state.phase === 'ready' && (
            <>
              <span className="text-chr-primary font-medium">v{state.version}</span>{' '}
              pronta para instalar
            </>
          )}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {state.phase === 'available' && (
          <button
            onClick={handleDownload}
            className="font-mono text-xs text-chr-primary border border-chr-subtle px-2.5 py-0.5 rounded-sm hover:bg-active transition-colors duration-100"
          >
            Baixar
          </button>
        )}
        {state.phase === 'ready' && (
          <button
            onClick={handleInstall}
            className="font-mono text-xs text-chr-primary border border-chr-strong px-2.5 py-0.5 rounded-sm hover:bg-active transition-colors duration-100"
          >
            Reiniciar e instalar
          </button>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="text-chr-muted hover:text-chr-primary transition-colors duration-100"
          aria-label="Dispensar"
        >
          <X size={13} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
