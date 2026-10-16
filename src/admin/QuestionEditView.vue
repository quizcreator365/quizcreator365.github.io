<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { MAX_TEXT, MPC_TYPES, TYPE_LABELS, type QuestionType } from '../types'
import { deleteQuestion, getQuestion, getQuiz, saveQuestion, type QuestionForm, type QuestionRow } from './api'

const props = defineProps<{ id: string; qid?: string }>()
const router = useRouter()

const ALL_TYPES = Object.keys(TYPE_LABELS) as QuestionType[]

const quizName = ref('')
const siblings = ref<QuestionRow[]>([])
const form = ref<QuestionForm>(blank('mcq'))
const saved = ref('')
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const showErrors = ref(false)
const confirmDelete = ref(false)

function defaultAnswers(type: QuestionType): QuestionForm['answers'] {
  if (type === 'true_false') return [{ text: 'Vrai', is_correct: true }, { text: 'Faux', is_correct: false }]
  if (type === 'mcq') return [{ text: '', is_correct: false }, { text: '', is_correct: false }, { text: '', is_correct: false }]
  return [{ text: '', is_correct: true }]
}

function blank(type: QuestionType): QuestionForm {
  return { quiz_id: props.id, type, prompt: '', more_info: '', answers: defaultAnswers(type) }
}

const snapshot = () => JSON.stringify(form.value)
const dirty = computed(() => snapshot() !== saved.value)
const position = computed(() => {
  const i = siblings.value.findIndex((q) => q.id === props.qid)
  return i === -1 ? siblings.value.length : i
})

const problems = computed(() => {
  const f = form.value
  const list: string[] = []
  if (!f.prompt.trim()) list.push('Écris la question.')
  if (f.prompt.length > MAX_TEXT || f.more_info.length > MAX_TEXT) list.push(`${MAX_TEXT} caractères au maximum.`)
  const filled = f.answers.filter((a) => a.text.trim())
  if (f.type === 'free_text' && !filled.length) list.push('Écris la réponse attendue.')
  if (f.type === 'mcq') {
    if (filled.length < 2) list.push('Il faut au moins 2 propositions.')
    if (!filled.some((a) => a.is_correct)) list.push('Coche au moins une bonne réponse.')
  }
  if (f.type === 'true_false' && f.answers.filter((a) => a.is_correct).length !== 1) list.push('Choisis Vrai ou Faux.')
  return list
})

