/**
 * AssetManager — Gerenciador de imagens do vault
 *
 * Preparado para grandes volumes (milhares de imagens):
 *  - Paginação (PAGE_SIZE = 60) na visão em grade — máx. 60 nós no DOM por vez
 *  - loading="lazy" em todas as <img> — o browser carrega só o que está visível
 *  - useMemo para estado derivado — sem recálculo desnecessário
 *  - Visão agrupada por pasta: seções colapsáveis, órfãos destacados
 *  - Busca + ordenação client-side sobre metadados (sem binários no estado)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Clipboard,
  FolderOpen,
  ImageOff,
  LayoutGrid,
  List,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useVaultStore } from '@/stores/useVaultStore'
import { cn } from '@/utils/cn'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface AssetInfo {
  filePath: string
  filename: string
  eventFolder: string
  eventFolderPath: string
  relativePath: string
  size: number
  isOrphaned: boolean
}

type SortKey = 'name' | 'size' | 'orphaned'
type ViewMode = 'grid' | 'grouped'

// ── Constantes ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 60

// ── Utilitários ───────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function assetUrl(filePath: string): string {
  const forward = filePath.replace(/\\/g, '/')
  const pathPart = forward.startsWith('/') ? forward.slice(1) : forward
  return `asset://local/${pathPart}`
}

function applySort(list: AssetInfo[], sort: SortKey): AssetInfo[] {
  const copy = [...list]
  if (sort === 'name') copy.sort((a, b) => a.filename.localeCompare(b.filename))
  else if (sort === 'size') copy.sort((a, b) => b.size - a.size)
  else if (sort === 'orphaned') copy.sort((a, b) => Number(b.isOrphaned) - Number(a.isOrphaned))
  return copy
}

// ── AssetCard ─────────────────────────────────────────────────────────────────

interface AssetCardProps {
  asset: AssetInfo
  onDelete: (filePath: string) => void
  onRename: (filePath: string, newName: string) => Promise<{ newFilePath: string; newFilename: string } | null>
  deleting: boolean
  /** Se true, oculta o nome da pasta (usado na visão agrupada) */
  hideFolder?: boolean
}

