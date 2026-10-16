// GitHub Pages ne sait pas rediriger /voisines vers l'application :
// on sert la même page pour les chemins inconnus via 404.html.
import { copyFileSync, writeFileSync } from 'node:fs'

copyFileSync('dist/index.html', 'dist/404.html')
// Empêche GitHub Pages d'appliquer Jekyll aux fichiers du site.
writeFileSync('dist/.nojekyll', '')
console.log('404.html et .nojekyll créés')
