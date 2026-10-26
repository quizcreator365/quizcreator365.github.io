<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { fetchImageFromUrl, imageUrl, removeUnusedImages, uploadImage } from '../images'
import { isValidColor, needsLightText, toHex } from '../colors'
import { renderInline } from '../format'
import { AVAILABLE_TYPES, IMAGE_TYPES, MAX_TEXT, TEXT_TYPES, TYPE_LABELS, type QuestionType } from '../types'
import { deleteQuestion, getQuestion, getQuiz, saveQuestion, type AnswerForm, type QuestionForm, type QuestionRow } from './api'
import ImageCropper from './ImageCropper.vue'
import RichField from './RichField.vue'

const props = defineProps<{ id: string; qid?: string }>()
const router = useRouter()

const ALL_TYPES = Object.keys(TYPE_LABELS) as QuestionType[]

interface Pair { left: string; right: string }
interface Step { text: string; date: string }

const quizName = ref('')
const siblings = ref<QuestionRow[]>([])
const form = ref<QuestionForm>(blank('mcq'))
/** Association : paires saisies ; chronologie : éléments dans le bon ordre. */
const pairs = ref<Pair[]>([])
const steps = ref<Step[]>([])
const saved = ref('')
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const showErrors = ref(false)
const confirmDelete = ref(false)
const leaving = ref(false)
/** Photo choisie et cadrée, envoyée à l'enregistrement. */
const pendingFile = ref<File | null>(null)
const pendingPreview = ref<string | null>(null)
const photoError = ref('')
/** Photo en cours de cadrage. */
const cropSrc = ref<string | null>(null)

function defaultAnswers(type: QuestionType): AnswerForm[] {
  if (type === 'true_false') return [{ text: 'Vrai', is_correct: true }, { text: 'Faux', is_correct: false }]
  if (type === 'mcq') return [{ text: '', is_correct: false }, { text: '', is_correct: false }, { text: '', is_correct: false }]
  if (type === 'matching' || type === 'chronology') return []
  return [{ text: '', is_correct: true }]
}

/** Le champ date renvoie '' quand il est vidé : on enregistre alors « sans date ». */
const scheduledModel = computed({
  get: () => form.value.scheduled_on ?? '',
  set: (v: string) => (form.value.scheduled_on = v || null),
})

function blank(type: QuestionType): QuestionForm {
  return { quiz_id: props.id, type, prompt: '', more_info: '', image_path: null, background_color: '', scheduled_on: null, answers: defaultAnswers(type) }
}

function resetStructured(type: QuestionType) {
  pairs.value = type === 'matching' ? [{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }] : []
  steps.value = type === 'chronology' ? [{ text: '', date: '' }, { text: '', date: '' }, { text: '', date: '' }] : []
}

/** Lit les paires / étapes depuis les réponses enregistrées. */
function loadStructured(f: QuestionForm) {
  resetStructured(f.type)
  if (f.type === 'matching') {
    const keys = [...new Set(f.answers.map((a) => a.pair_key))].filter((k) => k != null)
    pairs.value = keys.map((k) => ({
      left: f.answers.find((a) => a.pair_key === k && a.side === 'left')?.text ?? '',
      right: f.answers.find((a) => a.pair_key === k && a.side === 'right')?.text ?? '',
    }))
  }
  if (f.type === 'chronology') steps.value = f.answers.map((a) => ({ text: a.text, date: a.date_label ?? '' }))
}

/** Réponses à enregistrer, selon le type. */
function buildAnswers(): AnswerForm[] {
  const f = form.value
  if (f.type === 'matching') {
    return pairs.value
      .filter((p) => p.left.trim() && p.right.trim())
      .flatMap((p, i) => [
        { text: p.left.trim(), is_correct: false, side: 'left' as const, pair_key: i + 1 },
        { text: p.right.trim(), is_correct: false, side: 'right' as const, pair_key: i + 1 },
      ])
  }
  if (f.type === 'chronology') {
    return steps.value
      .filter((s) => s.text.trim())
      .map((s) => ({ text: s.text.trim(), is_correct: false, date_label: s.date.trim() || null }))
  }
  return f.answers.map((a) => ({ text: a.text.trim(), is_correct: a.is_correct })).filter((a) => a.text)
}

