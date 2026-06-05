/* ════════════════════════════════════════════════════════════════
   ui.js — Composants d'interface réutilisables (recettes & modales)
   Ces fonctions construisent du HTML puis y branchent leurs écouteurs.
   Les mutations passent par store.js, qui émet 'change' → re-rendu.
   ════════════════════════════════════════════════════════════════ */

import {
  state, getRecipe, computeRecipe, fridgeHas,
  addRecipe, updateRecipe, deleteRecipe, duplicateRecipe, toggleFavorite, addToPlan,
} from './store.js';
import { MEALS, FRIDGE_CATEGORIES } from './config.js';
import { esc, qtyFmt, euro, round, openModal, closeModal, toast, todayISO, fmtShort, weekDates, uid } from './utils.js';
import { importFromUrl } from './api.js';

/* ───────── Carte recette (grille découverte) ───────── */
export function recipeCardHTML(r) {
  const img = r.image
    ? `<img src="${esc(r.image)}" alt="" loading="lazy" onerror="this.style.display='none';this.parentNode.textContent='${r.emoji || '🍽️'}'">`
    : (r.emoji || '🍽️');
  const fav = getRecipe(r.id)?.favorite || r.favorite;
  return `
    <article class="rcard" data-recipe="${esc(r.id)}">
      <div class="rcard-img">${img}
        <button class="rcard-fav" data-fav="${esc(r.id)}" title="Favori">${fav ? '❤️' : '🤍'}</button>
        ${r.category ? `<span class="rcard-cat">${esc(r.category)}</span>` : ''}
      </div>
      <div class="rcard-body">
        <h3 class="rcard-name">${esc(r.name)}</h3>
        <div class="rcard-meta">
          ${r.origin ? `<span class="tag t-sage">${esc(r.origin)}</span>` : ''}
          ${(r.prepTime + r.cookTime) ? `<span class="tag">${r.prepTime + r.cookTime} min</span>` : ''}
        </div>
      </div>
    </article>`;
}

/* ───────── Élément de liste (carnet) ───────── */
export function listItemHTML(r) {
  const img = r.image ? `<img src="${esc(r.image)}" alt="" loading="lazy">` : (r.emoji || '🍽️');
  const c = computeRecipe(r);
  return `
    <div class="list-item" data-recipe="${esc(r.id)}">
      <div class="li-thumb">${img}</div>
      <div class="li-info">
        <div class="li-name">${r.favorite ? '★ ' : ''}${esc(r.name)}</div>
        <div class="li-sub">
          <span>${esc(r.category || 'Plat')}</span>
          <span>· ${r.portions} pers.</span>
          <span>· ${Math.round(c.perPortion.kcal)} kcal</span>
          <span>· ${euro(c.perPortion.cost)}/pers</span>
        </div>
      </div>
      <span class="icon-btn">›</span>
    </div>`;
}

