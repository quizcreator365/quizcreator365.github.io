import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// BASE_PATH : '/' si le dépôt s'appelle ton-compte.github.io,
// sinon '/<nom-du-depot>/' (ex. '/quiz/').
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [vue()],
  test: {
    environment: 'node',
  },
})
