import { ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'

export const session = ref<Session | null>(null)
export const authReady = ref(false)
/** Vrai quand l'admin arrive depuis l'email « mot de passe oublié ». */
export const recovering = ref(false)

let started = false

export function initAuth() {
  if (started) return
  started = true
  supabase.auth.getSession().then(({ data }) => {
    session.value = data.session
    authReady.value = true
  })
  supabase.auth.onAuthStateChange((event, s) => {
    session.value = s
    if (event === 'PASSWORD_RECOVERY') recovering.value = true
  })
}

export function frenchAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email ou mot de passe incorrect.'
  if (/email not confirmed/i.test(message)) return 'Adresse email non confirmée.'
  if (/password should be at least/i.test(message)) return 'Le mot de passe doit contenir au moins 6 caractères.'
  if (/rate limit|too many/i.test(message)) return 'Trop de tentatives. Réessaie dans quelques minutes.'
  if (/failed to fetch|network/i.test(message)) return 'Connexion impossible. Vérifie ta connexion internet.'
  return message
}
