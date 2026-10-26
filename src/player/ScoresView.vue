<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { dayLabel, ordinal, percent, playerStats, shortDay, type ScoreBoard } from '../board'
import { formatScore } from '../scoring'

const props = defineProps<{ board: ScoreBoard; playerId: string; quizName: string }>()
const emit = defineEmits<{ back: [] }>()

const stats = computed(() => playerStats(props.board, props.playerId))
const me = computed(() => props.board.players.find((p) => p.id === props.playerId))

// Le graphique défile horizontalement : on montre d'abord les jours les plus récents.
const chart = ref<HTMLElement | null>(null)
onMounted(async () => {
  await nextTick()
  if (chart.value) chart.value.scrollLeft = chart.value.scrollWidth
})
</script>

<template>
  <main class="screen">
    <div class="topline">
      <button type="button" class="btn btn-ghost btn-small" @click="emit('back')">← Retour</button>
      <span class="pill">{{ me?.name }}</span>
    </div>
    <div class="stack" style="gap: 4px">
      <span class="eyebrow">{{ quizName }}</span>
      <h1>Mes scores</h1>
    </div>

    <div class="stat-grid">
      <div class="stat">
        <span class="label">Cumul</span>
        <b>{{ formatScore(stats.total) }}<small> / {{ stats.maxTotal }}</small></b>
        <span class="small muted">{{ percent(stats.total, stats.maxTotal) }}</span>
      </div>
      <div class="stat">
        <span class="label">Aujourd'hui</span>
        <b v-if="stats.today">{{ formatScore(stats.today.points) }}<small> / {{ stats.today.max }}</small></b>
        <b v-else>–</b>
        <span class="small muted">{{ stats.today ? percent(stats.today.points, stats.today.max) : 'Pas de question' }}</span>
      </div>
      <div class="stat">
        <span class="label">Classement</span>
        <b>{{ stats.rank ? ordinal(stats.rank) : '–' }}</b>
        <span class="small muted">sur {{ stats.ranking.length }}</span>
      </div>
    </div>

    <section class="stack" style="gap: 10px">
      <h2>Jour après jour</h2>
      <p v-if="stats.days.length === 0" class="muted">Les scores apparaîtront après les premières questions.</p>
      <div v-else ref="chart" class="day-chart" role="list" aria-label="Points par jour">
        <div
          v-for="d in stats.days"
          :key="d.day"
          class="day-bar"
          :class="{ today: d.day === board.today }"
          role="listitem"
          :aria-label="`${dayLabel(d.day, board.today)} : ${formatScore(d.points)} sur ${d.max}`"
        >
          <span class="value">{{ formatScore(d.points) }}<small>/{{ d.max }}</small></span>
          <span class="track"><span class="fill" :style="{ height: (d.max ? (d.points / d.max) * 100 : 0) + '%' }"></span></span>
          <span class="date">{{ d.day === board.today ? 'Auj.' : shortDay(d.day) }}</span>
        </div>
      </div>
    </section>

    <section class="stack" style="gap: 10px">
      <h2>Classement</h2>
      <ol class="ranking">
        <li v-for="r in stats.ranking" :key="r.id" :class="{ me: r.id === playerId }">
          <span class="rank">{{ ordinal(r.rank) }}</span>
          <span class="grow">{{ r.name }}<span v-if="r.id === playerId" class="small"> (toi)</span></span>
          <b>{{ formatScore(r.total) }}</b>
          <span class="small muted" style="width: 48px; text-align: right">{{ percent(r.total, stats.maxTotal) }}</span>
        </li>
      </ol>
    </section>
  </main>
</template>
