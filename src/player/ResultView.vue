<script setup lang="ts">
import Icon from '../Icon.vue'
import { formatScore, type Summary } from '../scoring'

defineProps<{ quizName: string; playerName: string; summary: Summary; answered: number }>()
const emit = defineEmits<{ replay: [] }>()
</script>

<template>
  <main class="screen">
    <h1>Bravo {{ playerName }} !</h1>

    <section class="result-card" aria-label="Ton résultat">
      <div>
        <span class="eyebrow">{{ quizName }}</span>
        <p style="color: var(--ink-soft)">{{ playerName }}</p>
      </div>
      <div class="score">
        <b>{{ formatScore(summary.total) }}</b><span>/ {{ summary.max }}</span>
      </div>
      <div
        class="bar"
        role="img"
        :aria-label="`${summary.correct} justes, ${summary.partial} partielles, ${summary.wrong} fausses`"
      >
        <div v-if="summary.correct" :style="{ flex: summary.correct, background: '#4cc38a' }"></div>
        <div v-if="summary.partial" :style="{ flex: summary.partial, background: 'var(--sun)' }"></div>
        <div v-if="summary.wrong" :style="{ flex: summary.wrong, background: '#f07c73' }"></div>
      </div>
      <div class="counts">
        <div><b>{{ summary.correct }}</b><span style="color: #a9dcc4">{{ summary.correct > 1 ? 'justes' : 'juste' }}</span></div>
        <div><b>{{ summary.partial }}</b><span style="color: #ffe08a">{{ summary.partial > 1 ? 'partielles' : 'partielle' }}</span></div>
        <div><b>{{ summary.wrong }}</b><span style="color: #f7b2ac">{{ summary.wrong > 1 ? 'fausses' : 'fausse' }}</span></div>
      </div>
      <span class="small" style="color: #9ca1c8">{{ answered }} questions répondues sur {{ summary.max }}</span>
    </section>

    <div class="spacer"></div>
    <button type="button" class="btn btn-secondary btn-big btn-block" @click="emit('replay')">
      <Icon name="replay" /> Rejouer
    </button>
    <p class="small muted" style="text-align: center">Ton résultat n'est pas enregistré.</p>
  </main>
</template>
