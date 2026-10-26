/** Scores enregistrés : jours de série, cumul et classement (calculs purs, testés). */

export interface ScoreBoard {
  today: string
  days: { day: string; max: number }[]
  players: { id: string; name: string; total: number; answered: number; days: Record<string, number> }[]
}

export interface DayScore {
  day: string
  max: number
  points: number
}

export interface RankRow {
  id: string
  name: string
  total: number
  rank: number
}

export interface PlayerStats {
  days: DayScore[]
  total: number
  maxTotal: number
  /** Score du jour (null si aucune question ouverte aujourd'hui). */
  today: DayScore | null
  rank: number | null
  ranking: RankRow[]
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0)) || 0

/** Classement par cumul décroissant ; les ex aequo partagent le même rang. */
export function rankPlayers(board: ScoreBoard): RankRow[] {
  const rows = board.players
    .map((p) => ({ id: p.id, name: p.name, total: num(p.total) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'fr'))
  let rank = 0
  let previous: number | null = null
  return rows.map((r, i) => {
    if (previous === null || Math.abs(r.total - previous) > 1e-9) rank = i + 1
    previous = r.total
    return { ...r, rank }
  })
}

export function playerStats(board: ScoreBoard, playerId: string): PlayerStats {
  const me = board.players.find((p) => p.id === playerId)
  const days = board.days.map((d) => ({ day: d.day, max: num(d.max), points: num(me?.days?.[d.day]) }))
  const ranking = rankPlayers(board)
  return {
    days,
    total: num(me?.total),
    maxTotal: days.reduce((sum, d) => sum + d.max, 0),
    today: days.find((d) => d.day === board.today) ?? null,
    rank: ranking.find((r) => r.id === playerId)?.rank ?? null,
    ranking,
  }
}

/** « 12 % » à partir de points et d'un maximum. */
export function percent(points: number, max: number): string {
  if (!max) return '–'
  return `${Math.round((points / max) * 100)} %`
}

/** Libellé d'un jour de série par rapport à aujourd'hui. */
export function dayLabel(day: string, today: string): string {
  if (day === today) return "Aujourd'hui"
  const diff = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86_400_000)
  if (diff === 1) return 'Hier'
  const d = new Date(`${day}T12:00:00Z`)
  const label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** « 23/10 » pour les axes du graphique. */
export function shortDay(day: string): string {
  const [, m, d] = day.split('-')
  return `${d}/${m}`
}

/** « 1er », « 2e »… */
export function ordinal(n: number): string {
  return n === 1 ? '1er' : `${n}e`
}
