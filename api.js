/* ════════════════════════════════════════════════════════════════
   api.js — Accès réseau : TheMealDB (recettes) + IA culinaire
   ════════════════════════════════════════════════════════════════ */

import { uid } from './utils.js';
import { state } from './store.js';

/* ───────────────────────── TheMealDB ─────────────────────────
   API publique gratuite, clé de test « 1 », compatible CORS.
   Docs : https://www.themealdb.com/api.php
*/
const MEALDB = 'https://www.themealdb.com/api/json/v1/1';

/* Transforme un objet « meal » TheMealDB vers notre format de recette */
export function mapMeal(meal) {
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const name = (meal[`strIngredient${i}`] || '').trim();
    const measure = (meal[`strMeasure${i}`] || '').trim();
    if (!name) continue;
    const { qty, unit } = parseMeasure(measure);
    ingredients.push({ name, qty, unit, raw: measure });
  }
  const steps = (meal.strInstructions || '')
    .split(/\r?\n|\.\s+(?=[A-ZÀ-Ý])/)
    .map(s => s.trim())
    .filter(s => s.length > 4);

  return {
    id: 'mdb_' + meal.idMeal,
    externalId: meal.idMeal,
    name: meal.strMeal,
    emoji: '🍽️',
    image: meal.strMealThumb || null,
    category: meal.strCategory || 'Plat',
    origin: meal.strArea || '',
    tags: (meal.strTags || '').split(',').map(t => t.trim()).filter(Boolean),
    portions: 4,            // TheMealDB ne fournit pas le nombre de portions
    prepTime: 0, cookTime: 0,
    ingredients, steps,
    nutrition: null,        // estimée localement via la base FOOD_DB
    source: 'mealdb',
    sourceUrl: meal.strSource || `https://www.themealdb.com/meal/${meal.idMeal}`,
    youtube: meal.strYoutube || '',
  };
}

/* Extrait une quantité + unité d'une mesure libre (« 200g », « 2 tbsp », « 1 cup ») */
function parseMeasure(m = '') {
  const match = m.match(/([\d.,/]+)\s*([a-zA-Zàéè²]*)/);
  if (!match) return { qty: 0, unit: m };
  let qty = match[1];
  if (qty.includes('/')) { const [a, b] = qty.split('/').map(Number); qty = b ? a / b : a; }
  else qty = parseFloat(qty.replace(',', '.')) || 0;
  const unit = (match[2] || '').toLowerCase()
    .replace(/^g.*/, 'g').replace(/^kg.*/, 'kg')
    .replace(/^ml.*/, 'ml').replace(/^l$/, 'l')
    .replace(/tbsp|tablespoon/, 'c. à s.').replace(/tsp|teaspoon/, 'c. à c.')
    .replace(/cup.*/, 'tasse');
  return { qty, unit: unit || '' };
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Réseau : ' + res.status);
  return res.json();
}

/* Recherche par nom (recettes complètes) */
export async function searchByName(q) {
  const data = await getJSON(`${MEALDB}/search.php?s=${encodeURIComponent(q)}`);
  return (data.meals || []).map(mapMeal);
}

/* Filtre (ingrédient / catégorie / pays) → résultats partiels, complétés via lookup */
export async function filterBy(type, value) {
  const param = { ingredient: 'i', category: 'c', area: 'a' }[type];
  const data = await getJSON(`${MEALDB}/filter.php?${param}=${encodeURIComponent(value)}`);
  const meals = (data.meals || []).slice(0, 24); // limite raisonnable
  // Détails complets (en parallèle, par lots)
  const full = await Promise.all(meals.map(m => lookup(m.idMeal).catch(() => null)));
  return full.filter(Boolean);
}

/* Détail complet d'une recette par identifiant */
export async function lookup(id) {
  const data = await getJSON(`${MEALDB}/lookup.php?i=${encodeURIComponent(id)}`);
  return data.meals?.[0] ? mapMeal(data.meals[0]) : null;
}

/* ───────────────────────── Assistant IA ─────────────────────────
   Utilise la clé d'API de l'utilisateur (stockée localement).
   Compatible OpenAI, Anthropic, ou tout endpoint compatible OpenAI.
   Retourne un objet JSON structuré : { type, recipe?, menu?, message? }.
*/

