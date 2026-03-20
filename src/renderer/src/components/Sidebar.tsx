/**
 * Sidebar Component
 *
 * Navigation sidebar with collapsible state.
 * Shows app nav links and vault timelines when a vault is loaded.
 * Suporta criação, renomeação, lixeira e exclusão permanente de timelines.
 */

import React, { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { BookOpen, Images, Plus, Pencil, Trash2, Trash } from 'lucide-react'
import { useAppStore } from '@/stores/useAppStore'
import { useVaultStore } from '@/stores/useVaultStore'
import { useTimeline } from '@/hooks/useTimeline'
import { useVault } from '@/hooks/useVault'
import { useI18n } from '@/hooks/useI18n'
import { cn } from '@/utils/cn'
import type { TimelineRef } from '@/types/chronicler'

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

function ConfirmModal({
  title, description, confirmLabel, isDanger = false, isLoading = false, onConfirm, onCancel,
}: ConfirmModalProps) {
  const { t } = useI18n()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      {/* Card */}
      <div className="relative z-10 w-80 chr-card p-5 shadow-card-hover">
        <h3 className="font-serif text-base text-chr-primary mb-2">{title}</h3>
        <p className="font-mono text-xs text-chr-muted mb-5 leading-relaxed">{description}</p>
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

// ── TimelinesSection ──────────────────────────────────────────────────────────

interface TimelinesSectionProps {
  timelines: TimelineRef[]
  collapsed: boolean
}

// ── ContextMenu ───────────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number
  y: number
  timeline: TimelineRef
}

interface ContextMenuProps {
  menu: ContextMenuState
  onRename: () => void
  onTrash: () => void
  onClose: () => void
}

function ContextMenu({ menu, onRename, onTrash, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const { t } = useI18n()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const [pos, setPos] = useState({ x: menu.x, y: menu.y })
  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    setPos({
      x: menu.x + rect.width  > vw ? vw - rect.width  - 8 : menu.x,
      y: menu.y + rect.height > vh ? vh - rect.height - 8 : menu.y,
    })
  }, [menu.x, menu.y])

  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />

      <div
        ref={menuRef}
        className={cn(
          'fixed z-50 min-w-44 py-1 rounded-sm',
          'bg-surface border border-chr-subtle shadow-card-hover',
          'select-none'
        )}
        style={{ left: pos.x, top: pos.y }}
      >
        <div className="px-3 py-1.5 border-b border-chr-subtle mb-1">
          <p className="font-mono text-2xs text-chr-muted truncate max-w-[160px]">
            {menu.timeline.title}
          </p>
        </div>

        <button
          onMouseDown={(e) => { e.stopPropagation(); onRename() }}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-1.5',
            'text-sm text-chr-secondary hover:bg-hover hover:text-chr-primary',
            'transition-colors duration-100'
          )}
        >
          <Pencil size={13} strokeWidth={1.5} className="text-chr-muted shrink-0" />
          {t('ctx_rename')}
        </button>

        <div className="border-t border-chr-subtle my-1" />

        <button
          onMouseDown={(e) => { e.stopPropagation(); onTrash() }}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-1.5',
            'text-sm text-chr-secondary hover:bg-hover hover:text-red-500',
            'transition-colors duration-100'
          )}
        >
          <Trash2 size={13} strokeWidth={1.5} className="text-chr-muted shrink-0" />
          {t('ctx_trash')}
        </button>
      </div>
    </>
  )
}

// ── TimelinesSection ──────────────────────────────────────────────────────────

