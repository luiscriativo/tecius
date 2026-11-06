import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { FileSystemService } from './FileSystemService'

let dir: string
let svc: FileSystemService
const write = (rel: string, text: string) => { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text, 'utf-8'); return p }

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tecius-style-'))
  svc = new FileSystemService()
  svc.setVaultPath(dir)
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('estilo de página nos arquivos', () => {
  it('_vault.md com style: chega ao vault', () => {
    write('_vault.md', '---\ntitle: V\nstyle: jornal\n---\n')
    write('tl/_timeline.md', '---\ntitle: T\n---\n')
    expect(svc.readVault().style).toBe('jornal')
  })
  it('_timeline.md guarda masthead e colunas; o trecho do chronicle herda o style e leva o deck', () => {
    write('tl/_timeline.md', '---\ntitle: T\nstyle: jornal\nmasthead: O Correio\nmasthead-sub: Crônica\ncolumns: 2\n---\n')
    write('tl/vida.md', '---\ntype: chronicle\ntitle: Vida\nstyle: classico\nentries:\n  - title: A\n    date: 1900\n    deck: Um subtítulo\n  - title: B\n    date: 1901\n    style: jornal\n---\n')
    const tl = svc.readTimeline(path.join(dir, 'tl'))
    expect(tl.meta.masthead).toBe('O Correio')
    expect(tl.meta['masthead-sub']).toBe('Crônica')
    expect(tl.events[0].frontmatter.style).toBe('classico')
    expect(tl.events[0].frontmatter.deck).toBe('Um subtítulo')
    expect(tl.events[1].frontmatter.style).toBe('jornal')
  })
  it('readStyle lê _styles/<nome>.css e recusa nomes fora da pasta', () => {
    write('_styles/meu.css', '.page { color: red }')
    expect(svc.readStyle('meu')).toBe('.page { color: red }')
    expect(svc.readStyle('MEU')).toBe('.page { color: red }')
    expect(svc.readStyle('nao-existe')).toBeNull()
    expect(svc.readStyle('../_vault')).toBeNull()
  })

  it('setPageStyle grava, troca e remove o style: sem mexer no resto do cabeçalho', () => {
    // _vault.md inexistente: nasce só com o style
    svc.setPageStyle({ kind: 'vault' }, 'Jornal')
    expect(fs.readFileSync(path.join(dir, '_vault.md'), 'utf-8')).toBe('---\nstyle: jornal\n---\n')

    // _timeline.md com CRLF e comentário: entra no fim do cabeçalho, CRLF e comentário preservados
    const tl = write('tl/_timeline.md', '---\r\ntitle: T\r\n# nota\r\ndescription: D\r\n---\r\ncorpo\r\n')
    svc.setPageStyle({ kind: 'timeline', dirPath: path.join(dir, 'tl') }, 'album')
    expect(fs.readFileSync(tl, 'utf-8')).toBe('---\r\ntitle: T\r\n# nota\r\ndescription: D\r\nstyle: album\r\n---\r\ncorpo\r\n')

    // Evento: troca a linha existente; null remove e o evento volta a herdar
    const ev = write('tl/ev.md', '---\ntitle: E\nstyle: jornal\ndate: 1900\n---\ntexto\n')
    svc.setPageStyle({ kind: 'event', filePath: ev }, 'classico')
    expect(fs.readFileSync(ev, 'utf-8')).toBe('---\ntitle: E\nstyle: classico\ndate: 1900\n---\ntexto\n')
    svc.setPageStyle({ kind: 'event', filePath: ev }, null)
    expect(fs.readFileSync(ev, 'utf-8')).toBe('---\ntitle: E\ndate: 1900\n---\ntexto\n')
    expect(svc.readTimeline(path.join(dir, 'tl')).events[0].frontmatter.style).toBeUndefined()

    // Nome inválido vira remoção; fora do vault é recusado
    svc.setPageStyle({ kind: 'event', filePath: ev }, '!!!')
    expect(fs.readFileSync(ev, 'utf-8')).not.toContain('style:')
    expect(() => svc.setPageStyle({ kind: 'event', filePath: path.join(dir, '..', 'fora.md') }, 'jornal')).toThrow()
  })
  it('setPageStyle grava o paper: do arquivo (só light | dark) e o trecho do chronicle herda', () => {
    const ev = write('tl/ev.md', '---\ntitle: E\ndate: 1900\n---\n')
    svc.setPageStyle({ kind: 'event', filePath: ev }, 'dark', 'paper')
    expect(fs.readFileSync(ev, 'utf-8')).toBe('---\ntitle: E\ndate: 1900\npaper: dark\n---\n')
    svc.setPageStyle({ kind: 'event', filePath: ev }, 'roxo', 'paper')
    expect(fs.readFileSync(ev, 'utf-8')).not.toContain('paper:')
    write('tl/_timeline.md', '---\ntitle: T\n---\n')
    write('tl/vida.md', '---\ntype: chronicle\ntitle: Vida\npaper: light\nentries:\n  - title: A\n    date: 1900\n  - title: B\n    date: 1901\n    paper: dark\n---\n')
    const tl = svc.readTimeline(path.join(dir, 'tl'))
    const vida = tl.events.filter((e) => e.chronicle)
    expect(vida[0].frontmatter.paper).toBe('light')
    expect(vida[1].frontmatter.paper).toBe('dark')
  })
  it('listStyles lista os _styles/*.css por nome', () => {
    expect(svc.listStyles()).toEqual([])
    write('_styles/Pergaminho.css', '')
    write('_styles/meu-estilo.css', '')
    write('_styles/leia-me.txt', '')
    expect(svc.listStyles()).toEqual(['meu-estilo', 'pergaminho'])
  })
})