/* ───────── Fiche détaillée d'une recette (modale) ───────── */
export function openRecipeSheet(recipe, { portions } = {}) {
  const body = document.getElementById('ov-recipe-body');
  const inCarnet = !!getRecipe(recipe.id);
  let curPortions = portions || recipe.portions || 4;

  function render() {
    const c = computeRecipe(recipe, curPortions);
    const scale = curPortions / (recipe.portions || 1);
    const img = recipe.image ? `<img src="${esc(recipe.image)}" alt="">` : (recipe.emoji || '🍽️');

    body.innerHTML = `
      <div class="sheet-head">
        <h2 class="sheet-title">${esc(recipe.name)}</h2>
        <button class="icon-btn" data-close>×</button>
      </div>
      <div class="detail-hero">${img}</div>
      <div class="row wrap" style="gap:6px;margin-bottom:6px;">
        ${recipe.origin ? `<span class="tag t-sage">📍 ${esc(recipe.origin)}</span>` : ''}
        ${recipe.category ? `<span class="tag t-terra">${esc(recipe.category)}</span>` : ''}
        ${(recipe.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
      </div>

      <div class="stat-grid">
        <div class="stat-box"><div class="stat-val">${(recipe.prepTime + recipe.cookTime) || '—'}</div><div class="stat-lbl">minutes</div></div>
        <div class="stat-box"><div class="stat-val">${Math.round(c.perPortion.kcal)}</div><div class="stat-lbl">kcal/pers</div></div>
        <div class="stat-box"><div class="stat-val">${round(c.perPortion.protein)}g</div><div class="stat-lbl">protéines</div></div>
        <div class="stat-box"><div class="stat-val">${euro(c.perPortion.cost)}</div><div class="stat-lbl">par pers.</div></div>
      </div>

      <div class="row between" style="margin:8px 0 4px;">
        <span class="sec-label" style="margin:0;">Ingrédients</span>
        <div class="portion-ctl">
          <button data-port="-1">−</button><span>${curPortions} pers.</span><button data-port="1">+</button>
        </div>
      </div>
      <div class="card" style="padding:6px 16px;">
        ${(recipe.ingredients || []).map(i => {
          const have = fridgeHas(i.name);
          return `<div class="ing-row">
            <span>${esc(i.name)} ${have ? '<span class="ing-have">· en stock ✓</span>' : ''}</span>
            <span class="ing-qty">${i.qty ? qtyFmt(i.qty * scale) : ''} ${esc(i.unit || '')}</span>
          </div>`;
        }).join('') || '<p class="slot-empty" style="padding:10px 0;">Aucun ingrédient renseigné.</p>'}
      </div>

      ${(recipe.steps || []).length ? `
        <span class="sec-label">Préparation</span>
        <div>${recipe.steps.map((s, i) => `<div class="step-row"><span class="step-num">${i + 1}</span><span>${esc(s)}</span></div>`).join('')}</div>
      ` : ''}

      ${recipe.youtube ? `<a class="btn btn-ghost btn-block mt-12" href="${esc(recipe.youtube)}" target="_blank" rel="noopener">▶️ Voir la vidéo</a>` : ''}

      <div class="stack mt-16">
        ${inCarnet ? `
          <button class="btn btn-accent" data-plan>📅 Ajouter au planning</button>
          <div class="row" style="gap:8px;">
            <button class="btn btn-ghost grow" data-edit>✏️ Modifier</button>
            <button class="btn btn-ghost grow" data-dup>📑 Dupliquer</button>
            <button class="btn btn-ghost" data-fav>${recipe.favorite ? '❤️' : '🤍'}</button>
          </div>
          <button class="btn btn-danger" data-del>🗑️ Supprimer du carnet</button>
        ` : `
          <button class="btn btn-accent" data-save>❤️ Enregistrer dans mon carnet</button>
          <button class="btn btn-ghost" data-plan>📅 Ajouter au planning</button>
        `}
      </div>`;

    // Écouteurs
    body.querySelector('[data-close]').onclick = () => closeModal('ov-recipe');
    body.querySelectorAll('[data-port]').forEach(b => b.onclick = () => {
      curPortions = Math.max(1, curPortions + Number(b.dataset.port)); render();
    });
    body.querySelector('[data-save]')?.addEventListener('click', async () => {
      const { id, externalId, sourceUrl, ...rest } = recipe;
      const saved = await addRecipe({ ...rest, source: recipe.source || 'manual' });
      recipe.id = saved.id; // pour ré-ouvertures cohérentes
      toast('Ajouté au carnet ❤️'); closeModal('ov-recipe');
    });
    body.querySelector('[data-plan]')?.addEventListener('click', () => {
      // S'assure que la recette existe dans le carnet pour pouvoir la planifier
      let id = recipe.id;
      if (!getRecipe(id)) { addRecipe({ ...recipe }).then(s => openPlanPicker(s.id)); }
      else openPlanPicker(id);
    });
    body.querySelector('[data-edit]')?.addEventListener('click', () => { closeModal('ov-recipe'); openRecipeForm(recipe); });
    body.querySelector('[data-dup]')?.addEventListener('click', async () => { await duplicateRecipe(recipe.id); toast('Recette dupliquée'); closeModal('ov-recipe'); });
    body.querySelector('[data-fav]')?.addEventListener('click', async () => { await toggleFavorite(recipe.id); recipe.favorite = !recipe.favorite; render(); });
    body.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (confirm('Supprimer cette recette du carnet ?')) { await deleteRecipe(recipe.id); toast('Recette supprimée'); closeModal('ov-recipe'); }
    });
  }

  render();
  openModal('ov-recipe');
}

