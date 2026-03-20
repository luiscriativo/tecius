/**
 * Global Type Declarations
 *
 * Extends the Window interface to include the electronAPI exposed by the preload script.
 * This file must be included in tsconfig.web.json's "include" array.
 */

import type { ElectronAPI } from '../../../preload/index'

declare global {
  interface Window {
    /**
     * The Electron IPC bridge exposed via contextBridge in the preload script.
     * Only available when running inside Electron (not in a standard browser).
     */
    electronAPI: ElectronAPI
  }
}

export {}
