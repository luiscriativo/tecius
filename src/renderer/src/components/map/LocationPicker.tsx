/**
 * LocationPicker — modal para escolher onde um evento ocorreu.
 *
 * - Busca offline (países, estados, cidades — Natural Earth)
 * - Busca online opcional (OpenStreetMap), só se ativada em Configurações
 * - Clique no mapa marca um ponto exato
 * - Precisão, nome e coordenadas editáveis
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { FeatureCollection } from 'geojson'
import { MapPin, Search, X, Globe, Layers } from 'lucide-react'
import { WorldMap, type MapArea, type MapMarker } from './WorldMap'
import { searchPlaces, precisionFromOsm, type PlaceResult } from '@/utils/geoData'
import { DEFAULT_RADIUS_KM, PRECISION_LABELS, effectiveRadiusKm } from '@/utils/location'
import { parseChroniclerDate, formatYear } from '@/utils/chroniclerDate'
import { useAppStore } from '@/stores/useAppStore'
import { useI18n } from '@/hooks/useI18n'
import { cn } from '@/utils/cn'
import type { EventLocation, LocationPrecision } from '@/types/chronicler'

interface LocationPickerProps {
  value: EventLocation | null
  /** Data do evento/trecho — em tempo profundo, explica e permite pré-visualizar a era */
  dateText?: string
  onSave: (loc: EventLocation | null) => void
  onCancel: () => void
}

const PRECISIONS: LocationPrecision[] = ['point', 'city', 'region', 'country', 'approx']

