import { describe, expect, it } from 'vitest'
import { stripAnchors } from './anchors'

describe('stripAnchors', () => {
  it('tira o marcador no fim do parágrafo', () => {
    expect(stripAnchors('Primeiro trecho. ^descoberta')).toBe('Primeiro trecho.')
  })

  it('tira o marcador numa linha sozinha, inclusive na primeira linha', () => {
    expect(stripAnchors('^descoberta\n\nPrimeiro trecho.').trim()).toBe('Primeiro trecho.')
  })

  it('não junta os parágrafos em volta de um marcador sozinho', () => {
    const out = stripAnchors('Um.\n\n^auge\n\nDois.')
    expect(out.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)).toEqual(['Um.', 'Dois.'])
  })

  it('normaliza CRLF e mantém ^ no meio da linha', () => {
    expect(stripAnchors('A ^meio aqui\r\nB ^fim\r\n')).toBe('A ^meio aqui\nB\n')
  })
})
