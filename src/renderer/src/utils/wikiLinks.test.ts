import { describe, expect, it } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { completeWikiLink, openWikiQuery, parseWikiLink, remarkWikiLinks, resolveWikiLink, suggestWikiTargets, wikiTextFor, type VaultEventDoc } from './wikiLinks'

const doc = (title: string, timelineTitle: string, date = '1500'): VaultEventDoc =>
  ({ filePath: `/v/${timelineTitle}/${title}.md`, slug: title, title, date, timelineDir: `/v/${timelineTitle}`, timelineTitle })
const docs = [
  doc('Cabral reaches Brazil', 'Exploration', '1500-04-22'),
  doc('Treaty of Tordesillas', 'Exploration', '1494'),
  doc('Fundação', 'Brasil', '1554'),
  doc('Fundação', 'Portugal', '1143'),
]

describe('parseWikiLink', () => {
  it('alvo e texto mostrado', () => {
    expect(parseWikiLink('Cabral reaches Brazil')).toEqual({ target: 'Cabral reaches Brazil', label: 'Cabral reaches Brazil' })
    expect(parseWikiLink('Cabral reaches Brazil|a chegada')).toEqual({ target: 'Cabral reaches Brazil', label: 'a chegada' })
  })
})

describe('resolveWikiLink', () => {
  it('acha pelo título, sem diferenciar maiúsculas e acentos', () => {
    expect(resolveWikiLink('treaty of TORDESILLAS', docs)?.date).toBe('1494')
    expect(resolveWikiLink('fundacao', docs, '/v/Brasil')?.timelineTitle).toBe('Brasil')
  })
  it('título repetido: Timeline/Título escolhe; sem isso, a timeline atual', () => {
    expect(resolveWikiLink('Portugal/Fundação', docs)?.date).toBe('1143')
    expect(resolveWikiLink('Fundação', docs, '/v/Portugal')?.date).toBe('1143')
  })
  it('inexistente', () => {
    expect(resolveWikiLink('Batalha de Guararapes', docs)).toBeNull()
  })
})

describe('wikiTextFor', () => {
  it('usa Timeline/Título só quando o título se repete', () => {
    expect(wikiTextFor(docs[0], docs)).toBe('Cabral reaches Brazil')
    expect(wikiTextFor(docs[3], docs)).toBe('Portugal/Fundação')
  })
})

describe('suggestWikiTargets', () => {
  it('filtra e põe primeiro o que começa com a busca e a timeline atual', () => {
    expect(suggestWikiTargets('tre', docs).map((d) => d.title)).toEqual(['Treaty of Tordesillas'])
    expect(suggestWikiTargets('fund', docs, '/v/Portugal')[0].timelineTitle).toBe('Portugal')
    expect(suggestWikiTargets('', docs).length).toBe(4)
  })
})

describe('openWikiQuery / completeWikiLink', () => {
  it('detecta o [[ aberto antes do cursor', () => {
    expect(openWikiQuery('veja [[Cab')).toBe('Cab')
    expect(openWikiQuery('veja [[')).toBe('')
    expect(openWikiQuery('veja [[Cabral]] e')).toBeNull()
    expect(openWikiQuery('veja')).toBeNull()
  })
  it('completa e aproveita o ]] que já existir', () => {
    expect(completeWikiLink('veja [[Cab e', 10, 'Cabral reaches Brazil').value).toBe('veja [[Cabral reaches Brazil]] e')
    expect(completeWikiLink('veja [[Cab]]', 10, 'Cabral reaches Brazil').value).toBe('veja [[Cabral reaches Brazil]]')
  })
})

describe('remarkWikiLinks', () => {
  const links = (md: string) => {
    const tree = unified().use(remarkParse).use(remarkWikiLinks).runSync(unified().use(remarkParse).parse(md)) as unknown as { children: Array<{ children: Array<{ type: string; data?: { hProperties?: Record<string, string> }; children?: Array<{ value: string }> }> }> }
    return tree.children[0].children.filter((n) => n.type === 'link').map((n) => [n.data?.hProperties?.['data-wiki'], n.children?.[0].value])
  }
  it('vira link com o alvo e o texto mostrado', () => {
    expect(links('Depois de [[Treaty of Tordesillas]], [[Cabral reaches Brazil|a chegada]].')).toEqual([
      ['Treaty of Tordesillas', 'Treaty of Tordesillas'], ['Cabral reaches Brazil', 'a chegada'],
    ])
  })
  it('não mexe em código', () => {
    expect(links('use `[[Título]]` para ligar')).toEqual([])
  })
})
