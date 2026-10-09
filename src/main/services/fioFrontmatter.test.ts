import { describe, expect, it } from 'vitest'
import { normFioTarget, renameInFio, setFioInRaw } from './fioFrontmatter'

const file = '---\ntitle: "Vida"\ndate: 1467\nlocation:\n  name: "Santarém"\n  lat: 39.2\n---\n\nTexto [[Belmonte]].\n'

describe('setFioInRaw', () => {
  it('acrescenta a lista sem mexer no resto', () => {
    expect(setFioInRaw(file, ['Belmonte', 'Cabral: chegada'])).toBe(
      '---\ntitle: "Vida"\ndate: 1467\nlocation:\n  name: "Santarém"\n  lat: 39.2\nfio:\n  - "Belmonte"\n  - "Cabral: chegada"\n---\n\nTexto [[Belmonte]].\n')
  })
  it('troca a lista existente, vazia e remove', () => {
    const a = setFioInRaw(file, ['Belmonte'])
    expect(setFioInRaw(a, ['Santarém'])).toBe(setFioInRaw(file, ['Santarém']))
    expect(setFioInRaw(a, [])).toContain('\nfio: []\n---')
    expect(setFioInRaw(a, null)).toBe(file)
    // lista no meio do cabeçalho
    const mid = '---\nfio:\n  - "A"\n  - B\ntitle: X\n---\ncorpo'
    expect(setFioInRaw(mid, ['C'])).toBe('---\nfio:\n  - "C"\ntitle: X\n---\ncorpo')
  })
  it('arquivo sem cabeçalho ganha um', () => {
    expect(setFioInRaw('só texto', [])).toBe('---\nfio: []\n---\nsó texto')
  })
})

describe('renameInFio', () => {
  it('troca os alvos antigos (sem acentos/maiúsculas) e conta', () => {
    const a = setFioInRaw(file, ['Belmonte', 'Pessoas/Belmonte', 'Santarém'])
    const r = renameInFio(a, new Set(['belmonte', 'pessoas/belmonte'].map(normFioTarget)), 'Nascimento em Belmonte')
    expect(r.changed).toBe(2)
    expect(r.raw).toContain('fio:\n  - "Nascimento em Belmonte"\n  - "Nascimento em Belmonte"\n  - "Santarém"\n---')
    expect(renameInFio(file, new Set(['belmonte']), 'X').changed).toBe(0)
  })
  it('lista inline', () => {
    expect(renameInFio('---\nfio: ["A", B]\n---\n', new Set(['b']), 'C').raw).toBe('---\nfio:\n  - "A"\n  - "C"\n---\n')
  })
})
