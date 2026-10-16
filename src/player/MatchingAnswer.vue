<script setup lang="ts">
import { computed, ref } from 'vue'
import { renderInline } from '../format'
import type { Answer, PlayerAnswer } from '../types'
import { PAIR_COLORS } from './pairs'

const props = defineProps<{ options: Answer[]; modelValue: PlayerAnswer; readonly?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: PlayerAnswer] }>()

const lefts = computed(() => props.options.filter((a) => a.side === 'left'))
const rights = computed(() => props.options.filter((a) => a.side === 'right'))
const pairs = computed(() => (props.modelValue.kind === 'pairs' ? props.modelValue.pairs : {}))
const selected = ref<string | null>(null)

/** Numéro de paire d'un élément de gauche (ordre d'association), ou null. */
const order = computed(() => {
  const ids = Object.keys(pairs.value)
  return (leftId: string) => {
    const i = lefts.value.findIndex((l) => l.id === leftId)
    return ids.includes(leftId) ? i : null
  }
})
function leftOfRight(rightId: string) {
  return Object.keys(pairs.value).find((l) => pairs.value[l] === rightId) ?? null
}
const remaining = computed(() => lefts.value.length - Object.keys(pairs.value).length)

function update(next: Record<string, string>) {
  emit('update:modelValue', { kind: 'pairs', pairs: next })
}

function tapLeft(id: string) {
  if (props.readonly) return
  selected.value = selected.value === id ? null : id
}

function tapRight(id: string) {
  if (props.readonly) return
  const owner = leftOfRight(id)
  if (!selected.value) {
    // Toucher une paire formée la défait.
    if (owner) {
      const next = { ...pairs.value }
      delete next[owner]
      update(next)
    }
    return
  }
  const next = { ...pairs.value }
  if (owner) delete next[owner]
  next[selected.value] = id
  update(next)
  selected.value = null
}

function badgeStyle(i: number | null) {
  if (i === null) return {}
  const c = PAIR_COLORS[i % PAIR_COLORS.length]
  return { background: c, color: '#fff', borderColor: c }
}
function cardStyle(i: number | null) {
  return i === null ? {} : { borderColor: PAIR_COLORS[i % PAIR_COLORS.length] }
}
</script>

<template>
  <div class="stack">
    <p class="small muted">Touche un élément à gauche, puis celui qui lui correspond à droite. Touche une paire à droite pour la défaire.</p>
    <div class="match-grid">
      <div class="stack" style="gap: 10px" role="group" aria-label="Éléments à associer">
        <button
          v-for="l in lefts"
          :key="l.id"
          type="button"
          class="match-item"
          :class="{ active: selected === l.id }"
          :style="cardStyle(order(l.id))"
          :aria-pressed="selected === l.id"
          :disabled="readonly"
          @click="tapLeft(l.id)"
        >
          <span class="match-badge" :style="badgeStyle(order(l.id))">{{ order(l.id) !== null ? order(l.id)! + 1 : '' }}</span>
          <span v-html="renderInline(l.text)"></span>
        </button>
      </div>
      <div class="stack" style="gap: 10px" role="group" aria-label="Correspondances">
        <button
          v-for="r in rights"
          :key="r.id"
          type="button"
          class="match-item"
          :style="cardStyle(leftOfRight(r.id) ? order(leftOfRight(r.id)!) : null)"
          :disabled="readonly"
          @click="tapRight(r.id)"
        >
          <span class="match-badge" :style="badgeStyle(leftOfRight(r.id) ? order(leftOfRight(r.id)!) : null)">{{ leftOfRight(r.id) ? order(leftOfRight(r.id)!)! + 1 : '' }}</span>
          <span v-html="renderInline(r.text)"></span>
        </button>
      </div>
    </div>
    <p v-if="!readonly" class="small muted" aria-live="polite">
      {{ remaining > 0 ? `Encore ${remaining} ${remaining > 1 ? 'éléments' : 'élément'} à associer.` : 'Toutes les paires sont formées.' }}
    </p>
  </div>
</template>
