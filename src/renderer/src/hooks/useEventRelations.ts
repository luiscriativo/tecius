import { useEffect, useMemo } from 'react'
import { ensureEventIndex, useEventIndexStore } from '@/stores/useEventIndexStore'
import { useVaultStore } from '@/stores/useVaultStore'
import { eventRelations, type VaultEventDoc } from '@/utils/wikiLinks'

/**
 * Relações [[…]] de um evento (os que ele cita e os que citam ele), pelo índice
 * do vault. `null` enquanto o índice carrega ou se o evento não está nele.
 */
export function useEventRelations(ev: { filePath: string; slug: string } | null):
  { self: VaultEventDoc; cites: VaultEventDoc[]; citedBy: VaultEventDoc[] } | null {
  const docs = useEventIndexStore((s) => s.docs)
  const stale = useEventIndexStore((s) => s.stale)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  useEffect(() => { if (ev) ensureEventIndex(vaultPath) }, [!!ev, vaultPath, stale]) // eslint-disable-line react-hooks/exhaustive-deps
  const filePath = ev?.filePath, slug = ev?.slug
  return useMemo(() => {
    const self = docs?.find((d) => d.filePath === filePath && d.slug === slug)
    return self && docs ? { self, ...eventRelations(self, docs) } : null
  }, [docs, filePath, slug])
}
