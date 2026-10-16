<script setup lang="ts">
import { ref } from 'vue'
import { supabase } from '../supabase'
import { frenchAuthError, recovering } from './auth'

const email = ref('')
const password = ref('')
const error = ref('')
const info = ref('')
const busy = ref(false)
const mode = ref<'login' | 'forgot'>('login')

async function signIn() {
  error.value = ''
  busy.value = true
  const { error: e } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: password.value })
  busy.value = false
  if (e) error.value = frenchAuthError(e.message)
}

async function sendReset() {
  error.value = ''
  info.value = ''
  if (!email.value.trim()) {
    error.value = 'Saisis ton adresse email.'
    return
  }
  busy.value = true
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}admin`
  const { error: e } = await supabase.auth.resetPasswordForEmail(email.value.trim(), { redirectTo })
  busy.value = false
  if (e) error.value = frenchAuthError(e.message)
  else info.value = 'Email envoyé. Ouvre le lien qu’il contient pour choisir un nouveau mot de passe.'
}

async function setNewPassword() {
  error.value = ''
  if (password.value.length < 8) {
    error.value = 'Choisis un mot de passe d’au moins 8 caractères.'
    return
  }
  busy.value = true
  const { error: e } = await supabase.auth.updateUser({ password: password.value })
  busy.value = false
  if (e) error.value = frenchAuthError(e.message)
  else {
    recovering.value = false
    password.value = ''
  }
}
</script>

<template>
  <main class="admin-main" style="max-width: 440px">
    <form v-if="recovering" class="panel" @submit.prevent="setNewPassword">
      <h1 style="font-size: 26px">Nouveau mot de passe</h1>
      <div class="field">
        <label for="new-password">Mot de passe</label>
        <input id="new-password" v-model="password" class="input" type="password" autocomplete="new-password" required />
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button class="btn btn-primary" type="submit" :disabled="busy">Enregistrer</button>
    </form>

    <form v-else-if="mode === 'login'" class="panel" @submit.prevent="signIn">
      <h1 style="font-size: 26px">Connexion admin</h1>
      <div class="field">
        <label for="email">Email</label>
        <input id="email" v-model="email" class="input" type="email" autocomplete="username" required />
      </div>
      <div class="field">
        <label for="password">Mot de passe</label>
        <input id="password" v-model="password" class="input" type="password" autocomplete="current-password" required />
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button class="btn btn-primary" type="submit" :disabled="busy">{{ busy ? 'Connexion…' : 'Se connecter' }}</button>
      <button class="btn btn-ghost" type="button" @click="mode = 'forgot'; error = ''">Mot de passe oublié ?</button>
    </form>

    <form v-else class="panel" @submit.prevent="sendReset">
      <h1 style="font-size: 26px">Mot de passe oublié</h1>
      <p class="muted">Tu vas recevoir un lien pour choisir un nouveau mot de passe.</p>
      <div class="field">
        <label for="reset-email">Email</label>
        <input id="reset-email" v-model="email" class="input" type="email" autocomplete="username" required />
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="info" class="ok" role="status">{{ info }}</p>
      <button class="btn btn-primary" type="submit" :disabled="busy">Envoyer le lien</button>
      <button class="btn btn-ghost" type="button" @click="mode = 'login'; error = ''; info = ''">Retour à la connexion</button>
    </form>
  </main>
</template>
