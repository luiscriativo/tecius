import { create } from 'zustand'
import type { TimelineData, ChroniclerEvent } from '../types/chronicler'
import { oneOf, readPref, writePref } from '../utils/prefs'

const VIEW_MODES = ['horizontal', 'list', 'map'] as const

/** Vista do mapa (centro geográfico + escala aparente), por timeline */
export interface MapGeoView { lng: number; lat: number; z: number }
/** Timelines cujas vistas do mapa ficam guardadas (as mais recentes) */
const MAX_MAP_VIEWS = 30
const isMapViews = (v: unknown): v is Record<string, MapGeoView> =>
  !!v && typeof v === 'object' && Object.values(v).every((g) =>
    !!g && typeof g === 'object' && ['lng', 'lat', 'z'].every((k) => Number.isFinite((g as Record<string, unknown>)[k])))
let mapViewsSaveTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Posição da régua do modo Mapa (para voltar ao mesmo momento ao trocar de
 * vista ou abrir um evento). `selectedSlug` é o evento selecionado quando a
 * posição foi salva: se outro evento for selecionado depois (na timeline ou
 * na lista), o mapa abre na data dele.
 */
export interface MapCursor { dirPath: string; t: number; selectedSlug: string | null }

/**
 * Momento (anos decimais, [start, end)) que a timeline horizontal deve
 * enquadrar ao abrir — definido quando se troca do modo Mapa para outra vista.
 */
export interface TimelineFocus { dirPath: string; start: number; end: number }

interface TimelineState {
  currentTimeline: TimelineData | null
  selectedEvent: ChroniclerEvent | null
  selectedEventBody: string | null
  selectedEventRaw: string | null
  isLoadingTimeline: boolean
  isLoadingEvent: boolean
  viewMode: 'horizontal' | 'list' | 'map'
  cache: Map<string, TimelineData>
  mapCursor: MapCursor | null
  /** Zoom e posição do mapa de cada timeline: o mapa reabre onde ficou */
  mapViews: Record<string, MapGeoView>
  timelineFocus: TimelineFocus | null

  setCurrentTimeline: (t: TimelineData | null) => void
  setSelectedEvent: (e: ChroniclerEvent | null) => void
  setSelectedEventBody: (body: string | null) => void
  setSelectedEventRaw: (raw: string | null) => void
  setLoadingTimeline: (v: boolean) => void
  setLoadingEvent: (v: boolean) => void
  setViewMode: (mode: 'horizontal' | 'list' | 'map') => void
  setMapCursor: (c: MapCursor | null) => void
  setMapView: (dirPath: string, view: MapGeoView) => void
  setTimelineFocus: (f: TimelineFocus | null) => void
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
  // A última visão escolhida volta ao reabrir o app
  viewMode: readPref('timeline.viewMode', 'horizontal', oneOf(VIEW_MODES)),
  cache: new Map(),
  mapCursor: null,
  mapViews: readPref('map.views', {}, isMapViews),
  timelineFocus: null,

  setCurrentTimeline: (t) => set({ currentTimeline: t }),
  setSelectedEvent: (e) => set({ selectedEvent: e }),
  setSelectedEventBody: (body) => set({ selectedEventBody: body }),
  setSelectedEventRaw: (raw) => set({ selectedEventRaw: raw }),
  setLoadingTimeline: (v) => set({ isLoadingTimeline: v }),
  setLoadingEvent: (v) => set({ isLoadingEvent: v }),
  setViewMode: (mode) => { writePref('timeline.viewMode', mode); set({ viewMode: mode }) },
  setMapCursor: (c) => set({ mapCursor: c }),
  setMapView: (dirPath, view) => {
    // A mais recente vai para o fim; as mais antigas saem do limite
    const { [dirPath]: _old, ...rest } = get().mapViews
    const entries = Object.entries({ ...rest, [dirPath]: view }).slice(-MAX_MAP_VIEWS)
    set({ mapViews: Object.fromEntries(entries) })
    // Durante o arraste a vista muda a cada quadro: grava só quando para
    if (mapViewsSaveTimer) clearTimeout(mapViewsSaveTimer)
    mapViewsSaveTimer = setTimeout(() => writePref('map.views', get().mapViews), 400)
  },
  setTimelineFocus: (f) => set({ timelineFocus: f }),
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
