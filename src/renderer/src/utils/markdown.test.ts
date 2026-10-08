import { describe, expect, it } from 'vitest'
import { imageMarkdown } from './markdown'

describe('imageMarkdown', () => {
  it('caminho simples fica como está', () => {
    expect(imageMarkdown('imagem', '_assets/planta.png')).toBe('![imagem](_assets/planta.png)')
  })

  it('caminho com espaço ou parênteses vai entre <...>', () => {
    expect(imageMarkdown('imagem', '_assets/Captura de Tela 2025-12-09 às 12.42.43.png'))
      .toBe('![imagem](<_assets/Captura de Tela 2025-12-09 às 12.42.43.png>)')
    expect(imageMarkdown('imagem', '_assets/foto(1).png')).toBe('![imagem](<_assets/foto(1).png>)')
  })
})