function AssetCard({ asset, onDelete, onRename, deleting, hideFolder }: AssetCardProps) {
  const [imgError, setImgError] = useState(false)
  const [copied, setCopied] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameLoading, setRenameLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Copia o link markdown para o clipboard
  const handleCopy = useCallback(() => {
    const link = `![imagem](${asset.relativePath})`
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [asset.relativePath])

  // Inicia modo de renomeação
  const handleStartRename = useCallback(() => {
    setRenameValue(asset.filename)
    setRenaming(true)
    // Foca o input após o render
    setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
  }, [asset.filename])

  // Confirma o rename
  const handleConfirmRename = useCallback(async () => {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === asset.filename) {
      setRenaming(false)
      return
    }
    setRenameLoading(true)
    await onRename(asset.filePath, trimmed)
    setRenameLoading(false)
    setRenaming(false)
  }, [renameValue, asset.filename, asset.filePath, onRename])

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleConfirmRename() }
    if (e.key === 'Escape') { setRenaming(false) }
  }, [handleConfirmRename])

  return (
    <div
      className={cn(
        'group relative flex flex-col border rounded-sm overflow-hidden',
        'bg-surface transition-colors duration-150',
        asset.isOrphaned
          ? 'border-amber-800/50 hover:border-amber-700'
          : 'border-chr-subtle hover:border-chr'
      )}
    >
      {/* ── Preview ─────────────────────────────────────────────────────── */}
      <div className="relative bg-vault aspect-video flex items-center justify-center overflow-hidden">
        {imgError ? (
          <div className="flex flex-col items-center gap-1 text-chr-muted">
            <ImageOff size={18} strokeWidth={1.5} />
            <span className="text-2xs font-mono">sem preview</span>
          </div>
        ) : (
          <img
            src={assetUrl(asset.filePath)}
            alt={asset.filename}
            loading="lazy"
            onError={() => setImgError(true)}
            className="max-h-full max-w-full object-contain"
          />
        )}

        {/* Badge órfã */}
        {asset.isOrphaned && (
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-amber-900/80 border border-amber-700/60">
            <AlertTriangle size={9} strokeWidth={2} className="text-amber-400" />
            <span className="font-mono text-2xs text-amber-300">órfã</span>
          </div>
        )}
      </div>

      {/* ── Info ────────────────────────────────────────────────────────── */}
      <div className="px-2 pt-1.5 pb-1 space-y-0.5">
        {/* Filename ou input de rename */}
        {renaming ? (
          <input
            ref={inputRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={handleConfirmRename}
            disabled={renameLoading}
            className={cn(
              'w-full px-1 py-0.5 rounded-sm font-mono text-2xs',
              'bg-vault border border-chr text-chr-primary',
              'focus:outline-none focus:border-chr-strong',
              renameLoading && 'opacity-50'
            )}
          />
        ) : (
          <p className="font-mono text-2xs text-chr-primary truncate" title={asset.filename}>
            {asset.filename}
          </p>
        )}

        <div className="flex items-center justify-between gap-1">
          {!hideFolder && (
            <span className="font-mono text-2xs text-chr-muted truncate" title={asset.eventFolder}>
              {asset.eventFolder}
            </span>
          )}
          <span className={cn('font-mono text-2xs text-chr-muted shrink-0', hideFolder && 'ml-auto')}>
            {formatSize(asset.size)}
          </span>
        </div>
      </div>

      {/* ── Barra de ações (hover, oculta durante rename) ────────────────── */}
      {!renaming && (
        <div className={cn(
          'flex items-center justify-end gap-1 px-2 py-1 border-t border-chr-subtle',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-150'
        )}>
          {/* Copiar link */}
          <button
            onClick={handleCopy}
            title={copied ? 'Copiado!' : 'Copiar link markdown'}
            className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 rounded-sm font-mono text-2xs',
              'transition-colors duration-150',
              copied
                ? 'text-green-400 bg-green-950/30'
                : 'text-chr-muted hover:text-chr-secondary hover:bg-hover'
            )}
          >
            {copied
              ? <><Check size={10} strokeWidth={2.5} /> Copiado</>
              : <><Clipboard size={10} strokeWidth={1.5} /> Copiar</>
            }
          </button>

          {/* Renomear */}
          <button
            onClick={handleStartRename}
            title="Renomear imagem"
            className="p-1 rounded-sm text-chr-muted hover:text-chr-secondary hover:bg-hover transition-colors"
          >
            <Pencil size={11} strokeWidth={1.5} />
          </button>

          {/* Deletar */}
          <button
            onClick={() => onDelete(asset.filePath)}
            disabled={deleting}
            title="Deletar imagem"
            className={cn(
              'p-1 rounded-sm text-red-600 hover:text-red-400 hover:bg-red-950/30',
              'transition-colors duration-150',
              deleting && 'opacity-50 cursor-default'
            )}
          >
            <Trash2 size={11} strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* Barra de confirmação de rename */}
      {renaming && (
        <div className="flex items-center justify-end gap-1 px-2 py-1 border-t border-chr-subtle">
          <span className="font-mono text-2xs text-chr-muted flex-1">
            {renameLoading ? 'Renomeando...' : 'Enter confirma · Esc cancela'}
          </span>
          <button
            onClick={handleConfirmRename}
            disabled={renameLoading}
            className="p-1 rounded-sm text-green-500 hover:text-green-400 hover:bg-green-950/30 transition-colors"
          >
            <Check size={11} strokeWidth={2} />
          </button>
          <button
            onClick={() => setRenaming(false)}
            disabled={renameLoading}
            className="p-1 rounded-sm text-chr-muted hover:text-chr-secondary hover:bg-hover transition-colors"
          >
            <X size={11} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── FolderSection — seção colapsável por pasta ────────────────────────────────

interface FolderSectionProps {
  folder: string
  assets: AssetInfo[]
  onDelete: (filePath: string) => void
  onRename: (filePath: string, newName: string) => Promise<{ newFilePath: string; newFilename: string } | null>
  deletingPaths: Set<string>
  defaultOpen?: boolean
}

function FolderSection({ folder, assets, onDelete, onRename, deletingPaths, defaultOpen = false }: FolderSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const orphanCount = assets.filter((a) => a.isOrphaned).length
  const totalSize = assets.reduce((s, a) => s + a.size, 0)

  return (
    <div className="border border-chr-subtle rounded-sm overflow-hidden">
      {/* Cabeçalho da pasta */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-surface hover:bg-hover transition-colors text-left"
      >
        <span className="text-chr-muted shrink-0">
          {open ? <ChevronDown size={13} strokeWidth={2} /> : <ChevronRight size={13} strokeWidth={2} />}
        </span>
        <FolderOpen size={14} strokeWidth={1.5} className="text-chr-muted shrink-0" />
        <span className="font-mono text-xs text-chr-primary truncate flex-1">{folder}</span>
        <span className="font-mono text-2xs text-chr-muted shrink-0">{assets.length} imagem{assets.length !== 1 ? 's' : ''}</span>
        <span className="font-mono text-2xs text-chr-muted shrink-0 ml-2">{formatSize(totalSize)}</span>
        {orphanCount > 0 && (
          <span className="font-mono text-2xs text-amber-500 shrink-0 ml-2">
            {orphanCount} órfã{orphanCount !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {/* Grade de imagens */}
      {open && (
        <div className="p-3 border-t border-chr-subtle grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 bg-vault/30">
          {assets.map((asset) => (
            <AssetCard
              key={asset.filePath}
              asset={asset}
              onDelete={onDelete}
              onRename={onRename}
              deleting={deletingPaths.has(asset.filePath)}
              hideFolder
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Paginação ─────────────────────────────────────────────────────────────────

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  onPage: (p: number) => void
}

function Pagination({ page, totalPages, total, onPage }: PaginationProps) {
  if (totalPages <= 1) return null

  const from = page * PAGE_SIZE + 1
  const to = Math.min((page + 1) * PAGE_SIZE, total)

  return (
    <div className="flex items-center justify-center gap-3 py-4 border-t border-chr-subtle">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 0}
        className="px-3 py-1.5 rounded-sm font-mono text-xs border border-chr-subtle text-chr-muted hover:border-chr hover:text-chr-secondary disabled:opacity-30 disabled:cursor-default transition-colors"
      >
        ‹ Anterior
      </button>

      <span className="font-mono text-2xs text-chr-muted">
        {from}–{to} de {total}
      </span>

      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages - 1}
        className="px-3 py-1.5 rounded-sm font-mono text-xs border border-chr-subtle text-chr-muted hover:border-chr hover:text-chr-secondary disabled:opacity-30 disabled:cursor-default transition-colors"
      >
        Próxima ›
      </button>
    </div>
  )
}

// ── AssetManager ──────────────────────────────────────────────────────────────

export default function AssetManager(): React.ReactElement {
  const vaultInfo = useVaultStore((s) => s.vaultInfo)

  // Dados brutos
  const [assets, setAssets] = useState<AssetInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [deletingPaths, setDeletingPaths] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  // Controles de UI
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('name')
  const [filterOrphaned, setFilterOrphaned] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [page, setPage] = useState(0)

  const searchRef = useRef<HTMLInputElement>(null)

  // ── Carregamento ──────────────────────────────────────────────────────────

  const loadAssets = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.invoke<{
        success: boolean
        data?: AssetInfo[]
        error?: string
      }>('fs:list-assets')
      if (result.success && result.data) {
        setAssets(result.data)
      } else {
        setError(result.error ?? 'Erro ao listar assets')
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (vaultInfo) loadAssets()
  }, [vaultInfo, loadAssets])

  // Resetar página quando filtros mudam
  useEffect(() => { setPage(0) }, [search, filterOrphaned, sort, viewMode])

  // ── Derivados (useMemo para não recalcular no render) ──────────────────────

  const filtered = useMemo(() => {
    let list = assets
    if (filterOrphaned) list = list.filter((a) => a.isOrphaned)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (a) =>
          a.filename.toLowerCase().includes(q) ||
          a.eventFolder.toLowerCase().includes(q)
      )
    }
    return applySort(list, sort)
  }, [assets, filterOrphaned, search, sort])

  // Grade: fatia da página atual
  const pageAssets = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page]
  )
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  // Agrupado: mapa pasta → lista
  const grouped = useMemo(() => {
    if (viewMode !== 'grouped') return new Map<string, AssetInfo[]>()
    const map = new Map<string, AssetInfo[]>()
    for (const asset of filtered) {
      const group = map.get(asset.eventFolder) ?? []
      group.push(asset)
      map.set(asset.eventFolder, group)
    }
    return map
  }, [filtered, viewMode])

  // Stats do total (sempre sobre assets completos, não filtrado)
  const totalOrphans = useMemo(() => assets.filter((a) => a.isOrphaned).length, [assets])
  const totalSize = useMemo(() => assets.reduce((s, a) => s + a.size, 0), [assets])

  // ── Ações ──────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (filePath: string) => {
    setDeletingPaths((prev) => new Set(prev).add(filePath))
    try {
      const result = await window.electronAPI.invoke<{ success: boolean; error?: string }>(
        'fs:delete-asset',
        filePath
      )
      if (result.success) {
        setAssets((prev) => prev.filter((a) => a.filePath !== filePath))
      } else {
        setError(result.error ?? 'Erro ao deletar')
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setDeletingPaths((prev) => {
        const next = new Set(prev)
        next.delete(filePath)
        return next
      })
    }
  }, [])

  const handleDeleteAllOrphaned = useCallback(async () => {
    const orphaned = assets.filter((a) => a.isOrphaned)
    for (const asset of orphaned) {
      await handleDelete(asset.filePath)
    }
  }, [assets, handleDelete])

  const handleRename = useCallback(async (
    filePath: string,
    newName: string
  ): Promise<{ newFilePath: string; newFilename: string } | null> => {
    const result = await window.electronAPI.invoke<{
      success: boolean
      data?: { newFilePath: string; newFilename: string }
      error?: string
    }>('fs:rename-asset', filePath, newName)

    if (result.success && result.data) {
      const { newFilePath, newFilename } = result.data
      setAssets((prev) =>
        prev.map((a) =>
          a.filePath === filePath
            ? { ...a, filePath: newFilePath, filename: newFilename, relativePath: `_assets/${newFilename}` }
            : a
        )
      )
      return result.data
    }
    if (result.error) setError(result.error)
    return null
  }, [])

  // ── Sem vault ──────────────────────────────────────────────────────────────

  if (!vaultInfo) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <p className="font-mono text-xs text-chr-muted">Nenhum vault carregado.</p>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-chr-subtle bg-surface">

        {/* Linha 1: título + stats + ações */}
        <div className="flex items-center justify-between px-6 py-3 gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <h1 className="font-mono text-sm text-chr-primary">Imagens do Vault</h1>
            {!isLoading && (
              <div className="flex items-center gap-2 font-mono text-2xs text-chr-muted">
                <span>{assets.length} imagens</span>
                <span className="text-chr-subtle">·</span>
                <span>{formatSize(totalSize)}</span>
                {totalOrphans > 0 && (
                  <>
                    <span className="text-chr-subtle">·</span>
                    <span className="text-amber-500">{totalOrphans} órfã{totalOrphans !== 1 ? 's' : ''}</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Alternar visão */}
            <div className="flex items-center border border-chr-subtle rounded-sm overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                title="Visão em grade paginada"
                className={cn(
                  'p-1.5 transition-colors',
                  viewMode === 'grid'
                    ? 'bg-active text-chr-primary'
                    : 'text-chr-muted hover:text-chr-secondary hover:bg-hover'
                )}
              >
                <LayoutGrid size={13} strokeWidth={1.5} />
              </button>
              <button
                onClick={() => setViewMode('grouped')}
                title="Visão agrupada por pasta"
                className={cn(
                  'p-1.5 transition-colors',
                  viewMode === 'grouped'
                    ? 'bg-active text-chr-primary'
                    : 'text-chr-muted hover:text-chr-secondary hover:bg-hover'
                )}
              >
                <List size={13} strokeWidth={1.5} />
              </button>
            </div>

            {/* Deletar órfãs */}
            {totalOrphans > 0 && (
              <button
                onClick={handleDeleteAllOrphaned}
                disabled={deletingPaths.size > 0}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-mono',
                  'border border-red-900/60 text-red-500',
                  'hover:bg-red-950/40 hover:border-red-800 transition-colors',
                  deletingPaths.size > 0 && 'opacity-50 cursor-default'
                )}
              >
                <Trash2 size={11} strokeWidth={1.5} />
                Deletar {totalOrphans} órfã{totalOrphans !== 1 ? 's' : ''}
              </button>
            )}

            {/* Recarregar */}
            <button
              onClick={loadAssets}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-mono border border-chr-subtle text-chr-muted hover:border-chr hover:text-chr-secondary transition-colors"
            >
              <RefreshCw size={11} strokeWidth={1.5} className={isLoading ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>
        </div>

        {/* Linha 2: busca + ordenação + filtro */}
        <div className="flex items-center gap-3 px-6 pb-3 flex-wrap">

          {/* Campo de busca */}
          <div className="relative flex-1 min-w-48 max-w-xs">
            <Search size={12} strokeWidth={1.5} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-chr-muted pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou pasta..."
              className={cn(
                'w-full pl-7 pr-7 py-1.5 rounded-sm',
                'bg-vault border border-chr-subtle',
                'font-mono text-xs text-chr-primary placeholder:text-chr-muted',
                'focus:outline-none focus:border-chr transition-colors'
              )}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-chr-muted hover:text-chr-secondary"
              >
                <X size={11} strokeWidth={2} />
              </button>
            )}
          </div>

          {/* Ordenação */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className={cn(
              'px-2 py-1.5 rounded-sm border border-chr-subtle bg-vault',
              'font-mono text-xs text-chr-muted',
              'focus:outline-none focus:border-chr transition-colors cursor-pointer'
            )}
          >
            <option value="name">Ordenar: Nome</option>
            <option value="size">Ordenar: Tamanho</option>
            <option value="orphaned">Ordenar: Órfãs primeiro</option>
          </select>

          {/* Filtro órfãs */}
          <button
            onClick={() => setFilterOrphaned((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-mono border transition-colors',
              filterOrphaned
                ? 'bg-amber-900/30 border-amber-700 text-amber-400'
                : 'border-chr-subtle text-chr-muted hover:border-chr hover:text-chr-secondary'
            )}
          >
            <AlertTriangle size={11} strokeWidth={1.5} />
            {filterOrphaned ? 'Ver todas' : 'Só órfãs'}
          </button>

          {/* Resultado do filtro */}
          {(search || filterOrphaned) && !isLoading && (
            <span className="font-mono text-2xs text-chr-muted">
              {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </header>

      {/* ── Erro ────────────────────────────────────────────────────────────── */}
      {error && (
        <div className="shrink-0 px-6 py-2 bg-red-950/30 border-b border-red-900/40 flex items-center justify-between">
          <p className="font-mono text-xs text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-400">
            <X size={12} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* ── Conteúdo principal ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <RefreshCw size={20} strokeWidth={1.5} className="text-chr-muted animate-spin" />
            <span className="font-mono text-xs text-chr-muted">Carregando imagens...</span>
          </div>

        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <ImageOff size={24} strokeWidth={1.5} className="text-chr-muted" />
            <p className="font-mono text-xs text-chr-muted">
              {search || filterOrphaned
                ? 'Nenhuma imagem encontrada para os filtros aplicados.'
                : 'Nenhuma imagem no vault ainda.'}
            </p>
          </div>

        ) : viewMode === 'grid' ? (
          /* ── Visão em grade paginada ─────────────────────────────────────── */
          <>
            <div className="p-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {pageAssets.map((asset) => (
                <AssetCard
                  key={asset.filePath}
                  asset={asset}
                  onDelete={handleDelete}
                  onRename={handleRename}
                  deleting={deletingPaths.has(asset.filePath)}
                />
              ))}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={filtered.length}
              onPage={setPage}
            />
          </>

        ) : (
          /* ── Visão agrupada por pasta ────────────────────────────────────── */
          <div className="p-5 space-y-2">
            {Array.from(grouped.entries()).map(([folder, folderAssets], idx) => (
              <FolderSection
                key={folder}
                folder={folder}
                assets={folderAssets}
                onDelete={handleDelete}
                onRename={handleRename}
                deletingPaths={deletingPaths}
                defaultOpen={idx === 0} /* Abre a primeira pasta por padrão */
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
