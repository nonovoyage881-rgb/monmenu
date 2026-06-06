/* ════════════════════════════════════════════════════════════════
   views.js — Rendu de chaque vue de l'application
   Chaque fonction render*() peint le contenu d'une section.
   app.js appelle renderView(nom) à la navigation et à chaque
   événement 'change' du store (re-rendu de la vue active).
   Les contrôles statiques (chips, segments, recherche) sont câblés
   une seule fois par app.js ; les éléments injectés ici reçoivent
   leurs écouteurs juste après l'injection.
   ════════════════════════════════════════════════════════════════ */

import {
  state, getRecipe, addRecipe, toggleFavorite,
  computeDay, computeWeek, weeklyCostSeries, recipesFromFridge,
  removeFromPlan, moveSlot, duplicateDay, addToPlan,
  toggleShopItem, deleteFridgeItem, setGoals,
} from './store.js';
import { searchByName, filterBy } from './api.js';
import {
  recipeCardHTML, listItemHTML, openRecipeSheet, openRecipePicker, openFridgeForm,
} from './ui.js';
import {
  MEALS, AISLES, FRIDGE_CATEGORIES, MEALDB_CATEGORIES, MEALDB_AREAS, SEASONAL_RECIPES, fr,
} from './config.js';
import {
  esc, euro, round, qtyFmt, todayISO, addDays, weekStart, weekDates,
  fmtDay, fmtShort, daysUntil, toast,
} from './utils.js';

/* ───────── État local des vues (filtres, mode, date sélectionnée) ───────── */
export const vstate = {
  discover: { mode: 'name', search: '', facet: null, results: [], loading: false, error: '' },
  carnet:   { search: '', filter: 'all' },
  planning: { mode: 'day', selected: todayISO() },
  frigo:    { search: '', cat: 'all', showCook: false },
};

/* Dispatcher appelé par app.js */
export function renderView(view) {
  switch (view) {
    case 'decouverte': return renderDiscover();
    case 'assistant':  return renderAssistant();
    case 'carnet':     return renderCarnet();
    case 'planning':   return renderPlanning();
    case 'frigo':      return renderFrigo();
    case 'courses':    return renderCourses();
    case 'budget':     return renderBudget();
    case 'reglages':   return renderReglages();
  }
}

/* Relie le clic d'une carte / élément de recette à l'ouverture de la fiche */
function wireRecipeCards(container, pool) {
  container.querySelectorAll('[data-recipe]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-fav]')) return; // géré séparément
      const id = el.dataset.recipe;
      const recipe = pool.find(r => r.id === id) || getRecipe(id);
      if (recipe) openRecipeSheet(recipe);
    });
  });
  container.querySelectorAll('[data-fav]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.fav;
      if (getRecipe(id)) { await toggleFavorite(id); }
      else {
        const recipe = pool.find(r => r.id === id);
        if (recipe) { const saved = await addRecipe({ ...recipe, favorite: true }); recipe.id = saved.id; toast('Ajouté aux favoris ❤️'); }
      }
    });
  });
}

/* ═══════════════════════ 1. DÉCOUVRIR ═══════════════════════ */
export function renderDiscover() {
  const d = vstate.discover;
  const facets = document.getElementById('discover-facets');
  const grid = document.getElementById('discover-grid');
  const count = document.getElementById('discover-count');
  const status = document.getElementById('discover-status');
  if (!grid) return;

  // Facettes selon le mode (catégorie / pays)
  if (d.mode === 'category' || d.mode === 'area') {
    const list = d.mode === 'category' ? MEALDB_CATEGORIES : MEALDB_AREAS;
    facets.classList.remove('hidden');
    facets.innerHTML = list.map(v =>
      `<span class="chip ${d.facet === v ? 'active' : ''}" data-facet="${esc(v)}">${esc(fr(v))}</span>`).join('');
    facets.querySelectorAll('[data-facet]').forEach(c => c.addEventListener('click', () => {
      d.facet = c.dataset.facet; runDiscoverQuery();
    }));
  } else {
    facets.classList.add('hidden');
    facets.innerHTML = '';
  }

  // Mode « suggestions de saison » : pas de réseau
  if (d.mode === 'local') {
    d.results = SEASONAL_RECIPES;
    d.error = '';
  }

  if (d.loading) { status.innerHTML = '<div class="empty"><span class="spinner"></span> Recherche en cours…</div>'; }
  else if (d.error) { status.innerHTML = `<div class="empty">⚠️ ${esc(d.error)}</div>`; }
  else status.innerHTML = '';

  const hint = {
    name: 'Tapez un nom de plat puis Entrée…',
    ingredient: 'Tapez un ingrédient (ex : chicken) puis Entrée…',
    category: 'Choisissez une catégorie ci-dessus.',
    area: 'Choisissez un pays ci-dessus.',
    local: 'Nos suggestions de saison, prêtes à cuisiner.',
  }[d.mode];

  count.textContent = d.results.length ? `${d.results.length} recette(s)` : hint;
  if (d.results.length) {
    grid.innerHTML = d.results.map(recipeCardHTML).join('');
    wireRecipeCards(grid, d.results);
  } else if (!d.loading && !d.error && (d.search.trim() || d.facet)) {
    const q = d.search.trim() || d.facet;
    grid.innerHTML = `<div class="empty">Aucune recette trouvée pour « ${esc(q)} ».<br>Essayez un autre mot, ou créez-la vous-même dans « Mon carnet ».</div>`;
  } else {
    grid.innerHTML = '';
  }
}

