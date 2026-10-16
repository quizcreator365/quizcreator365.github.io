<script setup lang="ts">
import { computed } from 'vue'
import Icon from '../Icon.vue'
import { renderInline } from '../format'
import { imageUrl } from '../images'
import { formatScore } from '../scoring'
import { IMAGE_TYPES, TEXT_TYPES, type Answer, type PlayerAnswer, type Question } from '../types'

const props = defineProps<{
  question: Question
  options: Answer[]
  answer: PlayerAnswer
  score: number
}>()
const emit = defineEmits<{ selfEval: [correct: boolean] }>()

const isText = computed(() => TEXT_TYPES.includes(props.question.type))
const photo = computed(() => (IMAGE_TYPES.includes(props.question.type) ? imageUrl(props.question.image_path) : null))
const selfCorrect = computed(() => (props.answer.kind === 'text' ? props.answer.selfCorrect : null))
const chosen = computed(() => (props.answer.kind === 'choices' ? props.answer.ids : []))
const reference = computed(() => props.question.answers.find((a) => a.is_correct)?.text ?? props.question.answers[0]?.text ?? '')

const verdict = computed(() => {
  if (isText.value && selfCorrect.value === null) return null
  if (props.score === 1) return { tone: 'good', title: 'Bravo !', icon: 'check' as const }
  if (props.score === 0) return { tone: 'bad', title: 'Raté !', icon: 'cross' as const }
  return { tone: 'mid', title: props.score >= 0.5 ? 'En partie juste' : 'Presque…', icon: 'half' as const }
})

function optionState(option: Answer) {
  const picked = chosen.value.includes(option.id)
  if (option.is_correct) return { cls: 'good', note: picked ? 'Ta réponse · juste' : 'Bonne réponse' }
  if (picked) return { cls: 'bad', note: 'Ta réponse' }
  return { cls: 'neutral', note: '' }
}

/** Association : chaque élément de gauche, la réponse donnée et la bonne. */
const matchRows = computed(() => {
  if (props.question.type !== 'matching' || props.answer.kind !== 'pairs') return []
  const pairs = props.answer.pairs
  const byId = new Map(props.question.answers.map((a) => [a.id, a]))
  return props.options
    .filter((a) => a.side === 'left')
    .map((left) => {
      const good = props.question.answers.find((a) => a.side === 'right' && a.pair_key === left.pair_key)
      const given = byId.get(pairs[left.id])
      return { left, good, given, ok: !!given && given.id === good?.id }
    })
})
const matchGood = computed(() => matchRows.value.filter((r) => r.ok).length)

/** Chronologie : bon ordre, avec la place donnée par le joueur. */
const chronoRows = computed(() => {
  if (props.question.type !== 'chronology' || props.answer.kind !== 'order') return []
  const given = props.answer.ids
  return [...props.question.answers]
    .sort((a, b) => a.position - b.position)
    .map((item, i) => {
      const placed = given.indexOf(item.id)
      return { item, ok: placed === i, placed: placed + 1 }
    })
})
const chronoGood = computed(() => chronoRows.value.filter((r) => r.ok).length)
</script>

<template>
  <div class="stack">
    <div v-if="verdict" class="banner" :class="verdict.tone" role="status">
      <Icon :name="verdict.icon" :size="28" />
      <div>
        <strong>{{ verdict.title }}</strong>
        <span class="small">
          <template v-if="question.type === 'matching'">{{ matchGood }} {{ matchGood > 1 ? 'paires justes' : 'paire juste' }} sur {{ matchRows.length }} · </template>
          <template v-if="question.type === 'chronology'">{{ chronoGood }} bien {{ chronoGood > 1 ? 'placés' : 'placé' }} sur {{ chronoRows.length }} · </template>
          {{ formatScore(score) }} / 1 point
        </span>
      </div>
    </div>

    <div class="row" style="flex-wrap: nowrap; align-items: center; gap: 14px">
      <img v-if="photo" :src="photo" alt="Photo de la question" class="thumb" />
      <p class="prompt" style="font-size: 18px; font-family: var(--body)" v-html="renderInline(question.prompt)"></p>
    </div>

    <template v-if="isText">
      <div class="answer-box">
        <span class="label">Tu as répondu</span>
        <span class="value">{{ answer.kind === 'text' && answer.text.trim() ? answer.text : '(pas de réponse)' }}</span>
      </div>
      <div class="answer-box ref">
        <span class="label">La réponse</span>
        <span class="value" style="font-weight: 700" v-html="renderInline(reference)"></span>
      </div>
    </template>

    <ul v-else-if="question.type === 'matching'" class="corr-list">
      <li v-for="r in matchRows" :key="r.left.id" :class="r.ok ? 'good' : 'bad'">
        <Icon :name="r.ok ? 'check' : 'cross'" :color="r.ok ? 'var(--good)' : 'var(--bad)'" />
        <div class="grow">
          <span><span v-html="renderInline(r.left.text)"></span> → <b v-html="renderInline(r.given?.text ?? '—')"></b></span>
          <span v-if="!r.ok" class="small corr-fix">Bonne réponse : <span v-html="renderInline(r.good?.text)"></span></span>
        </div>
      </li>
    </ul>

    <ol v-else-if="question.type === 'chronology'" class="corr-list">
      <li v-for="r in chronoRows" :key="r.item.id" :class="r.ok ? 'good' : 'bad'">
        <span class="corr-date">{{ r.item.date_label || '' }}</span>
        <div class="grow">
          <span :style="{ fontWeight: r.ok ? 700 : 400 }" v-html="renderInline(r.item.text)"></span>
          <span v-if="!r.ok" class="small corr-fix">Tu l'avais placé {{ r.placed === 1 ? '1er' : `${r.placed}e` }}</span>
        </div>
        <Icon v-if="r.ok" name="check" color="var(--good)" />
      </li>
    </ol>

    <div v-else class="stack">
      <div v-for="option in options" :key="option.id" class="option" :class="optionState(option).cls">
        <Icon v-if="optionState(option).cls === 'good'" name="check" color="var(--good)" />
        <Icon v-else-if="optionState(option).cls === 'bad'" name="cross" color="var(--bad)" />
        <span v-else style="width: 20px"></span>
        <span v-html="renderInline(option.text)"></span>
        <span class="note">{{ optionState(option).note }}</span>
      </div>
    </div>

    <details v-if="question.more_info" class="more">
      <summary>En savoir plus</summary>
      <p v-html="renderInline(question.more_info)"></p>
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
