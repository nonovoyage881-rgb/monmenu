/* ════════════════════════════════════════════════════════════════
   store.js — Cœur métier : état global, persistance, calculs
   Importé par les vues et par app.js. Émet un événement 'change'
   sur un EventTarget pour permettre des re-rendus ciblés si besoin.
   ════════════════════════════════════════════════════════════════ */

import { dbGet, dbSet, dbClear, migrateLegacy } from './db.js';
import { initSync, pushCollection, syncEnabled } from './sync.js';
import {
  FOOD_DB, DEFAULT_FOOD, PIECE_GRAMS, DEFAULT_GOALS, SEASONAL_RECIPES, MEALS,
} from './config.js';
import { normalize, uid, weekDates, todayISO } from './utils.js';

/* Canal de synchronisation entre onglets ouverts */
const channel = ('BroadcastChannel' in window) ? new BroadcastChannel('monmenu-sync') : null;

/* État en mémoire */
export const state = {
  recipes: [],
  fridge: [],
  planning: {},     // { iso: { breakfast:[{recipeId,portions}], lunch:[], dinner:[], snack:[] } }
  shopping: [],
  goals: { ...DEFAULT_GOALS },
  settings: { ai: { provider: 'openai', model: 'gpt-4o-mini', baseUrl: '', key: '' }, sync: { url: '', anonKey: '', family: '' } },
};

/* Petit bus d'événements pour notifier les vues */
export const bus = new EventTarget();
const emit = () => bus.dispatchEvent(new Event('change'));

/* ───────── Initialisation ───────── */
export async function initStore() {
  // Migration éventuelle de la v1
  const migrated = await migrateLegacy();

  state.recipes  = (await dbGet('recipes'))  ?? migrated?.recipes  ?? [...SEASONAL_RECIPES.map(seedClone)];
  state.fridge   = (await dbGet('fridge'))   ?? migrated?.fridge   ?? [];
  state.planning = (await dbGet('planning')) ?? migrated?.planning ?? {};
  state.shopping = (await dbGet('shopping')) ?? migrated?.shopping ?? [];
  state.goals    = (await dbGet('goals'))    ?? { ...DEFAULT_GOALS };
  const savedSettings = await dbGet('settings');
  if (savedSettings) {
    state.settings = {
      ...state.settings, ...savedSettings,
      ai:   { ...state.settings.ai,   ...(savedSettings.ai   || {}) },
      sync: { ...state.settings.sync, ...(savedSettings.sync || {}) },
    };
  }

  // Si la migration a fourni des données, on les persiste dans IndexedDB
  if (migrated) { await persist('recipes'); await persist('fridge'); await persist('planning'); await persist('shopping'); }
  // Si tout premier lancement : on sème quelques recettes de saison
  if (!(await dbGet('recipes'))) await persist('recipes');

  // Écoute des autres onglets
  channel?.addEventListener('message', async (e) => {
    if (e.data?.key) {
      state[e.data.key] = (await dbGet(e.data.key)) ?? state[e.data.key];
      emit();
    }
  });

  // Synchronisation familiale (si configurée)
  if (syncEnabled(state.settings.sync)) startSync().catch(() => {});
}

/* Clone une recette de saison vers le carnet (avec nouvel id) */
function seedClone(r) {
  return { ...r, id: r.id, favorite: false, source: 'seed', image: null,
           createdAt: Date.now(), updatedAt: Date.now() };
}

/* Persistance d'une collection + diffusion aux autres onglets */
export async function persist(key) {
  await dbSet(key, state[key]);
  channel?.postMessage({ key, ts: Date.now() });
  pushCollection(key, state[key]); // synchro familiale (sans bloquer)
  emit();
}

/* Applique une modification reçue de la base partagée (sans la re-pousser) */
function applyRemote(coll, value) {
  state[coll] = value;
  dbSet(coll, value);
  emit();
}

/* Connecte (ou reconnecte) la synchronisation familiale selon les réglages */
export async function startSync() {
  const sy = state.settings.sync;
  if (!syncEnabled(sy)) return { ok: false, reason: 'INCOMPLETE' };
  return initSync(sy, applyRemote);
}

