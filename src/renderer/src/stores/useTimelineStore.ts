import { create } from 'zustand'
import type { TimelineData, ChroniclerEvent } from '../types/chronicler'

interface TimelineState {
  currentTimeline: TimelineData | null
  selectedEvent: ChroniclerEvent | null
  selectedEventBody: string | null
  selectedEventRaw: string | null
  isLoadingTimeline: boolean
  isLoadingEvent: boolean
  viewMode: 'horizontal' | 'list' | 'files'
  cache: Map<string, TimelineData>

  setCurrentTimeline: (t: TimelineData | null) => void
  setSelectedEvent: (e: ChroniclerEvent | null) => void
  setSelectedEventBody: (body: string | null) => void
  setSelectedEventRaw: (raw: string | null) => void
  setLoadingTimeline: (v: boolean) => void
  setLoadingEvent: (v: boolean) => void
  setViewMode: (mode: 'horizontal' | 'list' | 'files') => void
  cacheTimeline: (path: string, data: TimelineData) => void
  getCached: (path: string) => TimelineData | undefined
  deleteCached: (path: string) => void
  clearSelection: () => void
}

export const useTimelineStore = create<TimelineState>()((set, get) => ({
  currentTimeline: null,
  selectedEvent: null,
  selectedEventBody: null,
  selectedEventRaw: null,
  isLoadingTimeline: false,
  isLoadingEvent: false,
  viewMode: 'horizontal',
  cache: new Map(),

  setCurrentTimeline: (t) => set({ currentTimeline: t }),
  setSelectedEvent: (e) => set({ selectedEvent: e }),
  setSelectedEventBody: (body) => set({ selectedEventBody: body }),
  setSelectedEventRaw: (raw) => set({ selectedEventRaw: raw }),
  setLoadingTimeline: (v) => set({ isLoadingTimeline: v }),
  setLoadingEvent: (v) => set({ isLoadingEvent: v }),
  setViewMode: (mode) => set({ viewMode: mode }),
  cacheTimeline: (path, data) => {
    const cache = new Map(get().cache)
    if (cache.size > 30) {
      const firstKey = cache.keys().next().value
      if (firstKey) cache.delete(firstKey)
    }
    cache.set(path, data)
    set({ cache })
  },
  getCached: (path) => get().cache.get(path),
  deleteCached: (path) => {
    const cache = new Map(get().cache)
    cache.delete(path)
    set({ cache })
  },
  clearSelection: () => set({ selectedEvent: null, selectedEventBody: null, selectedEventRaw: null }),
}))
