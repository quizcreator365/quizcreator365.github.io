/**
 * Mise en forme minimale : **gras** et *italique*.
 * Le texte est d'abord échappé : aucune balise saisie ne peut s'exécuter dans la page.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderInline(text: string | null | undefined): string {
  if (!text) return ''
  return escapeHtml(text)
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(?=\S)([\s\S]*?\S)\*/g, '<em>$1</em>')
}

/** Texte sans les marques de mise en forme (listes du back office, partage). */
export function plainText(text: string | null | undefined): string {
  if (!text) return ''
  return text.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '$1').replace(/\*(?=\S)([\s\S]*?\S)\*/g, '$1')
}

/** Entoure la sélection de marques ; renvoie le nouveau texte et la nouvelle sélection. */
export function wrapSelection(
  text: string,
  start: number,
  end: number,
  marker: '**' | '*',
): { text: string; start: number; end: number } {
  const selected = text.slice(start, end)
  const before = text.slice(0, start)
  const after = text.slice(end)
  // Déjà entouré : on retire la mise en forme.
  if (before.endsWith(marker) && after.startsWith(marker) && !(marker === '*' && before.endsWith('**') && !before.endsWith('***'))) {
    return {
      text: before.slice(0, -marker.length) + selected + after.slice(marker.length),
      start: start - marker.length,
      end: end - marker.length,
    }
  }
  const inner = selected || (marker === '**' ? 'texte en gras' : 'texte en italique')
  return {
    text: before + marker + inner + marker + after,
    start: start + marker.length,
    end: start + marker.length + inner.length,
  }
}