/* ───────── Sélecteur « ajouter au planning » : choix jour + repas ───────── */
export function openPlanPicker(recipeId) {
  const body = document.getElementById('ov-pick-body');
  const days = weekDates(todayISO());
  body.innerHTML = `
    <div class="sheet-head"><h2 class="sheet-title">Ajouter au planning</h2><button class="icon-btn" data-close>×</button></div>
    <label class="field-label">Jour</label>
    <select id="pp-day" class="input">
      ${days.map(d => `<option value="${d}">${fmtShort(d)} · ${new Date(d + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'long' })}</option>`).join('')}
    </select>
    <label class="field-label">Repas</label>
    <select id="pp-meal" class="input">
      ${MEALS.map(m => `<option value="${m.key}">${m.icon} ${m.label}</option>`).join('')}
    </select>
    <button class="btn btn-accent btn-block mt-16" id="pp-ok">Ajouter</button>`;
  body.querySelector('[data-close]').onclick = () => closeModal('ov-pick');
  body.querySelector('#pp-ok').onclick = async () => {
    const iso = body.querySelector('#pp-day').value;
    const meal = body.querySelector('#pp-meal').value;
    await addToPlan(iso, meal, recipeId);
    closeModal('ov-pick'); closeModal('ov-recipe');
    toast('Ajouté au planning 📅');
  };
  openModal('ov-pick');
}

/* ───────── Sélecteur « choisir une recette » (depuis un créneau du planning) ───────── */
export function openRecipePicker(onPick) {
  const body = document.getElementById('ov-pick-body');
  function draw(filter = '') {
    const list = state.recipes.filter(r => r.name.toLowerCase().includes(filter.toLowerCase()));
    body.querySelector('#rp-list').innerHTML = list.length
      ? list.map(r => `
        <div class="pick-item" data-pick="${esc(r.id)}">
          <div class="pick-thumb">${r.image ? `<img src="${esc(r.image)}" alt="">` : (r.emoji || '🍽️')}</div>
          <div class="grow"><b>${esc(r.name)}</b><div class="li-sub">${esc(r.category || '')} · ${r.portions} pers.</div></div>
        </div>`).join('')
      : '<p class="slot-empty" style="padding:14px 0;">Aucune recette. Créez-en dans « Mon carnet » ou via l\'IA.</p>';
    body.querySelectorAll('[data-pick]').forEach(el => el.onclick = () => { onPick(el.dataset.pick); closeModal('ov-pick'); });
  }
  body.innerHTML = `
    <div class="sheet-head"><h2 class="sheet-title">Choisir une recette</h2><button class="icon-btn" data-close>×</button></div>
    <div class="search"><span class="ri">🔎</span><input id="rp-search" class="input" placeholder="Filtrer…"></div>
    <div id="rp-list"></div>`;
  body.querySelector('[data-close]').onclick = () => closeModal('ov-pick');
  body.querySelector('#rp-search').oninput = (e) => draw(e.target.value);
  draw();
  openModal('ov-pick');
}