const SYSTEM_PROMPT = `Tu es un chef cuisinier assistant. Tu réponds UNIQUEMENT en JSON valide, sans texte autour, sans balises Markdown.
Schéma attendu :
{
  "type": "recipe" | "menu" | "text",
  "message": "courte phrase d'introduction en français",
  "recipe": {                        // si type=recipe
    "name": "string", "emoji": "un émoji", "category": "Entrée|Plat|Dessert|...",
    "origin": "pays", "portions": 4, "prepTime": minutes, "cookTime": minutes,
    "ingredients": [ { "name": "string", "qty": number, "unit": "g|ml|pièce|c. à s." } ],
    "steps": ["étape 1", "étape 2"],
    "nutrition": { "calories": number, "protein": number, "carbs": number, "fat": number },  // PAR PORTION
    "estimatedCostPerPerson": number   // en euros
  },
  "menu": [                          // si type=menu (une entrée par jour)
    { "day": "Lundi", "meals": { "lunch": <recipe>, "dinner": <recipe> } }
  ]
}
Règles : quantités réalistes, nutrition par portion, coûts en euros pour la France. Réponds toujours en français.
IMPORTANT : les CLÉS du JSON doivent rester EXACTEMENT en anglais comme ci-dessus (name, emoji, category, portions, ingredients, name, qty, unit, steps, nutrition, calories, protein, carbs, fat). Seules les VALEURS sont en français. Remplis TOUJOURS les tableaux "ingredients" et "steps" avec du contenu détaillé.`;

/* Construit le message utilisateur en y injectant le contexte (frigo, objectifs) si pertinent */
function buildUserMessage(prompt) {
  let ctx = '';
  if (/frigo|j'ai|que j'ai|mes ingr/i.test(prompt) && state.fridge.length) {
    ctx = `\n\nContenu actuel de mon frigo : ${state.fridge.map(f => `${f.name} (${f.qty} ${f.unit})`).join(', ')}.`;
  }
  return prompt + ctx;
}

/* Extrait le JSON même si le modèle ajoute du texte ou des ``` autour */
function parseAIJson(text) {
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const first = t.indexOf('{'); const last = t.lastIndexOf('}');
  if (first !== -1 && last !== -1) t = t.slice(first, last + 1);
  return JSON.parse(t);
}

