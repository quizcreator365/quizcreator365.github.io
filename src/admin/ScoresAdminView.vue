<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { supabase } from '../supabase'
import { formatDay } from '../schedule'
import { ordinal, percent, rankPlayers, type ScoreBoard } from '../board'
import { formatScore } from '../scoring'
import { plainText } from '../format'
import { TYPE_LABELS } from '../types'
import { deleteResponse, getQuiz, listResponses, type QuestionRow, type ResponseRow } from './api'

const props = defineProps<{ id: string }>()

const loading = ref(true)
const error = ref('')
const quizName = ref('')
const questions = ref<QuestionRow[]>([])
const board = ref<ScoreBoard | null>(null)
const day = ref('')
const responses = ref<ResponseRow[]>([])
const answerTexts = ref<Record<string, string>>({})
const confirmId = ref<string | null>(null)
const toast = ref('')

const ranking = computed(() => (board.value ? rankPlayers(board.value) : []))
const maxTotal = computed(() => board.value?.days.reduce((s, d) => s + Number(d.max), 0) ?? 0)
const players = computed(() => board.value?.players ?? [])
const playerName = (id: string) => players.value.find((p) => p.id === id)?.name ?? '?'
const dayQuestions = computed(() => questions.value.filter((q) => q.scheduled_on === day.value))
const days = computed(() => [...(board.value?.days ?? [])].reverse())

async function load() {
  loading.value = true
  error.value = ''
  try {
    const quiz = await getQuiz(props.id)
    quizName.value = quiz.form.name
    questions.value = quiz.questions
    const { data, error: e } = await supabase.rpc('get_scores', { p_slug: quiz.form.slug })
    if (e) throw new Error(e.message)
    board.value = data as ScoreBoard
    if (!day.value || !board.value.days.some((d) => d.day === day.value)) day.value = board.value.days.at(-1)?.day ?? ''
    await loadDay()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function loadDay() {
  const ids = dayQuestions.value.map((q) => q.id)
  responses.value = await listResponses(ids)
  if (ids.length) {
    const { data } = await supabase.from('answers').select('id, text').in('question_id', ids)
    answerTexts.value = Object.fromEntries((data ?? []).map((a) => [a.id, plainText(a.text as string)]))
  }
}

/** Réponse du joueur, en clair. */
function describe(r: ResponseRow): string {
  const a = r.answer as { kind: string; text?: string; ids?: string[]; pairs?: Record<string, string> }
  const t = (id: string) => answerTexts.value[id] ?? '?'
  if (a.kind === 'text') return a.text ?? ''
  if (a.kind === 'choices') return (a.ids ?? []).map(t).join(', ')
  if (a.kind === 'order') return (a.ids ?? []).map(t).join(' → ')
  if (a.kind === 'pairs') return Object.entries(a.pairs ?? {}).map(([l, rr]) => `${t(l)} ↔ ${t(rr)}`).join(' ; ')
  return ''
}

function answeredLate(r: ResponseRow, questionDay: string | null) {
  if (!questionDay) return false
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(r.answered_at))
  return d > questionDay
}

async function remove(id: string) {
  try {
    await deleteResponse(id)
    confirmId.value = null
    toast.value = 'Réponse supprimée : le joueur peut répondre de nouveau'
    setTimeout(() => (toast.value = ''), 2600)
    await load()
  } catch (e) {
    error.value = (e as Error).message
  }
}

watch(() => props.id, load, { immediate: true })
watch(day, (d, old) => {
  if (old && d !== old) loadDay()
})
</script>

<template>
  <main class="admin-main">
    <RouterLink :to="{ name: 'quiz', params: { id } }" class="back">← {{ quizName || 'Quiz' }}</RouterLink>
    <h1>Scores et réponses</h1>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="loading" class="muted">Chargement…</p>

    <template v-else-if="board">
      <p v-if="board.days.length === 0" class="muted">Aucune question n'a encore été ouverte : les scores apparaîtront ici.</p>

      <div v-else class="columns">
        <section class="panel side">
          <h2>Classement</h2>
          <p class="small muted">Cumul sur {{ board.days.length }} jour{{ board.days.length > 1 ? 's' : '' }}, {{ maxTotal }} points possibles.</p>
          <ol class="ranking">
            <li v-for="r in ranking" :key="r.id">
              <span class="rank">{{ ordinal(r.rank) }}</span>
              <span class="grow">{{ r.name }}</span>
              <b>{{ formatScore(r.total) }}</b>
              <span class="small muted" style="width: 44px; text-align: right">{{ percent(r.total, maxTotal) }}</span>
            </li>
          </ol>
        </section>

        <section class="panel main">
          <h2>Jour après jour</h2>
          <div class="table-scroll">
            <table class="score-table">
              <thead>
                <tr>
                  <th scope="col">Joueur</th>
                  <th v-for="d in days" :key="d.day" scope="col">{{ formatDay(d.day) }}<small>/{{ d.max }}</small></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in players" :key="p.id">
                  <th scope="row">{{ p.name }}</th>
                  <td v-for="d in days" :key="d.day">{{ p.days[d.day] !== undefined ? formatScore(Number(p.days[d.day])) : '–' }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="row" style="justify-content: space-between; margin-top: 8px">
            <h2>Réponses du jour</h2>
            <label class="row" style="gap: 8px">
              <span class="small">Jour</span>
              <select v-model="day" class="input" style="width: auto">
                <option v-for="d in days" :key="d.day" :value="d.day">{{ formatDay(d.day) }}</option>
              </select>
            </label>
          </div>
          <div v-for="q in dayQuestions" :key="q.id" class="response-block">
            <p><span class="type-tag">{{ TYPE_LABELS[q.type] }}</span> {{ plainText(q.prompt) }}</p>
            <ul v-if="responses.some((r) => r.question_id === q.id)">
              <li v-for="r in responses.filter((x) => x.question_id === q.id)" :key="r.id">
                <span class="who">{{ playerName(r.player_id) }}</span>
                <span class="grow what">{{ describe(r) }}<span v-if="answeredLate(r, q.scheduled_on)" class="late-tag">en retard</span></span>
                <b class="pts">{{ r.points === null ? 'à évaluer' : formatScore(r.points) }}</b>
                <template v-if="confirmId === r.id">
                  <button type="button" class="btn btn-secondary btn-small" @click="confirmId = null">Annuler</button>
                  <button type="button" class="btn btn-danger solid btn-small" @click="remove(r.id)">Supprimer</button>
                </template>
                <button v-else type="button" class="btn btn-danger btn-small" :aria-label="`Supprimer la réponse de ${playerName(r.player_id)}`" @click="confirmId = r.id">Supprimer</button>
              </li>
            </ul>
            <p v-else class="small muted">Pas encore de réponse.</p>
          </div>
          <p class="small muted">Supprimer une réponse retire ses points ; le joueur peut alors répondre de nouveau à la question.</p>
        </section>
      </div>
    </template>
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </main>
</template>
