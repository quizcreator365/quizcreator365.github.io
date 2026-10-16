import { supabase } from './supabase'

/** Vrai si l'erreur signale une session admin expirée. */
export function isSessionError(message: string): boolean {
  return /jwt expired|invalid jwt|refresh token|session (not found|expired)|not authenticated/i.test(message)
}

/** Traduit les erreurs techniques les plus courantes en messages compréhensibles. */
export function frenchError(error: { message: string; code?: string } | string): string {
  const message = typeof error === 'string' ? error : error.message
  const code = typeof error === 'string' ? undefined : error.code
  if (isSessionError(message)) {
    // Déconnexion : l'écran de connexion s'affiche à la place du back office.
    void supabase.auth.signOut()
    return 'Ta session a expiré. Reconnecte-toi pour continuer.'
  }
  if (code === '23505') return 'Cette adresse est déjà utilisée par un autre quiz.'
  if (code === '42501' || /row-level security|permission denied/i.test(message))
    return "Ton compte n'a pas les droits d'administration."
  if (code === '23514' || /check constraint/i.test(message)) return 'Une valeur saisie ne respecte pas les règles (longueur ou format).'
  if (/failed to fetch|network|load failed|networkerror/i.test(message))
    return 'Connexion impossible. Vérifie ta connexion internet et réessaie.'
  if (/payload too large|exceeded the maximum allowed size|entity too large/i.test(message))
    return 'Fichier trop lourd pour le stockage.'
  if (/mime type|invalid.*content.?type/i.test(message)) return "Ce format d'image n'est pas accepté."
  if (/already exists/i.test(message)) return 'Ce fichier existe déjà.'
  if (/rate limit|too many requests/i.test(message)) return 'Trop de demandes. Patiente un instant puis réessaie.'
  if (/bucket not found/i.test(message)) return "Le stockage des photos n'est pas installé : relance le script SQL initial."
  return message
}