/* Recherche dans les recettes locales (carnet + suggestions de saison) */
function searchLocal(q) {
  const n = q.toLowerCase();
  const pool = [...state.recipes, ...SEASONAL_RECIPES];
  const seen = new Set();
  return pool.filter(r => {
    if (!r || !r.name) return false;
    const hit = r.name.toLowerCase().includes(n)
      || (r.category || '').toLowerCase().includes(n)
      || (r.origin || '').toLowerCase().includes(n);
    if (!hit) return false;
    const key = (r.id || r.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* Lance la requête réseau selon le mode courant (appelée par app.js et les facettes) */
export async function runDiscoverQuery() {
  const d = vstate.discover;
  d.error = '';
  try {
    if (d.mode === 'local') { d.results = SEASONAL_RECIPES; renderDiscover(); return; }
    if (d.mode === 'name') {
      const q = d.search.trim();
      if (!q) { d.results = []; renderDiscover(); return; }
      d.loading = true; renderDiscover();
      const local = searchLocal(q);
      let online = [];
      try { online = await searchByName(q); } catch { online = []; }
      const seen = new Set(local.map(r => (r.name || '').toLowerCase()));
      d.results = [...local, ...online.filter(r => !seen.has((r.name || '').toLowerCase()))];
    } else if (d.mode === 'ingredient') {
      if (!d.search.trim()) { d.results = []; renderDiscover(); return; }
      d.loading = true; renderDiscover();
      d.results = await filterBy('ingredient', d.search.trim());
    } else if (d.mode === 'category' || d.mode === 'area') {
      if (!d.facet) { d.results = []; renderDiscover(); return; }
      d.loading = true; renderDiscover();
      d.results = await filterBy(d.mode, d.facet);
    }
  } catch (e) {
    d.error = 'Impossible de joindre TheMealDB. Vérifiez votre connexion.';
    d.results = [];
  } finally {
    d.loading = false;
    renderDiscover();
  }
}

/* ═══════════════════════ 2. ASSISTANT IA ═══════════════════════ */
/* Le rendu de base est statique (textarea + pills) ; on n'efface pas le résultat. */
export function renderAssistant() { /* contenu géré par app.js (envoi + résultat) */ }

/* Affiche le résultat structuré renvoyé par l'IA */
export function renderAIResult(result) {
  const box = document.getElementById('ai-result');
  if (!box) return;

  if (result.type === 'text' || (!result.recipe && !result.menu)) {
    box.innerHTML = `<div class="assistant-bubble">${esc(result.message || 'Aucune suggestion.')}</div>`;
    return;
  }

  if (result.type === 'recipe' && result.recipe) {
    const r = result.recipe;
    box.innerHTML =
      `${result.message ? `<div class="assistant-bubble mb-16">${esc(result.message)}</div>` : ''}
       <div class="recipe-grid">${recipeCardHTML(r)}</div>`;
    wireRecipeCards(box, [r]);
    return;
  }

  if (result.type === 'menu' && Array.isArray(result.menu)) {
    const pool = [];
    const daysHTML = result.menu.map(day => {
      const meals = Object.entries(day.meals || {}).map(([mealKey, rec]) => {
        pool.push(rec);
        const meal = MEALS.find(m => m.key === mealKey);
        return `<div class="slot filled" data-recipe="${esc(rec.id)}">
            <span class="slot-emoji">${rec.emoji || '🍽️'}</span>
            <span class="slot-value">${esc(rec.name)}<small>${meal ? meal.label : mealKey}</small></span>
          </div>`;
      }).join('');
      return `<div class="meal-block">
          <div class="meal-head"><span class="ttl">${esc(day.day || 'Jour')}</span></div>
          ${meals}
        </div>`;
    }).join('');
    box.innerHTML =
      `${result.message ? `<div class="assistant-bubble mb-16">${esc(result.message)}</div>` : ''}
       ${daysHTML}
       <button class="btn btn-accent btn-block mt-16" id="ai-save-menu">📅 Enregistrer ce menu dans mon carnet</button>`;
    wireRecipeCards(box, pool);
    document.getElementById('ai-save-menu').onclick = async () => {
      for (const rec of pool) await addRecipe({ ...rec });
      toast(`${pool.length} recettes ajoutées au carnet ✨`);
    };
    return;
  }

  box.innerHTML = `<div class="assistant-bubble">${esc(result.message || 'Réponse non reconnue.')}</div>`;
}

export function renderAILoading() {
  const box = document.getElementById('ai-result');
  if (box) box.innerHTML = '<div class="empty"><span class="spinner"></span> L\'assistant réfléchit…</div>';
}

export function renderAIError(err) {
  const box = document.getElementById('ai-result');
  if (!box) return;
  if (err && err.code === 'NO_KEY') {
    box.innerHTML = `<div class="alert-banner warn">
        <span class="ico">🔑</span>
        <span>Aucune clé d'API configurée. Rendez-vous dans <b>Réglages → Assistant IA</b> pour ajouter votre clé (OpenAI ou Anthropic). Elle reste stockée sur cet appareil.</span>
      </div>`;
  } else {
    box.innerHTML = `<div class="alert-banner danger"><span class="ico">⚠️</span><span>${esc((err && err.message) || 'Erreur inconnue')}</span></div>`;
  }
}

/* ═══════════════════════ 3. MON CARNET ═══════════════════════ */
export function renderCarnet() {
  const c = vstate.carnet;
  const list = document.getElementById('carnet-list');
  const count = document.getElementById('carnet-count');
  if (!list) return;

  let items = state.recipes.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (c.filter === 'fav') items = items.filter(r => r.favorite);
  if (c.search.trim()) {
    const q = c.search.toLowerCase();
    items = items.filter(r => r.name.toLowerCase().includes(q) || (r.category || '').toLowerCase().includes(q));
  }

  count.textContent = `${items.length} recette(s)`;
  list.innerHTML = items.length
    ? items.map(listItemHTML).join('')
    : '<div class="empty">Aucune recette. Créez-en une avec le bouton ＋, importez depuis « Découvrir » ou demandez à l\'IA.</div>';
  wireRecipeCards(list, state.recipes);
}

/* ═══════════════════════ 4. PLANNING ═══════════════════════ */
export function renderPlanning() {
  const p = vstate.planning;
  const body = document.getElementById('plan-body');
  if (!body) return;
  if (p.mode === 'day') renderPlanDay(body);
  else if (p.mode === 'week') renderPlanWeek(body);
  else renderPlanMonth(body);
  renderPlanKpis();
}

function slotFilledHTML(iso, mealKey, slot, index) {
  const r = getRecipe(slot.recipeId);
  const name = r ? r.name : 'Recette introuvable';
  const emoji = r ? (r.emoji || '🍽️') : '❓';
  return `<div class="slot filled" draggable="true"
      data-iso="${iso}" data-meal="${mealKey}" data-index="${index}" data-rid="${esc(slot.recipeId)}">
      <span class="slot-emoji">${emoji}</span>
      <span class="slot-value">${esc(name)}${slot.portions ? `<small>${slot.portions} pers.</small>` : ''}</span>
      <button class="slot-x" data-rm title="Retirer">×</button>
    </div>`;
}

function renderPlanDay(body) {
  const p = vstate.planning;
  const week = weekDates(p.selected);
  const today = todayISO();

  const strip = week.map(iso => {
    const dd = new Date(iso + 'T00:00');
    const planned = state.planning[iso] && MEALS.some(m => (state.planning[iso][m.key] || []).length);
    return `<button class="day-chip ${iso === p.selected ? 'active' : ''} ${iso === today ? 'today' : ''}" data-day="${iso}">
        <span class="dc-name">${dd.toLocaleDateString('fr-FR', { weekday: 'short' })}</span>
        <span class="dc-num">${dd.getDate()}</span>
        ${planned ? '<span class="dc-dot"></span>' : ''}
      </button>`;
  }).join('');

  const meals = MEALS.map(m => {
    const slots = (state.planning[p.selected]?.[m.key]) || [];
    const slotsHTML = slots.length
      ? slots.map((s, i) => slotFilledHTML(p.selected, m.key, s, i)).join('')
      : '';
    return `<div class="meal-block">
        <div class="meal-head">
          <span class="ttl"><span class="ico">${m.icon}</span>${m.label}</span>
        </div>
        ${slotsHTML}
        <div class="slot" data-add data-iso="${p.selected}" data-meal="${m.key}">
          <span class="slot-emoji">＋</span><span class="slot-value slot-empty">Ajouter un plat…</span>
        </div>
      </div>`;
  }).join('');

  body.innerHTML = `
    <div class="week-strip">${strip}</div>
    <div class="day-nav">
      <button class="icon-btn" data-nav="-1">‹</button>
      <span class="day-nav-label">${fmtDay(p.selected)}</span>
      <button class="icon-btn" data-nav="1">›</button>
    </div>
    <div class="row between mb-16">
      <button class="btn btn-ghost btn-sm" data-dupday>📑 Dupliquer ce jour → demain</button>
    </div>
    ${meals}`;

  // Navigation jours
  body.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { p.selected = b.dataset.day; renderPlanning(); });
  body.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { p.selected = addDays(p.selected, Number(b.dataset.nav)); renderPlanning(); });
  body.querySelector('[data-dupday]').onclick = async () => { await duplicateDay(p.selected, addDays(p.selected, 1)); toast('Jour dupliqué sur demain'); };

  // Ajout / retrait
  body.querySelectorAll('[data-add]').forEach(el => el.onclick = () => {
    const { iso, meal } = el.dataset;
    openRecipePicker(rid => addToPlan(iso, meal, rid).then(() => toast('Plat ajouté 📅')));
  });
  body.querySelectorAll('[data-rm]').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const s = btn.closest('.slot');
    removeFromPlan(s.dataset.iso, s.dataset.meal, Number(s.dataset.index));
  });
  // Ouverture fiche au clic sur un slot rempli
  body.querySelectorAll('.slot.filled').forEach(s => s.addEventListener('click', (e) => {
    if (e.target.closest('[data-rm]')) return;
    const r = getRecipe(s.dataset.rid); if (r) openRecipeSheet(r);
  }));

  attachDnD(body);
}

