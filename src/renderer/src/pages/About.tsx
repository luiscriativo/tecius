/**
 * About Page
 *
 * Exibe informações sobre o aplicativo Tecius:
 * - Versão atual (carregada via IPC app:get-version)
 * - Links para GitHub e releases
 * - Créditos e licença
 * - Stack técnica (colapsável)
 */

import React, { useEffect, useState } from 'react'
import { Github, ExternalLink, ChevronDown, ChevronUp, Heart } from 'lucide-react'
import { useAppStore } from '../stores/useAppStore'

// ── helpers ───────────────────────────────────────────────────────────────────

function platformLabel(p: string): string {
  if (p === 'win32') return 'Windows'
  if (p === 'darwin') return 'macOS'
  if (p === 'linux') return 'Linux'
  return p
}

// ── sub-components ────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between py-2 border-b border-chr-subtle last:border-0">
      <span className="font-mono text-xs text-chr-muted">{label}</span>
      <span className="font-mono text-xs text-chr-secondary tabular-nums">{value}</span>
    </div>
  )
}

function LinkButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-sm border border-chr-subtle text-chr-secondary font-mono text-xs hover:border-chr hover:text-chr-primary transition-colors duration-150"
    >
      <Icon size={13} strokeWidth={1.5} />
      {label}
    </button>
  )
}

// ── AboutPage ─────────────────────────────────────────────────────────────────

export function AboutPage(): React.ReactElement {
  const appVersion = useAppStore((s) => s.appVersion)
  const [platform, setPlatform] = useState<string>('…')
  const [nodeVersion, setNodeVersion] = useState<string>('…')
  const [electronVersion, setElectronVersion] = useState<string>('…')
  const [showStack, setShowStack] = useState(false)

  useEffect(() => {
    // Plataforma do sistema operacional
    window.electronAPI
      .invoke<string>('app:get-platform')
      .then((p) => setPlatform(p ? platformLabel(p) : '—'))
      .catch(() => setPlatform('—'))

    // Versões do runtime (disponíveis via preload)
    const versions = window.electronAPI?.versions
    if (versions) {
      setNodeVersion(versions.node ?? '—')
      setElectronVersion(versions.electron ?? '—')
    }
  }, [])

  function openExternal(url: string): void {
    window.electronAPI.invoke('app:open-external', url)
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-vault">
      <div className="px-8 py-10 max-w-xl mx-auto w-full space-y-8">

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center text-center gap-4">
          {/* Ícone */}
          <div className="w-14 h-14 rounded-xl bg-surface border border-chr-subtle flex items-center justify-center shrink-0">
            <span className="font-serif text-2xl text-chr-primary select-none">T</span>
          </div>

          {/* Nome e tagline */}
          <div>
            <h1 className="font-serif text-2xl text-chr-primary leading-none">Tecius</h1>
            <p className="font-mono text-xs text-chr-muted mt-2 leading-relaxed max-w-sm">
              Sistema pessoal de timelines visuais.<br />
              Seus eventos, seus arquivos, seu controle.
            </p>
          </div>

          {/* Badge de versão */}
          <span className="font-mono text-xs text-chr-secondary border border-chr-subtle px-3 py-1 rounded-full">
            {appVersion ? `v${appVersion}` : '…'} · {platform}
          </span>
        </div>

        {/* ── Links ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap justify-center gap-2">
          <LinkButton
            icon={Github}
            label="Código-fonte"
            onClick={() => openExternal('https://github.com/luiscriativo/tecius')}
          />
          <LinkButton
            icon={ExternalLink}
            label="Releases"
            onClick={() => openExternal('https://github.com/luiscriativo/tecius/releases')}
          />
          <LinkButton
            icon={ExternalLink}
            label="Reportar bug"
            onClick={() => openExternal('https://github.com/luiscriativo/tecius/issues')}
          />
        </div>

        {/* ── Créditos ──────────────────────────────────────────────────────── */}
        <div className="chr-card px-5 py-4 text-center space-y-1">
          <p className="font-mono text-xs text-chr-muted flex items-center justify-center gap-1.5">
            Feito com <Heart size={11} className="text-chr-muted fill-chr-muted" /> por
            <button
              onClick={() => openExternal('https://github.com/luiscriativo')}
              className="text-chr-secondary hover:text-chr-primary transition-colors duration-150 underline underline-offset-2"
            >
              luiscriativo
            </button>
          </p>
          <p className="font-mono text-2xs text-chr-muted">
            Licença MIT · Open Source · Gratuito para sempre
          </p>
        </div>

        {/* ── Stack técnica (colapsável) ────────────────────────────────────── */}
        <div className="chr-card overflow-hidden">
          <button
            onClick={() => setShowStack((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-active transition-colors duration-100"
          >
            <span className="font-mono text-xs text-chr-secondary">Informações técnicas</span>
            {showStack
              ? <ChevronUp size={13} strokeWidth={1.5} className="text-chr-muted" />
              : <ChevronDown size={13} strokeWidth={1.5} className="text-chr-muted" />
            }
          </button>

          {showStack && (
            <div className="px-5 pb-3 border-t border-chr-subtle">
              <div className="pt-2 space-y-0">
                <p className="font-mono text-2xs text-chr-muted py-2 border-b border-chr-subtle">Runtime</p>
                <InfoRow label="Electron" value={electronVersion} />
                <InfoRow label="Node.js"  value={nodeVersion} />
                <InfoRow label="Chrome"   value={window.electronAPI?.versions?.chrome ?? '—'} />
                <p className="font-mono text-2xs text-chr-muted py-2 border-b border-chr-subtle mt-1">Interface</p>
                <InfoRow label="React"        value="18.x" />
                <InfoRow label="TypeScript"   value="5.x"  />
                <InfoRow label="Tailwind CSS" value="3.x"  />
                <InfoRow label="Zustand"      value="5.x"  />
                <InfoRow label="Vite"         value="6.x"  />
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