function TimelinesSection({ timelines, collapsed }: TimelinesSectionProps) {
  const { openTimeline } = useTimeline()
  const { createTimeline, renameTimeline, trashTimeline } = useVault()
  const navigate = useNavigate()
  const { t } = useI18n()

  const [creatingNew, setCreatingNew]       = useState(false)
  const [newTitle, setNewTitle]             = useState('')
  const [renamingDir, setRenamingDir]       = useState<string | null>(null)
  const [renameValue, setRenameValue]       = useState('')
  const [isProcessing, setIsProcessing]     = useState(false)
  const [confirmTrash, setConfirmTrash]     = useState<TimelineRef | null>(null)
  const [contextMenu, setContextMenu]       = useState<ContextMenuState | null>(null)

  const newInputRef    = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (creatingNew) newInputRef.current?.focus()    }, [creatingNew])
  useEffect(() => { if (renamingDir) renameInputRef.current?.select() }, [renamingDir])

  const handleContextMenu = (e: React.MouseEvent, timeline: TimelineRef) => {
    if (collapsed) return
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, timeline })
  }

  const handleCreateSubmit = async () => {
    const name = newTitle.trim()
    if (!name) { setCreatingNew(false); setNewTitle(''); return }
    setIsProcessing(true)
    try {
      await createTimeline(name)
    } finally {
      setCreatingNew(false)
      setNewTitle('')
      setIsProcessing(false)
    }
  }

  const handleRenameSubmit = async () => {
    const name = renameValue.trim()
    if (!name || !renamingDir) { setRenamingDir(null); return }
    setIsProcessing(true)
    try {
      await renameTimeline(renamingDir, name)
    } finally {
      setRenamingDir(null)
      setIsProcessing(false)
    }
  }

  const handleTrashConfirm = async () => {
    if (!confirmTrash) return
    setIsProcessing(true)
    try {
      await trashTimeline(confirmTrash.dirPath)
    } finally {
      setConfirmTrash(null)
      setIsProcessing(false)
    }
  }

  const startRename = (timeline: TimelineRef) => {
    setContextMenu(null)
    setRenamingDir(timeline.dirPath)
    setRenameValue(timeline.title)
  }

  const startTrash = (timeline: TimelineRef) => {
    setContextMenu(null)
    setConfirmTrash(timeline)
  }

  const handleTimelineClick = async (timeline: TimelineRef) => {
    if (renamingDir === timeline.dirPath) return
    await openTimeline(timeline.dirPath, timeline.title)
    navigate('/timeline')
  }

  return (
    <>
      <div className="mt-1">

        {!collapsed && (
          <div className="px-3 py-1.5 flex items-center justify-between">
            <span className="font-mono text-2xs text-chr-muted tracking-wider uppercase">
              {t('timelines_section')}
            </span>
            <button
              onClick={() => { setCreatingNew(true); setNewTitle('') }}
              className="p-0.5 rounded-sm text-chr-muted hover:text-chr-primary hover:bg-hover transition-colors"
              title={t('new_timeline')}
            >
              <Plus size={13} strokeWidth={1.5} />
            </button>
          </div>
        )}

        {!collapsed && creatingNew && (
          <div className="px-2 pb-1">
            <input
              ref={newInputRef}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter')  handleCreateSubmit()
                if (e.key === 'Escape') { setCreatingNew(false); setNewTitle('') }
              }}
              onBlur={handleCreateSubmit}
              placeholder={t('timeline_name_ph')}
              disabled={isProcessing}
              className={cn(
                'w-full px-3 py-1.5 text-sm rounded-sm outline-none',
                'bg-active border border-chr-subtle text-chr-primary',
                'placeholder:text-chr-muted font-sans',
                'focus:border-chr-strong transition-colors disabled:opacity-50'
              )}
            />
          </div>
        )}

        <div className="space-y-0.5 px-2">
          {timelines.map((timeline) => (
            <div key={timeline.dirPath}>

              {renamingDir === timeline.dirPath && !collapsed ? (
                <div className="px-1 py-0.5">
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter')  handleRenameSubmit()
                      if (e.key === 'Escape') setRenamingDir(null)
                    }}
                    onBlur={handleRenameSubmit}
                    disabled={isProcessing}
                    className={cn(
                      'w-full px-2 py-1.5 text-sm rounded-sm outline-none',
                      'bg-active border border-chr-subtle text-chr-primary font-sans',
                      'focus:border-chr-strong transition-colors disabled:opacity-50'
                    )}
                  />
                </div>
              ) : (
                <button
                  onClick={() => handleTimelineClick(timeline)}
                  onContextMenu={(e) => handleContextMenu(e, timeline)}
                  title={collapsed ? timeline.title : undefined}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-sm text-sm',
                    'transition-colors duration-150',
                    'text-chr-secondary hover:bg-hover hover:text-chr-primary',
                    collapsed && 'justify-center px-2'
                  )}
                >
                  <BookOpen size={16} className="shrink-0 text-chr-muted" strokeWidth={1.5} />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate text-left">{timeline.title}</span>
                      <span className="font-mono text-2xs text-chr-muted shrink-0">
                        {timeline.eventCount > 0 ? timeline.eventCount : ''}
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onRename={() => startRename(contextMenu.timeline)}
          onTrash={() => startTrash(contextMenu.timeline)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {confirmTrash && (
        <ConfirmModal
          title={t('trash_confirm_title')}
          description={t('trash_confirm_desc', { title: confirmTrash.title })}
          confirmLabel={t('trash_confirm_btn')}
          isLoading={isProcessing}
          onConfirm={handleTrashConfirm}
          onCancel={() => setConfirmTrash(null)}
        />
      )}
    </>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function Sidebar(): React.ReactElement {
  const { isSidebarCollapsed, toggleSidebar } = useAppStore()
  const vaultInfo = useVaultStore((s) => s.vaultInfo)
  const { t } = useI18n()

  const navItems = [
    {
      label: t('nav_home'),
      path: '/',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      )
    },
    {
      label: t('nav_settings'),
      path: '/settings',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      )
    },
    {
      label: t('nav_about'),
      path: '/about',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
        </svg>
      )
    }
  ]

  return (
    <aside
      className={cn(
        'flex flex-col h-full border-r border-chr-subtle bg-surface text-chr-primary',
        'transition-all duration-200 ease-in-out shrink-0',
        isSidebarCollapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* ── Logo / App name ────────────────────────────────────────────── */}
      <div
        className={cn(
          'flex items-center h-14 px-4 border-b border-chr-subtle bg-surface shrink-0',
          isSidebarCollapsed ? 'justify-center' : 'justify-between'
        )}
      >
        {!isSidebarCollapsed && (
          <span className="font-serif text-base text-chr-primary truncate">Tecius</span>
        )}

        <button
          onClick={toggleSidebar}
          className={cn(
            'p-1.5 rounded-sm text-chr-muted',
            'hover:bg-hover hover:text-chr-secondary',
            'transition-colors duration-150'
          )}
          aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            className={cn('w-4 h-4 transition-transform duration-200', isSidebarCollapsed && 'rotate-180')}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
      </div>

      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <nav className="p-2 space-y-0.5 shrink-0">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-sm text-sm',
                'transition-colors duration-150',
                isActive
                  ? 'bg-active text-chr-primary font-medium border-l-2 border-chr-strong'
                  : 'text-chr-secondary hover:bg-hover hover:text-chr-primary',
                isSidebarCollapsed && 'justify-center px-2'
              )
            }
            title={isSidebarCollapsed ? item.label : undefined}
          >
            <span className="shrink-0">{item.icon}</span>
            {!isSidebarCollapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}

        {/* Imagens do vault */}
        {vaultInfo && (
          <NavLink
            to="/assets"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-sm text-sm',
                'transition-colors duration-150',
                isActive
                  ? 'bg-active text-chr-primary font-medium border-l-2 border-chr-strong'
                  : 'text-chr-secondary hover:bg-hover hover:text-chr-primary',
                isSidebarCollapsed && 'justify-center px-2'
              )
            }
            title={isSidebarCollapsed ? t('nav_images') : undefined}
          >
            <span className="shrink-0"><Images size={20} className="w-5 h-5" strokeWidth={1.5} /></span>
            {!isSidebarCollapsed && <span className="truncate">{t('nav_images')}</span>}
          </NavLink>
        )}

        {/* Lixeira do vault */}
        {vaultInfo && (
          <NavLink
            to="/trash"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-sm text-sm',
                'transition-colors duration-150',
                isActive
                  ? 'bg-active text-chr-primary font-medium border-l-2 border-chr-strong'
                  : 'text-chr-secondary hover:bg-hover hover:text-chr-primary',
                isSidebarCollapsed && 'justify-center px-2'
              )
            }
            title={isSidebarCollapsed ? t('nav_trash') : undefined}
          >
            <span className="shrink-0 relative">
              <Trash size={18} className="w-5 h-5" strokeWidth={1.5} />
              {vaultInfo.trashCount > 0 && !isSidebarCollapsed && (
                <span className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-chr-muted text-surface font-mono text-[9px] leading-none flex items-center justify-center">
                  {vaultInfo.trashCount}
                </span>
              )}
            </span>
            {!isSidebarCollapsed && (
              <span className="flex-1 truncate">{t('nav_trash')}</span>
            )}
            {!isSidebarCollapsed && vaultInfo.trashCount > 0 && (
              <span className="font-mono text-2xs text-chr-muted shrink-0">{vaultInfo.trashCount}</span>
            )}
          </NavLink>
        )}
      </nav>

      {/* ── Timelines do vault ─────────────────────────────────────────── */}
      {vaultInfo && (
        <>
          <div className="border-t border-chr-subtle mx-2" />
          <div className="flex-1 overflow-y-auto py-1">
            <TimelinesSection timelines={vaultInfo.timelines} collapsed={isSidebarCollapsed} />
          </div>
        </>
      )}

      {/* ── Footer area ────────────────────────────────────────────────── */}
      <div className="p-2 border-t border-chr-subtle shrink-0">
        <div
          className={cn(
            'flex items-center gap-3 px-3 py-2',
            'text-2xs text-chr-muted font-mono tracking-wider uppercase',
            isSidebarCollapsed && 'justify-center'
          )}
        >
          <div className="w-5 h-5 border border-chr-subtle flex items-center justify-center shrink-0">
            <span className="font-serif text-xs text-chr-secondary font-medium">C</span>
          </div>
          {!isSidebarCollapsed && <span>v0.1.0</span>}
        </div>
      </div>
    </aside>
  )
}
