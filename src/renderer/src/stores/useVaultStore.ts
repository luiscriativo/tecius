import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { VaultInfo } from '../types/chronicler'

/** Quantos vaults ficam na lista de recentes */
const MAX_RECENT = 8

interface VaultState {
  vaultPath: string | null
  vaultInfo: VaultInfo | null
  isLoading: boolean
  error: string | null
  /** Vaults abertos antes (o atual primeiro), para trocar sem o seletor de pasta */
  recentVaults: string[]

  setVaultPath: (path: string) => void
  setVaultInfo: (info: VaultInfo) => void
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
  clearVault: () => void
  addRecent: (path: string) => void
  removeRecent: (path: string) => void
}

export const useVaultStore = create<VaultState>()(
  persist(
    (set) => ({
      vaultPath: null,
      vaultInfo: null,
      isLoading: false,
      error: null,
      recentVaults: [],
      setVaultPath: (path) => set({ vaultPath: path }),
      setVaultInfo: (info) => set({ vaultInfo: info }),
      setLoading: (v) => set({ isLoading: v }),
      setError: (e) => set({ error: e }),
      clearVault: () => set({ vaultPath: null, vaultInfo: null, error: null }),
      addRecent: (path) => set((s) => ({ recentVaults: [path, ...s.recentVaults.filter((p) => p !== path)].slice(0, MAX_RECENT) })),
      removeRecent: (path) => set((s) => ({ recentVaults: s.recentVaults.filter((p) => p !== path) })),
    }),
    {
      name: 'tecius-vault',
      partialize: (s) => ({ vaultPath: s.vaultPath, recentVaults: s.recentVaults }), // caminho e recentes
    }
  )
)