/* Appel IA principal */
export async function askAI(prompt) {
  const ai = state.settings.ai;
  if (!ai.key) {
    const err = new Error('NO_KEY');
    err.code = 'NO_KEY';
    throw err;
  }
  const userMsg = buildUserMessage(prompt);
  let text;

  if (ai.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ai.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: ai.model || 'claude-3-5-haiku-latest',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });
    if (!res.ok) throw new Error('IA ' + res.status + ' : ' + (await res.text()).slice(0, 200));
    const data = await res.json();
    text = (data.content || []).map(b => b.text || '').join('\n');
  } else {
    // OpenAI ou compatible
    const base = ai.provider === 'custom' && ai.baseUrl ? ai.baseUrl.replace(/\/$/, '') : 'https://api.openai.com/v1';
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ai.key}` },
      body: JSON.stringify({
        model: ai.model || 'gpt-4o-mini',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMsg }],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error('IA ' + res.status + ' : ' + (await res.text()).slice(0, 200));
    const data = await res.json();
    text = data.choices?.[0]?.message?.content || '';
  }

  const parsed = parseAIJson(text);
  return normalizeAIResult(parsed);
}

/* Normalise une recette issue de l'IA vers notre format de carnet */
export function aiRecipeToStore(r) {
  r = r || {};
  const pick = (...keys) => {
    for (const k of keys) { if (r[k] !== undefined && r[k] !== null && r[k] !== '') return r[k]; }
    return undefined;
  };
  // Ingrédients : objets {name,qty,unit} en anglais OU en français, ou simples chaînes
  const rawIng = pick('ingredients', 'ingrédients', 'ingredient', 'ingrédient') || [];
  const ingredients = (Array.isArray(rawIng) ? rawIng : []).map(i => {
    if (typeof i === 'string') return { name: i, qty: 0, unit: '' };
    i = i || {};
    return {
      name: i.name || i.nom || i.ingredient || i.ingrédient || i.libelle || i.libellé || '',
      qty: Number(i.qty ?? i.quantity ?? i.quantite ?? i.quantité ?? i.qte ?? 0) || 0,
      unit: i.unit || i.unite || i.unité || i.mesure || '',
    };
  }).filter(i => i.name);
  // Étapes : tableau de chaînes, ou d'objets {step|instruction|texte|description}
  const rawSteps = pick('steps', 'etapes', 'étapes', 'instructions', 'preparation', 'préparation') || [];
  const steps = (Array.isArray(rawSteps) ? rawSteps : []).map(s =>
    typeof s === 'string' ? s : (s && (s.step || s.instruction || s.texte || s.text || s.description)) || ''
  ).filter(Boolean);
  // Nutrition : clés EN ou FR
  const nut = pick('nutrition', 'valeurs', 'valeursNutritionnelles', 'nutritionParPortion');
  return {
    id: 'ai_' + uid(),
    name: pick('name', 'nom', 'title', 'titre') || 'Recette IA',
    emoji: pick('emoji') || '🤖', image: null,
    category: pick('category', 'categorie', 'catégorie') || 'Plat',
    origin: pick('origin', 'origine', 'pays') || '',
    tags: ['IA'],
    portions: Number(pick('portions', 'servings', 'parts')) || 4,
    prepTime: Number(pick('prepTime', 'tempsPreparation', 'prep')) || 0,
    cookTime: Number(pick('cookTime', 'tempsCuisson', 'cuisson')) || 0,
    ingredients,
    steps,
    nutrition: nut ? {
      calories: Number(nut.calories ?? nut.kcal ?? nut.energie ?? nut.énergie ?? 0) || 0,
      protein: Number(nut.protein ?? nut.proteines ?? nut.protéines ?? 0) || 0,
      carbs: Number(nut.carbs ?? nut.glucides ?? 0) || 0,
      fat: Number(nut.fat ?? nut.lipides ?? 0) || 0,
    } : null,
    source: 'ai',
  };
}

function normalizeAIResult(parsed) {
  if (parsed.type === 'recipe' && parsed.recipe) parsed.recipe = aiRecipeToStore(parsed.recipe);
  if (parsed.type === 'menu' && Array.isArray(parsed.menu)) {
    parsed.menu = parsed.menu.map(d => ({
      day: d.day || '',
      meals: Object.fromEntries(Object.entries(d.meals || {}).map(([k, v]) => [k, aiRecipeToStore(v)])),
    }));
  }
  return parsed;
}

/* ════════════════════════════════════════════════════════════════
   IMPORT DEPUIS UN LIEN
   On récupère la page via le proxy (contourne les blocages CORS des
   sites), puis :
   1) on tente d'extraire les données structurées JSON-LD (schema.org
      /Recipe) que publient la plupart des grands sites de cuisine ;
   2) à défaut, on envoie le texte de la page à l'IA pour la mettre
      en forme.
   ════════════════════════════════════════════════════════════════ */
export async function importFromUrl(url) {
  const ai = state.settings.ai || {};
  if (!ai.baseUrl) {
    const e = new Error("L'import par lien nécessite le proxy (fournisseur « Compatible OpenAI »). Configurez-le dans Réglages.");
    e.code = 'NO_PROXY';
    throw e;
  }
  const origin = new URL(ai.baseUrl).origin;
  const res = await fetch(`${origin}/fetch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${ai.key || ''}` },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error('Import ' + res.status + ' : ' + (await res.text()).slice(0, 150));
  const data = await res.json();
  const html = data.html || '';

  // 1) Données structurées JSON-LD
  const ld = extractJsonLdRecipe(html);
  if (ld) {
    try {
      const r = jsonLdToRecipe(ld);
      if (r.ingredients.length || r.steps.length) return r;
    } catch { /* structure inattendue → on bascule sur l'IA */ }
  }

  // 2) Repli : on demande à l'IA de structurer le texte de la page
  const text = htmlToText(html).slice(0, 6000);
  if (!text) throw new Error("Page vide ou illisible.");
  const result = await askAI(`Voici le texte brut d'une page de recette trouvée sur Internet. Extrais-en la recette (nom, ingrédients avec quantités, étapes) et structure-la en JSON selon le schéma. Réponds en type "recipe".\n\n${text}`);
  if (result && result.recipe) return result.recipe;
  throw new Error("Aucune recette détectée sur cette page.");
}