const snapshot = () => JSON.stringify([form.value, pairs.value, steps.value])
const dirty = computed(() => snapshot() !== saved.value || pendingFile.value !== null)
const position = computed(() => {
  const i = siblings.value.findIndex((q) => q.id === props.qid)
  return i === -1 ? siblings.value.length : i
})
const needsPhoto = computed(() => IMAGE_TYPES.includes(form.value.type))
const isText = computed(() => TEXT_TYPES.includes(form.value.type))
const photoSrc = computed(() => pendingPreview.value ?? imageUrl(form.value.image_path))

// ---------- Couleur de fond ----------
const colorValid = computed(() => isValidColor(form.value.background_color ?? ''))
const colorHex = computed(() => (colorValid.value ? toHex(form.value.background_color ?? '') : null))
const previewStyle = computed(() => {
  const hex = colorHex.value
  if (!hex) return {}
  return { background: hex, color: needsLightText(hex) ? '#ffffff' : '#1a1d3a' }
})
function onPickColor(event: Event) {
  form.value.background_color = (event.target as HTMLInputElement).value
}

// ---------- Photo à partir d'un lien ----------
const photoLink = ref('')
const importing = ref(false)
async function importFromLink() {
  photoError.value = ''
  importing.value = true
  try {
    const blob = await fetchImageFromUrl(photoLink.value)
    cropSrc.value = URL.createObjectURL(blob)
    photoLink.value = ''
  } catch (e) {
    photoError.value = (e as Error).message
  } finally {
    importing.value = false
  }
}

const problems = computed(() => {
  const f = form.value
  const list: string[] = []
  if (!f.prompt.trim()) list.push('Écris la question.')
  if (f.prompt.length > MAX_TEXT || f.more_info.length > MAX_TEXT) list.push(`${MAX_TEXT} caractères au maximum.`)
  if (isText.value && !f.answers[0]?.text.trim()) list.push('Écris la réponse attendue.')
  if (needsPhoto.value && !f.image_path && !pendingFile.value) list.push('Ajoute une photo.')
  if (f.type === 'mcq') {
    const filled = f.answers.filter((a) => a.text.trim())
    if (filled.length < 2) list.push('Il faut au moins 2 propositions.')
    if (!filled.some((a) => a.is_correct)) list.push('Coche au moins une bonne réponse.')
  }
  if (f.type === 'true_false' && f.answers.filter((a) => a.is_correct).length !== 1) list.push('Choisis Vrai ou Faux.')
  if (f.type === 'matching') {
    if (pairs.value.some((p) => Boolean(p.left.trim()) !== Boolean(p.right.trim()))) list.push('Complète les deux côtés de chaque paire.')
    if (pairs.value.filter((p) => p.left.trim() && p.right.trim()).length < 2) list.push('Il faut au moins 2 paires.')
  }
  if (f.type === 'chronology' && steps.value.filter((s) => s.text.trim()).length < 2) list.push('Il faut au moins 2 éléments à classer.')
  if (!colorValid.value) list.push('Couleur inconnue : utilise un nom HTML (ex. lightblue) ou un code HEX (ex. #ADD8E6).')
  return list
})

function clearPending() {
  if (pendingPreview.value) URL.revokeObjectURL(pendingPreview.value)
  pendingPreview.value = null
  pendingFile.value = null
  photoError.value = ''
}

function closeCrop() {
  if (cropSrc.value?.startsWith('blob:')) URL.revokeObjectURL(cropSrc.value)
  cropSrc.value = null
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value && !leaving.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload)
  clearPending()
  closeCrop()
})
onBeforeRouteLeave(() => {
  if (leaving.value || !dirty.value) return true
  return window.confirm('Cette question a des modifications non enregistrées. Quitter quand même ?')
})

