<script setup lang="ts">
defineProps<{ name: 'check' | 'cross' | 'arrow' | 'replay' | 'copy' | 'half'; size?: number; color?: string }>()
</script>

<template>
  <svg
    class="icon"
    :width="size ?? 20"
    :height="size ?? 20"
    viewBox="0 0 24 24"
    fill="none"
    :stroke="color ?? 'currentColor'"
    stroke-width="2.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-if="name === 'check'" d="M5 12.5l4.5 4.5L19 7" />
    <path v-else-if="name === 'cross'" d="M6 6l12 12M18 6L6 18" />
    <path v-else-if="name === 'arrow'" d="M5 12h14M13 6l6 6-6 6" />
    <g v-else-if="name === 'replay'"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></g>
    <g v-else-if="name === 'copy'" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h9" /></g>
    <g v-else-if="name === 'half'" stroke-width="2.2"><circle cx="12" cy="12" r="9.5" /><path d="M12 2.5a9.5 9.5 0 0 1 0 19z" :fill="color ?? 'currentColor'" /></g>
  </svg>
</template>
