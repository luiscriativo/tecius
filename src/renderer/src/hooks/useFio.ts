import { useEffect, useMemo } from 'react'
import { ensureEventIndex, useEventIndexStore } from '@/stores/useEventIndexStore'
import { useVaultStore } from '@/stores/useVaultStore'
import { fioView, fiosContaining, type FioView } from '@/utils/fio'
import type { VaultEventDoc } from '@/utils/wikiLinks'

/**
 * Fio de um evento pelo índice do vault: o próprio evento no índice, as paradas
 * e menções (se for um fio) e os fios de que ele faz parte.
 */
export function useFio(ev: { filePath: string; slug: string } | null): {
  self: VaultEventDoc | null; fio: FioView | null; inFios: VaultEventDoc[]; docs: VaultEventDoc[]
} {
  const docs = useEventIndexStore((s) => s.docs)
  const stale = useEventIndexStore((s) => s.stale)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  useEffect(() => { if (ev) ensureEventIndex(vaultPath) }, [!!ev, vaultPath, stale]) // eslint-disable-line react-hooks/exhaustive-deps
  const filePath = ev?.filePath, slug = ev?.slug
  return useMemo(() => {
    const list = docs ?? []
    const self = list.find((d) => d.filePath === filePath && d.slug === slug) ?? null
    return { self, fio: self ? fioView(self, list) : null, inFios: self ? fiosContaining(self, list) : [], docs: list }
  }, [docs, filePath, slug])
}
