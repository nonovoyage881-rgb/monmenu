/* ════════════════════════════════════════════════════════════════
   db.js — Couche de persistance (IndexedDB) + migration localStorage
   Architecture clé/valeur simple : chaque "collection" est stockée
   comme un blob JSON. Plus robuste et capacitif que localStorage,
   et prête à être doublée par une synchro distante (voir sync.js).
   ════════════════════════════════════════════════════════════════ */

const DB_NAME = 'monmenu-db';
const DB_VERSION = 1;
const STORE = 'kv';

/* Anciennes clés localStorage de la v1, pour migration */
const LEGACY_KEYS = {
  recipes:  'monmenu_recipes',
  fridge:   'monmenu_fridge',
  planning: 'monmenu_planning',
  shopping: 'monmenu_shopping',
};

let _dbPromise = null;

/* Ouvre (ou crée) la base IndexedDB une seule fois */
function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB indisponible')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

/* Lecture d'une clé */
export async function dbGet(key) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => reject(r.error);
    });
  } catch (e) {
    /* Repli localStorage si IndexedDB échoue (mode privé, etc.) */
    const raw = localStorage.getItem('mm_' + key);
    return raw ? JSON.parse(raw) : null;
  }
}

/* Écriture d'une clé */
export async function dbSet(key, value) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    try { localStorage.setItem('mm_' + key, JSON.stringify(value)); } catch (_) {}
  }
}

/* Suppression de toutes les données */
export async function dbClear() {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (_) {}
  Object.values(LEGACY_KEYS).forEach(k => localStorage.removeItem(k));
}

/*
  Migration des données v1 (localStorage) vers le nouveau schéma.
  Exécutée une seule fois (drapeau 'migrated_v1'). Transforme :
  - recettes : ajoute category/origin/nutrition/cost/favorite/source
  - frigo    : ajoute category/expiry/emoji
  - planning : ajoute le créneau "collation", normalise les slots
  Retourne un objet { recipes, fridge, planning, shopping } ou null si rien à migrer.
*/
export async function migrateLegacy() {
  const done = await dbGet('migrated_v1');
  if (done) return null;

  const out = {};
  let found = false;

  // Recettes
  try {
    const raw = localStorage.getItem(LEGACY_KEYS.recipes);
    if (raw) {
      const old = JSON.parse(raw);
      if (Array.isArray(old) && old.length) {
        found = true;
        out.recipes = old.map(r => ({
          id: r.id || ('rec_' + Math.random().toString(36).slice(2, 8)),
          name: r.name || 'Recette',
          emoji: r.emoji || '🍽️',
          image: r.image || null,
          category: r.category || 'Plat',
          origin: r.origin || '',
          tags: Array.isArray(r.tags) ? r.tags : [],
          portions: r.portions || 4,
          prepTime: r.prepTime || 0,
          cookTime: r.cookTime || 0,
          ingredients: Array.isArray(r.ingredients) ? r.ingredients.map(i => ({
            name: i.name || '', qty: Number(i.qty) || 0, unit: i.unit || '',
          })) : [],
          steps: Array.isArray(r.steps) ? r.steps : [],
          nutrition: r.nutrition || null,
          favorite: !!r.favorite,
          source: r.source || 'manual',
          createdAt: r.createdAt || Date.now(),
          updatedAt: Date.now(),
        }));
      }
    }
  } catch (_) {}

  // Frigo
  try {
    const raw = localStorage.getItem(LEGACY_KEYS.fridge);
    if (raw) {
      const old = JSON.parse(raw);
      if (Array.isArray(old) && old.length) {
        found = true;
        out.fridge = old.map(i => ({
          id: i.id || ('frg_' + Math.random().toString(36).slice(2, 8)),
          name: i.name || 'Aliment',
          qty: Number(i.qty) || 1,
          unit: i.unit || 'pièce',
          category: i.category || 'autres',
          emoji: i.emoji || '📦',
          expiry: i.expiry || null,
          addedAt: i.addedAt || Date.now(),
        }));
      }
    }
  } catch (_) {}

  // Planning : ajoute la collation et conserve les recipeId existants
  try {
    const raw = localStorage.getItem(LEGACY_KEYS.planning);
    if (raw) {
      const old = JSON.parse(raw);
      if (old && typeof old === 'object') {
        found = true;
        const plan = {};
        for (const [iso, day] of Object.entries(old)) {
          plan[iso] = {};
          for (const meal of ['breakfast', 'lunch', 'dinner', 'snack']) {
            const slots = Array.isArray(day?.[meal]) ? day[meal] : [];
            plan[iso][meal] = slots
              .filter(s => s && s.recipeId)
              .map(s => ({ recipeId: s.recipeId, portions: s.portions || null }));
          }
        }
        out.planning = plan;
      }
    }
  } catch (_) {}

  // Liste de courses
  try {
    const raw = localStorage.getItem(LEGACY_KEYS.shopping);
    if (raw) {
      const old = JSON.parse(raw);
      if (Array.isArray(old) && old.length) {
        found = true;
        out.shopping = old.map(i => ({
          id: i.id || ('shop_' + Math.random().toString(36).slice(2, 8)),
          name: i.name || '', qty: Number(i.qty) || 1, unit: i.unit || '',
          aisle: i.aisle || 'other', checked: !!i.checked,
        }));
      }
    }
  } catch (_) {}

  await dbSet('migrated_v1', true);
  return found ? out : null;
}
