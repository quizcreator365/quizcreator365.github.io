import { supabase } from './supabase'
import { frenchError } from './errors'

export const BUCKET = 'question-images'
/** Format du cadre photo affiché au joueur (largeur / hauteur). */
export const PHOTO_RATIO = 4 / 3
const MAX_SIDE = 1200
const MAX_INPUT_BYTES = 20 * 1024 * 1024

/** Adresse publique d'une photo enregistrée. */
export function imageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Cette image n'a pas pu être lue. Essaie une photo JPEG ou PNG."))
    }
    img.src = url
  })
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/** Réduit la photo à 1 200 px de côté au plus, en WebP (ou JPEG si le navigateur ne sait pas). */
export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choisis un fichier image.')
  if (file.size > MAX_INPUT_BYTES) throw new Error('Image trop lourde (20 Mo au maximum).')
  const img = await loadImage(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Ton navigateur ne permet pas de préparer la photo.')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const webp = await toBlob(canvas, 'image/webp', 0.82)
  if (webp && webp.type === 'image/webp') return webp
  const jpeg = await toBlob(canvas, 'image/jpeg', 0.85)
  if (!jpeg) throw new Error('La photo n’a pas pu être préparée.')
  return jpeg
}

/** Compresse puis envoie la photo ; renvoie son chemin dans le stockage. */
export async function uploadImage(quizId: string, file: File): Promise<string> {
  const blob = await compressImage(file)
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${quizId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type,
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) throw new Error(`Envoi de la photo impossible : ${frenchError(error.message)}`)
  return path
}

/** Supprime les photos qu'aucune question n'utilise plus (une copie de quiz peut les partager). */
export async function removeUnusedImages(paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))]
  const unused: string[] = []
  for (const path of unique) {
    const { count } = await supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('image_path', path)
    if (count === 0) unused.push(path)
  }
  if (unused.length) await supabase.storage.from(BUCKET).remove(unused)
}
