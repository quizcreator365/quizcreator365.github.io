<script setup lang="ts">
import { supabase } from '../supabase'
import { authReady, initAuth, recovering, session } from './auth'
import LoginView from './LoginView.vue'

initAuth()
document.title = 'Admin · Quiz'

async function signOut() {
  await supabase.auth.signOut()
}
</script>

<template>
  <div class="admin">
    <header class="admin-header">
      <RouterLink to="/admin" class="brand">Quiz creator <small>· admin</small></RouterLink>
      <div v-if="session && !recovering" class="row">
        <span class="small" style="color: var(--ink-soft)">{{ session.user.email }}</span>
        <button type="button" class="btn btn-small" @click="signOut">Se déconnecter</button>
      </div>
    </header>

    <main v-if="!authReady" class="admin-main"><p class="muted">Chargement…</p></main>
    <LoginView v-else-if="!session || recovering" />
    <RouterView v-else />
  </div>
</template>
