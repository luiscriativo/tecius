import { useCallback } from 'react'
import { useTimelineStore } from '../stores/useTimelineStore'
import { useNavigationStore } from '../stores/useNavigationStore'
import { parseChroniclerDate } from '../utils/chroniclerDate'
import type { RawTimeline, RawEvent } from '../types/ipc'
import type { TimelineData, ChroniclerEvent, ChroniclerDate, TimelineMeta, TimelineRef } from '../types/chronicler'
import type { EventFrontmatter } from '../types/chronicler'

function toChroniclerDate(raw: Record<string, unknown>): ChroniclerDate {
  const dateStr = String(raw.date ?? '0')
  const timeStr = raw.time ? String(raw.time) : undefined
  return parseChroniclerDate(dateStr, timeStr, undefined, Boolean(raw.circa))
}

function toChroniclerEvent(raw: RawEvent): ChroniclerEvent {
  const fm = raw.frontmatter as Partial<EventFrontmatter>
  return {
    filePath: raw.filePath,
    relativePath: raw.relativePath,
    slug: raw.slug,
    frontmatter: {
      type: 'event',
      title: String(fm.title ?? raw.slug),
      date: String(fm.date ?? '0'),
      ...fm,
    } as EventFrontmatter,
    date: toChroniclerDate(raw.frontmatter),
    dateEnd: raw.frontmatter['date-end']
      ? parseChroniclerDate(String(raw.frontmatter['date-end']))
      : undefined,
    hasSubtimeline: raw.hasSubtimeline,
    subtimelinePath: raw.subtimelinePath,
    chronicle: raw.chronicle,
  }
}

function toTimelineData(raw: RawTimeline): TimelineData {
  const events = raw.events.map((e) => toChroniclerEvent(e))
  const sorted = [...events].sort((a, b) => a.date.sortKey - b.date.sortKey)

  const minDate = sorted[0]?.date ?? null
  const maxDate = sorted[sorted.length - 1]?.date ?? null

  const meta: TimelineMeta = {
    title: String(raw.meta.title ?? 'Timeline'),
    description: raw.meta.description ? String(raw.meta.description) : undefined,
    icon: raw.meta.icon ? String(raw.meta.icon) : undefined,
    sort: 'chronological',
    tags: Array.isArray(raw.meta.tags) ? raw.meta.tags.map(String) : [],
  }

  const subtimelines: TimelineRef[] = raw.subtimelines.map((s) => ({
    title: s.title,
    dirPath: s.dirPath,
    relativePath: s.relativePath,
    icon: s.icon,
    eventCount: s.eventCount,
  }))

  return {
    dirPath: raw.dirPath,
    relativePath: raw.relativePath,
    meta,
    events: sorted,
    subtimelines,
    dateRange: {
      min: minDate,
      max: maxDate,
      spanYears: minDate && maxDate ? Math.abs(maxDate.year - minDate.year) : 0,
    },
  }
}

