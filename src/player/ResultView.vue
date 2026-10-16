<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import Icon from '../Icon.vue'
import { formatScore, type Summary } from '../scoring'
import { quizUrl } from '../utils'
import { renderCard, shareResult } from './share'

const props = defineProps<{ quizName: string; quizSlug: string; playerName: string; summary: Summary; answered: number; showPartial: boolean }>()

/** Message de fin selon la part de points obtenue. */
function endMessage() {
  const ratio = props.summary.max ? props.summary.total / props.summary.max : 0
  if (ratio >= 0.8) return `Bravo ${props.playerName} !`
  if (ratio >= 0.5) return `Bien joué ${props.playerName} !`
  if (ratio > 0) return `Pas mal ${props.playerName}, tu feras mieux la prochaine fois !`
  return `Merci d'avoir joué ${props.playerName} !`
}
const emit = defineEmits<{ replay: [] }>()

const card = ref<HTMLElement | null>(null)
const image = ref<Blob | null>(null)
const status = ref<'preparing' | 'ready' | 'error'>('preparing')
const message = ref('')

const shareText = () =>
  `J'ai eu ${formatScore(props.summary.total)} / ${props.summary.max} au quiz « ${props.quizName} » ! ` +
  `À toi de jouer : ${quizUrl(props.quizSlug)}`

// L'image est préparée dès l'affichage : sur iPhone, le partage doit suivre immédiatement le toucher.
onMounted(async () => {
  await nextTick()
  try {
    await document.fonts?.ready
    if (card.value) image.value = await renderCard(card.value)
    status.value = 'ready'
  } catch {
    status.value = 'error'
  }
})

async function share() {
  message.value = ''
  if (!image.value) {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText())}`, '_blank', 'noopener')
    return
  }
  const outcome = await shareResult(image.value, shareText())
  if (outcome === 'downloaded') message.value = "Image enregistrée : ajoute-la à ton message WhatsApp."
}
</script>

<template>
  <main class="screen">
    <h1>{{ endMessage() }}</h1>

    <section ref="card" class="result-card" aria-label="Ton résultat">
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
      <div class="counts" :class="{ two: !showPartial }">
        <div><b>{{ summary.correct }}</b><span style="color: #a9dcc4">{{ summary.correct > 1 ? 'justes' : 'juste' }}</span></div>
        <div v-if="showPartial"><b>{{ summary.partial }}</b><span style="color: #ffe08a">{{ summary.partial > 1 ? 'partielles' : 'partielle' }}</span></div>
        <div><b>{{ summary.wrong }}</b><span style="color: #f7b2ac">{{ summary.wrong > 1 ? 'fausses' : 'fausse' }}</span></div>
      </div>
      <span class="small" style="color: #9ca1c8">{{ answered }} questions répondues sur {{ summary.max }}</span>
    </section>

    <div class="spacer"></div>
    <button
      type="button"
      class="btn btn-primary btn-big btn-block"
      :disabled="status === 'preparing'"
      @click="share"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>
      {{ status === 'preparing' ? 'Préparation de l’image…' : 'Partager sur WhatsApp' }}
    </button>
    <p v-if="message" class="ok" role="status" style="text-align: center">{{ message }}</p>
    <p v-if="status === 'error'" class="small muted" style="text-align: center">L'image n'a pas pu être créée : seul le texte sera partagé.</p>
    <button type="button" class="btn btn-secondary btn-big btn-block" @click="emit('replay')">
      <Icon name="replay" /> Rejouer
    </button>
    <p class="small muted" style="text-align: center">Ton résultat n'est pas enregistré.</p>
  </main>
</template>
