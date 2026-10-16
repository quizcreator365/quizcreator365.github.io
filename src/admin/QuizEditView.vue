<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../Icon.vue'
import { TYPE_LABELS } from '../types'
import { copyText, quizUrl, slugError, slugify } from '../utils'
import { deleteQuestion, getQuiz, isSlugTaken, saveQuiz, type QuestionRow, type QuizForm } from './api'

const props = defineProps<{ id?: string }>()
const router = useRouter()

const form = ref<QuizForm>({ slug: '', name: '', description: '', players: [] })
const questions = ref<QuestionRow[]>([])
const saved = ref('')
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const newPlayer = ref('')
const slugTouched = ref(false)
const slugTaken = ref(false)
const confirmQid = ref<string | null>(null)
const toast = ref('')

const snapshot = () => JSON.stringify(form.value)
const dirty = computed(() => snapshot() !== saved.value)
const slugProblem = computed(() => (form.value.slug ? slugError(form.value.slug) : 'Choisis une adresse.'))
const slugState = computed(() => {
  if (!form.value.slug) return ''
  if (slugProblem.value || slugTaken.value) return 'invalid'
  return 'valid'
})
const base = computed(() => `${window.location.host}${import.meta.env.BASE_URL}`)
const canSave = computed(() => form.value.name.trim() && !slugProblem.value && !slugTaken.value && !busy.value)

