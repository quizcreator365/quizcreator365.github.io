export const RESERVED_SLUGS = ['admin', 'assets', '404']
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

/** « Le quiz des voisines » → « le-quiz-des-voisines ». */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

export function slugError(slug: string): string | null {
  if (slug.length < 3 || slug.length > 40) return 'Entre 3 et 40 caractères.'
  if (!SLUG_PATTERN.test(slug)) return 'Lettres minuscules, chiffres et tirets, sans tiret au début ni à la fin.'
  if (RESERVED_SLUGS.includes(slug)) return 'Cette adresse est réservée.'
  return null
}

/** Adresse complète d'un quiz, ex. https://ton-compte.github.io/voisines */
export function quizUrl(slug: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}${slug}`
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Copie dans le presse-papiers ; renvoie faux si le navigateur refuse. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
