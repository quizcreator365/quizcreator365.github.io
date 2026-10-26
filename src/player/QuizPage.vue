<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from '../Icon.vue'
import { supabase } from '../supabase'
import { scoreQuestion, summarize } from '../scoring'
import { AVAILABLE_TYPES, IMAGE_TYPES, PARTIAL_TYPES, TEXT_TYPES, TYPE_LABELS, type Answer, type PlayerAnswer, type Question, type Quiz } from '../types'
import { shuffle } from '../utils'
import { imageUrl } from '../images'
import { renderInline } from '../format'
import { isValidColor, needsLightText, toHex } from '../colors'
import { dayLabel, playerStats, type ScoreBoard } from '../board'
import { useRoute } from 'vue-router'
import QuestionAnswer from './QuestionAnswer.vue'
import QuestionCorrection from './QuestionCorrection.vue'
import ResultView from './ResultView.vue'
import ScoresView from './ScoresView.vue'
import {
  forgetCode, getScores, NetworkError, playerLogin, readCode, refusalMessage, saveCode, selfEvaluate, submitAnswer,
  type Refusal, type StoredResponse,
} from './session'

const props = defineProps<{ slug: string }>()
const route = useRoute()
/** Aperçu ouvert depuis le back office : toutes les questions, aucun enregistrement. */
const preview = computed(() => route.query.apercu !== undefined)
const PREVIEW_PLAYER = { id: '__apercu__', name: 'Aperçu' }

const status = ref<'loading' | 'notfound' | 'closed' | 'error' | 'ready'>('loading')
const closedName = ref('')
const quiz = ref<Quiz | null>(null)
const phase = ref<'pick' | 'code' | 'play' | 'done' | 'result' | 'scores'>('pick')
const playerId = ref<string | null>(null)
const code = ref('')
const codeInput = ref('')
const codeError = ref('')
const busy = ref(false)
const actionError = ref('')

/** Réponses déjà enregistrées pour le joueur. */
const responses = ref<Record<string, StoredResponse>>({})
/** Questions à traiter pendant cette visite (figées au démarrage). */
const queue = ref<Question[]>([])
const index = ref(0)
const stage = ref<'answer' | 'correction' | 'review'>('answer')
const options = ref<Record<string, Answer[]>>({})
const answers = ref<Record<string, PlayerAnswer>>({})
/** Questions traitées pendant cette visite, pour le résumé. */
const doneIds = ref<string[]>([])
const board = ref<ScoreBoard | null>(null)
const scoresFrom = ref<'done' | 'result' | 'pick'>('done')

const questions = computed<Question[]>(() =>
  (quiz.value?.questions ?? []).filter((q) => AVAILABLE_TYPES.includes(q.type)),
)
const today = computed(() => quiz.value?.today ?? new Date().toISOString().slice(0, 10))
const current = computed(() => queue.value[index.value])
const players = computed(() => {
  const list = quiz.value?.players ?? []
  return preview.value && list.length === 0 ? [PREVIEW_PLAYER] : list
})
const player = computed(() => players.value.find((p) => p.id === playerId.value))
const currentImage = computed(() =>
  current.value && IMAGE_TYPES.includes(current.value.type) ? imageUrl(current.value.image_path) : null,
)
const isLast = computed(() => index.value === queue.value.length - 1)
const stats = computed(() => (board.value && playerId.value && !preview.value ? playerStats(board.value, playerId.value) : null))
const summary = computed(() => {
  const byId = new Map(questions.value.map((q) => [q.id, q]))
  return summarize(doneIds.value.map((id) => scoreQuestion(byId.get(id)!, answers.value[id])))
})
const showPartial = computed(() => questions.value.some((q) => PARTIAL_TYPES.includes(q.type)))

const progress = computed(() => {
  const done = index.value + (stage.value === 'answer' ? 0 : 1)
  return (done / Math.max(queue.value.length, 1)) * 100
})

const canValidate = computed(() => {
  const a = current.value && answers.value[current.value.id]
  if (!a || busy.value) return false
  if (a.kind === 'text') return a.text.trim().length > 0
  if (a.kind === 'choices') return a.ids.length > 0
  if (a.kind === 'pairs') return Object.keys(a.pairs).length === current.value.answers.filter((x) => x.side === 'left').length
  return true
})

const canContinue = computed(() => {
  const a = current.value && answers.value[current.value.id]
  return !busy.value && !(a && a.kind === 'text' && a.selfCorrect === null)
})

/** Infobulle du bouton grisé : au survol sur ordinateur, au toucher sur téléphone. */
const tipShown = ref(false)
let tipTimer: ReturnType<typeof setTimeout> | undefined
function flashTip() {
  if (canContinue.value) return
  tipShown.value = true
  clearTimeout(tipTimer)
  tipTimer = setTimeout(() => (tipShown.value = false), 3000)
}

