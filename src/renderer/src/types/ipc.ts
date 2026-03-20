/**
 * IPC raw types — espelha as interfaces exportadas pelo main process.
 * Mantido separado para evitar que o renderer importe codigo Node.js.
 */

export interface RawEvent {
  filePath: string
  relativePath: string
  slug: string
  frontmatter: Record<string, unknown>
  hasSubtimeline: boolean
  subtimelinePath?: string
  /** Preenchido quando o evento foi expandido de um chronicle */
  chronicle?: {
    title: string
    entryIndex: number
    totalEntries: number
    anchor?: string
  }
}

export interface RawTimeline {
  dirPath: string
  relativePath: string
  meta: Record<string, unknown>
  events: RawEvent[]
  subtimelines: RawTimelineRef[]
}

export interface RawTimelineRef {
  title: string
  dirPath: string
  relativePath: string
  icon?: string
  eventCount: number
}

export interface RawVault {
  rootPath: string
  title: string
  timelines: RawTimelineRef[]
  totalEvents: number
  trashCount: number
}

export interface RawTrashItem {
  name: string
  originalPath: string
  trashedAt: string
  dirPath: string
  eventCount: number
}