function renderPlanWeek(body) {
  const p = vstate.planning;
  const week = weekDates(p.selected);
  const today = todayISO();

  const cols = week.map(iso => {
    const dd = new Date(iso + 'T00:00');
    const mealsHTML = MEALS.filter(m => m.key !== 'snack').map(m => {
      const slots = (state.planning[iso]?.[m.key]) || [];
      const filled = slots.map((s, i) => {
        const r = getRecipe(s.recipeId);
        return `<div class="mini-slot" draggable="true" data-iso="${iso}" data-meal="${m.key}" data-index="${i}" data-rid="${esc(s.recipeId)}">
            <span class="ml">${m.label}</span>${esc(r ? r.name : '—')}
          </div>`;
      }).join('');
      const add = `<div class="mini-slot empty" data-add data-iso="${iso}" data-meal="${m.key}"><span class="ml">${m.label}</span>＋</div>`;
      return filled + (slots.length ? '' : add);
    }).join('');
    return `<div class="week-col ${iso === today ? 'today' : ''}" data-col="${iso}">
        <div class="wc-head">${dd.toLocaleDateString('fr-FR', { weekday: 'short' })}<b>${dd.getDate()}</b></div>
        ${mealsHTML}
      </div>`;
  }).join('');

  body.innerHTML = `
    <div class="day-nav">
      <button class="icon-btn" data-wnav="-7">‹</button>
      <span class="day-nav-label">Semaine du ${fmtShort(weekStart(p.selected))}</span>
      <button class="icon-btn" data-wnav="7">›</button>
    </div>
    <div class="week-grid">${cols}</div>`;

  body.querySelectorAll('[data-wnav]').forEach(b => b.onclick = () => { p.selected = addDays(p.selected, Number(b.dataset.wnav)); renderPlanning(); });
  body.querySelectorAll('[data-add]').forEach(el => el.onclick = () => {
    const { iso, meal } = el.dataset;
    openRecipePicker(rid => addToPlan(iso, meal, rid).then(() => toast('Plat ajouté 📅')));
  });
  body.querySelectorAll('.mini-slot[data-rid]').forEach(s => s.addEventListener('click', () => {
    const r = getRecipe(s.dataset.rid); if (r) openRecipeSheet(r);
  }));
  attachDnD(body);
}

