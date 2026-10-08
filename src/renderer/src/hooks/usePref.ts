import { useCallback, useState } from 'react'
import { readPref, writePref } from '@/utils/prefs'

/**
 * useState que lembra o valor entre aberturas da tela e do app (localStorage).
 * Mesma assinatura do useState, inclusive o setter com função.
 */
export function usePref<T>(key: string, fallback: T, isValid?: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(() => readPref(key, fallback, isValid))
  const set = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      writePref(key, v)
      return v
    })
  }, [key])
  return [value, set] as const
}
