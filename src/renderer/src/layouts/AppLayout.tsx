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
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { NotificationStack } from '@/components/NotificationStack'
import { UpdateBanner } from '@/components/UpdateBanner'
import { useVaultStore } from '@/stores/useVaultStore'
import { useTimelineStore } from '@/stores/useTimelineStore'
import VaultSetup from '@/pages/VaultSetup'
import { SearchDialog } from '@/components/SearchDialog'

/** Evento global para abrir a busca (botão da barra lateral) */
export const OPEN_SEARCH_EVENT = 'tecius:open-search'
/** Ctrl+N (ou paleta): a TimelineView abre o modal de novo evento */
export const NEW_EVENT_EVENT = 'tecius:new-event'
/** Ctrl+E: a EventView alterna entre ler e editar */
export const TOGGLE_EDIT_EVENT = 'tecius:toggle-edit'

/** Há um campo de texto com foco? (atalhos de letra não devem roubar a digitação) */
const typing = (): boolean => {
  const el = document.activeElement as HTMLElement | null
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)
}

export function AppLayout(): React.ReactElement {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const hasVault = Boolean(vaultPath)
  const navigate = useNavigate()
  const location = useLocation()

  // Busca global: Ctrl/Cmd+K em qualquer tela, ou o botão "Buscar" da barra lateral
  const [searchOpen, setSearchOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'k' && hasVault) { e.preventDefault(); setSearchOpen(true); return }
      if (!mod || e.shiftKey || e.altKey || !hasVault) return
      // Ctrl+N: novo evento na timeline aberta (de qualquer tela)
      if (key === 'n') {
        const tl = useTimelineStore.getState().currentTimeline
        if (!tl) return
        e.preventDefault()
        if (location.pathname !== '/timeline') navigate('/timeline')
        setTimeout(() => window.dispatchEvent(new Event(NEW_EVENT_EVENT)), location.pathname === '/timeline' ? 0 : 80)
        return
      }
      // Ctrl+E: editar / voltar a ler o evento aberto (o editor usa Ctrl+E? não; mas não rouba a digitação em campos)
      if (key === 'e' && location.pathname === '/event' && !typing()) {
        e.preventDefault()
        window.dispatchEvent(new Event(TOGGLE_EDIT_EVENT))
      }
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
  }, [hasVault, location.pathname, navigate])

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