export function useTimeline() {
  const {
    currentTimeline,
    selectedEvent,
    selectedEventBody,
    selectedEventRaw,
    isLoadingTimeline,
    isLoadingEvent,
    viewMode,
    setCurrentTimeline,
    setSelectedEvent,
    setSelectedEventBody,
    setSelectedEventRaw,
    setLoadingTimeline,
    setLoadingEvent,
    setViewMode,
    cacheTimeline,
    getCached,
    deleteCached,
    clearSelection,
  } = useTimelineStore()

  const { stack, push, pop, reset } = useNavigationStore()

  const loadTimeline = useCallback(
    async (dirPath: string, title: string, pushNav = true) => {
      const cached = getCached(dirPath)
      if (cached) {
        setCurrentTimeline(cached)
        clearSelection()
        if (pushNav) push({ title, dirPath })
        return
      }

      setLoadingTimeline(true)
      clearSelection()
      try {
        const result = await window.electronAPI.invoke<{
          success: boolean
          data?: RawTimeline
          error?: string
        }>('fs:read-timeline', dirPath)
        if (!result.success || !result.data) throw new Error(result.error)
        const data = toTimelineData(result.data)
        cacheTimeline(dirPath, data)
        setCurrentTimeline(data)
        if (pushNav) push({ title, dirPath })
      } finally {
        setLoadingTimeline(false)
      }
    },
    [getCached, setCurrentTimeline, setLoadingTimeline, clearSelection, cacheTimeline, push]
  )

  const loadEvent = useCallback(
    async (event: ChroniclerEvent) => {
      setSelectedEvent(event)
      setSelectedEventBody(null)
      setSelectedEventRaw(null)
      setLoadingEvent(true)
      try {
        const result = await window.electronAPI.invoke<{
          success: boolean
          data?: { body: string; raw: string }
          error?: string
        }>('fs:read-event', event.filePath)
        if (result.success && result.data) {
          setSelectedEventBody(result.data.body)
          setSelectedEventRaw(result.data.raw)
        }
      } finally {
        setLoadingEvent(false)
      }
    },
    [setSelectedEvent, setSelectedEventBody, setSelectedEventRaw, setLoadingEvent]
  )

  const saveEvent = useCallback(
    async (filePath: string, rawContent: string): Promise<boolean> => {
      const result = await window.electronAPI.invoke<{
        success: boolean
        data?: { body: string }
        error?: string
      }>('fs:write-event', filePath, rawContent)
      if (result.success && result.data) {
        setSelectedEventBody(result.data.body)
        setSelectedEventRaw(rawContent)
        // Invalida o cache da timeline atual para forçar releitura
        if (currentTimeline) deleteCached(currentTimeline.dirPath)
      } else if (!result.success) {
        console.error('[saveEvent] Falha ao salvar:', result.error)
      }
      return result.success
    },
    [setSelectedEventBody, setSelectedEventRaw, currentTimeline, deleteCached]
  )

  const goBack = useCallback(async () => {
    const prev = pop()
    if (prev) {
      await loadTimeline(prev.dirPath, prev.title, false)
    }
  }, [pop, loadTimeline])

  // Opens a top-level timeline: resets the nav stack (breadcrumb starts fresh)
  const openTimeline = useCallback(
    async (dirPath: string, title: string) => {
      const cached = getCached(dirPath)
      if (cached) {
        setCurrentTimeline(cached)
        clearSelection()
        reset({ title, dirPath })
        return
      }

      setLoadingTimeline(true)
      clearSelection()
      try {
        const result = await window.electronAPI.invoke<{
          success: boolean
          data?: RawTimeline
          error?: string
        }>('fs:read-timeline', dirPath)
        if (!result.success || !result.data) throw new Error(result.error)
        const data = toTimelineData(result.data)
        cacheTimeline(dirPath, data)
        setCurrentTimeline(data)
        reset({ title, dirPath })
      } finally {
        setLoadingTimeline(false)
      }
    },
    [getCached, setCurrentTimeline, setLoadingTimeline, clearSelection, cacheTimeline, reset]
  )

  const enterSubtimeline = useCallback(
    async (event: ChroniclerEvent) => {
      if (!event.subtimelinePath) return
      clearSelection()
      await loadTimeline(event.subtimelinePath, event.frontmatter.title, true)
    },
    [clearSelection, loadTimeline]
  )

  const openInEditor = useCallback((filePath: string) => {
    window.electronAPI.send('fs:open-in-editor', filePath)
  }, [])

  const reloadTimeline = useCallback(async () => {
    if (!currentTimeline) return
    deleteCached(currentTimeline.dirPath)
    await loadTimeline(currentTimeline.dirPath, currentTimeline.meta.title, false)
  }, [currentTimeline, deleteCached, loadTimeline])

  const createEvent = useCallback(
    async (timelineDirPath: string, title: string, filename?: string, date?: string): Promise<{ filePath: string; slug: string } | null> => {
      const result = await window.electronAPI.invoke<{
        success: boolean
        data?: { filePath: string; slug: string }
        error?: string
      }>('fs:create-event', timelineDirPath, title, filename, date)
      if (result.success && result.data) {
        deleteCached(timelineDirPath)
        return result.data
      }
      return null
    },
    [deleteCached]
  )

  const deleteEvent = useCallback(
    async (eventFilePath: string): Promise<boolean> => {
      const result = await window.electronAPI.invoke<{
        success: boolean
        error?: string
      }>('fs:delete-event', eventFilePath)
      if (result.success && currentTimeline) {
        deleteCached(currentTimeline.dirPath)
      }
      return result.success
    },
    [currentTimeline, deleteCached]
  )

  const renameEventFile = useCallback(
    async (eventFilePath: string, newFilename: string): Promise<{ newFilePath: string; newSlug: string } | null> => {
      const result = await window.electronAPI.invoke<{
        success: boolean
        data?: { newFilePath: string; newSlug: string }
        error?: string
      }>('fs:rename-event-file', eventFilePath, newFilename)
      if (result.success && result.data) {
        if (currentTimeline) deleteCached(currentTimeline.dirPath)
        return result.data
      }
      return null
    },
    [currentTimeline, deleteCached]
  )

  return {
    currentTimeline,
    selectedEvent,
    selectedEventBody,
    selectedEventRaw,
    isLoadingTimeline,
    isLoadingEvent,
    viewMode,
    stack,
    setViewMode,
    loadTimeline,
    openTimeline,
    loadEvent,
    saveEvent,
    goBack,
    enterSubtimeline,
    openInEditor,
    clearSelection,
    reloadTimeline,
    createEvent,
    deleteEvent,
    renameEventFile,
  }
}