function renderPlanMonth(body) {
  const p = vstate.planning;
  const base = new Date(p.selected + 'T00:00');
  const year = base.getFullYear(), month = base.getMonth();
  const first = new Date(year, month, 1);
  const startISO = weekStart(`${year}-${String(month + 1).padStart(2, '0')}-01`);
  const today = todayISO();

  const headers = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => `<div class="mh">${d}</div>`).join('');
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const iso = addDays(startISO, i);
    const dd = new Date(iso + 'T00:00');
    const inMonth = dd.getMonth() === month;
    const day = state.planning[iso];
    const n = day ? MEALS.reduce((s, m) => s + (day[m.key]?.length || 0), 0) : 0;
    const dots = n ? `<div class="dots">${Array.from({ length: Math.min(n, 4) }, () => '<i></i>').join('')}</div>` : '';
    cells += `<div class="mcell ${inMonth ? '' : 'dim'} ${iso === today ? 'today' : ''}" data-mday="${iso}">
        <span class="d">${dd.getDate()}</span>${dots}
      </div>`;
    if (i >= 34 && dd.getMonth() !== month && i % 7 === 6) break; // stoppe après dernière semaine utile
  }

  body.innerHTML = `
    <div class="day-nav">
      <button class="icon-btn" data-mnav="-1">‹</button>
      <span class="day-nav-label">${first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</span>
      <button class="icon-btn" data-mnav="1">›</button>
    </div>
    <div class="month-grid">${headers}${cells}</div>`;

  body.querySelectorAll('[data-mnav]').forEach(b => b.onclick = () => {
    const dir = Number(b.dataset.mnav);
    p.selected = new Date(year, month + dir, 1).toISOString().slice(0, 10);
    renderPlanning();
  });
  body.querySelectorAll('[data-mday]').forEach(c => c.onclick = () => {
    p.selected = c.dataset.mday; p.mode = 'day';
    document.querySelectorAll('#plan-mode button').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === 'day'));
    renderPlanning();
  });
}

