export type QuestionType =
  | 'free_text'
  | 'mcq'
  | 'true_false'
  | 'matching'
  | 'chronology'
  | 'who_am_i'
  | 'photo'

/** Types disponibles (tous depuis le lot 2). */
export const AVAILABLE_TYPES: QuestionType[] = ['free_text', 'mcq', 'true_false', 'matching', 'chronology', 'who_am_i', 'photo']

/** Types qui peuvent rapporter des points partiels. */
export const PARTIAL_TYPES: QuestionType[] = ['matching', 'chronology']

/** Types dont la réponse est un texte libre auto-évalué. */
export const TEXT_TYPES: QuestionType[] = ['free_text', 'who_am_i', 'photo']

/** Types qui affichent une photo. */
export const IMAGE_TYPES: QuestionType[] = ['who_am_i', 'photo']

export const TYPE_LABELS: Record<QuestionType, string> = {
  free_text: 'Texte libre',
  mcq: 'QCM',
  true_false: 'Vrai ou faux',
  matching: 'Association',
  chronology: 'Chronologie',
  who_am_i: 'Qui suis-je ?',
  photo: 'Quiz photo',
}

export const MAX_TEXT = 500

export interface Answer {
  id: string
  text: string
  is_correct: boolean
  position: number
  side?: 'left' | 'right' | null
  pair_key?: number | null
  date_label?: string | null
}

export interface Question {
  id: string
  type: QuestionType
  prompt: string
  image_path?: string | null
  more_info?: string | null
  answers: Answer[]
}

export interface Player {
  id: string
  name: string
}

export interface Quiz {
  id: string
  slug: string
  name: string
  description: string | null
  players: Player[]
  questions: Question[]
}

/** Réponse donnée par le joueur à une question. */
export type PlayerAnswer =
  | { kind: 'text'; text: string; selfCorrect: boolean | null }
  | { kind: 'choices'; ids: string[] }
  | { kind: 'pairs'; pairs: Record<string, string> }
  | { kind: 'order'; ids: string[] }
