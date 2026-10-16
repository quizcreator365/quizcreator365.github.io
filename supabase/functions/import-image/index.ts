// Supabase Edge Function « import-image »
// Récupère une image à partir de son adresse web et la renvoie au back office,
// qui la fait recadrer puis l'enregistre comme une photo envoyée depuis l'ordinateur.
// Réservée à l'administrateur.

import { createClient } from 'npm:@supabase/supabase-js@2'

const MAX_BYTES = 10 * 1024 * 1024

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Image-Type',
}

function error(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// Adresses internes refusées (le service ne doit servir qu'à lire des images publiques).
const PRIVATE_HOST =
  /^(localhost|0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|\[?f[cd][0-9a-f]{2}:|metadata\.)/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return error(405, 'Méthode non autorisée.')

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: isAdmin } = await supabase.rpc('is_admin')
  if (!isAdmin) return error(403, "Accès réservé à l'administrateur.")

  let target: URL
  try {
    const body = await req.json()
    target = new URL(String(body.url ?? ''))
  } catch {
    return error(400, 'Adresse invalide.')
  }
  if (!['http:', 'https:'].includes(target.protocol)) return error(400, "L'adresse doit commencer par http:// ou https://.")
  if (PRIVATE_HOST.test(target.hostname)) return error(400, 'Adresse non autorisée.')

  let res: Response
  try {
    res = await fetch(target, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QuizDesVoisines/1.0)', Accept: 'image/*' },
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    return error(502, "Le site de l'image ne répond pas.")
  }
  if (!res.ok) return error(502, `Image introuvable à cette adresse (code ${res.status}).`)

  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
  if (!type.startsWith('image/') || type === 'image/svg+xml') {
    return error(415, "Cette adresse ne mène pas à une image. Sur la page, fais un clic droit (ou un appui long) sur l'image puis « Copier l'adresse de l'image ».")
  }
  if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) return error(413, 'Image trop lourde (10 Mo au maximum).')

  const bytes = await res.arrayBuffer()
  if (bytes.byteLength > MAX_BYTES) return error(413, 'Image trop lourde (10 Mo au maximum).')

  return new Response(bytes, {
    headers: { ...cors, 'Content-Type': 'application/octet-stream', 'X-Image-Type': type },
  })
})
