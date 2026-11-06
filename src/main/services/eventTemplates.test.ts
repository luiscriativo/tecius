import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { FileSystemService } from './FileSystemService'

let dir: string
let svc: FileSystemService
const write = (rel: string, text: string) => { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text, 'utf-8'); return p }
const read = (p: string) => fs.readFileSync(p, 'utf-8')

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tecius-tpl-'))
  svc = new FileSystemService()
  svc.setVaultPath(dir)
  write('tl/_timeline.md', '---\ntitle: T\n---\n')
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('createEvent com padrões e modelo', () => {
  it('sem modelo: usa importância e categoria padrão das Configurações', () => {
    const { filePath } = svc.createEvent(path.join(dir, 'tl'), 'Novo', undefined, '1900', { importance: 4, category: 'Arte' })
    expect(read(filePath)).toBe('---\ntitle: Novo\ndate: 1900\ncategory: Arte\nimportance: 4\n---\n\n')
  })
  it('com _template.md: nasce do modelo, só título e data trocados; o modelo não vira evento', () => {
    write('tl/_template.md', '---\ntitle: MODELO\ndate: 0000\nimportance: 2\ntags: [padrao]\nreferences:\n  - url: https://x\n    label: Fonte\n---\n\n## Contexto\n\n## Fontes\n')
    const { filePath } = svc.createEvent(path.join(dir, 'tl'), 'Do modelo', undefined, '1950-01-02', { importance: 5, category: 'Arte' })
    expect(read(filePath)).toBe('---\ntitle: Do modelo\ndate: 1950-01-02\ncategory: Arte\nimportance: 2\ntags: [padrao]\nreferences:\n  - url: https://x\n    label: Fonte\n---\n\n## Contexto\n\n## Fontes\n')
    const tl = svc.readTimeline(path.join(dir, 'tl'))
    expect(tl.hasTemplate).toBe(true)
    expect(tl.events.map((e) => e.slug)).toEqual(['do-modelo'])
    expect(svc.countEvents(path.join(dir, 'tl'))).toBe(1)
  })
})

describe('duplicateEvent', () => {
  it('copia o arquivo com "(cópia)" no título e nome -2', () => {
    const src = write('tl/cabral.md', '---\ntitle: "Cabral: chegada"\ndate: 1500-04-22\n---\n\nTexto.\n')
    const { filePath, slug } = svc.duplicateEvent(src)
    expect(slug).toBe('cabral-2')
    expect(read(filePath)).toBe('---\ntitle: "Cabral: chegada (cópia)"\ndate: 1500-04-22\n---\n\nTexto.\n')
    expect(read(src)).toContain('title: "Cabral: chegada"\n')
  })
  it('num chronicle só o título do topo muda', () => {
    const src = write('tl/vida.md', '---\ntype: chronicle\ntitle: Vida\nentries:\n  - title: Nasce\n    date: 1467\n---\n')
    const { filePath } = svc.duplicateEvent(src)
    expect(read(filePath)).toBe('---\ntype: chronicle\ntitle: Vida (cópia)\nentries:\n  - title: Nasce\n    date: 1467\n---\n')
  })
})

describe('importEvents', () => {
  it('grava um .md por evento, com nomes únicos', () => {
    const { created, files } = svc.importEvents(path.join(dir, 'tl'), [
      { title: 'Mesmo nome', date: '1900', tags: [], body: '' },
      { title: 'Mesmo nome', date: '1901', tags: [], body: 'b' },
    ], { importance: 2 })
    expect(created).toBe(2)
    expect(files.map((f) => path.basename(f))).toEqual(['mesmo-nome.md', 'mesmo-nome-2.md'])
    expect(read(files[1])).toContain('importance: 2')
    expect(svc.readTimeline(path.join(dir, 'tl')).events).toHaveLength(2)
  })
})
