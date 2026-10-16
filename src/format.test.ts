import { describe, expect, it } from 'vitest'
import { plainText, renderInline, wrapSelection } from './format'

describe('mise en forme', () => {
  it('rend le gras et l\'italique', () => {
    expect(renderInline('Un **mot** et un *autre*')).toBe('Un <strong>mot</strong> et un <em>autre</em>')
  })
  it('échappe toute balise saisie', () => {
    expect(renderInline('<img src=x onerror=alert(1)> **ok**')).toBe('&lt;img src=x onerror=alert(1)&gt; <strong>ok</strong>')
  })
  it('laisse les astérisques isolées', () => {
    expect(renderInline('5 * 3 = 15')).toBe('5 * 3 = 15')
  })
  it('retire les marques pour le texte brut', () => {
    expect(plainText('Le **raï** est *algérien*')).toBe('Le raï est algérien')
  })
  it('entoure puis retire la sélection', () => {
    const on = wrapSelection('Le blues', 3, 8, '**')
    expect(on).toEqual({ text: 'Le **blues**', start: 5, end: 10 })
    const off = wrapSelection(on.text, on.start, on.end, '**')
    expect(off.text).toBe('Le blues')
  })
})
