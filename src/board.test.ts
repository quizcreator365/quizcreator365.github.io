import { describe, expect, it } from 'vitest'
import { dayLabel, ordinal, percent, playerStats, rankPlayers, shortDay, type ScoreBoard } from './board'

const board: ScoreBoard = {
  today: '2026-10-26',
  days: [
    { day: '2026-10-24', max: 3 },
    { day: '2026-10-25', max: 3 },
    { day: '2026-10-26', max: 2 },
  ],
  players: [
    { id: 'tom', name: 'Tom', total: 5.5, answered: 7, days: { '2026-10-24': 3, '2026-10-25': 1.5, '2026-10-26': 1 } },
    { id: 'pau', name: 'Paulette', total: 5.5, answered: 6, days: { '2026-10-24': 2.5, '2026-10-25': 3 } },
    { id: 'mir', name: 'Mireille', total: 2, answered: 2, days: { '2026-10-26': 2 } },
    { id: 'jo', name: 'Jo', total: 0, answered: 0, days: {} },
  ],
}

describe('classement', () => {
  it('trie par cumul et partage le rang des ex aequo', () => {
    expect(rankPlayers(board).map((r) => `${r.rank}:${r.name}`)).toEqual(['1:Paulette', '1:Tom', '3:Mireille', '4:Jo'])
  })
})

describe('scores d’un joueur', () => {
  it('donne les points par jour, le cumul, le maximum et le score du jour', () => {
    const s = playerStats(board, 'pau')
    expect(s.days.map((d) => d.points)).toEqual([2.5, 3, 0])
    expect(s.total).toBe(5.5)
    expect(s.maxTotal).toBe(8)
    expect(s.today).toEqual({ day: '2026-10-26', max: 2, points: 0 })
    expect(s.rank).toBe(1)
  })
  it('accepte les nombres envoyés sous forme de texte', () => {
    const s = playerStats({ ...board, players: [{ id: 'x', name: 'X', total: '1.5' as unknown as number, answered: 2, days: { '2026-10-26': '1.5' as unknown as number } }] }, 'x')
    expect(s.total).toBe(1.5)
    expect(s.today?.points).toBe(1.5)
  })
  it('sans question aujourd’hui, le score du jour est vide', () => {
    expect(playerStats({ ...board, today: '2026-10-27' }, 'tom').today).toBeNull()
  })
})

describe('libellés', () => {
  it('nomme les jours par rapport à aujourd’hui', () => {
    expect(dayLabel('2026-10-26', '2026-10-26')).toBe("Aujourd'hui")
    expect(dayLabel('2026-10-25', '2026-10-26')).toBe('Hier')
    expect(dayLabel('2026-10-23', '2026-10-26')).toBe('Vendredi 23 octobre')
  })
  it('formate pourcentage, date courte et rang', () => {
    expect(percent(5.5, 8)).toBe('69 %')
    expect(percent(0, 0)).toBe('–')
    expect(shortDay('2026-10-05')).toBe('05/10')
    expect(ordinal(1)).toBe('1er')
    expect(ordinal(3)).toBe('3e')
  })
})
