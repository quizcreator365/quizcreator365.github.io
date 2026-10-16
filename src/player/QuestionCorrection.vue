<script setup lang="ts">
import { computed } from 'vue'
import Icon from '../Icon.vue'
import { formatScore } from '../scoring'
import type { Answer, PlayerAnswer, Question } from '../types'

const props = defineProps<{
  question: Question
  options: Answer[]
  answer: PlayerAnswer
  score: number
}>()
const emit = defineEmits<{ selfEval: [correct: boolean] }>()

const isText = computed(() => props.question.type === 'free_text')
const selfCorrect = computed(() => (props.answer.kind === 'text' ? props.answer.selfCorrect : null))
const chosen = computed(() => (props.answer.kind === 'choices' ? props.answer.ids : []))
const reference = computed(() => props.question.answers.find((a) => a.is_correct)?.text ?? props.question.answers[0]?.text ?? '')

const verdict = computed(() => {
  if (isText.value && selfCorrect.value === null) return null
  if (props.score === 1) return { tone: 'good', title: 'Bravo !', icon: 'check' as const }
  if (props.score === 0) return { tone: 'bad', title: 'Raté !', icon: 'cross' as const }
  return { tone: 'mid', title: 'À moitié juste', icon: 'half' as const }
})

function optionState(option: Answer) {
  const picked = chosen.value.includes(option.id)
  if (option.is_correct) return { cls: 'good', note: picked ? 'Ta réponse · juste' : 'Bonne réponse' }
  if (picked) return { cls: 'bad', note: 'Ta réponse' }
  return { cls: 'neutral', note: '' }
}
</script>

<template>
  <div class="stack">
    <div v-if="verdict" class="banner" :class="verdict.tone" role="status">
      <Icon :name="verdict.icon" :size="28" />
      <div>
        <strong>{{ verdict.title }}</strong>
        <span class="small">{{ formatScore(score) }} / 1 point</span>
      </div>
    </div>

    <p class="prompt" style="font-size: 18px; font-family: var(--body)">{{ question.prompt }}</p>

    <template v-if="isText">
      <div class="answer-box">
        <span class="label">Tu as répondu</span>
        <span class="value">{{ answer.kind === 'text' && answer.text.trim() ? answer.text : '(pas de réponse)' }}</span>
      </div>
      <div class="answer-box ref">
        <span class="label">La réponse</span>
        <span class="value" style="font-weight: 700">{{ reference }}</span>
      </div>
    </template>

    <div v-else class="stack">
      <div v-for="option in options" :key="option.id" class="option" :class="optionState(option).cls">
        <Icon v-if="optionState(option).cls === 'good'" name="check" color="var(--good)" />
        <Icon v-else-if="optionState(option).cls === 'bad'" name="cross" color="var(--bad)" />
        <span v-else style="width: 20px"></span>
        <span>{{ option.text }}</span>
        <span class="note">{{ optionState(option).note }}</span>
      </div>
    </div>

    <details v-if="question.more_info" class="more">
      <summary>En savoir plus</summary>
      <p>{{ question.more_info }}</p>
    </details>

    <div v-if="isText" class="self-eval">
      <h2 style="font-size: 19px">Alors, c'était juste ?</h2>
      <div class="row">
        <button
          type="button"
          class="btn btn-good"
          :class="{ picked: selfCorrect === true }"
          :aria-pressed="selfCorrect === true"
          @click="emit('selfEval', true)"
        >
          <Icon name="check" /> J'avais juste
        </button>
        <button
          type="button"
          class="btn btn-bad"
          :class="{ picked: selfCorrect === false }"
          :aria-pressed="selfCorrect === false"
          @click="emit('selfEval', false)"
        >
          <Icon name="cross" :size="18" /> J'avais faux
        </button>
      </div>
    </div>
  </div>
</template>