function renderPlanKpis() {
  const el = document.getElementById('plan-kpis');
  if (!el) return;
  const p = vstate.planning;
  const day = computeDay(p.selected);
  const week = computeWeek(p.selected);
  el.innerHTML = `
    <div class="kpi"><div class="v">${euro(day.cost)}</div><div class="l">Coût du jour</div></div>
    <div class="kpi"><div class="v">${Math.round(day.kcal)}<small> kcal</small></div><div class="l">Énergie du jour</div></div>
    <div class="kpi"><div class="v">${euro(week.cost)}</div><div class="l">Coût semaine</div></div>
    <div class="kpi"><div class="v">${week.count}</div><div class="l">Repas planifiés (sem.)</div></div>`;
}

/* ───────── Glisser-déposer des créneaux ───────── */
function attachDnD(root) {
  let dragData = null;
  root.querySelectorAll('[draggable="true"]').forEach(el => {
    el.addEventListener('dragstart', () => {
      dragData = { iso: el.dataset.iso, meal: el.dataset.meal, index: Number(el.dataset.index) };
      el.style.opacity = '0.4';
    });
    el.addEventListener('dragend', () => { el.style.opacity = '1'; });
  });
  // Zones de dépôt : blocs repas (jour) ou colonnes (semaine)
  const zones = root.querySelectorAll('.meal-block, .week-col, .slot, .mini-slot');
  zones.forEach(z => {
    z.addEventListener('dragover', (e) => { e.preventDefault(); z.classList.add('dragover'); });
    z.addEventListener('dragleave', () => z.classList.remove('dragover'));
    z.addEventListener('drop', async (e) => {
      e.preventDefault(); z.classList.remove('dragover');
      if (!dragData) return;
      // Détermine la cible (iso/meal) à partir de la zone
      let target = null;
      const host = z.closest('[data-iso]') || z;
      if (z.classList.contains('week-col')) {
        target = { iso: z.dataset.col, meal: dragData.meal };
      } else if (host.dataset && host.dataset.iso && host.dataset.meal) {
        target = { iso: host.dataset.iso, meal: host.dataset.meal };
      } else if (z.closest('.meal-block')) {
        const add = z.closest('.meal-block').querySelector('[data-add]');
        if (add) target = { iso: add.dataset.iso, meal: add.dataset.meal };
      }
      if (target) { await moveSlot(dragData, target); dragData = null; }
    });
  });
}

