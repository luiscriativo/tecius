import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { VaultInfo } from '../types/chronicler'

interface VaultState {
  vaultPath: string | null
  vaultInfo: VaultInfo | null
  isLoading: boolean
  error: string | null

  setVaultPath: (path: string) => void
  setVaultInfo: (info: VaultInfo) => void
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
  clearVault: () => void
}

export const useVaultStore = create<VaultState>()(
  persist(
    (set) => ({
      vaultPath: null,
      vaultInfo: null,
      isLoading: false,
      error: null,
      setVaultPath: (path) => set({ vaultPath: path }),
      setVaultInfo: (info) => set({ vaultInfo: info }),
      setLoading: (v) => set({ isLoading: v }),
      setError: (e) => set({ error: e }),
      clearVault: () => set({ vaultPath: null, vaultInfo: null, error: null }),
    }),
    {
      name: 'tecius-vault',
      partialize: (s) => ({ vaultPath: s.vaultPath }), // so persiste o caminho
    }
  )
)