// ---------- Chargement ----------
async function load() {
  status.value = 'loading'
  const { data, error } = await supabase.rpc('get_quiz', { p_slug: props.slug, p_preview: preview.value })
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
  phase.value = 'pick'
  preloadImages()
  const last = readLastPlayer()
  playerId.value = players.value.find((p) => p.name === last)?.id ?? null
  if (preview.value && !playerId.value) playerId.value = players.value[0]?.id ?? null
}

function preloadImages() {
  for (const q of questions.value) {
    const url = IMAGE_TYPES.includes(q.type) ? imageUrl(q.image_path) : null
    if (url) new Image().src = url
  }
}

const lastKey = () => `quiz:dernier-joueur:${props.slug}`
function readLastPlayer(): string | null {
  try {
    return localStorage.getItem(lastKey())
  } catch {
    return null
  }
}
function saveLastPlayer(name: string) {
  try {
    localStorage.setItem(lastKey(), name)
  } catch {
    /* navigation privée : sans importance */
  }
}

// ---------- Choix du joueur et code ----------
async function choosePlayer() {
  if (!player.value) return
  actionError.value = ''
  if (preview.value) {
    responses.value = {}
    startVisit()
    return
  }
  saveLastPlayer(player.value.name)
  const stored = readCode(props.slug, player.value.id)
  if (stored && (await login(stored, true))) return
  codeInput.value = ''
  phase.value = 'code'
}

async function submitCode() {
  codeError.value = ''
  const value = codeInput.value.trim()
  if (!/^\d{4}$/.test(value)) {
    codeError.value = 'Le code contient 4 chiffres.'
    return
  }
  await login(value, false)
}

/** Vérifie le code ; en cas de succès, mémorise-le et lance la visite. */
async function login(value: string, silent: boolean): Promise<boolean> {
  if (!playerId.value) return false
  busy.value = true
  try {
    const res = await playerLogin(playerId.value, value)
    if (!res.ok) {
      forgetCode(props.slug, playerId.value)
      if (!silent || res.reason === 'locked') codeError.value = refusalMessage(res)
      else codeError.value = 'Ton code a changé : saisis le nouveau code.'
      phase.value = 'code'
      return false
    }
    code.value = value
    saveCode(props.slug, playerId.value, value)
    responses.value = Object.fromEntries(res.responses.map((r) => [r.question_id, { ...r, points: r.points === null ? null : Number(r.points) }]))
    startVisit()
    loadScores()
    return true
  } catch (e) {
    actionError.value = (e as Error).message
    codeError.value = silent ? '' : (e as Error).message
    return false
  } finally {
    busy.value = false
  }
}

function changePlayer() {
  phase.value = 'pick'
  codeError.value = ''
}

// ---------- Visite : questions non répondues, du jour le plus ancien au plus récent ----------
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

function startVisit() {
  const todo = questions.value.filter((q) => {
    const r = responses.value[q.id]
    return !r || r.points === null
  })
  const opts: Record<string, Answer[]> = {}
  const ans: Record<string, PlayerAnswer> = {}
  for (const q of todo) {
    opts[q.id] = displayOptions(q)
    const r = responses.value[q.id]
    // Réponse en texte libre enregistrée mais pas encore auto-évaluée : on reprend à la correction.
    ans[q.id] = r ? { ...(r.answer as PlayerAnswer), ...(r.answer.kind === 'text' ? { selfCorrect: null } : {}) } as PlayerAnswer : emptyAnswer(q)
  }
  options.value = opts
  answers.value = ans
  queue.value = todo
  doneIds.value = []
  index.value = 0
  actionError.value = ''
  if (todo.length === 0) {
    phase.value = 'done'
    return
  }
  stage.value = responses.value[todo[0].id] ? 'correction' : 'answer'
  phase.value = 'play'
}

async function loadScores() {
  if (preview.value) return
  try {
    board.value = await getScores(props.slug)
  } catch {
    /* les scores s'afficheront à la prochaine visite */
  }
}

/** Code refusé en cours de route (changé par l'admin) : retour à la saisie du code. */
function handleRefusal(r: Refusal) {
  if (r.reason === 'wrong' || r.reason === 'locked' || r.reason === 'unknown') {
    if (playerId.value) forgetCode(props.slug, playerId.value)
    codeError.value = r.reason === 'locked' ? refusalMessage(r) : 'Ton code a changé : saisis le nouveau code.'
    phase.value = 'code'
    return true
  }
  return false
}

