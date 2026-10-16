<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Cropper from 'cropperjs'
import { PHOTO_RATIO } from '../images'

const props = defineProps<{ src: string }>()
const emit = defineEmits<{ done: [file: File]; cancel: [] }>()

const img = ref<HTMLImageElement | null>(null)
const busy = ref(false)
const error = ref('')
let cropper: Cropper | null = null

onMounted(() => {
  if (!img.value) return
  cropper = new Cropper(img.value, {
    aspectRatio: PHOTO_RATIO,
    viewMode: 1,
    dragMode: 'move',
    autoCropArea: 1,
    cropBoxMovable: false,
    cropBoxResizable: false,
    toggleDragModeOnDblclick: false,
    background: false,
    guides: true,
    center: true,
    responsive: true,
  })
  document.body.style.overflow = 'hidden'
})

onBeforeUnmount(() => {
  cropper?.destroy()
  document.body.style.overflow = ''
})

function reset() {
  cropper?.reset()
}

function zoom(delta: number) {
  cropper?.zoom(delta)
}

function confirm() {
  if (!cropper) return
  busy.value = true
  error.value = ''
  const canvas = cropper.getCroppedCanvas({ width: 1200, height: 900, imageSmoothingQuality: 'high', fillColor: '#1a1d3a' })
  if (!canvas) {
    busy.value = false
    error.value = "La photo n'a pas pu être recadrée."
    return
  }
  canvas.toBlob(
    (blob) => {
      busy.value = false
      if (!blob) {
        error.value = "La photo n'a pas pu être recadrée (image protégée par son site d'origine ?)."
        return
      }
      emit('done', new File([blob], 'photo-recadree.jpg', { type: 'image/jpeg' }))
    },
    'image/jpeg',
    0.92,
  )
}
</script>

<template>
  <div class="crop-overlay" role="dialog" aria-modal="true" aria-labelledby="crop-title">
    <div class="crop-panel">
      <h2 id="crop-title">Cadrer la photo</h2>
      <p class="small muted">Fais glisser la photo et zoome pour choisir ce que verront les joueurs. Le cadre a le format de l'écran de jeu.</p>
      <div class="crop-area">
        <img ref="img" :src="props.src" crossorigin="anonymous" alt="Photo à cadrer" />
      </div>
      <div class="row" style="justify-content: center">
        <button type="button" class="btn btn-secondary" aria-label="Dézoomer" @click="zoom(-0.1)">−</button>
        <button type="button" class="btn btn-secondary" aria-label="Zoomer" @click="zoom(0.1)">+</button>
        <button type="button" class="btn btn-ghost" @click="reset">Réinitialiser</button>
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="emit('cancel')">Annuler</button>
        <button type="button" class="btn btn-primary wide" :disabled="busy" @click="confirm">Valider le cadrage</button>
      </div>
    </div>
  </div>
</template>
