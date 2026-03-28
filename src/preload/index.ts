/**
 * Preload Script
 *
 * This script runs in a privileged context BEFORE the renderer process loads.
 * It bridges the gap between the secure main process and the sandboxed renderer
 * using contextBridge — the ONLY safe way to expose Node/Electron APIs.
 *
 * Security rules:
 * - Never expose ipcRenderer directly (that would give the renderer full IPC access)
 * - Only expose specific, named channels
 * - Validate all data before passing it through
 */

import { contextBridge, ipcRenderer } from 'electron'

// ── Allowed IPC channel lists ─────────────────────────────────────────────────
// Only channels listed here can be used from the renderer process.
// This acts as an allowlist / whitelist for IPC communication.

const INVOKE_CHANNELS = [
  'app:get-version',
  'app:get-platform',
  'app:get-theme',
  'app:open-external',
  'app:export-pdf',
  'window:is-maximized',
  'fs:pick-vault-folder',
  'fs:set-vault',
  'fs:read-vault',
  'fs:read-timeline',
  'fs:read-event',
  'fs:write-event',
  'fs:save-image',
  'fs:pick-image',
  'fs:list-assets',
  'fs:delete-asset',
  'fs:rename-asset',
  'fs:create-timeline',
  'fs:rename-timeline',
  'fs:trash-timeline',
  'fs:delete-timeline',
  'fs:list-trash',
  'fs:restore-from-trash',
  'fs:delete-from-trash',
  'fs:empty-trash',
  'fs:create-event',
  'fs:delete-event',
  'fs:rename-event-file',
  'fs:rename-vault',
  'update:check',
  'update:download',
] as const

const SEND_CHANNELS = [
  'app:quit',
  'window:minimize',
  'window:maximize-toggle',
  'window:close',
  'window:set-title',
  'fs:open-in-editor',
  'update:install',
] as const

const RECEIVE_CHANNELS = [
  'update:available',
  'update:downloaded',
  'update:progress',
  'app:theme-changed',
  'fs:vault-changed',
] as const

// ── Type inference from the channel lists ─────────────────────────────────────
type InvokeChannel = (typeof INVOKE_CHANNELS)[number]
type SendChannel = (typeof SEND_CHANNELS)[number]
type ReceiveChannel = (typeof RECEIVE_CHANNELS)[number]

// ── Listener cleanup helper ───────────────────────────────────────────────────
type IpcListener = (...args: unknown[]) => void

// ── The API exposed to the renderer process ───────────────────────────────────
const electronAPI = {
  /**
   * Versões do runtime — lidas aqui no preload onde process está disponível.
   * O renderer não pode acessar process diretamente (sandbox + contextIsolation).
   */
  versions: {
    node:     process.versions.node,
    chrome:   process.versions.chrome,
    electron: process.versions.electron,
  } as Record<string, string>,

  /**
   * Resolve um caminho de asset relativo a um arquivo de evento.
   * Retorna uma URL file:// absoluta para uso em <img src>.
   * Exposto no preload onde path está disponível (Node.js context).
   */
  resolveAssetPath: (eventFilePath: string, assetRelativePath: string): string => {
    if (assetRelativePath.startsWith('http') || assetRelativePath.startsWith('asset:')) {
      return assetRelativePath
    }
    // Implementação sem `path` (não disponível em sandbox: true)
    // Normaliza separadores para forward slash
    const base = eventFilePath.replace(/\\/g, '/')
    // Extrai o diretório removendo o último segmento (nome do arquivo)
    const dir = base.substring(0, base.lastIndexOf('/'))
    const rel = assetRelativePath.replace(/\\/g, '/')
    const abs = `${dir}/${rel}`
    // Formato: asset://local/<caminho absoluto>
    // O host fixo "local" evita que o Chromium interprete a letra do drive Windows
    // (ex: "C:") como "host:porta" na URL, corrompendo o path.
    // O main process intercepta este protocolo e serve o arquivo via net.fetch.
    //   Windows: abs = "C:/path/..." → "asset://local/C:/path/..."
    //   Unix:    abs = "/home/..."   → "asset://local/home/..."
    const pathPart = abs.startsWith('/') ? abs.slice(1) : abs
    return `asset://local/${pathPart}`
  },

  /**
   * Sends a message to the main process and waits for a response.
   */
  invoke: <T = unknown>(channel: InvokeChannel, ...args: unknown[]): Promise<T> => {
    if (!(INVOKE_CHANNELS as readonly string[]).includes(channel)) {
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args) as Promise<T>
  },

  /**
   * Sends a fire-and-forget message to the main process.
   */
  send: (channel: SendChannel, ...args: unknown[]): void => {
    if (!(SEND_CHANNELS as readonly string[]).includes(channel)) {
      console.warn(`IPC channel not allowed: ${channel}`)
      return
    }
    ipcRenderer.send(channel, ...args)
  },

  /**
   * Subscribes to messages sent FROM the main process TO the renderer.
   * Returns an unsubscribe function — always call it on cleanup to avoid memory leaks.
   */
  on: (channel: ReceiveChannel, listener: IpcListener): (() => void) => {
    if (!(RECEIVE_CHANNELS as readonly string[]).includes(channel)) {
      console.warn(`IPC channel not allowed: ${channel}`)
      return () => {}
    }

    const wrappedListener = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
      listener(...args)
    }

    ipcRenderer.on(channel, wrappedListener)

    return () => {
      ipcRenderer.removeListener(channel, wrappedListener)
    }
  }
}

// ── Expose the API under window.electronAPI ───────────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// ── TypeScript type export ────────────────────────────────────────────────────
export type ElectronAPI = typeof electronAPI