/* ═══════════════════════ 5. MON FRIGO ═══════════════════════ */
export function renderFrigo() {
  const f = vstate.frigo;
  const list = document.getElementById('frigo-list');
  const stats = document.getElementById('frigo-stats');
  const alerts = document.getElementById('frigo-alerts');
  const count = document.getElementById('frigo-count');
  if (!list) return;

  const all = state.fridge;
  const soon = all.filter(i => { const d = daysUntil(i.expiry); return d !== null && d >= 0 && d <= 3; });
  const over = all.filter(i => { const d = daysUntil(i.expiry); return d !== null && d < 0; });

  // Bannières d'alerte
  let alertHTML = '';
  if (over.length) alertHTML += `<div class="alert-banner danger"><span class="ico">⛔</span><span><b>${over.length}</b> produit(s) périmé(s) : ${over.map(i => esc(i.name)).join(', ')}.</span></div>`;
  if (soon.length) alertHTML += `<div class="alert-banner warn"><span class="ico">⏳</span><span><b>${soon.length}</b> produit(s) bientôt périmé(s) — pensez à les cuisiner vite.</span></div>`;
  alerts.innerHTML = alertHTML;

  // Statistiques
  stats.innerHTML = `
    <div class="kpi"><div class="v">${all.length}</div><div class="l">Aliments</div></div>
    <div class="kpi"><div class="v">${soon.length}</div><div class="l">Bientôt périmés</div></div>
    <div class="kpi"><div class="v">${over.length}</div><div class="l">Périmés</div></div>`;

  // Suggestions « que cuisiner »
  if (f.showCook) {
    const sugg = recipesFromFridge().slice(0, 6);
    const cards = sugg.length
      ? sugg.map(({ r, have, total }) =>
          `<div class="list-item" data-recipe="${esc(r.id)}">
            <div class="li-thumb">${r.emoji || '🍽️'}</div>
            <div class="li-info"><div class="li-name">${esc(r.name)}</div>
              <div class="li-sub"><span class="t-sage">${have}/${total} ingrédients en stock</span></div></div>
            <span class="icon-btn">›</span>
          </div>`).join('')
      : '<div class="empty">Ajoutez des aliments et des recettes pour obtenir des suggestions anti-gaspillage.</div>';
    alerts.innerHTML += `<div class="card mb-16"><h3 class="sec-label" style="margin-top:0;">🍳 À cuisiner avec votre frigo</h3>${cards}</div>`;
    wireRecipeCards(alerts, state.recipes);
  }

  // Liste filtrée
  let items = all.slice();
  if (f.cat !== 'all') items = items.filter(i => (i.category || 'autres') === f.cat);
  if (f.search.trim()) { const q = f.search.toLowerCase(); items = items.filter(i => i.name.toLowerCase().includes(q)); }
  // Tri : périmés/bientôt en premier
  items.sort((a, b) => {
    const da = daysUntil(a.expiry), db = daysUntil(b.expiry);
    if (da === null) return db === null ? 0 : 1;
    if (db === null) return -1;
    return da - db;
  });

  count.textContent = `${items.length} aliment(s)`;
  list.innerHTML = items.length ? items.map(fridgeItemHTML).join('')
    : '<div class="empty">Frigo vide pour cette catégorie. Ajoutez vos stocks avec le bouton ＋.</div>';

  list.querySelectorAll('[data-edit-fr]').forEach(b => b.onclick = () => {
    const it = state.fridge.find(x => x.id === b.dataset.editFr); if (it) openFridgeForm(it);
  });
  list.querySelectorAll('[data-del-fr]').forEach(b => b.onclick = async () => {
    await deleteFridgeItem(b.dataset.delFr); toast('Aliment retiré');
  });
}

function fridgeItemHTML(i) {
  const d = daysUntil(i.expiry);
  let cls = '', exp = '';
  if (d !== null) {
    if (d < 0) { cls = 'exp-over'; exp = `<span class="t-danger">Périmé depuis ${-d} j</span>`; }
    else if (d <= 3) { cls = 'exp-soon'; exp = `<span class="t-gold">Périme dans ${d} j</span>`; }
    else exp = `<span>Périme le ${fmtShort(i.expiry)}</span>`;
  }
  const cat = FRIDGE_CATEGORIES[i.category] || FRIDGE_CATEGORIES.autres;
  return `<div class="fridge-item ${cls}">
      <span class="fi-emoji">${i.emoji || cat.emoji}</span>
      <div class="fi-info">
        <div class="fi-name">${esc(i.name)}</div>
        <div class="fi-sub"><span>${qtyFmt(i.qty)} ${esc(i.unit || '')}</span><span>· ${cat.label}</span>${exp ? '· ' + exp : ''}</div>
      </div>
      <div class="fi-actions">
        <button class="icon-btn" data-edit-fr="${esc(i.id)}" title="Modifier">✏️</button>
        <button class="icon-btn" data-del-fr="${esc(i.id)}" title="Supprimer">🗑️</button>
      </div>
    </div>`;
}

/* ═══════════════════════ 6. COURSES ═══════════════════════ */
export function renderCourses() {
  const list = document.getElementById('courses-list');
  const count = document.getElementById('courses-count');
  const wrap = document.getElementById('courses-progress');
  if (!list) return;

  const items = state.shopping;
  count.textContent = items.length;

  // Progression
  const done = items.filter(i => i.checked).length;
  if (items.length) {
    wrap.classList.remove('hidden');
    const pct = Math.round((done / items.length) * 100);
    document.getElementById('courses-prog-label').textContent = `${done} / ${items.length} articles`;
    document.getElementById('courses-prog-pct').textContent = `${pct} %`;
    document.getElementById('courses-prog-fill').style.width = pct + '%';
  } else {
    wrap.classList.add('hidden');
  }

  if (!items.length) {
    list.innerHTML = '<div class="empty">Liste vide. Planifiez des repas puis appuyez sur « Générer depuis le planning ».</div>';
    return;
  }

  // Groupement par rayon
  const groups = {};
  for (const it of items) (groups[it.aisle] || (groups[it.aisle] = [])).push(it);

  list.innerHTML = Object.keys(AISLES).filter(a => groups[a]).map(aisle => {
    const rows = groups[aisle].map(it => `
      <div class="shop-item ${it.checked ? 'checked' : ''}" data-shop="${esc(it.id)}">
        <div class="shop-check">✓</div>
        <div class="shop-name">${it.emoji || ''} ${esc(it.name)} ${it.inFridge ? '<span class="shop-have">· déjà au frigo</span>' : ''}</div>
        <span class="shop-qty">${it.qty ? qtyFmt(it.qty) : ''} ${esc(it.unit || '')}</span>
      </div>`).join('');
    return `<div class="shop-group">
        <div class="shop-group-head"><span class="ico">${AISLES[aisle].icon}</span><b>${AISLES[aisle].label}</b></div>
        ${rows}
      </div>`;
  }).join('');

  list.querySelectorAll('[data-shop]').forEach(el => el.onclick = () => toggleShopItem(el.dataset.shop));
}