async function load() {
  loading.value = true
  error.value = ''
  showErrors.value = false
  confirmDelete.value = false
  leaving.value = false
  clearPending()
  try {
    const quiz = await getQuiz(props.id)
    quizName.value = quiz.form.name
    siblings.value = quiz.questions
    form.value = props.qid ? await getQuestion(props.qid) : blank('mcq')
    loadStructured(form.value)
    saved.value = snapshot()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
watch(() => [props.id, props.qid], load, { immediate: true })

function setType(type: QuestionType) {
  if (!AVAILABLE_TYPES.includes(type) || type === form.value.type) return
  const wasText = TEXT_TYPES.includes(form.value.type)
  form.value.type = type
  // Entre texte libre et types photo, la réponse attendue est conservée.
  if (!(wasText && TEXT_TYPES.includes(type))) form.value.answers = defaultAnswers(type)
  resetStructured(type)
}

function onTypeSelect(event: Event) {
  setType((event.target as HTMLSelectElement).value as QuestionType)
}

function setTrueFalse(i: number) {
  form.value.answers.forEach((a, j) => (a.is_correct = i === j))
}

function moveStep(i: number, to: number) {
  if (to < 0 || to >= steps.value.length) return
  const [s] = steps.value.splice(i, 1)
  steps.value.splice(to, 0, s)
}

/** Trie les éléments par date quand toutes les dates commencent par une année. */
const canSortByDate = computed(() => steps.value.filter((s) => s.text.trim()).every((s) => /-?\d+/.test(s.date)))
function sortByDate() {
  const year = (d: string) => Number(d.match(/-?\d+/)?.[0] ?? 0)
  steps.value = [...steps.value].sort((a, b) => year(a.date) - year(b.date))
}

function onPhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    photoError.value = 'Choisis un fichier image (JPEG, PNG, WebP, HEIC…).'
    return
  }
  photoError.value = ''
  cropSrc.value = URL.createObjectURL(file)
}

function recrop() {
  if (photoSrc.value) cropSrc.value = photoSrc.value
}

function onCropped(file: File) {
  closeCrop()
  if (pendingPreview.value) URL.revokeObjectURL(pendingPreview.value)
  pendingFile.value = file
  pendingPreview.value = URL.createObjectURL(file)
}

function removePhoto() {
  clearPending()
  form.value.image_path = null
}

/** Enregistre si besoin. Renvoie l'id de la question, null s'il n'y a rien à enregistrer, false en cas d'erreur. */
async function persist(): Promise<string | null | false> {
  const pristineNew = !props.qid && !dirty.value
  if (pristineNew) return null
  if (props.qid && !dirty.value) return props.qid
  if (problems.value.length) {
    showErrors.value = true
    return false
  }
  busy.value = true
  error.value = ''
  const previousImage = (JSON.parse(saved.value || '[{}]')[0] as QuestionForm).image_path
  const imageBefore = form.value.image_path
  let uploaded: string | null = null
  try {
    if (pendingFile.value) {
      uploaded = await uploadImage(props.id, pendingFile.value)
      form.value.image_path = uploaded
    }
    if (!IMAGE_TYPES.includes(form.value.type)) form.value.image_path = null
    const id = await saveQuestion({
      ...form.value,
      id: props.qid,
      quiz_id: props.id,
      prompt: form.value.prompt.trim(),
      more_info: form.value.more_info.trim(),
      background_color: (form.value.background_color ?? '').trim(),
      answers: buildAnswers(),
    })
    clearPending()
    saved.value = snapshot()
    if (previousImage && previousImage !== form.value.image_path) await removeUnusedImages([previousImage])
    return id
  } catch (e) {
    // Photo envoyée mais question non enregistrée : on ne laisse pas de fichier orphelin.
    if (uploaded) {
      form.value.image_path = imageBefore
      await removeUnusedImages([uploaded]).catch(() => undefined)
    }
    error.value = (e as Error).message
    return false
  } finally {
    busy.value = false
  }
}

async function navigate(to: Parameters<typeof router.push>[0]) {
  leaving.value = true
  await router.push(to)
}

async function goPrevious() {
  if ((await persist()) === false) return
  const prev = siblings.value[position.value - 1]
  if (prev) navigate({ name: 'question', params: { id: props.id, qid: prev.id } })
}

async function goNext() {
  const id = await persist()
  if (id === false) return
  if (id === null && !props.qid) {
    error.value = 'Rédige cette question avant de passer à la suivante (ou clique sur Terminer).'
    return
  }
  const fresh = (await getQuiz(props.id)).questions
  const i = fresh.findIndex((q) => q.id === (id ?? props.qid))
  const next = i === -1 ? undefined : fresh[i + 1]
  if (next) navigate({ name: 'question', params: { id: props.id, qid: next.id } })
  else if (!props.qid) {
    // Déjà sur « nouvelle question » : l'adresse ne change pas, on vide le formulaire nous-mêmes.
    await load()
    window.scrollTo(0, 0)
  } else navigate({ name: 'question-new', params: { id: props.id } })
}