/* Cherche un script JSON-LD contenant une recette schema.org */
function extractJsonLdRecipe(html) {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let parsed;
    try { parsed = JSON.parse(m[1].trim()); } catch { continue; }
    const node = findRecipeNode(parsed);
    if (node) return node;
  }
  return null;
}
function findRecipeNode(data) {
  const list = Array.isArray(data) ? data : (data && data['@graph'] ? data['@graph'] : [data]);
  for (const node of list) {
    if (!node) continue;
    const t = node['@type'];
    const types = Array.isArray(t) ? t : [t];
    if (types.includes('Recipe')) return node;
  }
  return null;
}

/* Convertit un nœud JSON-LD Recipe en recette prête pour le carnet */
function jsonLdToRecipe(n) {
  const toArr = v => Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);

  const rawIng = n.recipeIngredient || n.ingredients;
  const ingArr = typeof rawIng === 'string' ? rawIng.split(/\r?\n+/) : toArr(rawIng);
  const ingredients = ingArr
    .map(s => {
      const name = (s && typeof s === 'object' ? (s.name || s.text || '') : String(s)).trim();
      return { name, qty: 0, unit: '' };
    })
    .filter(i => i.name);

  let steps = [];
  const ri = n.recipeInstructions;
  if (typeof ri === 'string') {
    steps = ri.split(/\r?\n+/).map(s => s.trim()).filter(Boolean);
  } else {
    toArr(ri).forEach(s => {
      if (typeof s === 'string') steps.push(s.trim());
      else if (s && s['@type'] === 'HowToSection' && Array.isArray(s.itemListElement)) {
        s.itemListElement.forEach(it => { const x = it.text || it.name; if (x) steps.push(String(x).trim()); });
      } else if (s && (s.text || s.name)) {
        steps.push(String(s.text || s.name).trim());
      }
    });
    steps = steps.filter(Boolean);
  }

  let image = n.image;
  if (Array.isArray(image)) image = image[0];
  if (image && typeof image === 'object') image = image.url;

  let portions = 4;
  const y = Array.isArray(n.recipeYield) ? n.recipeYield[0] : n.recipeYield;
  if (y) { const p = parseInt(String(y), 10); if (p > 0) portions = p; }

  return {
    id: 'imp_' + uid(),
    name: (n.name || 'Recette importée').toString().trim(),
    emoji: '🔗',
    image: typeof image === 'string' ? image : null,
    category: 'Plat',
    origin: (n.recipeCuisine && String(Array.isArray(n.recipeCuisine) ? n.recipeCuisine[0] : n.recipeCuisine)) || '',
    tags: ['Importé'],
    portions,
    prepTime: 0, cookTime: 0,
    ingredients, steps,
    nutrition: null,
    source: 'import',
  };
}

/* Nettoie le HTML pour n'en garder que le texte lisible */
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#39;|&rsquo;/gi, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n')
    .trim();
}

/* Traduit une recette en français via l'IA (à la demande). */
export async function translateRecipe(recipe) {
  const payload = {
    name: recipe.name, category: recipe.category, origin: recipe.origin,
    portions: recipe.portions,
    ingredients: recipe.ingredients, steps: recipe.steps,
  };
  const result = await askAI(
    `Traduis intégralement cette recette en français : le nom, le nom de chaque ingrédient, et chaque étape. Conserve les quantités et les unités telles quelles. Ne change pas les nombres. Réponds en type "recipe".\n\n${JSON.stringify(payload)}`
  );
  if (result && result.recipe) {
    return {
      ...result.recipe,
      image: recipe.image || result.recipe.image,
      emoji: recipe.emoji || result.recipe.emoji,
    };
  }
  throw new Error('Traduction impossible.');
}
