import type { PlayerAnswer, Question } from './types'

/**
 * Points obtenus sur une question, entre 0 et 1.
 * - Texte libre, Qui suis-je ?, Quiz photo : auto-évaluation (1 ou 0).
 * - QCM et vrai ou faux : 1 si les cases cochées sont exactement les bonnes, sinon 0.
 * - Association : paires justes / nombre de paires.
 * - Chronologie : éléments à la bonne position / nombre d'éléments.
 */
export function scoreQuestion(question: Question, answer: PlayerAnswer | undefined): number {
  if (!answer) return 0

  switch (question.type) {
    case 'free_text':
    case 'who_am_i':
    case 'photo':
      return answer.kind === 'text' && answer.selfCorrect === true ? 1 : 0

    case 'mcq':
    case 'true_false': {
      if (answer.kind !== 'choices') return 0
      const correct = new Set(question.answers.filter((a) => a.is_correct).map((a) => a.id))
      const chosen = new Set(answer.ids)
      if (correct.size === 0 || chosen.size !== correct.size) return 0
      for (const id of chosen) if (!correct.has(id)) return 0
      return 1
    }

    case 'matching': {
      if (answer.kind !== 'pairs') return 0
      const lefts = question.answers.filter((a) => a.side === 'left')
      if (lefts.length === 0) return 0
      const rightByKey = new Map(
        question.answers.filter((a) => a.side === 'right').map((a) => [a.pair_key, a.id]),
      )
      const good = lefts.filter((l) => answer.pairs[l.id] === rightByKey.get(l.pair_key)).length
      return good / lefts.length
    }

    case 'chronology': {
      if (answer.kind !== 'order') return 0
      const expected = [...question.answers].sort((a, b) => a.position - b.position).map((a) => a.id)
      if (expected.length === 0) return 0
      const good = expected.filter((id, i) => answer.ids[i] === id).length
      return good / expected.length
    }
  }
}

export interface Summary {
  total: number
  max: number
  correct: number
  partial: number
  wrong: number
}

export function summarize(scores: number[]): Summary {
  return {
    total: scores.reduce((sum, s) => sum + s, 0),
    max: scores.length,
    correct: scores.filter((s) => s === 1).length,
    partial: scores.filter((s) => s > 0 && s < 1).length,
    wrong: scores.filter((s) => s === 0).length,
  }
}

/** 7.5 → « 7,5 » ; 7 → « 7 » ; 7.333 → « 7,3 ». */
export function formatScore(value: number): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
}
