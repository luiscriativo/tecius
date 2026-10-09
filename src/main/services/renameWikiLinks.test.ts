import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { FileSystemService } from './FileSystemService'

let dir: string
let svc: FileSystemService
const write = (name: string, text: string) => { const p = path.join(dir, name); fs.writeFileSync(p, text, 'utf-8'); return p }
const read = (p: string) => fs.readFileSync(p, 'utf-8')

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tecius-wiki-'))
  svc = new FileSystemService()
  svc.setVaultPath(dir)
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('renameWikiLinks', () => {
  it('troca as formas que apontavam para o evento e mantém o texto mostrado', () => {
    const a = write('a.md', '---\ntitle: "A"\n---\n\nVer [[Tratado de Tordesilhas]], [[descobrimentos/tratado de tordesilhas|o tratado]] e [[Outro]].\n')
    const n = svc.renameWikiLinks([a], ['Tratado de Tordesilhas', 'Descobrimentos/Tratado de Tordesilhas'], 'Tratado de Tordesillas')
    expect(n).toBe(2)
    expect(read(a)).toBe('---\ntitle: "A"\n---\n\nVer [[Tratado de Tordesillas]], [[Tratado de Tordesillas|o tratado]] e [[Outro]].\n')
  })
  it('ignora acentos e maiúsculas ao comparar, e não mexe no cabeçalho', () => {
    const b = write('b.md', '---\ntitle: "[[Fundacao]]"\n---\n[[FUNDAÇÃO]]\n')
    expect(svc.renameWikiLinks([b], ['Fundação'], 'Fundação de Salvador')).toBe(1)
    expect(read(b)).toBe('---\ntitle: "[[Fundacao]]"\n---\n[[Fundação de Salvador]]\n')
  })
  it('arquivo sem ligação fica intacto', () => {
    const c = write('c.md', '---\ntitle: "C"\n---\nnada aqui\n')
    const before = fs.statSync(c).mtimeMs
    expect(svc.renameWikiLinks([c], ['X'], 'Y')).toBe(0)
    expect(fs.statSync(c).mtimeMs).toBe(before)
  })
  it('recusa arquivos fora do vault', () => {
    expect(() => svc.renameWikiLinks([path.join(os.tmpdir(), 'fora.md')], ['X'], 'Y')).toThrow()
  })
})

describe('renameWikiLinks — trechos vinculados', () => {
  it('atualiza o ref: do trecho vinculado (e só ele no cabeçalho)', () => {
    const v = write('v.md', '---\ntype: chronicle\ntitle: "Vida"\nentries:\n  - title: "Fundação"\n    date: 1554\n    ref: "Fundação"\n  - title: "Outra"\n    date: 1600\n    ref: Outra\n---\n\nTexto. ^a\n')
    expect(svc.renameWikiLinks([v], ['Fundação'], 'Fundação de São Paulo')).toBe(1)
    expect(read(v)).toBe('---\ntype: chronicle\ntitle: "Vida"\nentries:\n  - title: "Fundação"\n    date: 1554\n    ref: Fundação de São Paulo\n  - title: "Outra"\n    date: 1600\n    ref: Outra\n---\n\nTexto. ^a\n')
  })
})
