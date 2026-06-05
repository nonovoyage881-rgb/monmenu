# 🍽️ MonMenu — Planificateur de repas & anti-gaspi (PWA)

Application web progressive (PWA) moderne, installable et fonctionnant hors ligne, pour :

- **Découvrir** des recettes en ligne (TheMealDB) et nos suggestions de saison ;
- **Générer** des recettes et des menus avec un **assistant IA** (votre clé d'API) ;
- Tenir un **carnet** de recettes (création, édition, duplication, favoris) ;
- **Planifier** ses repas (jour / semaine / mois, glisser-déposer, génération auto) ;
- Gérer un **frigo intelligent** (péremptions, alertes, suggestions anti-gaspi) ;
- Produire une **liste de courses** automatique (fusion, rayons, export PDF) ;
- Suivre son **budget** et sa **nutrition** (objectifs personnalisés, graphique).

L'interface est en français, responsive (rail latéral sur ordinateur, barre inférieure sur mobile), avec un thème éditorial chaleureux (beige, vert sauge, terracotta, doré).

---

## 🚀 Déploiement sur GitHub Pages

1. Créez un dépôt GitHub (par exemple `monmenu`) et poussez l'intégralité de ce dossier à la racine.
2. Dans **Settings → Pages**, choisissez la branche `main` et le dossier `/ (root)`.
3. Attendez quelques instants : le site sera servi sur `https://VOTRE-UTILISATEUR.github.io/monmenu/`.

Le fichier `.nojekyll` (déjà présent) empêche GitHub de filtrer les fichiers commençant par `_`. Tous les chemins de l'application sont **relatifs**, donc le sous-dossier `/monmenu/` fonctionne sans configuration supplémentaire.

> 💡 Pour tester en local, servez le dossier avec un petit serveur HTTP (les modules ES et le service worker nécessitent `http://`, pas `file://`) :
> ```bash
> python3 -m http.server 8080
> # puis ouvrez http://localhost:8080
> ```

---

## 🔑 Configurer l'assistant IA

L'assistant utilise **votre propre clé d'API**, stockée uniquement sur votre appareil (IndexedDB / localStorage) — elle n'est jamais envoyée ailleurs que vers le fournisseur choisi.

1. Ouvrez **Réglages → Assistant IA**.
2. Choisissez le fournisseur :
   - **OpenAI** (ex. modèle `gpt-4o-mini`) ;
   - **Anthropic** (ex. `claude-3-5-haiku-latest`) — l'appel utilise l'en-tête d'accès navigateur direct ;
   - **Compatible OpenAI** — indiquez une URL de base personnalisée (`/chat/completions`).
3. Renseignez le modèle et votre clé, puis enregistrez.

L'IA répond en **JSON structuré** (recette ou menu) qui est directement intégré au carnet et au planning.

> ⚠️ Sur un hébergement statique, la clé reste côté client. Pour une application multi-utilisateurs, faites transiter les appels par un petit proxy serveur (voir ci-dessous) afin de ne pas exposer de clé partagée.

---

## 🗂️ Architecture du projet

```
monmenu/
├── index.html              Coquille de l'application (vues, modales, navigation)
├── manifest.webmanifest     Manifeste PWA (installable)
├── sw.js                    Service worker (cache hors ligne)
├── .nojekyll                Désactive le traitement Jekyll de GitHub Pages
├── css/
│   └── styles.css           Système de design complet (thème, composants, responsive)
├── icons/                   Icônes PWA (192 / 512 / maskable) + favicon
└── js/
    ├── config.js            Constantes : repas, rayons, base d'ingrédients, recettes de saison
    ├── utils.js             Fonctions utilitaires (dates, formats, DOM, modales)
    ├── db.js                Couche IndexedDB + repli localStorage + migration v1
    ├── store.js             Cœur métier : état, persistance, calculs, CRUD, courses
    ├── api.js               Réseau : TheMealDB + assistant IA (OpenAI / Anthropic)
    ├── ui.js                Composants réutilisables (cartes, fiches, formulaires)
    ├── views.js             Rendu de chaque vue (découvrir, planning, frigo…)
    └── app.js               Point d'entrée : démarrage, routage, événements, PWA
```

Le code est en **JavaScript moderne (modules ES)**, sans dépendance de build : il s'ouvre tel quel dans le navigateur.

### Flux de données

`Vues → store.js (mutation) → persistance IndexedDB → événement « change » → re-rendu`

Le store expose un `EventTarget` (`bus`) ; `app.js` ré-affiche la vue active à chaque changement. La synchronisation entre onglets ouverts est assurée par `BroadcastChannel`.

---

## 🔄 Migration depuis l'ancienne version

Au premier lancement, `db.js` détecte les anciennes clés `localStorage` (`monmenu_recipes`, `monmenu_fridge`, `monmenu_planning`, `monmenu_shopping`) et les convertit automatiquement vers le nouveau format (ajout des catégories, dates de péremption, créneau « collation », structure de planning normalisée). Aucune action n'est requise.

---

## ☁️ Brancher Firebase ou Supabase (synchronisation multi-appareils)

L'architecture est prête pour un backend. La persistance passe par une seule couche (`db.js` → `dbGet` / `dbSet`) et chaque écriture émet déjà un événement. Pour synchroniser dans le cloud :

1. **Créez `js/sync.js`** exposant `pull()` / `push(key, value)` vers votre backend.
2. Dans `store.js`, après chaque `persist(key)`, appelez `push(key, state[key])`.
3. Au démarrage (`initStore`), faites un `pull()` initial puis abonnez-vous aux changements distants pour mettre à jour `state` et appeler `emit()`.

Exemple minimal avec **Supabase** :

```js
import { createClient } from 'https://esm.sh/@supabase/supabase-js';
const supabase = createClient(URL, ANON_KEY);

export async function push(key, value) {
  await supabase.from('monmenu').upsert({ user_id: USER, key, value });
}
export async function pull() {
  const { data } = await supabase.from('monmenu').select('key,value').eq('user_id', USER);
  return Object.fromEntries((data || []).map(r => [r.key, r.value]));
}
```

Avec **Firebase**, utilisez Firestore (`doc(db, 'users', uid)`) selon le même schéma clé/valeur. Le reste de l'application ne change pas, car tout passe déjà par le store.

---

## 📦 Fonctionnement hors ligne

Le service worker pré-met en cache la coquille de l'application (HTML, CSS, JS, icônes). Les recettes TheMealDB sont mises en cache après consultation (stratégie *network-first*), et les polices Google en *stale-while-revalidate*. Les appels à l'IA ne sont jamais mis en cache (données privées). L'application reste donc utilisable sans connexion pour le carnet, le planning, le frigo et les courses.

---

## 🧪 Données & confidentialité

- Toutes vos données (recettes, planning, frigo, courses, objectifs, clé d'API) restent **sur votre appareil**.
- **Réglages → Données** permet d'**exporter** une sauvegarde JSON, de la **réimporter** et de **tout réinitialiser**.

---

## 📋 Licence

Projet personnel libre d'utilisation et de modification.