async function validate() {
  const q = current.value
  if (!canValidate.value || !q) return
  actionError.value = ''
  if (preview.value) {
    stage.value = 'correction'
    return
  }
  const a = answers.value[q.id]
  const isText = TEXT_TYPES.includes(q.type)
  busy.value = true
  try {
    const res = await submitAnswer(playerId.value!, code.value, q.id, a, isText ? null : scoreQuestion(q, a))
    if (!res.ok && handleRefusal(res)) return
    if (!res.ok && res.reason === 'closed') {
      actionError.value = refusalMessage(res)
      skip()
      return
    }
    if (!res.ok && res.reason !== 'already') {
      actionError.value = refusalMessage(res)
      return
    }
    responses.value[q.id] = { question_id: q.id, answer: a, points: isText ? null : scoreQuestion(q, a) }
    stage.value = 'correction'
  } catch (e) {
    actionError.value = (e as NetworkError).message
  } finally {
    busy.value = false
  }
}

function selfEval(correct: boolean) {
  const q = current.value
  const a = answers.value[q.id]
  if (a.kind === 'text') answers.value[q.id] = { ...a, selfCorrect: correct }
}

async function next() {
  const q = current.value
  if (!canContinue.value || !q) return
  actionError.value = ''
  const a = answers.value[q.id]
  if (!preview.value && a.kind === 'text' && responses.value[q.id]?.points === null) {
    busy.value = true
    try {
      const res = await selfEvaluate(playerId.value!, code.value, q.id, a.selfCorrect === true)
      if (!res.ok && handleRefusal(res)) return
      responses.value[q.id] = { ...responses.value[q.id], points: a.selfCorrect ? 1 : 0 }
    } catch (e) {
      actionError.value = (e as NetworkError).message
      return
    } finally {
      busy.value = false
    }
  }
  doneIds.value.push(q.id)
  advance()
}

function skip() {
  advance()
}

async function advance() {
  if (isLast.value) {
    // Les scores sont lus avant l'affichage : l'image partagée les contient.
    busy.value = true
    await loadScores()
    busy.value = false
    phase.value = 'result'
  } else {
    index.value += 1
    stage.value = responses.value[current.value.id] ? 'correction' : 'answer'
  }
  window.scrollTo(0, 0)
}

function openScores(from: 'done' | 'result' | 'pick') {
  scoresFrom.value = from
  phase.value = 'scores'
  loadScores()
}

