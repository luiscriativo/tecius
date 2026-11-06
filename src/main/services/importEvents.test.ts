import { describe, expect, it } from 'vitest'
import { eventToMarkdown, normalizeImportDate, parseCsv, parseImport } from './importEvents'

describe('parseCsv', () => {
  it('vírgula, aspas com vírgula dentro e quebra de linha entre aspas', () => {
    const rows = parseCsv('title,date,body\n"Tratado, de Tordesilhas",1494-06-07,"linha 1\nlinha 2"\n')
    expect(rows).toEqual([['title', 'date', 'body'], ['Tratado, de Tordesilhas', '1494-06-07', 'linha 1\nlinha 2']])
  })
  it('ponto e vírgula (Excel em português) e BOM', () => {
    const rows = parseCsv('﻿título;data\nCabral;22/04/1500\n')
    expect(rows).toEqual([['título', 'data'], ['Cabral', '22/04/1500']])
  })
})

describe('normalizeImportDate', () => {
  it('converte dd/mm/aaaa e corta a hora do ISO; mantém formatos do app', () => {
    expect(normalizeImportDate('14/07/1789')).toBe('1789-07-14')
    expect(normalizeImportDate('1789-07-14T10:00:00Z')).toBe('1789-07-14')
    expect(normalizeImportDate('1789-07')).toBe('1789-07')
    expect(normalizeImportDate('500 a.C.')).toBe('500 a.C.')
    expect(normalizeImportDate('66 Ma')).toBe('66 Ma')
    expect(normalizeImportDate('ontem')).toBeNull()
  })
})

describe('parseImport', () => {
  it('CSV com colunas em português: cria eventos e pula linhas sem data', () => {
    const csv = 'Título;Data;Categoria;Importância;Tags;Texto;Latitude;Longitude;Local\n'
      + 'Chegada de Cabral;22/04/1500;Política;5;descobrimento, navegação;Texto do evento;-16,43;-39,08;Porto Seguro\n'
      + 'Sem data;;;;;;;;\n'
    const r = parseImport(csv, 'csv')
    expect(r.events).toHaveLength(1)
    expect(r.skipped).toEqual([{ line: 3, reason: 'sem data' }])
    const e = r.events[0]
    expect(e.title).toBe('Chegada de Cabral')
    expect(e.date).toBe('1500-04-22')
    expect(e.category).toBe('Política')
    expect(e.importance).toBe(5)
    expect(e.tags).toEqual(['descobrimento', 'navegacao'])
    expect(e.location).toEqual({ name: 'Porto Seguro', lat: -16.43, lng: -39.08 })
  })
  it('JSON: lista de objetos, com location aninhado', () => {
    const r = parseImport(JSON.stringify([
      { title: 'A', date: '1900', tags: ['x', 'y'], location: { name: 'Rio', lat: -22.9, lng: -43.2 } },
      { name: 'B', data: '1901-05', description: 'corpo' },
      { date: '1902' },
    ]), 'json')
    expect(r.events.map((e) => e.title)).toEqual(['A', 'B'])
    expect(r.events[0].location?.name).toBe('Rio')
    expect(r.events[1].body).toBe('corpo')
    expect(r.skipped).toEqual([{ line: 3, reason: 'sem título' }])
  })
  it('CSV sem as colunas obrigatórias é recusado', () => {
    expect(parseImport('a,b\n1,2\n', 'csv').skipped[0].reason).toMatch(/title/)
  })
})

describe('eventToMarkdown', () => {
  it('cabeçalho válido com local e texto', () => {
    const md = eventToMarkdown({ title: 'Guerra: início', date: '1914-07-28', dateEnd: '1918-11-11', category: 'Política', tags: ['guerra'], body: 'Texto.', location: { name: 'Sarajevo', lat: 43.8563, lng: 18.4131 } })
    expect(md).toBe('---\ntype: event\ntitle: "Guerra: início"\ndate: 1914-07-28\ndate-end: 1918-11-11\ncategory: Política\nimportance: 3\ntags: [guerra]\nlocation:\n  name: Sarajevo\n  lat: 43.8563\n  lng: 18.4131\n  precision: point\n---\n\nTexto.\n')
  })
})
