import { useEffect, useState } from 'react'
import { useVaultStore } from '@/stores/useVaultStore'
import { isPreset } from '@/utils/pageStyle'

const cache = new Map<string, string | null>()

/**
 * Estilo próprio do vault (`_styles/<nome>.css`): carrega o CSS uma vez por
 * nome e o injeta num <style> enquanto a página o usa. Para os presets do app
 * não faz nada (o CSS deles já vem no bundle).
 */
export function usePageStyle(name: string): { custom: boolean; loaded: boolean } {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const custom = !isPreset(name)
  const [css, setCss] = useState<string | null>(() => (custom ? cache.get(`${vaultPath}|${name}`) ?? null : null))

  useEffect(() => {
    if (!custom || !vaultPath) return
    const key = `${vaultPath}|${name}`
    let alive = true
    if (cache.has(key)) { setCss(cache.get(key) ?? null); return }
    window.electronAPI.invoke<{ success: boolean; data?: string | null }>('fs:read-style', name)
      .then((r) => { const text = r.success ? (r.data ?? null) : null; cache.set(key, text); if (alive) setCss(text) })
      .catch(() => { if (alive) setCss(null) })
    return () => { alive = false }
  }, [custom, name, vaultPath])

  useEffect(() => {
    if (!custom || !css) return
    const el = document.createElement('style')
    el.dataset.pageStyle = name
    el.textContent = css
    document.head.appendChild(el)
    return () => { el.remove() }
  }, [custom, css, name])

  return { custom, loaded: !custom || css !== null }
}
