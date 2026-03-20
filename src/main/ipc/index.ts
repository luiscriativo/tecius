/**
 * IPC Handler Registry
 *
 * This module aggregates and registers all IPC handlers from sub-modules.
 * Each domain (app, window, fs, etc.) should have its own handler file.
 *
 * Pattern:
 *   - ipcMain.handle('channel:action', handler)  → for invoke() calls
 *   - ipcMain.on('channel:action', handler)       → for send() calls (fire-and-forget)
 */

import { registerAppHandlers } from './app.handlers'
import { registerWindowHandlers } from './window.handlers'
import { registerFsHandlers } from './fs.handlers'

/**
 * Registers all IPC handlers. Call this before the main window is created.
 */
export function registerIpcHandlers(): void {
  registerAppHandlers()
  registerWindowHandlers()
  registerFsHandlers()
}
