/**
 * AppLayout
 *
 * Shell principal da aplicacao: Sidebar + Header + Content.
 * Todas as paginas principais renderizam dentro deste layout via <Outlet />.
 *
 * Quando um vault esta carregado:
 *   - O <Outlet /> renderiza a pagina solicitada normalmente
 *
 * Quando nenhum vault esta configurado:
 *   - O conteudo principal exibe VaultSetup no lugar do <Outlet />
 */

import React from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { NotificationStack } from '@/components/NotificationStack'
import { UpdateBanner } from '@/components/UpdateBanner'
import { useVaultStore } from '@/stores/useVaultStore'
import VaultSetup from '@/pages/VaultSetup'

export function AppLayout(): React.ReactElement {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const hasVault = Boolean(vaultPath)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-vault text-chr-primary">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      {hasVault && <Sidebar />}

      {/* ── Area principal ───────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Banner de atualização — visível apenas quando há update disponível */}
        <UpdateBanner />

        {hasVault ? <Outlet /> : <VaultSetup />}
      </main>

      {/* ── Notification stack (overlay global) ─────────────────────────── */}
      <NotificationStack />
    </div>
  )
}
