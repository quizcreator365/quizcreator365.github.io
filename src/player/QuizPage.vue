<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Icon from '../Icon.vue'
import { supabase } from '../supabase'
import { scoreQuestion, summarize } from '../scoring'
import { AVAILABLE_TYPES, IMAGE_TYPES, PARTIAL_TYPES, TEXT_TYPES, TYPE_LABELS, type Answer, type PlayerAnswer, type Question, type Quiz } from '../types'
import { shuffle } from '../utils'
import { imageUrl } from '../images'
import { renderInline } from '../format'
import { useRoute } from 'vue-router'
import QuestionAnswer from './QuestionAnswer.vue'
import QuestionCorrection from './QuestionCorrection.vue'
import ResultView from './ResultView.vue'

const props = defineProps<{ slug: string }>()
const route = useRoute()
/** Aperçu ouvert depuis le back office : joueur fictif si besoin, bandeau visible. */
const preview = computed(() => route.query.apercu !== undefined)
const PREVIEW_PLAYER = { id: '__apercu__', name: 'Aperçu' }

const status = ref<'loading' | 'notfound' | 'closed' | 'error' | 'ready'>('loading')
const closedName = ref('')
const quiz = ref<Quiz | null>(null)
const phase = ref<'pick' | 'play' | 'result'>('pick')
const playerId = ref<string | null>(null)
const index = ref(0)
const stage = ref<'answer' | 'correction' | 'review'>('answer')
const options = ref<Record<string, Answer[]>>({})
const answers = ref<Record<string, PlayerAnswer>>({})

const questions = computed<Question[]>(() =>
  (quiz.value?.questions ?? []).filter((q) => AVAILABLE_TYPES.includes(q.type)),
)
const current = computed(() => questions.value[index.value])
const players = computed(() => {
  const list = quiz.value?.players ?? []
  return preview.value && list.length === 0 ? [PREVIEW_PLAYER] : list
})
const player = computed(() => players.value.find((p) => p.id === playerId.value))
const currentImage = computed(() =>
  current.value && IMAGE_TYPES.includes(current.value.type) ? imageUrl(current.value.image_path) : null,
)

/** Précharge les photos pour qu'elles s'affichent sans attente. */
function preloadImages() {
  for (const q of questions.value) {
    const url = IMAGE_TYPES.includes(q.type) ? imageUrl(q.image_path) : null
    if (url) new Image().src = url
  }
}
const isLast = computed(() => index.value === questions.value.length - 1)
const scores = computed(() => questions.value.map((q) => scoreQuestion(q, answers.value[q.id])))
const summary = computed(() => summarize(scores.value))

const progress = computed(() => {
  const done = index.value + (stage.value === 'answer' ? 0 : 1)
  return (done / Math.max(questions.value.length, 1)) * 100
})

const canValidate = computed(() => {
  const a = current.value && answers.value[current.value.id]
  if (!a) return false
  if (a.kind === 'text') return a.text.trim().length > 0
  if (a.kind === 'choices') return a.ids.length > 0
  if (a.kind === 'pairs') return Object.keys(a.pairs).length === current.value.answers.filter((x) => x.side === 'left').length
  return true
})

const canContinue = computed(() => {
  const a = current.value && answers.value[current.value.id]
  return !(a && a.kind === 'text' && a.selfCorrect === null)
})

async function load() {
  status.value = 'loading'
  const { data, error } = await supabase.rpc('get_quiz', { p_slug: props.slug })
  if (error) {
    status.value = 'error'
    return
  }
  if (!data) {
    status.value = 'notfound'
    document.title = 'Quiz introuvable'
    return
  }
  if ((data as { closed?: boolean }).closed) {
    closedName.value = (data as { name: string }).name
    status.value = 'closed'
    document.title = closedName.value
    return
  }
  quiz.value = data as Quiz
  document.title = quiz.value.name
  status.value = 'ready'
  reset()
  preloadImages()
  // Dernier joueur choisi sur ce téléphone (par son nom, stable d'un enregistrement à l'autre).
  const last = readLastPlayer()
  playerId.value = players.value.find((p) => p.name === last)?.id ?? null
  if (preview.value && !playerId.value) playerId.value = players.value[0]?.id ?? null
}

