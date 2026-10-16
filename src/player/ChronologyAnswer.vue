<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Sortable from 'sortablejs'
import { renderInline } from '../format'
import type { Answer, PlayerAnswer } from '../types'

const props = defineProps<{ options: Answer[]; modelValue: PlayerAnswer; readonly?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: PlayerAnswer] }>()

const byId = computed(() => new Map(props.options.map((a) => [a.id, a])))
const ids = computed(() => (props.modelValue.kind === 'order' ? props.modelValue.ids : []))
const listEl = ref<HTMLOListElement | null>(null)
let sortable: Sortable | null = null

function move(from: number, to: number) {
  if (props.readonly || to < 0 || to >= ids.value.length) return
  const next = [...ids.value]
  const [id] = next.splice(from, 1)
  next.splice(to, 0, id)
  emit('update:modelValue', { kind: 'order', ids: next })
}

onMounted(() => {
  if (!listEl.value || props.readonly) return
  sortable = Sortable.create(listEl.value, {
    handle: '.drag',
    animation: 150,
    onEnd(evt) {
      const { oldIndex, newIndex, item, from } = evt
      if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
      from.removeChild(item)
      from.insertBefore(item, from.children[oldIndex] ?? null)
      move(oldIndex, newIndex)
    },
  })
})
onBeforeUnmount(() => sortable?.destroy())
</script>

<template>
  <div class="stack">
    <p class="small muted">Du plus ancien (en haut) au plus récent (en bas). Fais glisser avec la poignée ⋮⋮ ou utilise les flèches.</p>
    <ol ref="listEl" class="chrono-list">
      <li v-for="(id, i) in ids" :key="id" class="chrono-item">
        <span class="drag" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
        </span>
        <span class="chrono-n">{{ i + 1 }}</span>
        <span class="grow" v-html="renderInline(byId.get(id)?.text)"></span>
        <span v-if="!readonly" class="q-actions">
          <button type="button" class="icon-btn move" :disabled="i === 0" :aria-label="`Monter : ${byId.get(id)?.text}`" @click="move(i, i - 1)">↑</button>
          <button type="button" class="icon-btn move" :disabled="i === ids.length - 1" :aria-label="`Descendre : ${byId.get(id)?.text}`" @click="move(i, i + 1)">↓</button>
        </span>
      </li>
    </ol>
  </div>
</template>