async function load() {
  error.value = ''
  if (!props.id) {
    form.value = { slug: '', name: '', description: '', players: [] }
    questions.value = []
    saved.value = snapshot()
    slugTouched.value = false
    return
  }
  loading.value = true
  try {
    const data = await getQuiz(props.id)
    form.value = data.form
    questions.value = data.questions
    saved.value = snapshot()
    slugTouched.value = true
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

watch(() => props.id, load, { immediate: true })

watch(
  () => form.value.name,
  (name) => {
    if (!slugTouched.value) form.value.slug = slugify(name)
  },
)

let slugTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => form.value.slug,
  (slug) => {
    slugTaken.value = false
    clearTimeout(slugTimer)
    if (!slug || slugError(slug)) return
    slugTimer = setTimeout(async () => {
      try {
        slugTaken.value = await isSlugTaken(slug, props.id)
      } catch {
        /* vérifié de nouveau à l'enregistrement */
      }
    }, 350)
  },
)

function onSlugInput(event: Event) {
  slugTouched.value = true
  form.value.slug = (event.target as HTMLInputElement).value.toLowerCase().replace(/[^a-z0-9-]/g, '')
}

function addPlayer() {
  const name = newPlayer.value.trim().slice(0, 60)
  if (!name) return
  if (!form.value.players.includes(name)) form.value.players.push(name)
  newPlayer.value = ''
}

function removePlayer(i: number) {
  form.value.players.splice(i, 1)
}

async function save(): Promise<string | null> {
  if (!canSave.value) return null
  busy.value = true
  error.value = ''
  try {
    const id = await saveQuiz(form.value)
    form.value.id = id
    saved.value = snapshot()
    flash('Quiz enregistré')
    if (!props.id) await router.replace({ name: 'quiz', params: { id } })
    return id
  } catch (e) {
    error.value = (e as Error).message
    return null
  } finally {
    busy.value = false
  }
}

async function addQuestion() {
  const id = dirty.value || !props.id ? await save() : props.id
  if (id) router.push({ name: 'question-new', params: { id } })
}

async function removeQuestion(qid: string) {
  try {
    await deleteQuestion(qid)
    questions.value = questions.value.filter((q) => q.id !== qid)
    confirmQid.value = null
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function copyLink() {
  const ok = await copyText(quizUrl(form.value.slug))
  flash(ok ? 'Lien copié' : 'Copie impossible : sélectionne le lien à la main')
}

function flash(message: string) {
  toast.value = message
  setTimeout(() => (toast.value = ''), 2200)
}
</script>

<template>
  <main class="admin-main">
    <RouterLink to="/admin" class="back">← Mes quiz</RouterLink>
    <h1>{{ props.id ? form.name || 'Quiz' : 'Nouveau quiz' }}</h1>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="loading" class="muted">Chargement…</p>

    <div v-else class="columns">
      <form class="panel side" @submit.prevent="save">
        <h2>Informations</h2>
        <div class="field">
          <label for="quiz-name">Nom</label>
          <input id="quiz-name" v-model="form.name" class="input" maxlength="200" required placeholder="Le quiz des voisines" />
        </div>
        <div class="field">
          <label for="quiz-desc">Description</label>
          <textarea id="quiz-desc" v-model="form.description" class="textarea" rows="2" maxlength="500" placeholder="Réviser les apprentissages de l'année"></textarea>
        </div>

        <div class="field">
          <span class="label">Joueurs</span>
          <div class="chips">
            <span v-for="(p, i) in form.players" :key="p" class="chip">
              {{ p }}
              <button type="button" :aria-label="`Retirer ${p}`" @click="removePlayer(i)">×</button>
            </span>
            <span v-if="form.players.length === 0" class="small muted">Aucun joueur pour l'instant.</span>
          </div>
          <div class="row" style="flex-wrap: nowrap">
            <label class="sr-only" for="new-player">Prénom du joueur</label>
            <input
              id="new-player"
              v-model="newPlayer"
              class="input"
              maxlength="60"
              placeholder="Prénom du joueur"
              @keydown.enter.prevent="addPlayer"
            />
            <button type="button" class="btn btn-secondary" @click="addPlayer">Ajouter</button>
          </div>
        </div>

        <div class="url-box">
          <label class="label" for="quiz-slug" style="font-weight: 700; font-size: 14px">Adresse du quiz</label>
          <div class="url-input" :class="slugState">
            <span>{{ base }}</span>
            <input id="quiz-slug" :value="form.slug" maxlength="40" autocomplete="off" spellcheck="false" @input="onSlugInput" />
          </div>
          <span v-if="form.slug && slugProblem" class="error">{{ slugProblem }}</span>
          <span v-else-if="slugTaken" class="error">Cette adresse est déjà utilisée par un autre quiz.</span>
          <span v-else-if="form.slug" class="ok row" style="gap: 6px"><Icon name="check" :size="16" /> Disponible</span>
          <span class="small" style="color: var(--mid-ink)">Lettres minuscules, chiffres et tirets. 3 à 40 caractères.</span>
          <div v-if="props.id && !dirty" class="row" style="padding-top: 10px; border-top: 1px solid #f0d98a">
            <code class="grow">{{ quizUrl(form.slug) }}</code>
            <button type="button" class="btn btn-dark btn-small" @click="copyLink">Copier</button>
          </div>
        </div>

        <button class="btn btn-primary" type="submit" :disabled="!canSave || (!dirty && !!props.id)">
          {{ busy ? 'Enregistrement…' : dirty || !props.id ? 'Enregistrer' : 'Enregistré' }}
        </button>
      </form>

      <section class="panel main">
        <div class="row" style="justify-content: space-between">
          <h2>Questions <span class="small muted" style="font-family: var(--body); font-weight: 400">· {{ questions.length }}</span></h2>
          <div class="row">
            <a v-if="props.id" class="btn btn-ghost btn-small" :href="quizUrl(form.slug)" target="_blank" rel="noopener">Ouvrir le quiz ↗</a>
            <button type="button" class="btn btn-primary btn-small" :disabled="!canSave" @click="addQuestion">+ Ajouter une question</button>
          </div>
        </div>

        <p v-if="!props.id" class="muted">Enregistre le quiz, puis ajoute ses questions.</p>
        <p v-else-if="questions.length === 0" class="muted">Pas encore de question.</p>

        <ol v-else class="qlist">
          <template v-for="(q, i) in questions" :key="q.id">
            <li>
              <span class="n">{{ i + 1 }}</span>
              <span class="type">{{ TYPE_LABELS[q.type] }}</span>
              <span class="text">{{ q.prompt }}</span>
              <RouterLink class="btn btn-ghost btn-small" :to="{ name: 'question', params: { id: props.id, qid: q.id } }">Modifier</RouterLink>
              <button type="button" class="btn btn-danger btn-small" :aria-label="`Supprimer la question ${i + 1}`" @click="confirmQid = q.id">Supprimer</button>
            </li>
            <li v-if="confirmQid === q.id" class="confirm" role="alert" style="border: 0">
              <span class="grow">Supprimer la question {{ i + 1 }} ?</span>
              <button type="button" class="btn btn-secondary btn-small" @click="confirmQid = null">Annuler</button>
              <button type="button" class="btn btn-danger solid btn-small" @click="removeQuestion(q.id)">Supprimer</button>
            </li>
          </template>
        </ol>
      </section>
    </div>
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </main>
</template>
