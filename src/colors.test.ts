import { describe, expect, it } from 'vitest'
import { isValidColor, needsLightText, toHex } from './colors'

const names = ['lightblue', 'navy', 'gold', 'white', 'black']
const supports = (v: string) => names.includes(v.toLowerCase())

describe('couleur de fond', () => {
  it('accepte les codes HEX et les noms HTML', () => {
    expect(isValidColor('#ADD8E6', supports)).toBe(true)
    expect(isValidColor('#fff', supports)).toBe(true)
    expect(isValidColor('lightblue', supports)).toBe(true)
    expect(isValidColor('', supports)).toBe(true)
  })
  it('refuse le reste', () => {
    expect(isValidColor('#12345', supports)).toBe(false)
    expect(isValidColor('bleuciel', supports)).toBe(false)
    expect(isValidColor('rgb(0,0,0)', supports)).toBe(false)
    expect(isValidColor('red;background:url(x)', supports)).toBe(false)
  })
  it('normalise les codes HEX', () => {
    expect(toHex('#ABC')).toBe('#aabbcc')
    expect(toHex('#ADD8E6')).toBe('#add8e6')
  })
  it('choisit un texte lisible', () => {
    expect(needsLightText('#000080')).toBe(true) // navy
    expect(needsLightText('#add8e6')).toBe(false) // lightblue
    expect(needsLightText('#ffd700')).toBe(false) // gold
  })
})
