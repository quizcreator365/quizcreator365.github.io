import { toBlob } from 'html-to-image'

/** Transforme la carte de résultat en image PNG. */
export async function renderCard(node: HTMLElement): Promise<Blob> {
  // backgroundColor s'applique à la carte elle-même : on reprend son bleu nuit.
  const options = { pixelRatio: 2, backgroundColor: '#1a1d3a', cacheBust: true }
  try {
    const blob = await toBlob(node, options)
    if (blob) return blob
  } catch {
    /* polices distantes non intégrables : on réessaie sans elles */
  }
  const blob = await toBlob(node, { ...options, skipFonts: true })
  if (!blob) throw new Error("L'image du résultat n'a pas pu être créée.")
  return blob
}

export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded'

/**
 * Ouvre le menu de partage du téléphone avec l'image (le joueur choisit WhatsApp).
 * Sans partage de fichier (ordinateur) : télécharge l'image et ouvre WhatsApp avec le texte.
 */
export async function shareResult(image: Blob, text: string): Promise<ShareOutcome> {
  const file = new File([image], 'mon-resultat-quiz.png', { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
      // Partage refusé par le navigateur : on bascule sur le téléchargement.
    }
  }
  const url = URL.createObjectURL(image)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  return 'downloaded'
}
