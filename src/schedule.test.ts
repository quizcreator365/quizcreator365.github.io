import { describe, expect, it } from 'vitest'
import { addDays, questionStatus, todayParis } from './schedule'

const T = '2026-10-26'
const q = (scheduled_on: string | null, is_hidden = false, hidden_on: string | null = null) => ({ scheduled_on, is_hidden, hidden_on })

describe('statut d’une question', () => {
  it('sans date : non programmée, masquée ou non', () => {
    expect(questionStatus(q(null), T)).toBe('unscheduled')
    expect(questionStatus(q(null, true, '2026-10-20'), T)).toBe('unscheduled')
  })
  it('date future : programmée', () => {
    expect(questionStatus(q('2026-10-28'), T)).toBe('scheduled')
  })
  it('date atteinte : ouverte', () => {
    expect(questionStatus(q('2026-10-26'), T)).toBe('open')
    expect(questionStatus(q('2026-10-23'), T)).toBe('open')
  })
  it('masquée avant sa date : ouverte automatiquement à la date', () => {
    expect(questionStatus(q('2026-10-26', true, '2026-10-24'), T)).toBe('open')
    expect(questionStatus(q('2026-10-26', true, null), T)).toBe('open')
  })
  it('masquée après son ouverture : masquée', () => {
    expect(questionStatus(q('2026-10-23', true, '2026-10-24'), T)).toBe('hidden')
    expect(questionStatus(q('2026-10-26', true, '2026-10-26'), T)).toBe('hidden')
  })
})

describe('dates', () => {
  it('donne la date de Paris, y compris juste après minuit', () => {
    // 23 h 30 UTC le 26 octobre = 0 h 30 le 27 à Paris (heure d'hiver)
    expect(todayParis(new Date('2026-10-26T23:30:00Z'))).toBe('2026-10-27')
    expect(todayParis(new Date('2026-10-26T10:00:00Z'))).toBe('2026-10-26')
  })
  it('ajoute des jours en passant les fins de mois', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
  })
})