/* Construit le HTML imprimable / PDF de la liste de courses */
export function shoppingPlainText() {
  const items = state.shopping;
  const groups = {};
  for (const it of items) (groups[it.aisle] || (groups[it.aisle] = [])).push(it);
  let out = 'MonMenu — Liste de courses\n\n';
  for (const a of Object.keys(AISLES)) {
    if (!groups[a]) continue;
    out += `${AISLES[a].label.toUpperCase()}\n`;
    for (const it of groups[a]) out += `  [ ] ${it.name} — ${qtyFmt(it.qty)} ${it.unit || ''}\n`;
    out += '\n';
  }
  return out;
}

/* ═══════════════════════ 7. BUDGET & NUTRITION ═══════════════════════ */
export function renderBudget() {
  const kpis = document.getElementById('budget-kpis');
  if (!kpis) return;
  const sel = vstate.planning.selected;
  const day = computeDay(sel);
  const week = computeWeek(sel);
  const month = monthlyCost(sel);

  kpis.innerHTML = `
    <div class="kpi"><div class="v">${euro(day.cost)}</div><div class="l">Jour sélectionné</div></div>
    <div class="kpi"><div class="v">${euro(week.cost)}</div><div class="l">Semaine</div></div>
    <div class="kpi"><div class="v">${euro(month)}</div><div class="l">Mois (estimé)</div></div>
    <div class="kpi"><div class="v">${euro(week.count ? week.cost / week.count : 0)}</div><div class="l">Coût moyen / repas</div></div>`;

  drawCostChart();
  renderNutritionToday(sel, day);
  renderGoalsForm();
}

function monthlyCost(iso) {
  const base = new Date(iso + 'T00:00');
  const y = base.getFullYear(), m = base.getMonth();
  let total = 0;
  for (const k of Object.keys(state.planning)) {
    const d = new Date(k + 'T00:00');
    if (d.getFullYear() === y && d.getMonth() === m) total += computeDay(k).cost;
  }
  return total;
}

/* Graphique d'évolution du coût hebdomadaire (canvas simple, sans librairie) */
function drawCostChart() {
  const canvas = document.getElementById('budget-chart');
  if (!canvas) return;
  const series = weeklyCostSeries();
  const ratio = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 600, H = 200;
  canvas.width = W * ratio; canvas.height = H * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, W, H);

  const css = getComputedStyle(document.documentElement);
  const terra = css.getPropertyValue('--terra').trim() || '#D67D4A';
  const muted = css.getPropertyValue('--muted').trim() || '#9b9384';
  const text = css.getPropertyValue('--text').trim() || '#2b2722';

  if (!series.length) {
    ctx.fillStyle = muted; ctx.font = '14px DM Sans, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Aucune semaine planifiée pour le moment.', W / 2, H / 2);
    return;
  }

  const pad = { l: 44, r: 16, t: 18, b: 28 };
  const max = Math.max(...series.map(s => s.cost), 10) * 1.15;
  const plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b;
  const n = series.length;
  const barW = Math.min(46, plotW / n * 0.6);
  const gap = plotW / n;

  // Axe + graduations
  ctx.strokeStyle = muted; ctx.globalAlpha = 0.25; ctx.lineWidth = 1;
  ctx.fillStyle = muted; ctx.globalAlpha = 1; ctx.font = '10px DM Sans, sans-serif'; ctx.textAlign = 'right';
  for (let g = 0; g <= 4; g++) {
    const val = (max / 4) * g;
    const y = pad.t + plotH - (val / max) * plotH;
    ctx.globalAlpha = 0.2; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillText(Math.round(val) + '€', pad.l - 6, y + 3);
  }

  // Barres
  series.forEach((s, i) => {
    const x = pad.l + gap * i + (gap - barW) / 2;
    const h = (s.cost / max) * plotH;
    const y = pad.t + plotH - h;
    ctx.fillStyle = terra;
    const r = 6;
    ctx.beginPath();
    ctx.moveTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.lineTo(x + barW - r, y); ctx.arcTo(x + barW, y, x + barW, y + r, r);
    ctx.lineTo(x + barW, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();

    ctx.fillStyle = text; ctx.textAlign = 'center'; ctx.font = '600 10px DM Sans, sans-serif';
    ctx.fillText(euro(s.cost), x + barW / 2, y - 5);
    ctx.fillStyle = muted; ctx.font = '10px DM Sans, sans-serif';
    ctx.fillText(fmtShort(s.week), x + barW / 2, H - 10);
  });
}

