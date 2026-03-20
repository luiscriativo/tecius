import { useCallback } from 'react'
import { useVaultStore } from '../stores/useVaultStore'
import { useNavigationStore } from '../stores/useNavigationStore'
import type { RawVault, RawTrashItem } from '../types/ipc'
import type { VaultInfo, TimelineRef, TrashItem } from '../types/chronicler'

// Converte RawVault (do main) em VaultInfo (tipado do renderer)
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

function toTrashItem(raw: RawTrashItem): TrashItem {
  return {
    name: raw.name,
    originalPath: raw.originalPath,
    trashedAt: raw.trashedAt,
    dirPath: raw.dirPath,
    eventCount: raw.eventCount,
  }
}

export function useVault() {
  const { vaultPath, vaultInfo, isLoading, error, setVaultPath, setVaultInfo, setLoading, setError, clearVault } =
    useVaultStore()
  const resetNav = useNavigationStore((s) => s.reset)

  const pickAndLoadVault = useCallback(async () => {
    const pickedPath = await window.electronAPI.invoke<string | null>('fs:pick-vault-folder')
    if (!pickedPath) return

    setLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.invoke<{ success: boolean; data?: RawVault; error?: string }>(
        'fs:set-vault',
        pickedPath
      )
      if (!result.success || !result.data) throw new Error(result.error ?? 'Erro ao ler vault')
      setVaultPath(pickedPath)
      setVaultInfo(toVaultInfo(result.data, pickedPath))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [setVaultPath, setVaultInfo, setLoading, setError])

  const reloadVault = useCallback(async () => {
    if (!vaultPath) return
    setLoading(true)
    try {
      const result = await window.electronAPI.invoke<{ success: boolean; data?: RawVault; error?: string }>(
        'fs:set-vault',
        vaultPath
      )
      if (result.success && result.data) {
        setVaultInfo(toVaultInfo(result.data, vaultPath))
      }
    } finally {
      setLoading(false)
    }
  }, [vaultPath, setVaultInfo, setLoading])

  // Suprime aviso de resetNav nao utilizado — sera usado em versoes futuras
  void resetNav

  const createTimeline = useCallback(async (name: string): Promise<boolean> => {
    if (!vaultPath) return false
    const result = await window.electronAPI.invoke<{ success: boolean; error?: string }>(
      'fs:create-timeline', name, vaultPath
    )
    if (result.success) await reloadVault()
    return result.success
  }, [vaultPath, reloadVault])

  const renameTimeline = useCallback(async (dirPath: string, newTitle: string): Promise<boolean> => {
    const result = await window.electronAPI.invoke<{ success: boolean; error?: string }>(
      'fs:rename-timeline', dirPath, newTitle
    )
    if (result.success) await reloadVault()
    return result.success
  }, [reloadVault])

  const renameVault = useCallback(async (newTitle: string): Promise<boolean> => {
    const result = await window.electronAPI.invoke<{ success: boolean; error?: string }>(
      'fs:rename-vault', newTitle
    )
    if (result.success) await reloadVault()
    return result.success
  }, [reloadVault])

  const trashTimeline = useCallback(async (dirPath: string): Promise<boolean> => {
    const result = await window.electronAPI.invoke<{ success: boolean; error?: string }>(
      'fs:trash-timeline', dirPath
    )
    if (result.success) await reloadVault()
    return result.success
  }, [reloadVault])

  const listTrash = useCallback(async (): Promise<TrashItem[]> => {
    const result = await window.electronAPI.invoke<{ success: boolean; data?: RawTrashItem[]; error?: string }>(
      'fs:list-trash'
    )
    if (result.success && result.data) return result.data.map(toTrashItem)
    return []
  }, [])

  const restoreFromTrash = useCallback(async (dirPath: string): Promise<boolean> => {
    const result = await window.electronAPI.invoke<{ success: boolean; error?: string }>(
      'fs:restore-from-trash', dirPath
    )
    if (result.success) await reloadVault()
    return result.success
  }, [reloadVault])

  const deleteFromTrash = useCallback(async (dirPath: string): Promise<boolean> => {
    const result = await window.electronAPI.invoke<{ success: boolean; error?: string }>(
      'fs:delete-from-trash', dirPath
    )
    if (result.success) await reloadVault()
    return result.success
  }, [reloadVault])

  const emptyTrash = useCallback(async (): Promise<boolean> => {
    const result = await window.electronAPI.invoke<{ success: boolean; error?: string }>(
      'fs:empty-trash'
    )
    if (result.success) await reloadVault()
    return result.success
  }, [reloadVault])

  const deleteTimeline = useCallback(async (dirPath: string): Promise<boolean> => {
    const result = await window.electronAPI.invoke<{ success: boolean; error?: string }>(
      'fs:delete-timeline', dirPath
    )
    if (result.success) await reloadVault()
    return result.success
  }, [reloadVault])

  return {
    vaultPath, vaultInfo, isLoading, error,
    pickAndLoadVault, reloadVault, clearVault,
    renameVault,
    createTimeline, renameTimeline, trashTimeline, deleteTimeline,
    listTrash, restoreFromTrash, deleteFromTrash, emptyTrash,
  }
}