const storageKey = () => `quiz:dernier-joueur:${props.slug}`
function readLastPlayer(): string | null {
  try {
    return localStorage.getItem(storageKey())
  } catch {
    return null
  }
}
function saveLastPlayer(name: string) {
  try {
    localStorage.setItem(storageKey(), name)
  } catch {
    /* navigation privée : sans importance */
  }
}

/** Ordre de départ de la chronologie : mélangé, et jamais déjà juste. */
function shuffledOrder(q: Question): string[] {
  const correct = [...q.answers].sort((a, b) => a.position - b.position).map((a) => a.id)
  if (correct.length < 2) return correct
  let ids = shuffle(correct)
  for (let i = 0; i < 10 && ids.every((id, j) => id === correct[j]); i++) ids = shuffle(correct)
  if (ids.every((id, j) => id === correct[j])) ids = [...correct].reverse()
  return ids
}

function emptyAnswer(q: Question): PlayerAnswer {
  if (TEXT_TYPES.includes(q.type)) return { kind: 'text', text: '', selfCorrect: null }
  if (q.type === 'matching') return { kind: 'pairs', pairs: {} }
  if (q.type === 'chronology') return { kind: 'order', ids: shuffledOrder(q) }
  return { kind: 'choices', ids: [] }
}

function displayOptions(q: Question): Answer[] {
  if (q.type === 'mcq') return shuffle(q.answers)
  if (q.type === 'matching')
    return [...shuffle(q.answers.filter((a) => a.side === 'left')), ...shuffle(q.answers.filter((a) => a.side === 'right'))]
  return [...q.answers]
}

const showPartial = computed(() => questions.value.some((q) => PARTIAL_TYPES.includes(q.type)))

function reset() {
  const opts: Record<string, Answer[]> = {}
  const empty: Record<string, PlayerAnswer> = {}
  for (const q of questions.value) {
    opts[q.id] = displayOptions(q)
    empty[q.id] = emptyAnswer(q)
  }
  options.value = opts
  answers.value = empty
  index.value = 0
  stage.value = 'answer'
}

function start() {
  if (!playerId.value) return
  if (player.value && player.value.id !== PREVIEW_PLAYER.id) saveLastPlayer(player.value.name)
  reset()
  phase.value = 'play'
}

function validate() {
  if (canValidate.value) stage.value = 'correction'
}

function selfEval(correct: boolean) {
  const q = current.value
  const a = answers.value[q.id]
  if (a.kind === 'text') answers.value[q.id] = { ...a, selfCorrect: correct }
}

function next() {
  if (!canContinue.value) return
  if (isLast.value) {
    phase.value = 'result'
  } else {
    index.value += 1
    stage.value = 'answer'
  }
  window.scrollTo(0, 0)
}

function replay() {
  reset()
  phase.value = 'pick'
}

watch(() => props.slug, load)
onMounted(load)
</script>