function renderNutritionToday(iso, day) {
  const box = document.getElementById('nutri-today');
  const label = document.getElementById('nutri-day-label');
  if (!box) return;
  if (label) label.textContent = '· ' + fmtDay(iso, { weekday: 'long', day: 'numeric', month: 'long' });
  const g = state.goals;
  const rows = [
    { k: 'Calories', v: day.kcal, goal: g.calories, unit: 'kcal', color: 'var(--terra)' },
    { k: 'Protéines', v: day.protein, goal: g.protein, unit: 'g', color: 'var(--sage)' },
    { k: 'Glucides', v: day.carbs, goal: g.carbs, unit: 'g', color: 'var(--gold)' },
    { k: 'Lipides', v: day.fat, goal: g.fat, unit: 'g', color: '#b06a4a' },
  ];
  box.innerHTML = day.count ? rows.map(r => {
    const pct = Math.min(100, Math.round((r.v / (r.goal || 1)) * 100));
    return `<div class="nutri-row">
        <div class="top"><b>${r.k}</b><span>${Math.round(r.v)} / ${r.goal} ${r.unit} · ${pct}%</span></div>
        <div class="bar-bg"><div class="bar-fill" style="width:${pct}%;background:${r.color};"></div></div>
      </div>`;
  }).join('') : '<div class="empty">Aucun repas planifié ce jour. Sélectionnez un jour dans le planning.</div>';
}

function renderGoalsForm() {
  const box = document.getElementById('nutri-goals');
  if (!box) return;
  const g = state.goals;
  box.innerHTML = `
    <div class="row wrap" style="gap:10px;">
      <div style="flex:1;min-width:120px;"><label class="field-label">Calories (kcal)</label><input class="input" id="goal-cal" type="number" min="0" value="${g.calories}"></div>
      <div style="flex:1;min-width:90px;"><label class="field-label">Protéines (g)</label><input class="input" id="goal-prot" type="number" min="0" value="${g.protein}"></div>
      <div style="flex:1;min-width:90px;"><label class="field-label">Glucides (g)</label><input class="input" id="goal-carb" type="number" min="0" value="${g.carbs}"></div>
      <div style="flex:1;min-width:90px;"><label class="field-label">Lipides (g)</label><input class="input" id="goal-fat" type="number" min="0" value="${g.fat}"></div>
    </div>
    <button class="btn btn-primary btn-block mt-12" id="goal-save">💾 Enregistrer mes objectifs</button>`;
  box.querySelector('#goal-save').onclick = async () => {
    await setGoals({
      calories: Number(box.querySelector('#goal-cal').value) || 0,
      protein: Number(box.querySelector('#goal-prot').value) || 0,
      carbs: Number(box.querySelector('#goal-carb').value) || 0,
      fat: Number(box.querySelector('#goal-fat').value) || 0,
    });
    toast('Objectifs enregistrés');
  };
}

/* ═══════════════════════ RÉGLAGES ═══════════════════════ */
export function renderReglages() {
  const ai = state.settings.ai;
  const prov = document.getElementById('ai-provider');
  const model = document.getElementById('ai-model');
  const baseurl = document.getElementById('ai-baseurl');
  const urlLabel = document.getElementById('ai-url-label');
  const key = document.getElementById('ai-key');
  if (prov) prov.value = ai.provider || 'openai';
  if (model) model.value = ai.model || '';
  if (baseurl) baseurl.value = ai.baseUrl || '';
  if (key) key.value = ai.key || '';
  const isCustom = (ai.provider === 'custom');
  if (baseurl) baseurl.style.display = isCustom ? '' : 'none';
  if (urlLabel) urlLabel.style.display = isCustom ? '' : 'none';

  // Statistiques de synchronisation
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('rg-recipes', state.recipes.length);
  set('rg-fridge', state.fridge.length);
  set('rg-plan', Object.keys(state.planning).filter(k => MEALS.some(m => (state.planning[k][m.key] || []).length)).length);

  // Champs de synchronisation familiale (sans écraser un champ en cours d'édition)
  const sy = state.settings.sync || {};
  const sv = (id, v) => { const e = document.getElementById(id); if (e && document.activeElement !== e) e.value = v; };
  sv('sy-url', sy.url || '');
  sv('sy-key', sy.anonKey || '');
  sv('sy-family', sy.family || '');
  set('rg-syncstate', (sy.url && sy.anonKey && sy.family) ? '🟢 Synchro familiale activée' : 'Locale uniquement');
}
