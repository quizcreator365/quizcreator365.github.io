<script setup lang="ts">
import { computed } from 'vue'
import { renderInline } from '../format'
import { MAX_TEXT, TEXT_TYPES, type Answer, type PlayerAnswer, type Question } from '../types'
import ChronologyAnswer from './ChronologyAnswer.vue'
import MatchingAnswer from './MatchingAnswer.vue'

const props = defineProps<{
  question: Question
  /** Propositions dans l'ordre d'affichage (mélangées pour QCM, association, chronologie). */
  options: Answer[]
  modelValue: PlayerAnswer
  readonly?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: PlayerAnswer] }>()

const multiple = computed(() => props.question.answers.filter((a) => a.is_correct).length > 1)
const chosen = computed(() => (props.modelValue.kind === 'choices' ? props.modelValue.ids : []))
const text = computed(() => (props.modelValue.kind === 'text' ? props.modelValue.text : ''))

function toggle(id: string) {
  if (props.readonly) return
  const ids = chosen.value
  let next: string[]
  if (multiple.value) next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
  else next = ids.includes(id) ? [] : [id]
  emit('update:modelValue', { kind: 'choices', ids: next })
}

function onText(event: Event) {
  const value = (event.target as HTMLTextAreaElement).value
  emit('update:modelValue', { kind: 'text', text: value, selfCorrect: null })
}
</script>

<template>
  <div class="stack">
    <template v-if="TEXT_TYPES.includes(question.type)">
      <div class="field">
        <label :for="`answer-${question.id}`">Ta réponse</label>
        <textarea
          :id="`answer-${question.id}`"
          class="textarea"
          rows="3"
          :maxlength="MAX_TEXT"
          :value="text"
          :readonly="readonly"
          placeholder="Écris ta réponse"
          @input="onText"
        ></textarea>
        <span class="counter">{{ text.length }} / {{ MAX_TEXT }}</span>
      </div>
    </template>

    <MatchingAnswer
      v-else-if="question.type === 'matching'"
      :options="options"
      :model-value="modelValue"
      :readonly="readonly"
      @update:model-value="emit('update:modelValue', $event)"
    />

    <ChronologyAnswer
      v-else-if="question.type === 'chronology'"
      :options="options"
      :model-value="modelValue"
      :readonly="readonly"
      @update:model-value="emit('update:modelValue', $event)"
    />

    <template v-else>
      <p v-if="question.type === 'mcq'" class="small muted">
        {{ multiple ? 'Plusieurs réponses sont justes : coche-les toutes.' : 'Une seule réponse est juste.' }}
      </p>
      <div class="stack" role="group" aria-label="Propositions">
        <label
          v-for="option in options"
          :key="option.id"
          class="option"
          :class="{ selected: chosen.includes(option.id) }"
        >
          <input
            :type="multiple ? 'checkbox' : 'radio'"
            :name="`q-${question.id}`"
            :checked="chosen.includes(option.id)"
            :disabled="readonly"
            @change="toggle(option.id)"
          />
          <span v-html="renderInline(option.text)"></span>
        </label>
      </div>
    </template>
  </div>
</template>
