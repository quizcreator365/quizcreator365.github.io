import { supabase } from '../supabase'
import { removeUnusedImages } from '../images'
import type { QuestionType } from '../types'
import { frenchError } from '../errors'

export interface QuizRow {
  id: string
  slug: string
  name: string
  description: string | null
  is_published: boolean
  players: { name: string; position: number }[]
  questions: { count: number }[]
}

export interface QuizForm {
  id?: string
  slug: string
  name: string
  description: string
  players: PlayerForm[]
}

export interface PlayerForm {
  id?: string
  name: string
  /** Code personnel à 4 chiffres (vide : tiré au hasard à l'enregistrement). */
  code: string
}

/** Code à 4 chiffres tiré au hasard. */
export function randomCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 10000
  return String(n).padStart(4, '0')
}

export interface QuestionRow {
  id: string
  type: QuestionType
  prompt: string
  position: number
  is_hidden: boolean
  scheduled_on: string | null
  hidden_on: string | null
}

export interface QuestionForm {
  id?: string
  quiz_id: string
  type: QuestionType
  prompt: string
  more_info: string
  image_path?: string | null
  background_color?: string | null
  /** Jour d'ouverture (AAAA-MM-JJ), vide si non programmée. */
  scheduled_on?: string | null
  answers: AnswerForm[]
}

export interface AnswerForm {
  text: string
  is_correct: boolean
  side?: 'left' | 'right' | null
  pair_key?: number | null
  date_label?: string | null
}

function fail(error: { message: string; code?: string } | null): never | void {
  if (!error) return
  throw new Error(frenchError(error))
}

export async function listQuizzes(): Promise<QuizRow[]> {
  const { data, error } = await supabase
    .from('quizzes')
    .select('id, slug, name, description, is_published, players(name, position), questions(count)')
    .order('created_at', { ascending: false })
  fail(error)
  return (data ?? []) as QuizRow[]
}

export async function getQuiz(id: string) {
  const [quiz, questions] = await Promise.all([
    supabase.from('quizzes').select('id, slug, name, description, is_published, players(id, name, position, code)').eq('id', id).single(),
    supabase.from('questions').select('id, type, prompt, position, is_hidden, scheduled_on, hidden_on').eq('quiz_id', id).order('position').order('created_at'),
  ])
  fail(quiz.error)
  fail(questions.error)
  const q = quiz.data as {
    id: string; slug: string; name: string; description: string | null; is_published: boolean
    players: { id: string; name: string; position: number; code: string }[]
  }
  return {
    form: {
      id: q.id,
      slug: q.slug,
      name: q.name,
      description: q.description ?? '',
      players: [...q.players].sort((a, b) => a.position - b.position).map((p) => ({ id: p.id, name: p.name, code: p.code })),
    } as QuizForm,
    isPublished: q.is_published,
    questions: (questions.data ?? []) as QuestionRow[],
  }
}

export async function isSlugTaken(slug: string, excludeId?: string): Promise<boolean> {
  let query = supabase.from('quizzes').select('id').eq('slug', slug)
  if (excludeId) query = query.neq('id', excludeId)
  const { data, error } = await query
  fail(error)
  return (data ?? []).length > 0
}

export async function saveQuiz(form: QuizForm): Promise<string> {
  const values = { slug: form.slug, name: form.name.trim(), description: form.description.trim() || null }
  let id = form.id
  if (id) {
    const { error } = await supabase.from('quizzes').update({ ...values, updated_at: new Date().toISOString() }).eq('id', id)
    fail(error)
  } else {
    const { data, error } = await supabase.from('quizzes').insert(values).select('id').single()
    fail(error)
    id = (data as { id: string }).id
  }
  // Les joueurs gardent leur identifiant : leurs réponses et scores sont conservés.
  const res = await supabase.rpc('save_players', {
    p_quiz_id: id,
    p: form.players.map((p) => ({ id: p.id ?? '', name: p.name, code: p.code })),
  })
  fail(res.error)
  return id
}