/* ───────── Formulaire de création / édition de recette ───────── */
export function openRecipeForm(recipe = null) {
  const body = document.getElementById('ov-form-body');
  const editing = !!recipe;
  // Copie de travail
  const r = recipe ? structuredClone(recipe) : {
    name: '', emoji: '🍳', category: 'Plat', origin: '', portions: 4, prepTime: 10, cookTime: 20,
    ingredients: [{ name: '', qty: '', unit: 'g' }], steps: [''], tags: [],
  };

  function ingRow(ing, idx) {
    return `<div class="row" style="gap:6px;margin-bottom:6px;" data-ing="${idx}">
      <input class="input" data-f="name" placeholder="Ingrédient" value="${esc(ing.name)}" style="flex:2;">
      <input class="input" data-f="qty" placeholder="Qté" value="${ing.qty}" style="flex:1;" inputmode="decimal">
      <input class="input" data-f="unit" placeholder="unité" value="${esc(ing.unit)}" style="flex:1;">
      <button class="icon-btn" data-rm-ing="${idx}">×</button>
    </div>`;
  }
  function stepRow(s, idx) {
    return `<div class="row" style="gap:6px;margin-bottom:6px;" data-step="${idx}">
      <input class="input" data-f="step" placeholder="Étape ${idx + 1}" value="${esc(s)}" style="flex:1;">
      <button class="icon-btn" data-rm-step="${idx}">×</button>
    </div>`;
  }

  function render() {
    body.innerHTML = `
      <div class="sheet-head"><h2 class="sheet-title">${editing ? 'Modifier' : 'Nouvelle recette'}</h2><button class="icon-btn" data-close>×</button></div>
      <div class="row" style="gap:8px;">
        <input class="input" id="rf-emoji" value="${esc(r.emoji)}" style="flex:0 0 64px;text-align:center;font-size:1.4rem;">
        <input class="input" id="rf-name" placeholder="Nom de la recette" value="${esc(r.name)}" style="flex:1;">
      </div>
      <div class="row" style="gap:8px;margin-top:8px;">
        <div style="flex:1;"><label class="field-label">Catégorie</label><input class="input" id="rf-cat" value="${esc(r.category)}"></div>
        <div style="flex:1;"><label class="field-label">Origine</label><input class="input" id="rf-origin" value="${esc(r.origin)}"></div>
      </div>
      <div class="row" style="gap:8px;margin-top:4px;">
        <div style="flex:1;"><label class="field-label">Portions</label><input class="input" id="rf-portions" type="number" min="1" value="${r.portions}"></div>
        <div style="flex:1;"><label class="field-label">Prépa (min)</label><input class="input" id="rf-prep" type="number" min="0" value="${r.prepTime}"></div>
        <div style="flex:1;"><label class="field-label">Cuisson (min)</label><input class="input" id="rf-cook" type="number" min="0" value="${r.cookTime}"></div>
      </div>

      <label class="field-label">Ingrédients</label>
      <div id="rf-ings">${r.ingredients.map(ingRow).join('')}</div>
      <button class="btn btn-ghost btn-sm" id="rf-add-ing">+ Ingrédient</button>

      <label class="field-label">Étapes</label>
      <div id="rf-steps">${r.steps.map(stepRow).join('')}</div>
      <button class="btn btn-ghost btn-sm" id="rf-add-step">+ Étape</button>

      <button class="btn btn-accent btn-block mt-16" id="rf-save">${editing ? 'Enregistrer' : 'Créer la recette'}</button>`;

    // collecte les valeurs des champs dans l'objet de travail
    const sync = () => {
      r.emoji = body.querySelector('#rf-emoji').value || '🍳';
      r.name = body.querySelector('#rf-name').value.trim();
      r.category = body.querySelector('#rf-cat').value.trim();
      r.origin = body.querySelector('#rf-origin').value.trim();
      r.portions = Math.max(1, Number(body.querySelector('#rf-portions').value) || 1);
      r.prepTime = Number(body.querySelector('#rf-prep').value) || 0;
      r.cookTime = Number(body.querySelector('#rf-cook').value) || 0;
      r.ingredients = [...body.querySelectorAll('[data-ing]')].map(row => ({
        name: row.querySelector('[data-f=name]').value.trim(),
        qty: parseFloat(row.querySelector('[data-f=qty]').value.replace(',', '.')) || 0,
        unit: row.querySelector('[data-f=unit]').value.trim(),
      }));
      r.steps = [...body.querySelectorAll('[data-step]')].map(row => row.querySelector('[data-f=step]').value.trim());
    };

    body.querySelector('[data-close]').onclick = () => closeModal('ov-form');
    body.querySelector('#rf-add-ing').onclick = () => { sync(); r.ingredients.push({ name: '', qty: '', unit: 'g' }); render(); };
    body.querySelector('#rf-add-step').onclick = () => { sync(); r.steps.push(''); render(); };
    body.querySelectorAll('[data-rm-ing]').forEach(b => b.onclick = () => { sync(); r.ingredients.splice(Number(b.dataset.rmIng), 1); render(); });
    body.querySelectorAll('[data-rm-step]').forEach(b => b.onclick = () => { sync(); r.steps.splice(Number(b.dataset.rmStep), 1); render(); });

    body.querySelector('#rf-save').onclick = async () => {
      sync();
      if (!r.name) { toast('Donnez un nom à la recette'); return; }
      r.ingredients = r.ingredients.filter(i => i.name);
      r.steps = r.steps.filter(s => s);
      if (editing) { await updateRecipe(recipe.id, r); toast('Recette enregistrée'); }
      else { await addRecipe(r); toast('Recette créée ✨'); }
      closeModal('ov-form');
    };
  }

  render();
  openModal('ov-form');
}

