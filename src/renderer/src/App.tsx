/**
 * Tecius — App Component
 *
 * Root component que configura:
 * - React Router com MemoryRouter (obrigatorio para Electron file:// protocol)
 * - Rotas da aplicacao mapeadas para paginas
 * - Inicializacao de tema e vault ao montar
 *
 * Rotas:
 *   /            — Home
 *   /timeline    — TimelineView (visualizacao de timeline ativa)
 *   /event       — EventView (evento em tela cheia)
 *   /settings    — Configuracoes
 *   /about       — Sobre
 */

import React, { useEffect } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { HomePage } from '@/pages/Home'
import { SettingsPage } from '@/pages/Settings'
import { AboutPage } from '@/pages/About'
import { NotFoundPage } from '@/pages/NotFound'
import TimelineView from '@/pages/TimelineView'
import EventView from '@/pages/EventView'
import AssetManager from '@/pages/AssetManager'
import TrashView from '@/pages/TrashView'
import { useTheme } from '@/hooks/useTheme'
import { useVaultStore } from '@/stores/useVaultStore'
import type { RawVault } from '@/types/ipc'
import type { VaultInfo, TimelineRef } from '@/types/chronicler'

// Converte RawVault em VaultInfo (duplicado aqui para evitar dep circular com useVault)
function toVaultInfo(raw: RawVault, vaultPath: string): VaultInfo {
  const timelines: TimelineRef[] = raw.timelines.map((t) => ({
    title: t.title,
    dirPath: t.dirPath,
    relativePath: t.relativePath,
    icon: t.icon,
    eventCount: t.eventCount,
  }))
  return {
    rootPath: vaultPath,
    title: raw.title || 'Meu Vault',
    timelines,
    totalEvents: raw.totalEvents,
    trashCount: raw.trashCount ?? 0,
  }
}

// ── ThemeProvider ─────────────────────────────────────────────────────────────
function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    setTheme(theme)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>
}

// ── VaultBootstrapper ─────────────────────────────────────────────────────────
// Se ja existe um vaultPath persistido, restaura o vault ao iniciar o app.
function VaultBootstrapper({ children }: { children: React.ReactNode }): React.ReactElement {
  const { vaultPath, setVaultInfo, setLoading, setError } = useVaultStore()

  useEffect(() => {
    if (!vaultPath) return

    setLoading(true)
    window.electronAPI
      .invoke<{ success: boolean; data?: RawVault; error?: string }>('fs:set-vault', vaultPath)
      .then((result) => {
        if (result.success && result.data) {
          setVaultInfo(toVaultInfo(result.data, vaultPath))
        } else {
          setError(result.error ?? 'Erro ao restaurar vault')
        }
      })
      .catch((e: unknown) => {
        setError(String(e))
      })
      .finally(() => {
        setLoading(false)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>
}

// ── Router (data router — necessário para useBlocker no EventView) ────────────
// createMemoryRouter funciona em Electron (file://) como MemoryRouter, mas é
// um "data router" que habilita useBlocker para guardar alterações não salvas.
const router = createMemoryRouter(
  [
    {
      path: '/',
      element: <AppLayout />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'timeline', element: <TimelineView /> },
        { path: 'event', element: <EventView /> },
        { path: 'assets', element: <AssetManager /> },
        { path: 'trash', element: <TrashView /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: 'about', element: <AboutPage /> },
      ],
    },
    { path: '*', element: <NotFoundPage /> },
  ],
  { initialEntries: ['/'] }
)

// ── App ───────────────────────────────────────────────────────────────────────

export default function App(): React.ReactElement {
  // ThemeProvider e VaultBootstrapper não usam hooks de rota — ficam fora do
  // RouterProvider mas seus contextos ainda fluem para os filhos da árvore React.
  return (
    <ThemeProvider>
      <VaultBootstrapper>
        <RouterProvider router={router} />
      </VaultBootstrapper>
    </ThemeProvider>
  )
}
