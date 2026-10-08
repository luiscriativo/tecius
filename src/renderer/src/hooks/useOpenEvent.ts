import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTimeline } from '@/hooks/useTimeline'
import { useTimelineStore } from '@/stores/useTimelineStore'
import { useNavigationStore } from '@/stores/useNavigationStore'

/**
 * Abre um evento de qualquer timeline do vault (busca global e links [[…]]):
 * carrega a timeline dele, recomeça o caminho do topo nela e mostra o evento.
 */
export function useOpenEvent() {
  const navigate = useNavigate()
  const { loadTimeline, loadEvent } = useTimeline()
  return useCallback(async (d: { filePath: string; slug: string; timelineDir: string; timelineTitle: string }) => {
    useNavigationStore.getState().reset({ title: d.timelineTitle, dirPath: d.timelineDir })
    await loadTimeline(d.timelineDir, d.timelineTitle, false)
    const ev = useTimelineStore.getState().currentTimeline?.events.find((e) => e.filePath === d.filePath && e.slug === d.slug)
    if (ev) { loadEvent(ev); navigate('/event') } else navigate('/timeline')
  }, [navigate, loadTimeline, loadEvent])
}