/* ───────── Recettes (CRUD) ───────── */
export function getRecipe(id) { return state.recipes.find(r => r.id === id); }

export async function addRecipe(recipe) {
  const r = {
    id: 'rec_' + uid(), name: 'Nouvelle recette', emoji: '🍳', image: null,
    category: 'Plat', origin: '', tags: [], portions: 4, prepTime: 0, cookTime: 0,
    ingredients: [], steps: [], nutrition: null, favorite: false, source: 'manual',
    createdAt: Date.now(), updatedAt: Date.now(), ...recipe,
  };
  state.recipes.unshift(r);
  await persist('recipes');
  return r;
}

export async function updateRecipe(id, patch) {
  const r = getRecipe(id);
  if (!r) return;
  Object.assign(r, patch, { updatedAt: Date.now() });
  await persist('recipes');
}

export async function deleteRecipe(id) {
  state.recipes = state.recipes.filter(r => r.id !== id);
  await persist('recipes');
}

export async function duplicateRecipe(id) {
  const r = getRecipe(id);
  if (!r) return;
  const copy = { ...structuredClone(r), id: 'rec_' + uid(), name: r.name + ' (copie)',
                 favorite: false, source: 'manual', createdAt: Date.now(), updatedAt: Date.now() };
  state.recipes.unshift(copy);
  await persist('recipes');
  return copy;
}

export async function toggleFavorite(id) {
  const r = getRecipe(id);
  if (!r) return;
  r.favorite = !r.favorite;
  await persist('recipes');
}

/* ───────── Frigo (CRUD) ───────── */
export async function addFridgeItem(item) {
  const it = { id: 'frg_' + uid(), name: '', qty: 1, unit: 'pièce', category: 'autres',
               emoji: '📦', expiry: null, addedAt: Date.now(), ...item };
  state.fridge.unshift(it);
  await persist('fridge');
  return it;
}
export async function updateFridgeItem(id, patch) {
  const it = state.fridge.find(f => f.id === id);
  if (it) { Object.assign(it, patch); await persist('fridge'); }
}
export async function deleteFridgeItem(id) {
  state.fridge = state.fridge.filter(f => f.id !== id);
  await persist('fridge');
}
/* Le frigo contient-il (au moins un peu) cet ingrédient ? */
export function fridgeHas(name) {
  const n = normalize(name);
  return state.fridge.some(f => normalize(f.name) === n || normalize(f.name).includes(n) || n.includes(normalize(f.name)));
}

/* ───────── Planning ───────── */
export function ensureDay(iso) {
  if (!state.planning[iso]) state.planning[iso] = { breakfast: [], lunch: [], dinner: [], snack: [] };
  return state.planning[iso];
}
export async function addToPlan(iso, meal, recipeId, portions = null) {
  ensureDay(iso)[meal].push({ recipeId, portions });
  await persist('planning');
}
export async function removeFromPlan(iso, meal, index) {
  ensureDay(iso)[meal].splice(index, 1);
  await persist('planning');
}
/* Déplace un slot d'un (jour,repas) vers un autre — pour le glisser-déposer */
export async function moveSlot(from, to) {
  const src = ensureDay(from.iso)[from.meal];
  if (!src[from.index]) return;
  const [slot] = src.splice(from.index, 1);
  ensureDay(to.iso)[to.meal].push(slot);
  await persist('planning');
}
export async function duplicateDay(fromISO, toISO) {
  const src = state.planning[fromISO];
  if (!src) return;
  state.planning[toISO] = structuredClone(src);
  await persist('planning');
}
/* Génération automatique d'une semaine à partir du carnet */
export async function autoGenerateWeek(anchorISO) {
  const pool = state.recipes.length ? state.recipes : SEASONAL_RECIPES;
  if (!pool.length) return;
  const pick = () => pool[Math.floor(Math.random() * pool.length)];
  for (const iso of weekDates(anchorISO)) {
    const day = ensureDay(iso);
    if (!day.lunch.length)  day.lunch  = [{ recipeId: pick().id, portions: null }];
    if (!day.dinner.length) day.dinner = [{ recipeId: pick().id, portions: null }];
  }
  await persist('planning');
}

