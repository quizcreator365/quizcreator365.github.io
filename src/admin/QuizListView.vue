<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Icon from '../Icon.vue'
import { copyText, quizUrl } from '../utils'
import { useRouter } from 'vue-router'
import { deleteQuiz, duplicateQuiz, listQuizzes, type QuizRow } from './api'

const quizzes = ref<QuizRow[]>([])
const loading = ref(true)
const error = ref('')
const search = ref('')
const confirmId = ref<string | null>(null)
const toast = ref('')
const router = useRouter()
const busyId = ref<string | null>(null)

async function duplicate(id: string) {
  busyId.value = id
  error.value = ''
  try {
    const newId = await duplicateQuiz(id)
    await router.push({ name: 'quiz', params: { id: newId } })
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busyId.value = null
  }
}

const filtered = computed(() => {
  const s = search.value.trim().toLowerCase()
  if (!s) return quizzes.value
  return quizzes.value.filter((q) => `${q.name} ${q.description ?? ''} ${q.slug}`.toLowerCase().includes(s))
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    quizzes.value = await listQuizzes()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

function playersOf(q: QuizRow) {
  return [...q.players].sort((a, b) => a.position - b.position).map((p) => p.name).join(', ') || '—'
}

async function copy(slug: string) {
  const ok = await copyText(quizUrl(slug))
  toast.value = ok ? 'Lien copié' : 'Copie impossible : sélectionne le lien à la main'
  setTimeout(() => (toast.value = ''), 2200)
}

async function remove(id: string) {
  try {
    await deleteQuiz(id)
    quizzes.value = quizzes.value.filter((q) => q.id !== id)
    confirmId.value = null
  } catch (e) {
    error.value = (e as Error).message
  }
}

onMounted(load)
</script>

<template>
  <main class="admin-main">
    <div class="row" style="justify-content: space-between; align-items: flex-end">
      <h1>Mes quiz</h1>
      <div class="row">
        <label class="sr-only" for="search">Rechercher un quiz</label>
        <input id="search" v-model="search" type="search" placeholder="Rechercher un quiz" class="input search-input" />
        <RouterLink class="btn btn-primary" :to="{ name: 'quiz-new' }">+ Nouveau quiz</RouterLink>
      </div>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="loading" class="muted">Chargement…</p>

    <div v-else-if="quizzes.length === 0" class="panel">
      <h2>Aucun quiz pour l'instant</h2>
      <p class="muted">Crée ton premier quiz : un nom, une adresse, des joueurs, puis les questions.</p>
      <RouterLink class="btn btn-primary" style="align-self: flex-start" :to="{ name: 'quiz-new' }">Créer un quiz</RouterLink>
    </div>

    <template v-else>
    <div class="table-wrap desktop-only">
      <table class="list">
        <thead>
          <tr>
            <th>Quiz</th>
            <th>Statut</th>
            <th>Questions</th>
            <th>Joueurs</th>
            <th>Lien d'accès</th>
            <th><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="q in filtered" :key="q.id">
            <tr>
              <td>
                <RouterLink :to="{ name: 'quiz', params: { id: q.id } }" style="font-weight: 700; color: var(--ink); text-decoration: none">{{ q.name }}</RouterLink>
                <div v-if="q.description" class="small muted">{{ q.description }}</div>
              </td>
              <td><span class="status" :class="{ on: q.is_published }">{{ q.is_published ? 'Publié' : 'Fermé' }}</span></td>
              <td class="num">{{ q.questions[0]?.count ?? 0 }}</td>
              <td>{{ playersOf(q) }}</td>
              <td>
                <button type="button" class="btn btn-secondary btn-small" :title="quizUrl(q.slug)" @click="copy(q.slug)">
                  /{{ q.slug }} <Icon name="copy" :size="14" />
                </button>
              </td>
              <td style="text-align: right; white-space: nowrap">
                <RouterLink class="btn btn-ghost btn-small" :to="{ name: 'quiz', params: { id: q.id } }">Modifier</RouterLink>
                <button type="button" class="btn btn-ghost btn-small" :disabled="busyId === q.id" @click="duplicate(q.id)">Dupliquer</button>
                <button type="button" class="btn btn-danger btn-small" @click="confirmId = q.id">Supprimer</button>
              </td>
            </tr>
            <tr v-if="confirmId === q.id">
              <td colspan="6">
                <div class="confirm" role="alert">
                  <span class="grow">Supprimer « {{ q.name }} » et toutes ses questions ? C'est définitif.</span>
                  <button type="button" class="btn btn-secondary btn-small" @click="confirmId = null">Annuler</button>
                  <button type="button" class="btn btn-danger solid btn-small" @click="remove(q.id)">Supprimer</button>
                </div>
              </td>
            </tr>
          </template>
          <tr v-if="filtered.length === 0">
            <td colspan="6" class="muted">Aucun quiz ne correspond à « {{ search }} ».</td>
          </tr>
        </tbody>
      </table>
    </div>

    <ul class="cards mobile-only">
      <li v-for="q in filtered" :key="q.id" class="quiz-card">
        <RouterLink :to="{ name: 'quiz', params: { id: q.id } }" class="quiz-card-title">{{ q.name }}</RouterLink>
        <p v-if="q.description" class="small muted">{{ q.description }}</p>
        <p class="small"><span class="status" :class="{ on: q.is_published }">{{ q.is_published ? 'Publié' : 'Fermé' }}</span> {{ q.questions[0]?.count ?? 0 }} questions · {{ playersOf(q) }}</p>
        <button type="button" class="btn btn-secondary btn-small" style="align-self: flex-start" @click="copy(q.slug)">
          Copier le lien /{{ q.slug }} <Icon name="copy" :size="14" />
        </button>
        <div class="card-actions">
          <RouterLink class="btn btn-primary" :to="{ name: 'quiz', params: { id: q.id } }">Modifier</RouterLink>
          <button type="button" class="btn btn-secondary" :disabled="busyId === q.id" @click="duplicate(q.id)">Dupliquer</button>
          <button type="button" class="btn btn-danger" @click="confirmId = q.id">Supprimer</button>
        </div>
        <div v-if="confirmId === q.id" class="confirm" role="alert">
          <span class="grow">Supprimer « {{ q.name }} » et toutes ses questions ?</span>
          <button type="button" class="btn btn-secondary btn-small" @click="confirmId = null">Annuler</button>
          <button type="button" class="btn btn-danger solid btn-small" @click="remove(q.id)">Supprimer</button>
        </div>
      </li>
      <li v-if="filtered.length === 0" class="muted">Aucun quiz ne correspond à « {{ search }} ».</li>
    </ul>
    </template>
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </main>
</template>
