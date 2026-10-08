import { describe, expect, it } from 'vitest'
import { continueList, diffRange, insertBlock, insertLink, toggleBlock, toggleHeading, toggleInline, type TextEdit } from './markdownEdit'

/** Texto com a seleção marcada: ⟦…⟧ */
const show = (r: TextEdit) => r.value.slice(0, r.selStart) + '⟦' + r.value.slice(r.selStart, r.selEnd) + '⟧' + r.value.slice(r.selEnd)

describe('toggleInline', () => {
  it('envolve a seleção', () => {
    expect(show(toggleInline('uma palavra aqui', 4, 11, '**', 'texto'))).toBe('uma **⟦palavra⟧** aqui')
  })
  it('deixa espaços das pontas fora da marca (senão não vira negrito)', () => {
    expect(show(toggleInline('uma palavra aqui', 4, 12, '**', 'texto'))).toBe('uma **⟦palavra⟧** aqui')
  })
  it('aplicar de novo remove — seleção por dentro ou com as marcas', () => {
    expect(show(toggleInline('uma **palavra** aqui', 6, 13, '**', 'texto'))).toBe('uma ⟦palavra⟧ aqui')
    expect(show(toggleInline('uma **palavra** aqui', 4, 15, '**', 'texto'))).toBe('uma ⟦palavra⟧ aqui')
  })
  it('itálico não confunde com negrito', () => {
    expect(show(toggleInline('uma **palavra** aqui', 6, 13, '*', 'texto'))).toBe('uma ***⟦palavra⟧*** aqui')
    expect(show(toggleInline('uma *palavra* aqui', 5, 12, '*', 'texto'))).toBe('uma ⟦palavra⟧ aqui')
    expect(show(toggleInline('***x***', 3, 4, '*', 't'))).toBe('**⟦x⟧**')
  })
  it('sem seleção insere exemplo selecionado', () => {
    expect(show(toggleInline('abc ', 4, 4, '~~', 'texto'))).toBe('abc ~~⟦texto⟧~~')
  })
})

describe('toggleHeading', () => {
  it('aplica, troca de nível e remove no mesmo nível', () => {
    expect(toggleHeading('Título\nTexto', 3, 2).value).toBe('## Título\nTexto')
    expect(toggleHeading('## Título', 4, 3).value).toBe('### Título')
    expect(toggleHeading('## Título\nTexto', 4, 2).value).toBe('Título\nTexto')
  })
})

describe('toggleBlock', () => {
  it('aplica em todas as linhas selecionadas', () => {
    expect(toggleBlock('um\ndois\ntrês', 0, 12, 'bullet').value).toBe('- um\n- dois\n- três')
    expect(toggleBlock('linha 1\nlinha 2', 0, 15, 'quote').value).toBe('> linha 1\n> linha 2')
  })
  it('numera em sequência e pula linhas em branco', () => {
    expect(toggleBlock('um\n\ndois', 0, 8, 'numbered').value).toBe('1. um\n\n2. dois')
  })
  it('aplicar de novo remove; trocar de tipo substitui o marcador', () => {
    expect(toggleBlock('- item', 3, 3, 'bullet').value).toBe('item')
    expect(toggleBlock('- item', 3, 3, 'task').value).toBe('- [ ] item')
    expect(toggleBlock('- [ ] item', 5, 5, 'numbered').value).toBe('1. item')
    expect(toggleBlock('- [x] feito', 5, 5, 'task').value).toBe('feito')
  })
  it('lista e tarefa não se confundem', () => {
    expect(toggleBlock('- [ ] a\n- b', 0, 11, 'bullet').value).toBe('- a\n- b')
  })
  it('seleção que termina numa quebra de linha não pega a linha seguinte', () => {
    expect(toggleBlock('um\ndois\n', 0, 3, 'bullet').value).toBe('- um\ndois\n')
  })
  it('cursor acompanha o texto', () => {
    expect(show(toggleBlock('ab|cd'.replace('|', ''), 2, 2, 'bullet'))).toBe('- ab⟦⟧cd')
  })
})

describe('insertLink', () => {
  it('texto selecionado vira o texto do link e o url fica selecionado', () => {
    expect(show(insertLink('veja o site', 7, 11, 'texto'))).toBe('veja o [site](⟦url⟧)')
  })
  it('URL selecionada vira o endereço', () => {
    expect(show(insertLink('https://tecius.app', 0, 18, 'texto'))).toBe('[⟦texto⟧](https://tecius.app)')
  })
})

describe('insertBlock', () => {
  it('separa do parágrafo com linhas em branco', () => {
    expect(insertBlock('Texto.', 6, 6, '| a |').value).toBe('Texto.\n\n| a |\n')
    expect(insertBlock('Antes\n\nDepois', 6, 6, 'B').value).toBe('Antes\n\nB\n\nDepois')
    expect(show(insertBlock('', 0, 0, '| Col 1 | x |', 'Col 1'))).toBe('| ⟦Col 1⟧ | x |\n')
  })
})

describe('continueList', () => {
  it('continua listas, numeradas e tarefas', () => {
    expect(show(continueList('- um', 4, 4)!)).toBe('- um\n- ⟦⟧')
    expect(show(continueList('9. nove', 7, 7)!)).toBe('9. nove\n10. ⟦⟧')
    expect(show(continueList('  - [x] feito', 13, 13)!)).toBe('  - [x] feito\n  - [ ] ⟦⟧')
  })
  it('item vazio encerra a lista; linha comum não é afetada', () => {
    expect(show(continueList('- um\n- ', 7, 7)!)).toBe('- um\n⟦⟧')
    expect(continueList('texto', 5, 5)).toBeNull()
  })
})

describe('diffRange', () => {
  it('acha só o trecho alterado', () => {
    expect(diffRange('uma palavra', 'uma **palavra**')).toEqual({ start: 4, endA: 11, insert: '**palavra**' })
    expect(diffRange('- item', 'item')).toEqual({ start: 0, endA: 2, insert: '' })
    expect(diffRange('abc', 'abc')).toEqual({ start: 3, endA: 3, insert: '' })
  })
})