/* ───────── Calculs nutrition & coût ───────── */
/* Convertit (qty, unit) d'un ingrédient en grammes pour les calculs */
function toGrams(name, qty, unit) {
  const u = (unit || '').toLowerCase();
  if (u === 'g' || u === 'gr' || u === 'grammes') return qty;
  if (u === 'kg') return qty * 1000;
  if (u === 'ml' || u === 'cl' || u === 'l') return u === 'cl' ? qty * 10 : u === 'l' ? qty * 1000 : qty;
  // pièce / unité / cuillère… → conversion approximative
  const n = normalize(name);
  const g = PIECE_GRAMS[n] ?? PIECE_GRAMS[Object.keys(PIECE_GRAMS).find(k => n.includes(k)) ] ?? PIECE_GRAMS._default;
  return qty * g;
}
/* Infos d'un ingrédient depuis la base (avec correspondance partielle) */
export function foodInfo(name) {
  const n = normalize(name);
  if (FOOD_DB[n]) return FOOD_DB[n];
  const key = Object.keys(FOOD_DB).find(k => n.includes(k) || k.includes(n));
  return key ? FOOD_DB[key] : DEFAULT_FOOD;
}
/* Nutrition + coût d'une recette (totaux et par portion) */
export function computeRecipe(recipe, portionsOverride = null) {
  const basePortions = recipe.portions || 1;
  let kcal = 0, p = 0, c = 0, f = 0, cost = 0;
  for (const ing of recipe.ingredients || []) {
    const info = foodInfo(ing.name);
    const grams = toGrams(ing.name, Number(ing.qty) || 0, ing.unit);
    const factor = grams / 100;
    kcal += info.kcal * factor;
    p += info.p * factor;
    c += info.c * factor;
    f += info.f * factor;
    cost += info.price * factor;
  }
  // Si l'utilisateur a fourni une nutrition explicite (ex : import API), on la respecte
  if (recipe.nutrition && recipe.nutrition.calories) {
    kcal = recipe.nutrition.calories * basePortions;
    p = (recipe.nutrition.protein || 0) * basePortions;
    c = (recipe.nutrition.carbs || 0) * basePortions;
    f = (recipe.nutrition.fat || 0) * basePortions;
  }
  const portions = portionsOverride || basePortions;
  const scale = portions / basePortions;
  return {
    total: { kcal: kcal * scale, protein: p * scale, carbs: c * scale, fat: f * scale, cost: cost * scale },
    perPortion: { kcal: kcal / basePortions, protein: p / basePortions, carbs: c / basePortions, fat: f / basePortions, cost: cost / basePortions },
    portions,
  };
}

/* Agrège nutrition + coût d'un jour planifié */
export function computeDay(iso) {
  const day = state.planning[iso];
  const acc = { kcal: 0, protein: 0, carbs: 0, fat: 0, cost: 0, count: 0 };
  if (!day) return acc;
  for (const meal of MEALS.map(m => m.key)) {
    for (const slot of day[meal] || []) {
      const r = getRecipe(slot.recipeId);
      if (!r) continue;
      const c = computeRecipe(r, slot.portions);
      acc.kcal += c.total.kcal; acc.protein += c.total.protein;
      acc.carbs += c.total.carbs; acc.fat += c.total.fat; acc.cost += c.total.cost; acc.count++;
    }
  }
  return acc;
}
export function computeWeek(iso) {
  return weekDates(iso).reduce((sum, d) => {
    const c = computeDay(d);
    sum.cost += c.cost; sum.kcal += c.kcal; sum.count += c.count;
    return sum;
  }, { cost: 0, kcal: 0, count: 0 });
}
/* Coût de chaque semaine planifiée (pour le graphique d'évolution) */
export function weeklyCostSeries() {
  const weeks = {};
  for (const iso of Object.keys(state.planning)) {
    const ws = weekDates(iso)[0];
    if (!(ws in weeks)) weeks[ws] = computeWeek(iso).cost;
  }
  return Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b)).map(([ws, cost]) => ({ week: ws, cost }));
}

