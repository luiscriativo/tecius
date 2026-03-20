import { useAppStore } from '@/stores/useAppStore'
import { translations } from '@/i18n/translations'
import type { TranslationKey } from '@/i18n/translations'

type Params = Record<string, string | number>

/**
 * useI18n — returns t(key, params?) for UI string translation.
 *
 * Interpolation: {param} syntax. Example: t('events_other', { count: 5 }) → "5 events"
 * Plural helper: pass the correct singular/plural key from the caller.
 */
export function useI18n() {
  const language = useAppStore((s) => s.language)
  const dict = translations[language]

  function t(key: TranslationKey, params?: Params): string {
    const template: string = (dict as Record<string, string>)[key] ?? key
    if (!params) return template
    return Object.entries(params).reduce(
      (str, [k, v]) => str.replaceAll(`{${k}}`, String(v)),
      template
    )
  }

  /** Convenience: singular or plural based on count */
  function nEvents(count: number): string {
    return count === 1 ? t('events_one') : t('events_other', { count })
  }
  function nSections(count: number): string {
    return count === 1 ? t('sections_one') : t('sections_other', { count })
  }
  function nItems(count: number): string {
    return count === 1 ? t('items_one') : t('items_other', { count })
  }
  function nResults(count: number): string {
    return count === 1 ? t('results_one') : t('results_other', { count })
  }

  return { t, language, nEvents, nSections, nItems, nResults }
}
