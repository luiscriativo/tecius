// ─────────────────────────────────────────────────────────────
// TECIUS — Tipos do dominio
// ─────────────────────────────────────────────────────────────

/** Precisao da data de um evento */
export type DatePrecision = 'year' | 'month' | 'day' | 'hour'

// ── Chronicle (documento multi-evento) ───────────────────────
/**
 * Uma entrada individual dentro de um documento chronicle.
 * Cada entrada gera um dot independente na timeline.
 */
export interface ChronicleEntry {
  date: string                    // ex: "1950-03-15"
  label: string                   // texto exibido no dot / tooltip
  importance?: EventImportance
  category?: EventCategory
  tags?: string[]
  /** ID do bloco no corpo — corresponde a `^anchor` no final do parágrafo */
  anchor?: string
}

/** Categorias de eventos */
export type EventCategory =
  | 'Politica'
  | 'Arte'
  | 'Ciencia'
  | 'Cultura'
  | 'Musica'
  | 'Cinema'
  | 'Literatura'
  | 'Esporte'
  | 'Pessoal'
  | 'Outro'

/** Importancia visual do evento na timeline (1=menor, 5=maior) */
export type EventImportance = 1 | 2 | 3 | 4 | 5

// ── Data normalizada do Tecius ────────────────────────────────
/**
 * Representacao interna de uma data historica.
 * Suporta datas parciais (so ano, ano+mes, data completa com hora).
 * Nao usa Date do JavaScript para evitar problemas com datas historicas.
 */
export interface ChroniclerDate {
  year: number
  month?: number       // 1-12
  day?: number         // 1-31
  hour?: number        // 0-23
  minute?: number      // 0-59
  precision: DatePrecision
  circa: boolean       // data aproximada?
  /** Chave numerica para ordenacao: YYYYMMDD (sem hora para simplificar) */
  sortKey: number
  /** String formatada para exibicao na UI */
  display: string
  /** String formatada curta (so ano, ou Mes Ano, etc.) */
  displayShort: string
}

// ── Frontmatter de um evento ──────────────────────────────────
/** Raw frontmatter parseado do arquivo .md */
export interface EventFrontmatter {
  type: 'event'
  title: string
  date: string                    // ex: "1789-07-14", "1789-07", "1789"
  time?: string                   // ex: "10:30"
  'date-end'?: string
  'date-precision'?: DatePrecision
  circa?: boolean
  tags?: string[]
  category?: EventCategory
  importance?: EventImportance
  'has-subtimeline'?: boolean
  'subtimeline-path'?: string
  links?: Array<{ path: string; label: string }>
  references?: Array<{ url: string; label: string }>
  'cover-image'?: string
}

// ── Evento processado (pronto para uso no renderer) ───────────
export interface ChroniclerEvent {
  /** Caminho absoluto do arquivo .md no disco */
  filePath: string
  /** Caminho relativo a raiz do vault */
  relativePath: string
  /** Slug do arquivo (sem extensao) */
  slug: string
  /** Frontmatter parseado e validado */
  frontmatter: EventFrontmatter
  /** Data normalizada (calculada a partir do frontmatter) */
  date: ChroniclerDate
  /** Data de fim (para eventos com duracao) */
  dateEnd?: ChroniclerDate
  /** Corpo do Markdown (sem o frontmatter) — carregado sob demanda */
  body?: string
  /** Este evento tem uma sub-timeline na mesma pasta? */
  hasSubtimeline: boolean
  /** Caminho da sub-timeline (se existir) */
  subtimelinePath?: string
  /**
   * Presente apenas quando o evento foi gerado a partir de um chronicle.
   * Identifica o documento-fonte e a posição desta entrada nele.
   */
  chronicle?: {
    title: string         // Título do documento chronicle
    entryIndex: number    // Índice da entrada (0-based)
    totalEntries: number  // Total de entradas no chronicle
    anchor?: string       // ID do bloco no corpo (`^anchor`)
  }
}

// ── Metadados de uma timeline ─────────────────────────────────
export interface TimelineMeta {
  title: string
  description?: string
  icon?: string
  sort: 'chronological' | 'reverse' | 'manual'
  tags?: string[]
  /** Corpo do _timeline.md (descricao longa, opcional) */
  body?: string
}

// ── Timeline carregada ────────────────────────────────────────
export interface TimelineData {
  /** Caminho absoluto da pasta da timeline no disco */
  dirPath: string
  /** Caminho relativo a raiz do vault */
  relativePath: string
  /** Metadados do _timeline.md */
  meta: TimelineMeta
  /** Eventos ordenados por data */
  events: ChroniclerEvent[]
  /** Sub-timelines diretas (pastas com _timeline.md dentro desta pasta) */
  subtimelines: TimelineRef[]
  /** Intervalo de datas (calculado a partir dos eventos) */
  dateRange: {
    min: ChroniclerDate | null
    max: ChroniclerDate | null
    spanYears: number
  }
}

// ── Referencia leve a uma timeline (para listas e vault) ──────
export interface TimelineRef {
  title: string
  dirPath: string
  relativePath: string
  icon?: string
  eventCount: number
  /** Resumo do periodo coberto */
  period?: string
}

// ── Vault ─────────────────────────────────────────────────────
export interface VaultInfo {
  /** Caminho absoluto da pasta raiz do vault */
  rootPath: string
  title: string
  /** Timelines de nivel 1 (pastas diretas no vault) */
  timelines: TimelineRef[]
  totalEvents: number
  /** Número de itens na lixeira interna do vault */
  trashCount: number
}

// ── Lixeira interna do vault ──────────────────────────────────
export interface TrashItem {
  name: string
  originalPath: string
  trashedAt: string   // ISO string
  dirPath: string
  eventCount: number
}

// ── Item de navegacao (breadcrumb) ────────────────────────────
export interface NavigationItem {
  title: string
  dirPath: string
  /** Estado salvo da timeline (scroll, zoom) para restaurar ao voltar */
  savedState?: {
    scrollLeft: number
    zoom: number
  }
}

// ── Resultado de operacoes de arquivo ────────────────────────
export interface FsResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

// ── Dados do editor de evento ────────────────────────────────
export interface EventEditorData {
  filePath: string
  frontmatter: Partial<EventFrontmatter>
  body: string
  isDirty: boolean
}