/* ───────── Liste de courses ───────── */
/*
  Génère la liste depuis le planning :
  - parcourt tous les jours planifiés (ou une plage)
  - agrège par (nom normalisé + unité) en additionnant les quantités
  - classe par rayon, déduit ce que contient déjà le frigo
*/
export async function generateShopping(scope = 'all', anchorISO = todayISO()) {
  const isoList = scope === 'week' ? weekDates(anchorISO)
                : scope === 'day'  ? [anchorISO]
                : Object.keys(state.planning);

  const agg = {}; // clé = nom|unit
  for (const iso of isoList) {
    const day = state.planning[iso];
    if (!day) continue;
    for (const meal of MEALS.map(m => m.key)) {
      for (const slot of day[meal] || []) {
        const r = getRecipe(slot.recipeId);
        if (!r) continue;
        const scale = (slot.portions || r.portions) / (r.portions || 1);
        for (const ing of r.ingredients || []) {
          const key = normalize(ing.name) + '|' + (ing.unit || '');
          if (!agg[key]) {
            const info = foodInfo(ing.name);
            agg[key] = { name: ing.name, unit: ing.unit || '', qty: 0, aisle: info.aisle, emoji: info.emoji };
          }
          agg[key].qty += (Number(ing.qty) || 0) * scale;
        }
      }
    }
  }

  // Conserve l'état "coché" des articles déjà présents
  const prevChecked = new Map(state.shopping.map(s => [normalize(s.name) + '|' + s.unit, s.checked]));

  state.shopping = Object.values(agg).map(x => ({
    id: 'shop_' + uid(),
    name: x.name, qty: Math.round(x.qty * 10) / 10, unit: x.unit,
    aisle: x.aisle, emoji: x.emoji,
    inFridge: fridgeHas(x.name),
    checked: prevChecked.get(normalize(x.name) + '|' + x.unit) || false,
  }));
  await persist('shopping');
}
export async function toggleShopItem(id) {
  const it = state.shopping.find(s => s.id === id);
  if (it) { it.checked = !it.checked; await persist('shopping'); }
}
export async function clearChecked() {
  state.shopping = state.shopping.filter(s => !s.checked);
  await persist('shopping');
}

/* ───────── Suggestions anti-gaspillage ───────── */
/* Recettes réalisables / proches avec le contenu du frigo, triées par couverture */
export function recipesFromFridge() {
  return state.recipes
    .map(r => {
      const ings = r.ingredients || [];
      if (!ings.length) return { r, ratio: 0, have: 0, total: 0 };
      const have = ings.filter(i => fridgeHas(i.name)).length;
      return { r, ratio: have / ings.length, have, total: ings.length };
    })
    .filter(x => x.have > 0)
    .sort((a, b) => b.ratio - a.ratio);
}

/* ───────── Réglages & objectifs ───────── */
export async function setGoals(goals) { state.goals = { ...state.goals, ...goals }; await persist('goals'); }
export async function setAISettings(ai) { state.settings.ai = { ...state.settings.ai, ...ai }; await persist('settings'); }

/* Enregistre la config de synchronisation familiale et (re)connecte */
export async function setSyncSettings(sync) {
  state.settings.sync = { ...state.settings.sync, ...sync };
  await persist('settings');
  return startSync();
}

/* ───────── Import / export / reset ───────── */
export function exportData() {
  return JSON.stringify({
    version: 2, exportedAt: new Date().toISOString(),
    recipes: state.recipes, fridge: state.fridge, planning: state.planning,
    shopping: state.shopping, goals: state.goals,
  }, null, 2);
}
export async function importData(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (data.recipes)  { state.recipes  = data.recipes;  await persist('recipes'); }
  if (data.fridge)   { state.fridge   = data.fridge;   await persist('fridge'); }
  if (data.planning) { state.planning = data.planning; await persist('planning'); }
  if (data.shopping) { state.shopping = data.shopping; await persist('shopping'); }
  if (data.goals)    { state.goals    = data.goals;    await persist('goals'); }
}
export async function resetAll() {
  await dbClear();
  state.recipes = SEASONAL_RECIPES.map(seedClone);
  state.fridge = []; state.planning = {}; state.shopping = [];
  state.goals = { ...DEFAULT_GOALS };
  await persist('recipes'); await persist('fridge'); await persist('planning'); await persist('shopping'); await persist('goals');
}