async function finish() {
  if ((await persist()) === false) return
  navigate({ name: 'quiz', params: { id: props.id } })
}

async function remove() {
  if (!props.qid) return
  try {
    await deleteQuestion(props.qid)
    navigate({ name: 'quiz', params: { id: props.id } })
  } catch (e) {
    error.value = (e as Error).message
  }
}
</script>

<template>
  <main class="admin-main narrow editor">
    <RouterLink :to="{ name: 'quiz', params: { id } }" class="back">← {{ quizName || 'Quiz' }}</RouterLink>
    <p v-if="loading" class="muted">Chargement…</p>

    <template v-else>
      <div class="row" style="justify-content: space-between; align-items: baseline">
        <h1>Question {{ position + 1 }}</h1>
        <span class="muted">{{ qid ? `sur ${siblings.length}` : 'nouvelle' }}</span>
      </div>

      <fieldset style="margin: 0; padding: 0; border: 0" class="stack">
        <legend class="label" style="font-weight: 700; font-size: 15px; margin-bottom: 10px">Type de question</legend>
        <div class="type-picker desktop-only">
          <label v-for="t in ALL_TYPES" :key="t" :class="{ on: form.type === t }">
            <input type="radio" name="qtype" :checked="form.type === t" @change="setType(t)" />
            {{ TYPE_LABELS[t] }}
          </label>
        </div>
        <select class="input mobile-only" aria-label="Type de question" :value="form.type" @change="onTypeSelect">
          <option v-for="t in ALL_TYPES" :key="t" :value="t">{{ TYPE_LABELS[t] }}</option>
        </select>
      </fieldset>

      <section class="panel">
        <div v-if="needsPhoto" class="field">
          <span class="label">Photo</span>
          <div class="photo-field">
            <img v-if="photoSrc" :src="photoSrc" alt="Aperçu de la photo telle que les joueurs la verront" />
            <div v-else class="photo-empty" aria-hidden="true">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="15" rx="2" /><circle cx="12" cy="12.5" r="3.5" /><path d="M8 5l1.5-2h5L16 5" /></svg>
            </div>
            <div class="stack" style="gap: 8px">
              <label class="btn btn-secondary">
                {{ photoSrc ? 'Changer la photo' : 'Ajouter une photo' }}
                <input type="file" accept="image/*" class="sr-only" @change="onPhoto" />
              </label>
              <button v-if="photoSrc" type="button" class="btn btn-secondary btn-small" @click="recrop">Recadrer</button>
              <button v-if="photoSrc" type="button" class="btn btn-danger btn-small" @click="removePhoto">Retirer la photo</button>
              <span class="small muted">Tu cadres la photo juste après l'avoir choisie. Sur téléphone, tu peux la prendre directement.</span>
            </div>
          </div>
          <form class="link-import" @submit.prevent="importFromLink">
            <label for="photo-link" class="small" style="font-weight: 700">Ou colle l'adresse d'une image</label>
            <div class="row" style="flex-wrap: nowrap">
              <input id="photo-link" v-model="photoLink" class="input" type="url" inputmode="url" placeholder="https://…/photo.jpg" />
              <button type="submit" class="btn btn-secondary" :disabled="importing || !photoLink.trim()">{{ importing ? 'Import…' : 'Importer' }}</button>
            </div>
          </form>
          <span v-if="photoError" class="error">{{ photoError }}</span>
        </div>

        <div class="field">
          <label for="prompt">Question</label>
          <RichField id="prompt" v-model="form.prompt" multiline :rows="3" counter aria-label="Question" />
        </div>

        <div v-if="isText" class="field">
          <label for="reference">Réponse attendue</label>
          <RichField id="reference" v-model="form.answers[0].text" multiline :rows="2" counter aria-label="Réponse attendue" />
          <span class="small muted">Le joueur compare sa réponse à celle-ci et dit lui-même s'il avait juste.</span>
        </div>

        <div v-else-if="form.type === 'mcq'" class="field">
          <div class="row" style="justify-content: space-between">
            <span class="label" style="font-weight: 700; font-size: 15px">Propositions</span>
            <span class="small muted">Coche la ou les bonnes réponses. Le joueur doit toutes les trouver pour gagner le point.</span>
          </div>
          <div v-for="(a, i) in form.answers" :key="i" class="prop-row" :class="{ correct: a.is_correct }">
            <label class="check"><input v-model="a.is_correct" type="checkbox" /> Bonne réponse</label>
            <RichField v-model="a.text" class="grow" :aria-label="`Proposition ${i + 1}`" :placeholder="`Proposition ${i + 1}`" />
            <button type="button" class="icon-btn" :aria-label="`Supprimer la proposition ${i + 1}`" :disabled="form.answers.length <= 2" @click="form.answers.splice(i, 1)">×</button>
          </div>
          <button type="button" class="btn btn-secondary" style="align-self: flex-start; border-style: dashed" @click="form.answers.push({ text: '', is_correct: false })">+ Ajouter une proposition</button>
        </div>

        <fieldset v-else-if="form.type === 'true_false'" class="field" style="border: 0; padding: 0; margin: 0">
          <legend class="label" style="font-weight: 700; font-size: 15px; margin-bottom: 6px">Bonne réponse</legend>
          <div class="row">
            <label v-for="(a, i) in form.answers" :key="a.text" class="option" :class="{ selected: a.is_correct }" style="width: auto; flex: 1">
              <input type="radio" name="tf" :checked="a.is_correct" @change="setTrueFalse(i)" /> {{ a.text }}
            </label>
          </div>
        </fieldset>

        <div v-else-if="form.type === 'matching'" class="field">
          <div class="row" style="justify-content: space-between">
            <span class="label" style="font-weight: 700; font-size: 15px">Paires à associer</span>
            <span class="small muted">Chaque élément de gauche va avec celui de droite. Le joueur les verra mélangés.</span>
          </div>
          <div v-for="(p, i) in pairs" :key="i" class="pair-row">
            <span class="pair-n">{{ i + 1 }}</span>
            <RichField v-model="p.left" class="grow" :aria-label="`Paire ${i + 1}, gauche`" placeholder="Ex. Le raï" />
            <span class="pair-link" aria-hidden="true">↔</span>
            <RichField v-model="p.right" class="grow" :aria-label="`Paire ${i + 1}, droite`" placeholder="Ex. Algérie" />
            <button type="button" class="icon-btn" :aria-label="`Supprimer la paire ${i + 1}`" :disabled="pairs.length <= 2" @click="pairs.splice(i, 1)">×</button>
          </div>
          <button type="button" class="btn btn-secondary" style="align-self: flex-start; border-style: dashed" @click="pairs.push({ left: '', right: '' })">+ Ajouter une paire</button>
          <span class="small muted">Notation : chaque paire juste rapporte sa part du point.</span>
        </div>

        <div v-else-if="form.type === 'chronology'" class="field">
          <div class="row" style="justify-content: space-between">
            <span class="label" style="font-weight: 700; font-size: 15px">Éléments, du plus ancien au plus récent</span>
            <button v-if="canSortByDate" type="button" class="btn btn-ghost btn-small" @click="sortByDate">Trier par date</button>
          </div>
          <div v-for="(s, i) in steps" :key="i" class="step-row">
            <span class="pair-n">{{ i + 1 }}</span>
            <input v-model="s.date" class="input step-date" maxlength="100" :aria-label="`Date de l'élément ${i + 1}`" placeholder="Date" />
            <RichField v-model="s.text" class="grow" :aria-label="`Élément ${i + 1}`" placeholder="Ex. La Scala de Milan" />
            <span class="q-actions">
              <button type="button" class="icon-btn move" :disabled="i === 0" :aria-label="`Monter l'élément ${i + 1}`" @click="moveStep(i, i - 1)">↑</button>
              <button type="button" class="icon-btn move" :disabled="i === steps.length - 1" :aria-label="`Descendre l'élément ${i + 1}`" @click="moveStep(i, i + 1)">↓</button>
              <button type="button" class="icon-btn" :aria-label="`Supprimer l'élément ${i + 1}`" :disabled="steps.length <= 2" @click="steps.splice(i, 1)">×</button>
            </span>
          </div>
          <button type="button" class="btn btn-secondary" style="align-self: flex-start; border-style: dashed" @click="steps.push({ text: '', date: '' })">+ Ajouter un élément</button>
          <span class="small muted">Les dates sont affichées au joueur dans la correction. Notation : chaque élément bien placé rapporte sa part du point.</span>
        </div>

        <div class="field">
          <label for="more">En savoir plus <span class="muted" style="font-weight: 400">(facultatif)</span></label>
          <RichField id="more" v-model="form.more_info" multiline :rows="3" counter aria-label="En savoir plus" />
        </div>

        <div class="field">
          <label for="scheduled">Date d'ouverture <span class="muted" style="font-weight: 400">(facultatif)</span></label>
          <div class="row" style="flex-wrap: nowrap">
            <input id="scheduled" v-model="scheduledModel" class="input" type="date" style="width: auto" aria-describedby="scheduled-help" />
            <button v-if="form.scheduled_on" type="button" class="btn btn-ghost btn-small" @click="form.scheduled_on = null">Retirer</button>
          </div>
          <span id="scheduled-help" class="small muted">
            {{ form.scheduled_on ? 'La question s’ouvre ce jour-là ; ses points comptent pour ce jour.' : 'Sans date, la question n’est pas proposée aux joueurs.' }}
          </span>
        </div>

        <div class="field">
          <label for="bgcolor">Couleur de fond <span class="muted" style="font-weight: 400">(facultatif)</span></label>
          <div class="color-row">
            <input
              id="bgcolor"
              v-model="form.background_color"
              class="input"
              :class="{ invalid: !colorValid }"
              maxlength="40"
              spellcheck="false"
              autocomplete="off"
              placeholder="lightblue ou #ADD8E6"
              aria-describedby="bgcolor-help"
            />
            <input type="color" class="color-picker" :value="colorHex ?? '#ffffff'" aria-label="Choisir une couleur" @input="onPickColor" />
            <button v-if="form.background_color" type="button" class="btn btn-ghost btn-small" @click="form.background_color = ''">Aucune</button>
          </div>
          <span id="bgcolor-help" class="small" :class="colorValid ? 'muted' : 'error'">
            {{ colorValid ? 'Nom de couleur HTML (lightblue, gold…) ou code HEX (#ADD8E6). Vide : fond habituel.' : 'Couleur inconnue : vérifie l’orthographe (en anglais) ou le code HEX.' }}
          </span>
          <div class="color-preview" :style="previewStyle" aria-label="Aperçu côté joueur">
            <span class="tag">{{ TYPE_LABELS[form.type] }}</span>
            <p class="prompt" style="font-size: 18px" v-html="renderInline(form.prompt) || 'Ta question s’affichera ici'"></p>
            <span class="small" style="opacity: 0.8">Aperçu côté joueur</span>
          </div>
        </div>

        <ul v-if="showErrors && problems.length" class="error" role="alert" style="margin: 0; padding-left: 18px">
          <li v-for="p in problems" :key="p">{{ p }}</li>
        </ul>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </section>

      <div v-if="confirmDelete" class="confirm" role="alert">
        <span class="grow">Supprimer cette question ? C'est définitif.</span>
        <button type="button" class="btn btn-secondary btn-small" @click="confirmDelete = false">Annuler</button>
        <button type="button" class="btn btn-danger solid btn-small" @click="remove">Supprimer</button>
      </div>

      <button v-if="qid" type="button" class="btn btn-danger" style="align-self: flex-start" @click="confirmDelete = true">Supprimer la question</button>

      <div class="editor-actions">
        <button type="button" class="btn btn-secondary" :disabled="busy || position === 0" @click="goPrevious">← Précédente</button>
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="goNext">Suivante →</button>
        <button type="button" class="btn btn-primary" :disabled="busy" @click="finish">{{ busy ? 'Enregistrement…' : 'Terminer' }}</button>
      </div>
    </template>

    <ImageCropper v-if="cropSrc" :src="cropSrc" @done="onCropped" @cancel="closeCrop" />
  </main>
</template>
