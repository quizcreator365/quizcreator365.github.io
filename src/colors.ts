/** Couleurs de fond des questions : nom HTML (lightblue) ou code HEX (#ADD8E6). */

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const NAME = /^[a-z]{3,30}$/i

/** Vrai pour un code HEX ou un nom de couleur HTML reconnu par le navigateur. Vide = pas de couleur. */
export function isValidColor(value: string, supports: (v: string) => boolean = defaultSupports): boolean {
  const v = value.trim()
  if (!v) return true
  if (HEX.test(v)) return true
  return NAME.test(v) && v.toLowerCase() !== 'transparent' && supports(v)
}

function defaultSupports(v: string): boolean {
  return typeof CSS !== 'undefined' && CSS.supports('color', v)
}

/** Convertit #abc en #aabbcc. */
function expandHex(hex: string): string {
  const h = hex.slice(1)
  return h.length === 3 ? `#${h.split('').map((c) => c + c).join('')}` : `#${h}`
}

/** Code HEX à 6 chiffres d'une couleur valide (nom HTML converti par le navigateur). */
export function toHex(value: string): string | null {
  const v = value.trim()
  if (!v) return null
  if (HEX.test(v)) return expandHex(v).toLowerCase()
  if (typeof document === 'undefined') return null
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#000000'
  ctx.fillStyle = v
  const out = String(ctx.fillStyle)
  return HEX.test(out) ? out.toLowerCase() : null
}

/** Luminance relative (WCAG) d'un code HEX à 6 chiffres. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Vrai si le texte doit passer en blanc pour rester lisible sur ce fond. */
export function needsLightText(hex: string): boolean {
  const l = luminance(hex)
  const contrastDark = (l + 0.05) / (luminance('#1a1d3a') + 0.05)
  const contrastLight = (1 + 0.05) / (l + 0.05)
  return contrastLight > contrastDark
}
