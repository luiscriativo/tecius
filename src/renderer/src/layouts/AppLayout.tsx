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
import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { NotificationStack } from '@/components/NotificationStack'
import { UpdateBanner } from '@/components/UpdateBanner'
import { useVaultStore } from '@/stores/useVaultStore'
import VaultSetup from '@/pages/VaultSetup'
import { SearchDialog } from '@/components/SearchDialog'

/** Evento global para abrir a busca (botão da barra lateral) */
export const OPEN_SEARCH_EVENT = 'tecius:open-search'

export function AppLayout(): React.ReactElement {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const hasVault = Boolean(vaultPath)

  // Busca global: Ctrl/Cmd+K em qualquer tela, ou o botão "Buscar" da barra lateral
  const [searchOpen, setSearchOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && hasVault) { e.preventDefault(); setSearchOpen(true) }
    }
    const onOpen = () => setSearchOpen(true)
    // Soltar um arquivo fora de uma área preparada não pode abrir o arquivo no
    // lugar do app (o Electron navegaria para file://...)
    const block = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault() }
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey); window.removeEventListener(OPEN_SEARCH_EVENT, onOpen)
      window.removeEventListener('dragover', block); window.removeEventListener('drop', block)
    }
  }, [hasVault])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-vault text-chr-primary">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      {hasVault && <Sidebar />}

      {/* ── Area principal ───────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Banner de atualização — visível apenas quando há update disponível */}
        <UpdateBanner />

        {/* macOS sem sidebar: faixa para arrastar a janela (escondida nas outras plataformas) */}
        {!hasVault && <div className="app-titlebar mac-only h-10 shrink-0" />}

        {hasVault ? <Outlet /> : <VaultSetup />}
      </main>

      {/* ── Notification stack (overlay global) ─────────────────────────── */}
      <NotificationStack />
      {hasVault && <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />}
    </div>
  )
}
