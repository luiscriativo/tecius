/**
 * useElectron Hook
 *
 * Provides typed access to the Electron IPC bridge (window.electronAPI)
 * with graceful degradation when running outside of Electron (e.g., browser).
 *
 * Usage:
 *   const { invoke, send, on, isElectron } = useElectron()
 *   const version = await invoke('app:get-version')
 */

import { useCallback } from 'react'

type ElectronAPI = Window['electronAPI']

interface UseElectronReturn {
  /** Whether the app is running inside an Electron shell */
  isElectron: boolean
  /** Invoke an IPC channel and wait for a response */
  invoke: ElectronAPI['invoke']
  /** Send a fire-and-forget IPC message */
  send: ElectronAPI['send']
  /** Subscribe to messages from the main process */
  on: ElectronAPI['on']
}

export function useElectron(): UseElectronReturn {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI

  const invoke = useCallback<ElectronAPI['invoke']>(
    async (channel, ...args) => {
      if (!isElectron) {
        console.warn(`[useElectron] Not in Electron — invoke('${channel}') skipped`)
        return undefined as never
      }
      return window.electronAPI.invoke(channel, ...args)
    },
    [isElectron]
  )

  const send = useCallback<ElectronAPI['send']>(
    (channel, ...args) => {
      if (!isElectron) {
        console.warn(`[useElectron] Not in Electron — send('${channel}') skipped`)
        return
      }
      window.electronAPI.send(channel, ...args)
    },
    [isElectron]
  )

  const on = useCallback<ElectronAPI['on']>(
    (channel, listener) => {
      if (!isElectron) {
        console.warn(`[useElectron] Not in Electron — on('${channel}') skipped`)
        return () => {}
      }
      return window.electronAPI.on(channel, listener)
    },
    [isElectron]
  )

  return { isElectron, invoke, send, on }
}