/** Ouvre (date du jour si elle n'en a pas) ou masque une question. */
export async function setQuestionOpen(id: string, open: boolean) {
  const { error } = await supabase.rpc('set_question_open', { p_question: id, p_open: open })
  fail(error)
}

/** Programme (ou déprogramme) une question. */
export async function setQuestionDate(id: string, day: string | null) {
  const { error } = await supabase.rpc('set_question_date', { p_question: id, p_day: day })
  fail(error)
}

/** Programme les questions sans date, N par jour à partir d'une date. */
export async function scheduleQuestions(quizId: string, start: string, perDay: number): Promise<number> {
  const { data, error } = await supabase.rpc('schedule_questions', { p_quiz_id: quizId, p_start: start, p_per_day: perDay })
  fail(error)
  return data as number
}

// ---------- Scores et réponses ----------
export interface ResponseRow {
  id: string
  question_id: string
  player_id: string
  answer: unknown
  points: number | null
  answered_at: string
}

export async function listResponses(questionIds: string[]): Promise<ResponseRow[]> {
  if (!questionIds.length) return []
  const { data, error } = await supabase
    .from('responses')
    .select('id, question_id, player_id, answer, points, answered_at')
    .in('question_id', questionIds)
    .order('answered_at')
  fail(error)
  return ((data ?? []) as ResponseRow[]).map((r) => ({ ...r, points: r.points === null ? null : Number(r.points) }))
}

export async function deleteResponse(id: string) {
  const { error } = await supabase.from('responses').delete().eq('id', id)
  fail(error)
}

export async function setPublished(id: string, published: boolean) {
  const { error } = await supabase.from('quizzes').update({ is_published: published }).eq('id', id)
  fail(error)
}

export async function deleteQuiz(id: string) {
  const { data } = await supabase.from('questions').select('image_path').eq('quiz_id', id).not('image_path', 'is', null)
  const { error } = await supabase.from('quizzes').delete().eq('id', id)
  fail(error)
  await removeUnusedImages((data ?? []).map((q) => q.image_path as string))
}

export async function duplicateQuiz(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('duplicate_quiz', { p_quiz_id: id })
  fail(error)
  return data as string
}

export async function reorderQuestions(quizId: string, ids: string[]) {
  const { error } = await supabase.rpc('reorder_questions', { p_quiz_id: quizId, p_ids: ids })
  fail(error)
}

export async function getQuestion(qid: string): Promise<QuestionForm> {
  const { data, error } = await supabase
    .from('questions')
    .select('id, quiz_id, type, prompt, more_info, image_path, background_color, scheduled_on, answers(text, is_correct, position, side, pair_key, date_label)')
    .eq('id', qid)
    .single()
  fail(error)
  const q = data as {
    id: string; quiz_id: string; type: QuestionType; prompt: string; more_info: string | null
    image_path: string | null; background_color: string | null; scheduled_on: string | null; answers: (AnswerForm & { position: number })[]
  }
  return {
    id: q.id,
    quiz_id: q.quiz_id,
    type: q.type,
    prompt: q.prompt,
    more_info: q.more_info ?? '',
    image_path: q.image_path,
    background_color: q.background_color ?? '',
    scheduled_on: q.scheduled_on,
    answers: [...q.answers]
      .sort((a, b) => a.position - b.position)
      .map(({ text, is_correct, side, pair_key, date_label }) => ({ text, is_correct, side, pair_key, date_label })),
  }
}

export async function saveQuestion(form: QuestionForm): Promise<string> {
  const { data, error } = await supabase.rpc('save_question', { p: form })
  fail(error)
  return data as string
}

export async function deleteQuestion(qid: string) {
  const { data } = await supabase.from('questions').select('image_path').eq('id', qid).maybeSingle()
  const { error } = await supabase.from('questions').delete().eq('id', qid)
  fail(error)
  await removeUnusedImages([(data as { image_path: string | null } | null)?.image_path])
}