/* ───────── Formulaire d'ajout / édition d'un aliment au frigo ───────── */
export function openFridgeForm(item = null) {
  const body = document.getElementById('ov-form-body');
  const editing = !!item;
  const it = item ? { ...item } : { name: '', qty: 1, unit: 'pièce', category: 'autres', expiry: '' };
  body.innerHTML = `
    <div class="sheet-head"><h2 class="sheet-title">${editing ? 'Modifier' : 'Ajouter au frigo'}</h2><button class="icon-btn" data-close>×</button></div>
    <label class="field-label">Aliment</label>
    <input class="input" id="ff-name" value="${esc(it.name)}" placeholder="Ex : Tomates">
    <div class="row" style="gap:8px;">
      <div style="flex:1;"><label class="field-label">Quantité</label><input class="input" id="ff-qty" type="number" min="0" step="0.1" value="${it.qty}"></div>
      <div style="flex:1;"><label class="field-label">Unité</label><input class="input" id="ff-unit" value="${esc(it.unit)}"></div>
    </div>
    <label class="field-label">Catégorie</label>
    <select class="input" id="ff-cat">
      ${Object.entries(FRIDGE_CATEGORIES).map(([k, v]) => `<option value="${k}" ${k === it.category ? 'selected' : ''}>${v.emoji} ${v.label}</option>`).join('')}
    </select>
    <label class="field-label">Date de péremption (optionnel)</label>
    <input class="input" id="ff-exp" type="date" value="${it.expiry || ''}">
    <button class="btn btn-accent btn-block mt-16" id="ff-save">${editing ? 'Enregistrer' : 'Ajouter'}</button>`;
  body.querySelector('[data-close]').onclick = () => closeModal('ov-form');
  body.querySelector('#ff-save').onclick = async () => {
    const name = body.querySelector('#ff-name').value.trim();
    if (!name) { toast('Indiquez un aliment'); return; }
    const cat = body.querySelector('#ff-cat').value;
    const data = {
      name, qty: Number(body.querySelector('#ff-qty').value) || 1,
      unit: body.querySelector('#ff-unit').value.trim() || 'pièce',
      category: cat, emoji: FRIDGE_CATEGORIES[cat].emoji,
      expiry: body.querySelector('#ff-exp').value || null,
    };
    const { addFridgeItem, updateFridgeItem } = await import('./store.js');
    if (editing) await updateFridgeItem(item.id, data); else await addFridgeItem(data);
    closeModal('ov-form'); toast(editing ? 'Modifié' : 'Ajouté au frigo 🧊');
  };
  openModal('ov-form');
}

/* ───────── Importer une recette depuis un lien ───────── */
export function openImportUrl() {
  const body = document.getElementById('ov-form-body');
  body.innerHTML = `
    <div class="sheet-head">
      <h2 class="sheet-title">🔗 Importer depuis un lien</h2>
      <button class="icon-btn" data-close>×</button>
    </div>
    <p class="muted mb-16">Collez l'adresse d'une recette vue sur un site de cuisine. L'app va la récupérer et la mettre en forme — vous pourrez ensuite la vérifier avant de l'enregistrer.</p>
    <label class="field-label">Lien de la recette</label>
    <input type="url" id="imp-url" class="input" placeholder="https://www.exemple.com/recette..." autocomplete="off">
    <div id="imp-status" class="mt-12"></div>
    <button class="btn btn-primary btn-block mt-16" id="imp-go">Importer la recette</button>
  `;
  body.querySelector('[data-close]').onclick = () => closeModal('ov-form');
  const input = body.querySelector('#imp-url');
  const status = body.querySelector('#imp-status');
  const go = body.querySelector('#imp-go');

  const run = async () => {
    const url = input.value.trim();
    if (!/^https?:\/\//i.test(url)) {
      status.innerHTML = '<div class="alert-banner warn"><span class="ico">⚠️</span><span>Entrez un lien valide commençant par https://</span></div>';
      return;
    }
    go.disabled = true;
    status.innerHTML = '<div class="empty"><span class="spinner"></span> Récupération de la recette…</div>';
    try {
      const recipe = await importFromUrl(url);
      closeModal('ov-form');
      openRecipeSheet(recipe); // l'utilisateur vérifie puis enregistre
      toast('Recette récupérée — vérifiez puis enregistrez ❤️');
    } catch (e) {
      go.disabled = false;
      const msg = e && e.code === 'NO_PROXY'
        ? "L'import par lien nécessite le proxy. Vérifiez la configuration dans Réglages → Assistant IA."
        : (e && e.message) || "Échec de l'import.";
      status.innerHTML = `<div class="alert-banner danger"><span class="ico">⚠️</span><span>${esc(msg)}</span></div>`;
    }
  };

  go.onclick = run;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
  openModal('ov-form');
  setTimeout(() => input.focus(), 50);
}
