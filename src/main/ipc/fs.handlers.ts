/**
 * FileSystem IPC Handlers
 *
 * Registra todos os handlers de IPC relacionados ao sistema de arquivos.
 * Chamados via window.electronAPI.invoke('fs:*') ou send('fs:*').
 */

import { ipcMain, dialog, shell } from 'electron'
import { fileSystemService } from '../services/FileSystemService'

export function registerFsHandlers(): void {
  // ── fs:pick-vault-folder ──────────────────────────────────────────────────
  // Abre dialog nativo para escolher pasta do vault
  ipcMain.handle('fs:pick-vault-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Escolher pasta do Vault',
      properties: ['openDirectory'],
      buttonLabel: 'Usar como Vault',
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  // ── fs:set-vault ──────────────────────────────────────────────────────────
  // Configura o caminho do vault e le a estrutura
  ipcMain.handle('fs:set-vault', async (_event, vaultPath: string) => {
    try {
      fileSystemService.setVaultPath(vaultPath)
      return { success: true, data: fileSystemService.readVault() }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── fs:read-vault ─────────────────────────────────────────────────────────
  // Le o vault atual (precisa ter sido configurado antes)
  ipcMain.handle('fs:read-vault', async () => {
    try {
      return { success: true, data: fileSystemService.readVault() }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── fs:read-timeline ──────────────────────────────────────────────────────
  // Le uma timeline especifica
  ipcMain.handle('fs:read-timeline', async (_event, timelinePath: string) => {
    try {
      fileSystemService.assertWithinVault(timelinePath)
      return { success: true, data: fileSystemService.readTimeline(timelinePath) }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── fs:read-event ─────────────────────────────────────────────────────────
  // Le um evento especifico
  ipcMain.handle('fs:read-event', async (_event, eventPath: string) => {
    try {
      fileSystemService.assertWithinVault(eventPath)
      return { success: true, data: fileSystemService.readEvent(eventPath) }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── fs:open-in-editor ─────────────────────────────────────────────────────
  // Abre o arquivo no editor externo padrao do sistema
  ipcMain.on('fs:open-in-editor', (_event, filePath: string) => {
    try {
      fileSystemService.assertWithinVault(filePath)
      shell.openPath(filePath)
    } catch (e) {
      console.error('fs:open-in-editor error:', e)
    }
  })

  // ── fs:write-event ────────────────────────────────────────────────────────
  // Salva o conteúdo bruto (raw) de um evento e retorna o novo body parseado
  ipcMain.handle('fs:write-event', async (_event, filePath: string, rawContent: string) => {
    try {
      fileSystemService.assertWithinVault(filePath)
      fileSystemService.writeEvent(filePath, rawContent)
      const updated = fileSystemService.readEvent(filePath)
      return { success: true, data: { body: updated.body } }
    } catch (e) {
      console.error('[fs:write-event] Erro ao salvar evento:', e)
      return { success: false, error: String(e) }
    }
  })

  // ── fs:save-image ─────────────────────────────────────────────────────────
  // Recebe dados binários de imagem (ArrayBuffer) e salva em _assets/
  ipcMain.handle('fs:save-image', async (_event, imageData: ArrayBuffer, filename: string, eventFilePath: string) => {
    try {
      const buffer = Buffer.from(imageData)
      const result = fileSystemService.saveImage(buffer, filename, eventFilePath)
      return { success: true, ...result }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── fs:pick-image ─────────────────────────────────────────────────────────
  // Abre dialog de arquivo para escolher imagem e copia para _assets/
  ipcMain.handle('fs:pick-image', async (_event, eventFilePath: string) => {
    try {
      fileSystemService.assertWithinVault(eventFilePath)
      const result = await dialog.showOpenDialog({
        title: 'Escolher imagem',
        properties: ['openFile'],
        filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
      })
      if (result.canceled || !result.filePaths[0]) return { success: false }
      const imageResult = fileSystemService.saveImageFromPath(result.filePaths[0], eventFilePath)
      return { success: true, ...imageResult }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── fs:list-assets ────────────────────────────────────────────────────────
  // Lista todas as imagens _assets/ no vault com metadados e status de órfão
  ipcMain.handle('fs:list-assets', async () => {
    try {
      return { success: true, data: fileSystemService.listAssets() }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── fs:delete-asset ───────────────────────────────────────────────────────
  // Deleta um arquivo de imagem do vault
  ipcMain.handle('fs:delete-asset', async (_event, filePath: string) => {
    try {
      fileSystemService.deleteAsset(filePath)
      return { success: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── fs:rename-asset ───────────────────────────────────────────────────────
  // Renomeia um arquivo de imagem; resolve conflitos com sufixo numérico
  ipcMain.handle('fs:rename-asset', async (_event, filePath: string, newName: string) => {
    try {
      const result = fileSystemService.renameAsset(filePath, newName)
      return { success: true, data: result }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── fs:create-timeline ────────────────────────────────────────────────────
  // Cria uma nova pasta de timeline com _timeline.md no vault
  ipcMain.handle('fs:create-timeline', async (_event, name: string, parentDir: string) => {
    try {
      fileSystemService.assertWithinVault(parentDir)
      fileSystemService.createTimeline(name, parentDir)
      return { success: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── fs:rename-timeline ────────────────────────────────────────────────────
  // Atualiza o título no _timeline.md (não renomeia a pasta)
  ipcMain.handle('fs:rename-timeline', async (_event, dirPath: string, newTitle: string) => {
    try {
      fileSystemService.assertWithinVault(dirPath)
      fileSystemService.renameTimeline(dirPath, newTitle)
      return { success: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── fs:rename-vault ───────────────────────────────────────────────────────
  // Atualiza o título do vault em _vault.md na raiz
  ipcMain.handle('fs:rename-vault', async (_event, newTitle: string) => {
    try {
      fileSystemService.renameVault(newTitle)
      return { success: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── fs:trash-timeline ─────────────────────────────────────────────────────
  // Move a pasta da timeline para a lixeira interna do vault (.trash/)
  ipcMain.handle('fs:trash-timeline', async (_event, dirPath: string) => {
    try {
      fileSystemService.assertWithinVault(dirPath)
      fileSystemService.moveTimelineToVaultTrash(dirPath)
      return { success: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── fs:list-trash ─────────────────────────────────────────────────────────
  // Lista itens na lixeira interna do vault
  ipcMain.handle('fs:list-trash', async () => {
    try {
      return { success: true, data: fileSystemService.listTrash() }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── fs:restore-from-trash ─────────────────────────────────────────────────
  // Restaura um item da lixeira para o local original
  ipcMain.handle('fs:restore-from-trash', async (_event, trashItemPath: string) => {
    try {
      fileSystemService.assertWithinVault(trashItemPath)
      fileSystemService.restoreFromTrash(trashItemPath)
      return { success: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── fs:delete-from-trash ──────────────────────────────────────────────────
  // Exclui permanentemente um item da lixeira
  ipcMain.handle('fs:delete-from-trash', async (_event, trashItemPath: string) => {
    try {
      fileSystemService.assertWithinVault(trashItemPath)
      fileSystemService.deleteFromTrash(trashItemPath)
      return { success: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── fs:empty-trash ────────────────────────────────────────────────────────
  // Esvazia toda a lixeira interna do vault
  ipcMain.handle('fs:empty-trash', async () => {
    try {
      fileSystemService.emptyTrash()
      return { success: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── fs:delete-timeline ────────────────────────────────────────────────────
  // Exclui permanentemente a pasta da timeline e todo o seu conteúdo
  ipcMain.handle('fs:delete-timeline', async (_event, dirPath: string) => {
    try {
      fileSystemService.assertWithinVault(dirPath)
      fileSystemService.deleteTimelinePermanently(dirPath)
      return { success: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── fs:create-event ───────────────────────────────────────────────────────
  // Cria um novo arquivo de evento .md numa timeline
  ipcMain.handle('fs:create-event', async (_event, timelineDirPath: string, title: string, filename?: string) => {
    try {
      fileSystemService.assertWithinVault(timelineDirPath)
      const result = fileSystemService.createEvent(timelineDirPath, title, filename)
      return { success: true, data: result }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── fs:delete-event ───────────────────────────────────────────────────────
  // Move um arquivo de evento para a lixeira interna do vault
  ipcMain.handle('fs:delete-event', async (_event, eventFilePath: string) => {
    try {
      fileSystemService.assertWithinVault(eventFilePath)
      fileSystemService.moveEventToVaultTrash(eventFilePath)
      return { success: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── fs:rename-event-file ──────────────────────────────────────────────────
  // Renomeia o arquivo .md de um evento (sem alterar o frontmatter)
  ipcMain.handle('fs:rename-event-file', async (_event, eventFilePath: string, newFilename: string) => {
    try {
      fileSystemService.assertWithinVault(eventFilePath)
      const result = fileSystemService.renameEventFile(eventFilePath, newFilename)
      return { success: true, data: result }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })
}
