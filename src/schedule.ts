/** Programmation des questions : même règle que la fonction SQL question_is_open. */

export type QuestionStatus = 'unscheduled' | 'scheduled' | 'open' | 'hidden'

export interface Schedulable {
  scheduled_on: string | null
  is_hidden: boolean
  hidden_on: string | null
}

/**
 * - sans date : non programmée (jamais visible) ;
 * - date future : programmée (un masquage antérieur sera ignoré à la date) ;
 * - date atteinte : ouverte, sauf si masquée depuis son ouverture.
 */
export function questionStatus(q: Schedulable, today: string): QuestionStatus {
  if (!q.scheduled_on) return 'unscheduled'
  if (q.scheduled_on > today) return 'scheduled'
  if (q.is_hidden && (q.hidden_on ?? '') >= q.scheduled_on) return 'hidden'
  return 'open'
}

export const STATUS_LABELS: Record<QuestionStatus, string> = {
  unscheduled: 'Non programmée',
  scheduled: 'Programmée',
  open: 'Ouverte',
  hidden: 'Masquée',
}

/** Date du jour à Paris, au format AAAA-MM-JJ. */
export function todayParis(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Ajoute des jours à une date AAAA-MM-JJ. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** « 23/10 » */
export function formatDay(day: string): string {
  const [, m, d] = day.split('-')
  return `${d}/${m}`
}
