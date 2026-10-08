import { create } from 'zustand'
import type { VaultEventDoc } from '@/utils/wikiLinks'
import { useVaultStore } from '@/stores/useVaultStore'

/**
 * Todos os eventos do vault (título, data, timeline), para as ligações [[…]]:
 * sugestões ao digitar e resolução dos links na leitura. Vem do mesmo índice da
 * busca global. Quando algo muda (salvar, criar, renomear, apagar) ele só é
 * marcado como desatualizado e recarrega na próxima vez que for usado — o
 * salvamento automático não relê o vault a cada tecla.
 */
interface EventIndexState {
  docs: VaultEventDoc[] | null
  vaultPath: string | null
  loading: Promise<void> | null
  stale: boolean
  /** Recarrega (ou carrega pela primeira vez) o índice do vault atual */
  refresh: (vaultPath: string) => Promise<void>
  /** Algo mudou nos eventos: recarrega na próxima vez que o índice for usado */
  markStale: () => void
}

export const useEventIndexStore = create<EventIndexState>()((set) => ({
  docs: null,
  vaultPath: null,
  loading: null,
  stale: false,
  markStale: () => set({ stale: true }),
  refresh: (vaultPath) => {
    const p = (async () => {
      try {
        const r = await window.electronAPI.invoke<{ success: boolean; data?: VaultEventDoc[] }>('fs:search-index')
        if (r.success && r.data) set({ docs: r.data, vaultPath, stale: false })
      } finally {
        set({ loading: null })
      }
    })()
    set({ loading: p })
    return p
  },
}))

/** Índice do vault atual; carrega na primeira vez (ou se o vault mudou) */
export function ensureEventIndex(vaultPath: string | null): void {
  if (!vaultPath) return
  const s = useEventIndexStore.getState()
  if ((s.vaultPath !== vaultPath || !s.docs || s.stale) && !s.loading) void s.refresh(vaultPath)
}

// Eventos criados, apagados ou renomeados recarregam o vault: o índice fica desatualizado
useVaultStore.subscribe((state, prev) => {
  if (state.vaultInfo !== prev.vaultInfo) useEventIndexStore.getState().markStale()
})
