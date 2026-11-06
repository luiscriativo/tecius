/**
 * Textos do processo principal no idioma do app (títulos de diálogos nativos e
 * mensagens de erro que chegam ao usuário). O renderer informa o idioma via
 * `app:set-language` ao abrir e sempre que ele muda.
 */

export type MainLanguage = 'pt' | 'en'

const messages = {
  pt: {
    dialog_pick_vault: 'Escolher pasta do Vault',
    dialog_use_as_vault: 'Usar como Vault',
    dialog_pick_image: 'Escolher imagem',
    dialog_images: 'Imagens',
    dialog_export_pdf: 'Exportar como PDF',
    dialog_export_html: 'Exportar como página web',
    err_no_vault: 'Vault não configurado',
    err_outside_vault: 'Acesso negado: caminho fora do vault',
    err_invalid_name: 'Nome inválido',
    err_event_exists: 'Já existe um evento com o nome "{name}"',
    err_original_folder_missing: 'A pasta original deste evento não existe mais. Restaure primeiro a timeline de origem.',
    err_vault_missing: 'A pasta do vault não foi encontrada: {path}',
    err_parent_missing: 'A pasta de destino não existe mais: {path}',
    err_trash_item_broken: 'O item da lixeira não contém um arquivo de evento (.md) para restaurar.',
    default_entry_title: 'Evento {n}',
    copy_suffix: ' (cópia)',
    dialog_import_events: 'Importar eventos (CSV ou JSON)',
    dialog_import_files: 'Planilhas e listas',
    dialog_export_png: 'Salvar imagem PNG',
  },
  en: {
    dialog_pick_vault: 'Choose Vault folder',
    dialog_use_as_vault: 'Use as Vault',
    dialog_pick_image: 'Choose image',
    dialog_images: 'Images',
    dialog_export_pdf: 'Export as PDF',
    dialog_export_html: 'Export as web page',
    err_no_vault: 'Vault not configured',
    err_outside_vault: 'Access denied: path outside the vault',
    err_invalid_name: 'Invalid name',
    err_event_exists: 'An event named "{name}" already exists',
    err_original_folder_missing: "This event's original folder no longer exists. Restore its timeline first.",
    err_vault_missing: 'The vault folder was not found: {path}',
    err_parent_missing: 'The destination folder no longer exists: {path}',
    err_trash_item_broken: 'This trash item has no event file (.md) to restore.',
    default_entry_title: 'Event {n}',
    copy_suffix: ' (copy)',
    dialog_import_events: 'Import events (CSV or JSON)',
    dialog_import_files: 'Spreadsheets and lists',
    dialog_export_png: 'Save PNG image',
  },
} as const

export type MainMessageKey = keyof typeof messages.pt

let language: MainLanguage = 'pt'

export function setMainLanguage(l: unknown): void {
  if (l === 'pt' || l === 'en') language = l
}

export function getMainLanguage(): MainLanguage {
  return language
}

export function tm(key: MainMessageKey, params?: Record<string, string | number>): string {
  let text: string = messages[language][key]
  for (const [k, v] of Object.entries(params ?? {})) text = text.replaceAll(`{${k}}`, String(v))
  return text
}