export function LocationPicker({ value, dateText, onSave, onCancel }: LocationPickerProps) {
  const { t, language } = useI18n()
  const onlineEnabled = useAppStore((s) => s.onlineGeocoding)
  const [loc, setLoc] = useState<EventLocation | null>(value)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [onlineState, setOnlineState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [fitKey, setFitKey] = useState('init')
  const inputRef = useRef<HTMLInputElement>(null)
  const paleoEnabled = useAppStore((s) => s.paleoMaps)

  // ── Tempo profundo: o local é marcado no mapa de HOJE; a posição na época é calculada
  const eventYear = dateText ? parseChroniclerDate(dateText).year : 0
  const isDeep = eventYear < -10_000
  const ageMa = Math.max(0.1, Math.round((-eventYear / 1e6) * 10) / 10)
  const [eraPreview, setEraPreview] = useState<{ coast: FeatureCollection; point: [number, number] | null } | null>(null)
  const [eraState, setEraState] = useState<'idle' | 'loading' | 'error'>('idle')
  const showEra = async () => {
    if (!loc) return
    setEraState('loading')
    const [coast, pts] = await Promise.all([
      window.electronAPI.invoke<{ success: boolean; data?: FeatureCollection }>('geo:paleo-coastlines', ageMa),
      window.electronAPI.invoke<{ success: boolean; data?: Array<[number, number] | null> }>('geo:paleo-points', [[loc.lng, loc.lat]], ageMa),
    ])
    if (!coast.success || !coast.data || !pts.success || !pts.data) { setEraState('error'); return }
    setEraPreview({ coast: coast.data, point: pts.data[0] ?? null })
    setEraState('idle')
    setFitKey(`era-${ageMa}-${loc.lat},${loc.lng}`)
  }
  // Mudou o local: a pré-visualização da era deixa de valer
  useEffect(() => { setEraPreview(null) }, [loc?.lat, loc?.lng])

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onCancel])

  // Busca offline enquanto digita
  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      searchPlaces(query).then((r) => { if (alive) setResults(r) })
    }, 120)
    return () => { alive = false; clearTimeout(timer) }
  }, [query])

  const searchOnline = async () => {
    if (!onlineEnabled || query.trim().length < 2) return
    setOnlineState('loading')
    const res = await window.electronAPI.invoke<{ success: boolean; data?: Array<{ name: string; lat: number; lng: number; type: string; cls: string }>; error?: string }>(
      'geo:search-online', query.trim()
    )
    if (!res.success || !res.data) { setOnlineState('error'); return }
    setOnlineState('idle')
    setResults(res.data.map((r) => {
      const precision = precisionFromOsm(r.type, r.cls)
      return {
        title: r.name.split(',')[0] ?? r.name,
        subtitle: r.name.split(',').slice(1, 4).join(',').trim(),
        kind: 'online' as const,
        location: { name: r.name.split(',').slice(0, 3).join(',').trim(), lat: r.lat, lng: r.lng, precision },
      }
    }))
  }

  const choose = (r: PlaceResult) => {
    setLoc(r.location)
    setFitKey(`${r.location.lat},${r.location.lng},${r.location.precision}`)
  }

  const setField = <K extends keyof EventLocation>(k: K, v: EventLocation[K]) =>
    setLoc((l) => (l ? { ...l, [k]: v } : l))

  const markers: MapMarker[] = useMemo(() => {
    if (!loc) return []
    if (eraPreview) return eraPreview.point
      ? [{ id: 'sel', lng: eraPreview.point[0], lat: eraPreview.point[1], shape: 'dot', label: loc.name ?? '', selected: true }]
      : []
    return [{ id: 'sel', lng: loc.lng, lat: loc.lat, shape: 'dot', label: loc.name ?? '', selected: true }]
  }, [loc, eraPreview])
  const areas: MapArea[] = useMemo(() => !eraPreview && loc && loc.precision !== 'point'
    ? [{ id: 'sel', lng: loc.lng, lat: loc.lat, areaCode: loc.precision === 'country' || loc.precision === 'region' ? loc.area : undefined, radiusKm: effectiveRadiusKm(loc) }]
    : [], [loc, eraPreview])

  const label = (p: LocationPrecision) => PRECISION_LABELS[p][language === 'en' ? 'en' : 'pt']
  const inputCls = 'w-full px-2.5 py-1.5 rounded-sm bg-vault border border-chr-subtle text-chr-primary font-mono text-xs focus:outline-none focus:border-chr'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-label={t('location_title')}>
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative z-10 w-[min(920px,94vw)] h-[min(620px,90vh)] chr-card shadow-card-hover flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-chr-subtle">
          <h3 className="font-serif text-base text-chr-primary flex items-center gap-2"><MapPin size={15} strokeWidth={1.5} />{t('location_title')}</h3>
          <button onClick={onCancel} aria-label={t('cancel')} className="text-chr-muted hover:text-chr-primary"><X size={16} strokeWidth={1.5} /></button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Coluna esquerda: busca + campos */}
          <div className="w-72 shrink-0 border-r border-chr-subtle flex flex-col min-h-0">
            <div className="p-3 border-b border-chr-subtle space-y-2">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-chr-muted" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (results[0] && !onlineEnabled) choose(results[0]); else searchOnline() } }}
                  placeholder={t('location_search_ph')}
                  className={cn(inputCls, 'pl-7')}
                  data-testid="location-search"
                />
              </div>
              {onlineEnabled ? (
                <button type="button" onClick={searchOnline} disabled={query.trim().length < 2 || onlineState === 'loading'}
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded-sm border border-chr-subtle font-mono text-2xs text-chr-secondary hover:bg-hover disabled:opacity-50">
                  <Globe size={11} /> {onlineState === 'loading' ? t('location_searching') : t('location_search_online')}
                </button>
              ) : (
                <p className="font-mono text-2xs text-chr-muted leading-relaxed">{t('location_offline_hint')}</p>
              )}
              {onlineState === 'error' && <p className="font-mono text-2xs text-red-500">{t('location_online_error')}</p>}
            </div>

            <div className="flex-1 overflow-y-auto">
              {results.map((r, i) => (
                <button key={`${r.kind}-${i}`} type="button" onClick={() => choose(r)}
                  className="w-full text-left px-3 py-2 border-b border-chr-subtle hover:bg-hover transition-colors" data-testid="location-result">
                  <span className="block text-sm text-chr-primary truncate">{r.title}</span>
                  <span className="block font-mono text-2xs text-chr-muted truncate">
                    {label(r.location.precision)}{r.subtitle ? ` · ${r.subtitle}` : ''}{r.kind === 'online' ? ' · OSM' : ''}
                  </span>
                </button>
              ))}
              {results.some((r) => r.kind === 'online') && (
                <p className="px-3 py-2 font-mono text-2xs text-chr-muted">© colaboradores do OpenStreetMap (ODbL)</p>
              )}
              {query.trim().length >= 2 && results.length === 0 && (
                <p className="px-3 py-3 font-mono text-2xs text-chr-muted">{t('location_no_results')}</p>
              )}
            </div>

            {loc && (
              <div className="shrink-0 border-t border-chr-subtle p-3 space-y-2" data-testid="location-fields">
                <input value={loc.name ?? ''} onChange={(e) => setField('name', e.target.value || undefined)} placeholder={t('location_name_ph')} className={inputCls} />
                <select value={loc.precision} onChange={(e) => {
                  const p = e.target.value as LocationPrecision
                  setLoc((l) => (l ? { ...l, precision: p, radiusKm: undefined, area: p === 'country' || p === 'region' ? l.area : undefined } : l))
                }} className={inputCls} aria-label={t('location_precision')}>
                  {PRECISIONS.map((p) => <option key={p} value={p}>{label(p)}</option>)}
                </select>
                <div className="flex gap-2">
                  <input type="number" step="0.0001" value={loc.lat} onChange={(e) => Number.isFinite(+e.target.value) && setField('lat', Math.max(-90, Math.min(90, +e.target.value)))} className={inputCls} aria-label="Latitude" />
                  <input type="number" step="0.0001" value={loc.lng} onChange={(e) => Number.isFinite(+e.target.value) && setField('lng', Math.max(-180, Math.min(180, +e.target.value)))} className={inputCls} aria-label="Longitude" />
                </div>
                {loc.precision !== 'point' && loc.precision !== 'country' && (
                  <label className="flex items-center gap-2 font-mono text-2xs text-chr-muted">
                    {t('location_radius')}
                    <input type="number" min={1} value={Math.round(effectiveRadiusKm(loc))}
                      onChange={(e) => setField('radiusKm', Math.max(1, +e.target.value) || DEFAULT_RADIUS_KM[loc.precision])}
                      className={cn(inputCls, 'w-20')} />
                    km
                  </label>
                )}
              </div>
            )}
          </div>

          {/* Mapa */}
          <div className="flex-1 flex flex-col min-w-0">
            {isDeep && (
              <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-chr-subtle bg-subtle font-mono text-2xs text-chr-secondary" data-testid="picker-deep-notice">
                <Layers size={12} strokeWidth={1.5} className="text-timeline-chronicle-text shrink-0" />
                <span className="flex-1 min-w-[200px] leading-relaxed">
                  {eraPreview
                    ? t('location_era_preview', { age: formatYear(eventYear) })
                    : t('location_deep_hint', { age: formatYear(eventYear, false) })}
                </span>
                {paleoEnabled ? (
                  <button type="button" disabled={!loc || eraState === 'loading'} data-testid="picker-era-toggle"
                    onClick={() => (eraPreview ? (setEraPreview(null), setFitKey(`now-${Date.now()}`)) : showEra())}
                    className="px-2 py-0.5 rounded-sm border border-chr-subtle text-chr-primary hover:bg-hover disabled:opacity-40">
                    {eraPreview ? t('map_paleo_hide') : eraState === 'loading' ? t('location_era_loading') : t('location_era_show', { age: formatYear(eventYear) })}
                  </button>
                ) : (
                  <span className="text-chr-muted">{t('map_paleo_enable_hint')}</span>
                )}
                {eraState === 'error' && <span className="text-red-500">{t('map_paleo_error')}</span>}
              </div>
            )}
            <WorldMap
              className="flex-1"
              markers={markers}
              areas={areas}
              basemap={eraPreview?.coast ?? null}
              fitKey={fitKey}
              onMapClick={eraPreview ? undefined : (lng, lat) => {
                setLoc((l) => ({
                  name: l?.precision === 'point' ? l?.name : undefined,
                  lat: Math.round(lat * 1e5) / 1e5,
                  lng: Math.round(lng * 1e5) / 1e5,
                  precision: 'point',
                }))
              }}
            />
            <p className="shrink-0 px-3 py-1.5 border-t border-chr-subtle font-mono text-2xs text-chr-muted">{eraPreview ? t('location_era_preview_hint') : t('location_map_hint')}</p>
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-between gap-2 px-5 py-3 border-t border-chr-subtle">
          {value ? (
            <button type="button" onClick={() => onSave(null)} className="font-mono text-xs text-red-500/80 hover:text-red-500">{t('location_remove')}</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="px-3 py-1.5 font-mono text-xs rounded-sm border border-chr-subtle text-chr-muted hover:text-chr-secondary">{t('cancel')}</button>
            <button type="button" disabled={!loc} onClick={() => loc && onSave(loc)} data-testid="location-save"
              className="px-3 py-1.5 font-mono text-xs rounded-sm bg-chr-primary text-surface hover:opacity-90 disabled:opacity-40">{t('save')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
