import { describe, expect, it } from 'vitest'
import { formatScore, scoreQuestion, summarize } from './scoring'
import type { Answer, Question, QuestionType } from './types'

const q = (type: QuestionType, answers: Partial<Answer>[]): Question => ({
  id: 'q',
  type,
  prompt: 'Question',
  answers: answers.map((a, i) => ({ id: `a${i}`, text: `R${i}`, is_correct: false, position: i, ...a })),
})

describe('texte libre (auto-évaluation)', () => {
  const question = q('free_text', [{ is_correct: true }])
  it('vaut 1 si le joueur dit avoir juste', () => {
    expect(scoreQuestion(question, { kind: 'text', text: 'x', selfCorrect: true })).toBe(1)
  })
  it('vaut 0 si le joueur dit avoir faux ou ne s\'est pas évalué', () => {
    expect(scoreQuestion(question, { kind: 'text', text: 'x', selfCorrect: false })).toBe(0)
    expect(scoreQuestion(question, { kind: 'text', text: 'x', selfCorrect: null })).toBe(0)
  })
})

describe('QCM : 1 ou 0', () => {
  const single = q('mcq', [{}, { is_correct: true }, {}])
  const multi = q('mcq', [{ is_correct: true }, { is_correct: true }, {}])

  it('une seule bonne réponse', () => {
    expect(scoreQuestion(single, { kind: 'choices', ids: ['a1'] })).toBe(1)
    expect(scoreQuestion(single, { kind: 'choices', ids: ['a0'] })).toBe(0)
  })
  it('plusieurs bonnes réponses : toutes et aucune mauvaise', () => {
    expect(scoreQuestion(multi, { kind: 'choices', ids: ['a1', 'a0'] })).toBe(1)
    expect(scoreQuestion(multi, { kind: 'choices', ids: ['a0'] })).toBe(0)
    expect(scoreQuestion(multi, { kind: 'choices', ids: ['a0', 'a1', 'a2'] })).toBe(0)
  })
  it('aucune case cochée', () => {
    expect(scoreQuestion(single, { kind: 'choices', ids: [] })).toBe(0)
  })
})

describe('vrai ou faux', () => {
  const question = q('true_false', [{ text: 'Vrai' }, { text: 'Faux', is_correct: true }])
  it('note 1 ou 0', () => {
    expect(scoreQuestion(question, { kind: 'choices', ids: ['a1'] })).toBe(1)
    expect(scoreQuestion(question, { kind: 'choices', ids: ['a0'] })).toBe(0)
  })
})

describe('association au prorata', () => {
  const question = q('matching', [
    { side: 'left', pair_key: 1 },
    { side: 'right', pair_key: 1 },
    { side: 'left', pair_key: 2 },
    { side: 'right', pair_key: 2 },
    { side: 'left', pair_key: 3 },
    { side: 'right', pair_key: 3 },
    { side: 'left', pair_key: 4 },
    { side: 'right', pair_key: 4 },
  ])
  it('2 paires justes sur 4 = 0,5', () => {
    const pairs = { a0: 'a1', a2: 'a3', a4: 'a7', a6: 'a5' }
    expect(scoreQuestion(question, { kind: 'pairs', pairs })).toBe(0.5)
  })
  it('toutes justes = 1', () => {
    const pairs = { a0: 'a1', a2: 'a3', a4: 'a5', a6: 'a7' }
    expect(scoreQuestion(question, { kind: 'pairs', pairs })).toBe(1)
  })
})

describe('chronologie au prorata', () => {
  const question = q('chronology', [{}, {}, {}, {}])
  it('2 éléments bien placés sur 4 = 0,5', () => {
    expect(scoreQuestion(question, { kind: 'order', ids: ['a0', 'a2', 'a1', 'a3'] })).toBe(0.5)
  })
})

describe('résumé et affichage', () => {
  it('compte justes, partielles et fausses', () => {
    const s = summarize([1, 1, 1, 1, 1, 1, 1, 0.5, 0, 0])
    expect(s).toEqual({ total: 7.5, max: 10, correct: 7, partial: 1, wrong: 2 })
  })
  it('formate le score à la française', () => {
    expect(formatScore(7.5).replace(/\s/g, '')).toBe('7,5')
    expect(formatScore(7)).toBe('7')
    expect(formatScore(7 + 1 / 3)).toBe('7,3')
  })
})

describe('Quiz photo (auto-évaluation)', () => {
  it('vaut 1 ou 0 selon l\'auto-évaluation', () => {
    for (const type of ['photo'] as const) {
      const question = q(type, [{ is_correct: true }])
      expect(scoreQuestion(question, { kind: 'text', text: 'Grace Kelly', selfCorrect: true })).toBe(1)
      expect(scoreQuestion(question, { kind: 'text', text: 'Grace Kely', selfCorrect: false })).toBe(0)
    }
  })
})