<template>
  <main v-if="status === 'loading'" class="screen center" aria-busy="true">
    <p class="muted" style="text-align: center">Chargement du quiz…</p>
  </main>

  <main v-else-if="status === 'notfound'" class="screen center">
    <div class="hero stack">
      <span class="eyebrow">Quiz introuvable</span>
      <h1>Ce quiz n'existe pas ou n'est plus disponible.</h1>
      <p>Vérifie le lien qu'on t'a envoyé.</p>
    </div>
  </main>

  <main v-else-if="status === 'closed'" class="screen center">
    <div class="hero stack">
      <span class="eyebrow">Quiz fermé</span>
      <h1>{{ closedName }}</h1>
      <p>Ce quiz n'est pas ouvert pour le moment. Reviens quand on t'aura prévenu qu'il est prêt !</p>
    </div>
  </main>

  <main v-else-if="status === 'error'" class="screen center">
    <div class="hero stack">
      <span class="eyebrow">Connexion impossible</span>
      <h1>Le quiz n'a pas pu être chargé.</h1>
      <p>Vérifie ta connexion internet, puis réessaie.</p>
    </div>
    <button type="button" class="btn btn-primary btn-big" @click="load">Réessayer</button>
  </main>

  <template v-else-if="quiz">
    <div v-if="preview" class="preview-banner" role="status">Aperçu du quiz · rien n'est enregistré</div>
    <!-- Choix du joueur -->
    <main v-if="phase === 'pick'" class="screen">
      <div class="hero stack">
        <span class="eyebrow">{{ questions.length }} question{{ questions.length > 1 ? 's' : '' }}</span>
        <h1>{{ quiz.name }}</h1>
        <p v-if="quiz.description">{{ quiz.description }}</p>
      </div>

      <template v-if="questions.length === 0">
        <p class="banner info">Ce quiz n'a pas encore de questions. Reviens plus tard !</p>
      </template>
      <template v-else>
        <fieldset class="stack" style="border: 0; padding: 0; margin: 0">
          <legend><h2 style="margin-bottom: 12px">Qui joue ?</h2></legend>
          <label
            v-for="p in players"
            :key="p.id"
            class="option"
            :class="{ selected: playerId === p.id }"
          >
            <span
              aria-hidden="true"
              :style="{
                width: '40px', height: '40px', borderRadius: '50%', flex: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
                background: playerId === p.id ? 'var(--primary)' : 'var(--primary-soft)',
                color: playerId === p.id ? '#fff' : 'var(--primary)',
              }"
            >{{ p.name.charAt(0).toUpperCase() }}</span>
            <span class="grow">{{ p.name }}</span>
            <input v-model="playerId" type="radio" name="player" :value="p.id" />
          </label>
          <p v-if="players.length === 0" class="muted">Aucun joueur n'est inscrit à ce quiz.</p>
        </fieldset>
        <div class="spacer"></div>
        <button type="button" class="btn btn-primary btn-big btn-block" :disabled="!playerId" @click="start">
          Démarrer <Icon name="arrow" />
        </button>
      </template>
    </main>

    <!-- Questions -->
    <main v-else-if="phase === 'play' && current" class="screen">
      <div class="stack" style="gap: 10px">
        <div class="topline">
          <span><b>Question {{ index + 1 }}</b> <span class="muted">/ {{ questions.length }}</span></span>
          <span class="pill">{{ player?.name }}</span>
        </div>
        <div
          class="progress"
          role="progressbar"
          :aria-valuenow="Math.round(progress)"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label="Progression"
        >
          <div :style="{ width: progress + '%' }"></div>
        </div>
      </div>

      <template v-if="stage === 'correction'">
        <QuestionCorrection
          :question="current"
          :options="options[current.id]"
          :answer="answers[current.id]"
          :score="scores[index]"
          @self-eval="selfEval"
        />
        <div class="spacer"></div>
        <div class="actions">
          <button type="button" class="btn btn-secondary btn-big" style="font-family: var(--body); font-size: 16px" @click="stage = 'review'">
            Revenir
          </button>
          <button type="button" class="btn btn-primary btn-big wide" :disabled="!canContinue" @click="next">
            {{ isLast ? 'Voir mon résultat' : 'Question suivante' }}
          </button>
        </div>
        <p v-if="!canContinue" class="small muted" style="text-align: center">Indique si ta réponse était juste pour continuer.</p>
      </template>

      <template v-else>
        <span class="tag">{{ TYPE_LABELS[current.type] }}</span>
        <figure v-if="currentImage" class="question-photo">
          <img :src="currentImage" :alt="current.type === 'who_am_i' ? 'Photo de la personne à trouver' : 'Photo de la question'" />
        </figure>
        <h1 class="prompt" v-html="renderInline(current.prompt)"></h1>
        <QuestionAnswer
          v-model="answers[current.id]"
          :question="current"
          :options="options[current.id]"
          :readonly="stage === 'review'"
        />
        <div class="spacer"></div>
        <button
          v-if="stage === 'answer'"
          type="button"
          class="btn btn-primary btn-big btn-block"
          :disabled="!canValidate"
          @click="validate"
        >
          Valider
        </button>
        <button v-else type="button" class="btn btn-primary btn-big btn-block" @click="stage = 'correction'">
          Voir la correction
        </button>
      </template>
    </main>

    <!-- Résultat -->
    <ResultView
      v-else-if="phase === 'result'"
      :quiz-name="quiz.name"
      :quiz-slug="quiz.slug"
      :show-partial="showPartial"
      :player-name="player?.name ?? ''"
      :summary="summary"
      :answered="questions.length"
      @replay="replay"
    />
  </template>
</template>
