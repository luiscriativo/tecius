import type { ChroniclerEvent } from '../types/chronicler'

/**
 * Evento com mais de um trecho (exibido como losango na timeline).
 * Um chronicle com uma única entrada é, para o usuário, um evento comum (bolinha).
 */
export function isMultiPart(event: ChroniclerEvent): boolean {
  return !!event.chronicle && event.chronicle.totalEntries > 1
}
