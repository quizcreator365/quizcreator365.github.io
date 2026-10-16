# Quiz des voisines

Application web de quiz : l'admin crée des quiz dans un back office, les joueurs y répondent depuis leur téléphone à une adresse du type `ton-compte.github.io/voisines`.

- **Site** : Vue 3 + TypeScript + Vite, publié gratuitement sur GitHub Pages.
- **Données, connexion admin, photos** : Supabase (offre gratuite).
- **Version** : lot 2. Tous les types de questions : texte libre, QCM, vrai ou faux, association, chronologie, Qui suis-je ?, Quiz photo.

## Mise en route (une seule fois, environ 20 minutes)

### 1. Créer le projet Supabase

1. Sur [supabase.com](https://supabase.com), crée un compte puis un projet (région conseillée : Paris ou Francfort). Note le mot de passe de la base.
2. Ouvre **SQL Editor** et exécute, dans l'ordre, `supabase/migrations/20261014000000_init.sql`, `20261016000000_lot1.sql` puis `20261017000000_lot2.sql`.
3. Ouvre **Authentication › Sign In / Providers** et désactive **Allow new users to sign up**. Ton compte sera ainsi le seul possible.
4. Ouvre **Authentication › Users › Add user › Create new user**. Saisis ton email et un mot de passe, et coche **Auto Confirm User**.
5. Dans **SQL Editor**, donne-toi les droits d'admin (remplace l'email) :
   ```sql
   insert into public.app_admins (user_id)
   select id from auth.users where email = 'ton@email.fr'
   on conflict do nothing;
   ```
6. Ouvre **Authentication › URL Configuration** :
   - **Site URL** : `https://ton-compte.github.io`
   - **Redirect URLs** : ajoute `https://ton-compte.github.io/admin` et `http://localhost:5173/admin`
7. Ouvre **Project Settings › API** et note l'**URL du projet** et la **clé publique** (`anon` ou `publishable`). Ne copie jamais la clé `service_role` / `secret` dans le site.

### 2. Créer le dépôt GitHub

1. Crée un dépôt public nommé exactement `ton-compte.github.io` (remplace `ton-compte` par ton identifiant GitHub).
2. Envoie les fichiers du projet dans le dépôt avec [GitHub Desktop](https://desktop.github.com) :
   - décompresse le zip (dossier `quiz`) ;
   - dans GitHub Desktop : **File › Clone repository** › `ton-compte.github.io` ;
   - affiche les fichiers cachés (Mac : Cmd + Maj + . ; Windows : Affichage › Éléments masqués) ;
   - copie **tout le contenu** du dossier `quiz` (y compris `.github`, `.gitignore`) dans le dossier cloné ;
   - dans GitHub Desktop : Summary « Quiz des voisines : MPC », **Commit to main**, puis **Push origin** ;
   - vérifie sur github.com la présence du dossier `.github` et de `package.json` à la racine.
3. Dans le dépôt, **Settings › Pages › Build and deployment › Source** : choisis **GitHub Actions**.
4. **Settings › Secrets and variables › Actions › onglet Variables › New repository variable** :
   - `SUPABASE_URL` = l'URL du projet Supabase
   - `SUPABASE_ANON_KEY` = la clé publique
5. Onglet **Actions** : relance « Publier sur GitHub Pages » si le premier passage a échoué faute de variables. Au bout de 2 minutes environ, le site répond sur `https://ton-compte.github.io`.

> Si le dépôt porte un autre nom (par exemple `quiz`), ajoute une variable `BASE_PATH` = `/quiz/`. Les adresses deviennent alors `ton-compte.github.io/quiz/voisines`.

### 3. Utiliser l'application

- Back office : `https://ton-compte.github.io/admin`
- Un quiz : `https://ton-compte.github.io/<adresse-choisie>`

## Travailler sur le code

```bash
npm install
cp .env.example .env.local   # puis renseigne les deux valeurs
npm run dev                  # http://localhost:5173
npm test                     # tests de la notation
npm run build                # version de production dans dist/
```

## Organisation

```
src/
  player/       écrans joueur : choix du joueur, question, correction, résultat
  admin/        back office : connexion, liste des quiz, fiche quiz, éditeur de question
  scoring.ts    calcul des points (testé dans scoring.test.ts)
  types.ts      types de questions et de réponses
supabase/migrations/   tables, règles d'accès, fonctions get_quiz et save_question
.github/workflows/     publication sur GitHub Pages, réveil hebdomadaire de Supabase
scripts/spa-fallback.mjs   copie index.html en 404.html pour les adresses /voisines
```

## Règles de notation

| Type | Points (sur 1) |
| --- | --- |
| Texte libre | 1 si le joueur indique « J'avais juste », sinon 0 |
| QCM | 1 si les cases cochées sont exactement les bonnes, sinon 0 |
| Vrai ou faux | 1 ou 0 |
| Association (lot 1) | paires justes ÷ nombre de paires |
| Chronologie (lot 1) | éléments bien placés ÷ nombre d'éléments |

## Limites connues

- Les bonnes réponses sont envoyées au navigateur pour la correction : un joueur averti peut les lire avec les outils de développement.
- Un projet Supabase gratuit se met en pause après 7 jours sans activité. Le workflow « Garder Supabase actif » l'appelle deux fois par semaine.
- Les adresses de quiz sont servies par `404.html` : le jeu fonctionne normalement, mais l'aperçu du lien dans WhatsApp peut être sommaire.

## Lots

- **Lot 1 (livré)** : Qui suis-je ?, Quiz photo, partage du résultat sur WhatsApp, back office sur téléphone, réorganisation des questions, aperçu et duplication d'un quiz.
- **Lot 2 (livré)** : association, chronologie, gras et italique, recadrage des photos, publier ou fermer un quiz, petites corrections.
- **Lot 3** : reprise d'une partie interrompue, couleur de fond des questions, import d'une photo à partir d'un lien.

Voir aussi LISEZMOI.txt, section « Pièges à éviter ».
