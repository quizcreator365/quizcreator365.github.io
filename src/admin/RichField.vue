<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { MAX_TEXT } from '../types'
import { wrapSelection } from '../format'

const props = withDefaults(
  defineProps<{
    modelValue: string
    id?: string
    multiline?: boolean
    rows?: number
    maxlength?: number
    placeholder?: string
    ariaLabel?: string
    counter?: boolean
  }>(),
  { multiline: false, rows: 3, maxlength: MAX_TEXT, counter: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const field = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)

async function apply(marker: '**' | '*') {
  const el = field.value
  if (!el) return
  const start = el.selectionStart ?? props.modelValue.length
  const end = el.selectionEnd ?? start
  const next = wrapSelection(props.modelValue, start, end, marker)
  if (next.text.length > props.maxlength) return
  emit('update:modelValue', next.text)
  await nextTick()
  el.focus()
  el.setSelectionRange(next.start, next.end)
}

function onKey(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey)) return
  const key = event.key.toLowerCase()
  if (key === 'b') {
    event.preventDefault()
    apply('**')
  } else if (key === 'i') {
    event.preventDefault()
    apply('*')
  }
}

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="rich">
    <div class="rich-tools" role="toolbar" :aria-label="`Mise en forme${ariaLabel ? ' : ' + ariaLabel : ''}`">
      <button type="button" class="rich-btn" title="Gras (Ctrl+B)" aria-label="Gras" @mousedown.prevent @click="apply('**')"><b>G</b></button>
      <button type="button" class="rich-btn" title="Italique (Ctrl+I)" aria-label="Italique" @mousedown.prevent @click="apply('*')"><i style="font-family: Georgia, serif">I</i></button>
    </div>
    <textarea
      v-if="multiline"
      :id="id"
      ref="field"
      class="textarea"
      :rows="rows"
      :maxlength="maxlength"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      :value="modelValue"
      @input="onInput"
      @keydown="onKey"
    ></textarea>
    <input
      v-else
      :id="id"
      ref="field"
      class="input"
      :maxlength="maxlength"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      :value="modelValue"
      @input="onInput"
      @keydown="onKey"
    />
    <span v-if="counter" class="counter" :class="{ over: modelValue.length >= maxlength }">{{ modelValue.length }} / {{ maxlength }}</span>
  </div>
</template>