async function load() {
  loading.value = true
  error.value = ''
  showErrors.value = false
  confirmDelete.value = false
  try {
    const quiz = await getQuiz(props.id)
    quizName.value = quiz.form.name
    siblings.value = quiz.questions
    form.value = props.qid ? await getQuestion(props.qid) : blank('mcq')
    saved.value = snapshot()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
watch(() => [props.id, props.qid], load, { immediate: true })

function setType(type: QuestionType) {
  if (!MPC_TYPES.includes(type) || type === form.value.type) return
  form.value.type = type
  form.value.answers = defaultAnswers(type)
}

function setTrueFalse(i: number) {
  form.value.answers.forEach((a, j) => (a.is_correct = i === j))
}

function addProposition() {
  form.value.answers.push({ text: '', is_correct: false })
}

function removeProposition(i: number) {
  form.value.answers.splice(i, 1)
}

/** Enregistre si besoin. Renvoie l'id de la question, ou null si rien n'est à enregistrer / en cas d'erreur. */
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
  try {
    const payload: QuestionForm = {
      ...form.value,
      id: props.qid,
      quiz_id: props.id,
      prompt: form.value.prompt.trim(),
      more_info: form.value.more_info.trim(),
      answers: form.value.answers
        .map((a) => ({ text: a.text.trim(), is_correct: a.is_correct }))
        .filter((a) => a.text),
    }
    const id = await saveQuestion(payload)
    saved.value = snapshot()
    return id
  } catch (e) {
    error.value = (e as Error).message
    return false
  } finally {
    busy.value = false
  }
}

async function goPrevious() {
  if ((await persist()) === false) return
  const prev = siblings.value[position.value - 1]
  if (prev) router.push({ name: 'question', params: { id: props.id, qid: prev.id } })
}

async function goNext() {
  const id = await persist()
  if (id === false) return
  // Recharge l'ordre pour inclure une question qui vient d'être créée.
  const fresh = (await getQuiz(props.id)).questions
  const i = fresh.findIndex((q) => q.id === (id ?? props.qid))
  const next = i === -1 ? undefined : fresh[i + 1]
  if (next) router.push({ name: 'question', params: { id: props.id, qid: next.id } })
  else if (id || props.qid) router.push({ name: 'question-new', params: { id: props.id } })
}

async function finish() {
  if ((await persist()) === false) return
  router.push({ name: 'quiz', params: { id: props.id } })
}

async function remove() {
  if (!props.qid) return
  try {
    await deleteQuestion(props.qid)
    router.push({ name: 'quiz', params: { id: props.id } })
  } catch (e) {
    error.value = (e as Error).message
  }
}
</script>

<template>
  <main class="admin-main narrow">
    <RouterLink :to="{ name: 'quiz', params: { id } }" class="back">← {{ quizName || 'Quiz' }}</RouterLink>
    <p v-if="loading" class="muted">Chargement…</p>

    <template v-else>
      <div class="row" style="justify-content: space-between; align-items: baseline">
        <h1>Question {{ position + 1 }}</h1>
        <span class="muted">{{ qid ? `sur ${siblings.length}` : 'nouvelle' }}</span>
      </div>

      <fieldset style="margin: 0; padding: 0; border: 0" class="stack">
        <legend class="label" style="font-weight: 700; font-size: 15px; margin-bottom: 10px">Type de question</legend>
        <div class="type-picker">
          <label
            v-for="t in ALL_TYPES"
            :key="t"
            :class="{ on: form.type === t, off: !MPC_TYPES.includes(t) }"
            :title="MPC_TYPES.includes(t) ? '' : 'Disponible au lot 1'"
          >
            <input type="radio" name="qtype" :checked="form.type === t" :disabled="!MPC_TYPES.includes(t)" @change="setType(t)" />
            {{ TYPE_LABELS[t] }}
          </label>
        </div>
        <span class="small muted">Association, Chronologie, Qui suis-je ? et Quiz photo arrivent au lot 1.</span>
      </fieldset>

      <section class="panel">
        <div class="field">
          <label for="prompt">Question</label>
          <textarea id="prompt" v-model="form.prompt" class="textarea" rows="3" :maxlength="MAX_TEXT"></textarea>
          <span class="counter" :class="{ over: form.prompt.length >= MAX_TEXT }">{{ form.prompt.length }} / {{ MAX_TEXT }}</span>
        </div>

        <div v-if="form.type === 'free_text'" class="field">
          <label for="reference">Réponse attendue</label>
          <textarea id="reference" v-model="form.answers[0].text" class="textarea" rows="2" :maxlength="MAX_TEXT"></textarea>
          <span class="counter">{{ form.answers[0].text.length }} / {{ MAX_TEXT }}</span>
          <span class="small muted">Le joueur compare sa réponse à celle-ci et dit lui-même s'il avait juste.</span>
        </div>

        <div v-else-if="form.type === 'mcq'" class="field">
          <div class="row" style="justify-content: space-between">
            <span class="label" style="font-weight: 700; font-size: 15px">Propositions</span>
            <span class="small muted">Coche la ou les bonnes réponses. Le joueur doit toutes les trouver pour gagner le point.</span>
          </div>
          <div v-for="(a, i) in form.answers" :key="i" class="prop-row" :class="{ correct: a.is_correct }">
            <label class="check"><input v-model="a.is_correct" type="checkbox" /> Bonne réponse</label>
            <input v-model="a.text" class="input" :maxlength="MAX_TEXT" :aria-label="`Proposition ${i + 1}`" :placeholder="`Proposition ${i + 1}`" />
            <button type="button" class="icon-btn" :aria-label="`Supprimer la proposition ${i + 1}`" :disabled="form.answers.length <= 2" @click="removeProposition(i)">×</button>
          </div>
          <button type="button" class="btn btn-secondary" style="align-self: flex-start; border-style: dashed" @click="addProposition">+ Ajouter une proposition</button>
        </div>

        <fieldset v-else-if="form.type === 'true_false'" class="field" style="border: 0; padding: 0; margin: 0">
          <legend class="label" style="font-weight: 700; font-size: 15px; margin-bottom: 6px">Bonne réponse</legend>
          <div class="row">
            <label v-for="(a, i) in form.answers" :key="a.text" class="option" :class="{ selected: a.is_correct }" style="width: auto; flex: 1">
              <input type="radio" name="tf" :checked="a.is_correct" @change="setTrueFalse(i)" /> {{ a.text }}
            </label>
          </div>
        </fieldset>

        <div class="field">
          <label for="more">En savoir plus <span class="muted" style="font-weight: 400">(facultatif)</span></label>
          <textarea id="more" v-model="form.more_info" class="textarea" rows="3" :maxlength="MAX_TEXT"></textarea>
          <span class="counter">{{ form.more_info.length }} / {{ MAX_TEXT }}</span>
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

      <div class="row">
        <button v-if="qid" type="button" class="btn btn-danger" @click="confirmDelete = true">Supprimer la question</button>
        <div class="grow"></div>
        <button type="button" class="btn btn-secondary" :disabled="busy || position === 0" @click="goPrevious">← Précédente</button>
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="goNext">Suivante →</button>
        <button type="button" class="btn btn-primary" :disabled="busy" @click="finish">{{ busy ? 'Enregistrement…' : 'Terminer' }}</button>
      </div>
    </template>
  </main>
</template>
