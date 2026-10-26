import { supabase } from '../supabase'
import type { ScoreBoard } from '../board'
import type { PlayerAnswer } from '../types'

/** Réponse déjà enregistrée pour ce joueur. Points vides : auto-évaluation à faire. */
export interface StoredResponse {
  question_id: string
  answer: PlayerAnswer
  points: number | null
}

export type Refusal =
  | { ok: false; reason: 'wrong'; left?: number }
  | { ok: false; reason: 'locked'; wait?: number }
  | { ok: false; reason: 'unknown' | 'question' | 'closed' | 'points' | 'already' }

type Result<T = object> = ({ ok: true } & T) | Refusal

class NetworkError extends Error {
  constructor() {
    super("Connexion impossible. Vérifie ta connexion internet, puis réessaie.")
  }
}
export { NetworkError }

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new NetworkError()
  return data as T
}

export function playerLogin(player: string, code: string) {
  return call<Result<{ responses: StoredResponse[] }>>('player_login', { p_player: player, p_code: code })
}

export function submitAnswer(player: string, code: string, question: string, answer: PlayerAnswer, points: number | null) {
  return call<Result>('submit_answer', {
    p_player: player,
    p_code: code,
    p_question: question,
    p_answer: answer,
    p_points: points,
  })
}

export function selfEvaluate(player: string, code: string, question: string, correct: boolean) {
  return call<Result>('self_evaluate', { p_player: player, p_code: code, p_question: question, p_correct: correct })
}

export function getScores(slug: string) {
  return call<ScoreBoard | null>('get_scores', { p_slug: slug })
}

/** Message à afficher pour un code refusé. */
export function refusalMessage(r: Refusal): string {
  if (r.reason === 'wrong')
    return r.left && r.left > 0
      ? `Code incorrect. Il te reste ${r.left} essai${r.left > 1 ? 's' : ''}.`
      : 'Code incorrect.'
  if (r.reason === 'locked') {
    const minutes = Math.max(1, Math.ceil((r.wait ?? 300) / 60))
    return `Trop d'essais. Réessaie dans ${minutes} minute${minutes > 1 ? 's' : ''}.`
  }
  if (r.reason === 'closed') return "Cette question vient d'être fermée."
  if (r.reason === 'already') return 'Tu as déjà répondu à cette question.'
  return "Ta réponse n'a pas pu être enregistrée."
}

// ---------- Code mémorisé sur ce téléphone ----------
const codeKey = (slug: string, player: string) => `quiz:code:${slug}:${player}`

export function readCode(slug: string, player: string): string | null {
  try {
    return localStorage.getItem(codeKey(slug, player))
  } catch {
    return null
  }
}

export function saveCode(slug: string, player: string, code: string) {
  try {
    localStorage.setItem(codeKey(slug, player), code)
  } catch {
    /* navigation privée : le code sera redemandé */
  }
}

export function forgetCode(slug: string, player: string) {
  try {
    localStorage.removeItem(codeKey(slug, player))
  } catch {
    /* rien à faire */
  }
}
