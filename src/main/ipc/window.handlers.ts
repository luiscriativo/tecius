/**
 * Window IPC Handlers
 *
 * Handles window-management IPC calls from the renderer process.
 * These are invoked via window.electronAPI.invoke('window:*').
 */

import { ipcMain, BrowserWindow } from 'electron'

export function registerWindowHandlers(): void {
  // ── window:minimize ───────────────────────────────────────────────────────
  ipcMain.on('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
  })

  // ── window:maximize-toggle ────────────────────────────────────────────────
  ipcMain.on('window:maximize-toggle', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  // ── window:close ─────────────────────────────────────────────────────────
  ipcMain.on('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })

  // ── window:is-maximized ───────────────────────────────────────────────────
  // Returns whether the current window is maximized.
  ipcMain.handle('window:is-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.isMaximized() ?? false
  })

  // ── window:set-title ──────────────────────────────────────────────────────
  // Allows the renderer to update the window title.
  ipcMain.on('window:set-title', (event, title: string) => {
    if (typeof title !== 'string') return
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.setTitle(title)
  })
}
