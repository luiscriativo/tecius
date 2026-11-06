import { useCallback } from 'react'
import { useVaultStore } from '../stores/useVaultStore'
import { useNavigationStore } from '../stores/useNavigationStore'
import { useTimelineStore } from '../stores/useTimelineStore'
import { useAppStore } from '../stores/useAppStore'
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
    title: raw.title || '',
    timelines,
    totalEvents: raw.totalEvents,
    trashCount: raw.trashCount ?? 0,
    style: raw.style,
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
  const { vaultPath, vaultInfo, isLoading, error, recentVaults, setVaultPath, setVaultInfo, setLoading, setError, clearVault, addRecent, removeRecent } =
    useVaultStore()
  const resetNav = useNavigationStore((s) => s.reset)

  /**
   * Abre um vault pelo caminho (lista de recentes). Fecha o que estava aberto:
   * timeline, seleção e caminho de navegação voltam ao zero.
   */
  const switchVault = useCallback(async (path: string): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.invoke<{ success: boolean; data?: RawVault; error?: string }>('fs:set-vault', path)
      if (!result.success || !result.data) {
        setError(result.error ?? 'Erro ao ler vault')
        return false
      }
      const tl = useTimelineStore.getState()
      tl.setCurrentTimeline(null)
      tl.clearSelection()
      tl.setMapRelations(null)
      useNavigationStore.getState().reset({ title: '', dirPath: '' })
      setVaultPath(path)
      setVaultInfo(toVaultInfo(result.data, path))
      addRecent(path)
      return true
    } catch (e) {
      setError(String(e))
      return false
    } finally {
      setLoading(false)
    }
  }, [setVaultPath, setVaultInfo, setLoading, setError, addRecent])

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

      // Seed an empty vault with a Welcome timeline and event (no idioma do app)
      if (result.data.timelines.length === 0) {
        const en = useAppStore.getState().language === 'en'
        const timelineName = en ? 'Getting Started' : 'Primeiros passos'
        await window.electronAPI.invoke('fs:create-timeline', timelineName, pickedPath)

        // Read the vault again to get the actual timeline dirPath (slug-based)
        const afterTimeline = await window.electronAPI.invoke<{ success: boolean; data?: RawVault }>(
          'fs:set-vault', pickedPath
        )
        const timelineDirPath = afterTimeline.data?.timelines[0]?.dirPath
        if (timelineDirPath) {
          const today = new Date().toISOString().split('T')[0]
          const welcomeTitle = en ? 'Welcome to Tecius' : 'Bem-vindo ao Tecius'
          const created = await window.electronAPI.invoke<{ success: boolean; data?: { filePath: string } }>(
            'fs:create-event', timelineDirPath, welcomeTitle, `${today}_welcome`
          )
          if (created.success && created.data?.filePath) {
            const welcomeBody = [
              '---',
              'type: event',
              `title: "${welcomeTitle}"`,
              `date: ${today}`,
              'importance: 4',
              '---',
              '',
              ...(en ? [
                'Welcome to **Tecius** — your personal visual timeline system.',
                '',
                'This is your first event. Every event is a plain Markdown file stored inside your vault folder.',
                '',
                '## Getting Started',
                '',
                '- **Timelines** are subfolders with a `_timeline.md` file',
                '- **Events** are `.md` files with a `date:` field in the front matter',
                '- **Chronicles** are single files that hold multiple events — great for biographies or project logs',
                '',
                'Use the canvas to zoom, pan, and explore. Click any dot to open its event panel.',
                '',
                '> Your vault is just a folder. Edit, move, or back up your files with any tool.',
              ] : [
                'Bem-vindo ao **Tecius** — seu sistema pessoal de timelines visuais.',
                '',
                'Este é o seu primeiro evento. Cada evento é um arquivo Markdown comum guardado na pasta do seu vault.',
                '',
                '## Primeiros passos',
                '',
                '- **Timelines** são subpastas com um arquivo `_timeline.md`',
                '- **Eventos** são arquivos `.md` com um campo `date:` no cabeçalho',
                '- **Chronicles** são arquivos únicos com vários eventos — ótimos para biografias ou diários de projeto',
                '',
                'Use o canvas para dar zoom, mover e explorar. Clique em qualquer ponto para abrir o evento.',
                '',
                '> Seu vault é só uma pasta. Edite, mova ou faça backup dos arquivos com qualquer ferramenta.',
              ]),
            ].join('\n')
            await window.electronAPI.invoke('fs:write-event', created.data.filePath, welcomeBody)
          }
        }

        // Final reload to reflect the seeded content
        const seeded = await window.electronAPI.invoke<{ success: boolean; data?: RawVault }>(
          'fs:set-vault', pickedPath
        )
        if (seeded.success && seeded.data) {
          setVaultPath(pickedPath)
          setVaultInfo(toVaultInfo(seeded.data, pickedPath))
          addRecent(pickedPath)
          return
        }
      }

      setVaultPath(pickedPath)
      setVaultInfo(toVaultInfo(result.data, pickedPath))
      addRecent(pickedPath)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [setVaultPath, setVaultInfo, setLoading, setError, addRecent])

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
        setError(null)
      } else {
        // A pasta pode ter sumido (drive desconectado): a tela inicial mostra o motivo
        setError(result.error ?? 'Erro ao ler vault')
      }
    } finally {
      setLoading(false)
    }
  }, [vaultPath, setVaultInfo, setLoading, setError])

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
    // A timeline em cache ficaria com título/conteúdo antigos
    if (result.success) useTimelineStore.getState().deleteCached(dirPath)
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

  /** Envia para a lixeira; `trashPath` permite desfazer */
  const trashTimeline = useCallback(async (dirPath: string): Promise<{ success: boolean; trashPath?: string }> => {
    const result = await window.electronAPI.invoke<{ success: boolean; data?: { trashPath: string }; error?: string }>(
      'fs:trash-timeline', dirPath
    )
    // A timeline em cache ficaria com título/conteúdo antigos
    if (result.success) useTimelineStore.getState().deleteCached(dirPath)
    if (result.success) await reloadVault()
    return { success: result.success, trashPath: result.data?.trashPath }
  }, [reloadVault])

  const listTrash = useCallback(async (): Promise<TrashItem[]> => {
    const result = await window.electronAPI.invoke<{ success: boolean; data?: RawTrashItem[]; error?: string }>(
      'fs:list-trash'
    )
    if (result.success && result.data) return result.data.map(toTrashItem)
    return []
  }, [])

  const restoreFromTrash = useCallback(async (dirPath: string): Promise<{ success: boolean; error?: string }> => {
    const result = await window.electronAPI.invoke<{ success: boolean; error?: string }>(
      'fs:restore-from-trash', dirPath
    )
    if (result.success) await reloadVault()
    return result
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
    // A timeline em cache ficaria com título/conteúdo antigos
    if (result.success) useTimelineStore.getState().deleteCached(dirPath)
    if (result.success) await reloadVault()
    return result.success
  }, [reloadVault])

  return {
    vaultPath, vaultInfo, isLoading, error,
    pickAndLoadVault, reloadVault, clearVault,
    recentVaults, switchVault, removeRecent,
    renameVault,
    createTimeline, renameTimeline, trashTimeline, deleteTimeline,
    listTrash, restoreFromTrash, deleteFromTrash, emptyTrash,
  }
}
