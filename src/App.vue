<script setup lang="ts">
import { isConfigured } from './supabase'
</script>

<template>
  <main v-if="!isConfigured" class="screen center">
    <div class="card stack">
      <h1>Configuration manquante</h1>
      <p>
        Renseigne <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code>
        (fichier <code>.env.local</code> en local, variables du dépôt sur GitHub).
      </p>
    </div>
  </main>
  <RouterView v-else />
</template>
