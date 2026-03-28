/**
 * TrashView — Lixeira interna do vault
 *
 * Lista timelines movidas para .trash/ com opções de:
 * - Restaurar para o local original
 * - Excluir permanentemente (com confirmação)
 * - Esvaziar toda a lixeira (com confirmação)
 */

import React, { useEffect, useState, useCallback } from 'react'
import { Trash2, RotateCcw, X, BookOpen, AlertTriangle } from 'lucide-react'
import { useVault } from '@/hooks/useVault'
import { useVaultStore } from '@/stores/useVaultStore'
import { useTimelineStore } from '@/stores/useTimelineStore'
import { useI18n } from '@/hooks/useI18n'
import { cn } from '@/utils/cn'
import type { TrashItem } from '@/types/chronicler'

// ── Utilitários ───────────────────────────────────────────────────────────────

function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

// ── ConfirmModal ──────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  title: string
  description: string
  confirmLabel: string
  isDanger?: boolean
  isLoading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmModal({ title, description, confirmLabel, isDanger = false, isLoading = false, onConfirm, onCancel }: ConfirmModalProps) {
  const { t } = useI18n()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative z-10 w-96 chr-card p-5 shadow-card-hover">
        <div className="flex items-start gap-3 mb-3">
          {isDanger && <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" strokeWidth={1.5} />}
          <h3 className="font-serif text-base text-chr-primary">{title}</h3>
        </div>
        <p className="font-mono text-xs text-chr-muted mb-5 leading-relaxed pl-7">{description}</p>
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-3 py-1.5 font-mono text-xs rounded-sm border border-chr-subtle text-chr-muted hover:text-chr-secondary hover:border-chr transition-colors disabled:opacity-40"
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              'px-3 py-1.5 font-mono text-xs rounded-sm transition-colors disabled:opacity-40',
              isDanger
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-chr-primary text-surface hover:opacity-90'
            )}
          >
            {isLoading ? t('please_wait') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── TrashView ─────────────────────────────────────────────────────────────────

export default function TrashView(): React.ReactElement {
  const { listTrash, restoreFromTrash, deleteFromTrash, emptyTrash } = useVault()
  const deleteCached = useTimelineStore((s) => s.deleteCached)
  const trashCount = useVaultStore((s) => s.vaultInfo?.trashCount ?? 0)
  const { t, language, nEvents, nItems } = useI18n()

  const [items, setItems]           = useState<TrashItem[]>([])
  const [isLoading, setIsLoading]   = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  const [confirmDelete, setConfirmDelete] = useState<TrashItem | null>(null)
  const [confirmEmpty, setConfirmEmpty]   = useState(false)

  const locale = language === 'en' ? 'en-US' : 'pt-BR'

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await listTrash()
      setItems(data)
    } finally {
      setIsLoading(false)
    }
  }, [listTrash])

  useEffect(() => { load() }, [load])

  // Retry when vault reports items exist but the first load returned empty (redirect timing race)
  useEffect(() => {
    if (!isLoading && items.length === 0 && trashCount > 0) {
      const timer = setTimeout(() => load(), 300)
      return () => clearTimeout(timer)
    }
  }, [isLoading, items.length, trashCount, load])

  // ── Ações ─────────────────────────────────────────────────────────────────

  const handleRestore = async (item: TrashItem) => {
    setProcessing(item.dirPath)
    try {
      await restoreFromTrash(item.dirPath)
      // Invalidate timeline cache so the restored content appears immediately.
      // For event items, originalPath is the event .md file — invalidate its parent dir.
      // For timeline items, originalPath is the dir itself.
      const isEventItem = item.originalPath.endsWith('.md')
      const timelineDirPath = isEventItem
        ? item.originalPath.replace(/[\\/][^\\/]+$/, '')
        : item.originalPath
      deleteCached(timelineDirPath)
      await load()
    } finally {
      setProcessing(null)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setProcessing(confirmDelete.dirPath)
    try {
      await deleteFromTrash(confirmDelete.dirPath)
      setConfirmDelete(null)
      await load()
    } finally {
      setProcessing(null)
    }
  }

  const handleEmptyTrash = async () => {
    setProcessing('__empty__')
    try {
      await emptyTrash()
      setConfirmEmpty(false)
      await load()
    } finally {
      setProcessing(null)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden bg-vault">

      {/* Cabeçalho */}
      <header className="shrink-0 border-b border-chr-subtle bg-surface">
        <div className="flex items-center justify-between px-6 py-3 gap-4">
          <div className="flex items-center gap-3">
            <Trash2 size={16} strokeWidth={1.5} className="text-chr-muted" />
            <div>
              <h1 className="font-mono text-sm font-medium text-chr-primary leading-none">{t('trash')}</h1>
              <p className="font-mono text-2xs text-chr-muted mt-0.5">
                {isLoading ? '...' : items.length === 0
                  ? t('trash_empty_status')
                  : nItems(items.length)
                }
              </p>
            </div>
          </div>

          {/* Esvaziar lixeira */}
          {items.length > 0 && (
            <button
              onClick={() => setConfirmEmpty(true)}
              disabled={processing !== null}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-mono',
                'border border-red-500/40 text-red-500',
                'hover:bg-red-500/10 transition-colors duration-150',
                'disabled:opacity-40 disabled:cursor-default'
              )}
            >
              <X size={12} strokeWidth={1.5} />
              {t('empty_trash_btn')}
            </button>
          )}
        </div>
      </header>

      {/* Corpo */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="px-8 py-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-subtle rounded animate-pulse" />
            ))}
          </div>

        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full pb-20 gap-4">
            <div className="w-16 h-16 rounded-full bg-subtle flex items-center justify-center">
              <Trash2 size={28} strokeWidth={1} className="text-chr-muted opacity-40" />
            </div>
            <div className="text-center">
              <p className="font-serif text-base text-chr-secondary">{t('trash_is_empty')}</p>
              <p className="font-mono text-xs text-chr-muted mt-1">
                {t('trash_empty_desc')}
              </p>
            </div>
          </div>

        ) : (
          <div className="px-8 py-6 space-y-2 max-w-3xl">
            {items.map((item) => {
              const isProcessing = processing === item.dirPath || processing === '__empty__'
              return (
                <div
                  key={item.dirPath}
                  className={cn(
                    'chr-card px-5 py-4 flex items-start gap-4',
                    'transition-opacity duration-150',
                    isProcessing && 'opacity-40 pointer-events-none'
                  )}
                >
                  {/* Ícone */}
                  <div className="shrink-0 mt-0.5">
                    <BookOpen size={18} strokeWidth={1.5} className="text-chr-muted" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-serif text-base text-chr-primary leading-tight truncate">
                      {item.name}
                    </p>
                    <p className="font-mono text-2xs text-chr-muted mt-1 truncate" title={item.originalPath}>
                      {item.originalPath}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="font-mono text-2xs text-chr-muted">
                        {t('removed_at', { date: formatDate(item.trashedAt, locale) })}
                      </span>
                      {item.eventCount > 0 && (
                        <span className="chr-tag font-mono">
                          {nEvents(item.eventCount)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Restaurar */}
                    <button
                      onClick={() => handleRestore(item)}
                      disabled={processing !== null}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-mono',
                        'border border-chr-subtle text-chr-secondary',
                        'hover:border-chr hover:text-chr-primary hover:bg-hover',
                        'transition-colors duration-150 disabled:opacity-40 disabled:cursor-default'
                      )}
                      title={t('restore_title')}
                    >
                      <RotateCcw size={11} strokeWidth={1.5} />
                      {t('restore')}
                    </button>

                    {/* Excluir permanentemente */}
                    <button
                      onClick={() => setConfirmDelete(item)}
                      disabled={processing !== null}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-mono',
                        'border border-red-500/30 text-red-500/70',
                        'hover:border-red-500 hover:text-red-500 hover:bg-red-500/5',
                        'transition-colors duration-150 disabled:opacity-40 disabled:cursor-default'
                      )}
                      title={t('delete_perm_title')}
                    >
                      <X size={11} strokeWidth={1.5} />
                      {t('delete_perm')}
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Nota informativa */}
            <p className="font-mono text-2xs text-chr-muted opacity-50 pt-2 text-center">
              {t('trash_footer')}
            </p>
          </div>
        )}
      </div>

      {/* Modal: excluir item individual */}
      {confirmDelete && (
        <ConfirmModal
          title={t('delete_confirm_title')}
          description={t('delete_confirm_desc', { name: confirmDelete.name, count: confirmDelete.eventCount })}
          confirmLabel={t('delete_confirm_btn')}
          isDanger
          isLoading={processing !== null}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Modal: esvaziar tudo */}
      {confirmEmpty && (
        <ConfirmModal
          title={t('empty_trash_title')}
          description={items.length === 1 ? t('empty_trash_desc_one') : t('empty_trash_desc_other', { count: items.length })}
          confirmLabel={t('empty_trash_btn')}
          isDanger
          isLoading={processing !== null}
          onConfirm={handleEmptyTrash}
          onCancel={() => setConfirmEmpty(false)}
        />
      )}
    </div>
  )
}