// ---------- Couleur de fond de la question ----------
const background = computed(() => {
  const c = current.value?.background_color ?? ''
  return phase.value === 'play' && c && isValidColor(c) ? toHex(c) : null
})
const lightText = computed(() => (background.value ? needsLightText(background.value) : false))
watch(background, (hex) => {
  document.body.style.background = hex ?? ''
}, { immediate: true })
onBeforeUnmount(() => {
  document.body.style.background = ''
})

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
    <div v-if="preview" class="preview-banner" role="status">Aperçu · toutes les questions non masquées · rien n'est enregistré</div>

    <!-- Choix du joueur -->
    <main v-if="phase === 'pick'" class="screen">
      <div class="hero stack">
        <span class="eyebrow">Quiz du jour</span>
        <h1>{{ quiz.name }}</h1>
        <p v-if="quiz.description">{{ quiz.description }}</p>
      </div>

      <p v-if="questions.length === 0" class="banner info">Pas encore de question ouverte. Reviens plus tard !</p>
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
      <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>
      <div class="spacer"></div>
      <button type="button" class="btn btn-primary btn-big btn-block" :disabled="!playerId || busy" @click="choosePlayer">
        {{ busy ? 'Connexion…' : 'Continuer' }} <Icon name="arrow" />
      </button>
    </main>

    <!-- Code personnel -->
    <main v-else-if="phase === 'code'" class="screen">
      <div class="topline">
        <button type="button" class="btn btn-ghost btn-small" @click="changePlayer">← Ce n'est pas moi</button>
        <span class="pill">{{ player?.name }}</span>
      </div>
      <form class="stack" @submit.prevent="submitCode">
        <h1>Ton code personnel</h1>
        <p class="muted">Saisis les 4 chiffres reçus de l'organisateur du quiz. Ton téléphone s'en souviendra.</p>
        <label class="sr-only" for="player-code">Code personnel à 4 chiffres</label>
        <input
          id="player-code"
          v-model="codeInput"
          class="input code-input"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="4"
          pattern="[0-9]*"
          placeholder="••••"
          :aria-invalid="codeError ? 'true' : undefined"
          aria-describedby="code-help"
          @input="codeInput = codeInput.replace(/\D/g, '')"
        />
        <p v-if="codeError" class="error" role="alert">{{ codeError }}</p>
        <p id="code-help" class="small muted">Code oublié ? Demande-le à l'organisateur du quiz.</p>
        <button type="submit" class="btn btn-primary btn-big btn-block" :disabled="codeInput.length !== 4 || busy">
          {{ busy ? 'Vérification…' : 'Valider' }}
        </button>
      </form>
    </main>

    <!-- Plus rien à répondre -->
    <main v-else-if="phase === 'done'" class="screen">
      <div class="topline">
        <span class="eyebrow">{{ quiz.name }}</span>
        <span class="pill">{{ player?.name }}</span>
      </div>
      <div class="hero stack">
        <h1>Tu as répondu à toutes les questions ouvertes.</h1>
        <p>Reviens demain pour les prochaines !</p>
      </div>
      <div v-if="stats" class="stat-grid">
        <div class="stat">
          <span class="label">Aujourd'hui</span>
          <b v-if="stats.today">{{ stats.today.points.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) }}<small> / {{ stats.today.max }}</small></b>
          <b v-else>–</b>
        </div>
        <div class="stat">
          <span class="label">Cumul</span>
          <b>{{ stats.total.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) }}<small> / {{ stats.maxTotal }}</small></b>
        </div>
      </div>
      <div class="spacer"></div>
      <button v-if="!preview" type="button" class="btn btn-primary btn-big btn-block" @click="openScores('done')">Mes scores et le classement</button>
      <button type="button" class="btn btn-ghost btn-block" @click="changePlayer">Changer de joueur</button>
    </main>

    <!-- Questions -->
    <main v-else-if="phase === 'play' && current" class="screen" :class="{ 'on-color': background, 'on-dark': lightText }">
      <div class="stack" style="gap: 10px">
        <div class="topline">
          <span><b>Question {{ index + 1 }}</b> <span class="muted">/ {{ queue.length }}</span></span>
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
        <span v-if="current.day" class="day-chip" :class="{ late: current.day < today }">
          {{ current.day < today ? `Rattrapage · ${dayLabel(current.day, today)}` : 'Question du jour' }}
        </span>
      </div>

      <template v-if="stage === 'correction'">
        <QuestionCorrection
          :question="current"
          :options="options[current.id]"
          :answer="answers[current.id]"
          :score="scoreQuestion(current, answers[current.id])"
          @self-eval="selfEval"
        />
        <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>
        <div class="spacer"></div>
        <div class="actions">
          <button type="button" class="btn btn-secondary btn-big" style="font-family: var(--body); font-size: 16px" @click="stage = 'review'">
            Revenir
          </button>
          <span class="tip-wrap wide" :class="{ show: tipShown && !canContinue }" @pointerdown="flashTip">
            <button
              type="button"
              class="btn btn-primary btn-big btn-block"
              :disabled="!canContinue"
              :aria-describedby="canContinue ? undefined : 'next-tip'"
              @click="next"
            >
              {{ busy ? 'Enregistrement…' : isLast ? 'Voir mon résultat' : 'Question suivante' }}
            </button>
            <span v-if="!canContinue && !busy" id="next-tip" role="tooltip" class="tooltip">Indique si ta réponse était juste pour continuer.</span>
          </span>
        </div>
      </template>

      <template v-else>
        <span class="tag">{{ TYPE_LABELS[current.type] }}</span>
        <figure v-if="currentImage" class="question-photo">
          <img :src="currentImage" alt="Photo de la question" />
        </figure>
        <h1 class="prompt" v-html="renderInline(current.prompt)"></h1>
        <QuestionAnswer
          v-model="answers[current.id]"
          :question="current"
          :options="options[current.id]"
          :readonly="stage === 'review'"
        />
        <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>
        <div class="spacer"></div>
        <button
          v-if="stage === 'answer'"
          type="button"
          class="btn btn-primary btn-big btn-block"
          :disabled="!canValidate"
          @click="validate"
        >
          {{ busy ? 'Enregistrement…' : 'Valider' }}
        </button>
        <button v-else type="button" class="btn btn-primary btn-big btn-block" @click="stage = 'correction'">
          Voir la correction
        </button>
        <p v-if="stage === 'answer' && !preview" class="small muted" style="text-align: center">Une seule réponse possible : elle est enregistrée dès que tu valides.</p>
      </template>
    </main>

    <!-- Résultat de la visite -->
    <ResultView
      v-else-if="phase === 'result'"
      :quiz-name="quiz.name"
      :quiz-slug="quiz.slug"
      :show-partial="showPartial"
      :player-name="player?.name ?? ''"
      :summary="summary"
      :stats="stats"
      :preview="preview"
      @scores="openScores('result')"
    />

    <!-- Mes scores -->
    <ScoresView
      v-else-if="phase === 'scores' && board && playerId"
      :board="board"
      :player-id="playerId"
      :quiz-name="quiz.name"
      @back="phase = scoresFrom"
    />
    <main v-else-if="phase === 'scores'" class="screen center">
      <p class="muted">Chargement des scores…</p>
    </main>
  </template>
</template>
